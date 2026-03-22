import { CommitMessageAiClient, OpenAISettings, PromptBuilderProvider } from '../application/contracts';
import { GitDiffMetadataExtractor } from './git-diff-metadata-extractor';

const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 5;
const MAX_COMMIT_MESSAGE_LENGTH = 72;
const MAX_PROGRESS_MESSAGE_LENGTH = 120;
const PROGRESS_UPDATE_INTERVAL_MS = 150;
const RESERVED_OUTPUT_TOKEN_RATIO = 0.35;
const MIN_RESERVED_OUTPUT_TOKENS = 64;
const PROMPT_OVERHEAD_TOKENS = 48;
const CONVENTIONAL_COMMIT_PATTERN =
	/^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^)]+\))?!?: .+/i;

type OpenAIChatResponse = {
	error?: { message?: string };
	choices?: Array<{
		message?: {
			content?: string;
		};
		finish_reason?: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	reasoning?: string;
};

type OpenAIStreamChunk = {
	error?: { message?: string };
	choices?: Array<{
		delta?: {
			content?: string;
			reasoning?: string;
			reasoning_content?: string;
		};
		message?: {
			content?: string;
		};
		reasoning?: string;
		reasoning_content?: string;
		finish_reason?: string | null;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
};

export class OpenAiCommitMessageClient implements CommitMessageAiClient {
	constructor(
		private readonly promptBuilder: PromptBuilderProvider,
		private readonly metadataExtractor = new GitDiffMetadataExtractor(),
	) {}

	async generateCommitMessage(
		settings: OpenAISettings,
		diff: string,
		options?: { onProgress?: (message: string) => void },
	): Promise<string> {
		const systemPrompt = await this.promptBuilder.buildSystemPrompt();
		const metadata = this.metadataExtractor.extract(diff, {
			maxInputTokens: this.estimateMaxInputTokens(settings.maxTokens),
		});
		const userPrompt = await this.promptBuilder.buildUserPrompt(metadata);
		const url = `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`;

		const data = await this.requestChatCompletion(url, settings, systemPrompt, userPrompt, options);
		console.log('Doc assistant - OpenAI raw response:', {
			content: data.choices?.[0]?.message?.content,
			finishReason: data.choices?.[0]?.finish_reason,
			usage: data.usage,
			reasoning: data.reasoning,
		});

		const content = data.choices?.[0]?.message?.content ?? '';
		const message = this.sanitizeCommitMessage(content);
		if (!message) {
			throw new Error(
				'The model returned an empty commit message after processing the diff metadata.',
			);
		}

		return message;
	}

	private sanitizeCommitMessage(rawMessage: string): string {
		const candidates = rawMessage
			.split('\n')
			.map((line) => this.normalizeCandidate(line))
			.filter(Boolean);

		const conventionalCommit = candidates.find((candidate) =>
			CONVENTIONAL_COMMIT_PATTERN.test(candidate),
		);
		if (conventionalCommit) {
			return this.limitCommitMessageLength(conventionalCommit);
		}

		return this.limitCommitMessageLength(candidates[0] ?? '');
	}

	private normalizeCandidate(line: string): string {
		return line
			.trim()
			.replace(/^[-*]\s+/, '')
			.replace(/^commit message:\s*/i, '')
			.replace(/^suggested commit:\s*/i, '')
			.replace(/^here(?:'s| is) (?:the )?commit message:\s*/i, '')
			.replace(/^['"`]+|['"`]+$/g, '')
			.trim();
	}

	private limitCommitMessageLength(message: string): string {
		if (message.length <= MAX_COMMIT_MESSAGE_LENGTH) {
			return message;
		}

		const truncated = message.slice(0, MAX_COMMIT_MESSAGE_LENGTH).trimEnd();
		const lastSpace = truncated.lastIndexOf(' ');
		if (lastSpace <= 0) {
			return truncated;
		}

		return truncated.slice(0, lastSpace).trimEnd();
	}

	private async requestChatCompletion(
		url: string,
		settings: OpenAISettings,
		systemPrompt: string,
		userPrompt: string,
		options?: { onProgress?: (message: string) => void },
	): Promise<OpenAIChatResponse> {
		const body = JSON.stringify({
			model: settings.model,
			temperature: settings.temperature,
			max_tokens: settings.maxTokens,
			stream: true,
			messages: [
				{
					role: 'system',
					content: systemPrompt,
				},
				{
					role: 'user',
					content: userPrompt,
				},
			],
		});

		const response = await this.fetchWithTimeoutRetry(
			url,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${settings.apiKey}`,
				},
				body,
			},
			settings.requestTimeoutMs,
		);

		if (!response.ok) {
			throw new Error(`OpenAI returned HTTP ${response.status}.`);
		}

		const data = await this.parseChatCompletionResponse(response, options);
		if (data.error?.message) {
			throw new Error(data.error.message);
		}

		return data;
	}

	private async parseChatCompletionResponse(
		response: Response,
		options?: { onProgress?: (message: string) => void },
	): Promise<OpenAIChatResponse> {
		const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
		if (!response.body || !contentType.includes('text/event-stream')) {
			return (await response.json()) as OpenAIChatResponse;
		}

		return this.readEventStream(response.body, options);
	}

	private async readEventStream(
		stream: ReadableStream<Uint8Array>,
		options?: { onProgress?: (message: string) => void },
	): Promise<OpenAIChatResponse> {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let content = '';
		let reasoning = '';
		let finishReason: string | undefined;
		let usage: OpenAIChatResponse['usage'];
		let lastProgressAt = 0;
		let lastProgressMessage = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const events = buffer.split('\n\n');
				buffer = events.pop() ?? '';

				for (const event of events) {
					const parsedChunk = this.parseEventStreamChunk(event);
					if (!parsedChunk) {
						continue;
					}

					if (parsedChunk.error?.message) {
						throw new Error(parsedChunk.error.message);
					}

					usage = parsedChunk.usage ?? usage;
					const choice = parsedChunk.choices?.[0];
					content += choice?.delta?.content ?? choice?.message?.content ?? '';
					reasoning +=
						choice?.delta?.reasoning ??
						choice?.delta?.reasoning_content ??
						choice?.reasoning ??
						choice?.reasoning_content ??
						'';
					finishReason = choice?.finish_reason ?? finishReason;
					({ lastProgressAt, lastProgressMessage } = this.reportStreamingProgress(
						options?.onProgress,
						reasoning,
						content,
						lastProgressAt,
						lastProgressMessage,
					));
				}
			}

			if (buffer.trim()) {
				const parsedChunk = this.parseEventStreamChunk(buffer);
				if (parsedChunk?.error?.message) {
					throw new Error(parsedChunk.error.message);
				}

				const choice = parsedChunk?.choices?.[0];
				content += choice?.delta?.content ?? choice?.message?.content ?? '';
				reasoning +=
					choice?.delta?.reasoning ??
					choice?.delta?.reasoning_content ??
					choice?.reasoning ??
					choice?.reasoning_content ??
					'';
				finishReason = choice?.finish_reason ?? finishReason;
				usage = parsedChunk?.usage ?? usage;
			}
		} finally {
			reader.releaseLock();
		}

		this.reportStreamingProgress(options?.onProgress, reasoning, content, 0, '', true);

		return {
			choices: [
				{
					message: { content },
					finish_reason: finishReason,
				},
			],
			usage,
			reasoning,
		};
	}

	private parseEventStreamChunk(event: string): OpenAIStreamChunk | null {
		const dataLines = event
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).trim())
			.filter(Boolean);

		if (dataLines.length === 0) {
			return null;
		}

		const payload = dataLines.join('\n');
		if (payload === '[DONE]') {
			return null;
		}

		return JSON.parse(payload) as OpenAIStreamChunk;
	}

	private async fetchWithTimeoutRetry(
		url: string,
		init: RequestInit,
		requestTimeoutMs: number,
	): Promise<Response> {
		const deadline = Date.now() + requestTimeoutMs;
		let lastError: unknown;
		let retries = 0;

		while (Date.now() < deadline) {
			const remainingMs = deadline - Date.now();
			if (remainingMs <= 0) {
				break;
			}

			try {
				return await fetch(url, {
					...init,
					signal: AbortSignal.timeout(remainingMs),
				});
			} catch (error) {
				lastError = error;
				const reachedDeadline = Date.now() >= deadline;
				const shouldRetry = this.isTimeoutLikeError(error) && !reachedDeadline && retries < MAX_RETRIES;
				if (!shouldRetry) {
					throw error;
				}

				retries += 1;
				await this.delay(Math.min(RETRY_DELAY_MS, Math.max(0, deadline - Date.now())));
			}
		}

		if (lastError instanceof Error) {
			throw new Error(`Request timed out after ${requestTimeoutMs}ms.`, { cause: lastError });
		}

		throw new Error(`Request timed out after ${requestTimeoutMs}ms.`);
	}

	private isTimeoutLikeError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}

		const message = `${error.name} ${error.message} ${(error as { cause?: unknown }).cause ?? ''}`
			.toLowerCase();
		return message.includes('timeout') || message.includes('aborted');
	}

	private async delay(ms: number): Promise<void> {
		if (ms <= 0) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	private reportStreamingProgress(
		onProgress: ((message: string) => void) | undefined,
		reasoning: string,
		content: string,
		lastProgressAt: number,
		lastProgressMessage: string,
		force = false,
	): { lastProgressAt: number; lastProgressMessage: string } {
		if (!onProgress) {
			return { lastProgressAt, lastProgressMessage };
		}

		const nextMessage = this.buildProgressMessage(reasoning, content);
		if (!nextMessage) {
			return { lastProgressAt, lastProgressMessage };
		}

		const now = Date.now();
		if (!force && nextMessage === lastProgressMessage) {
			return { lastProgressAt, lastProgressMessage };
		}

		if (!force && now - lastProgressAt < PROGRESS_UPDATE_INTERVAL_MS) {
			return { lastProgressAt, lastProgressMessage };
		}

		onProgress(nextMessage);
		return {
			lastProgressAt: now,
			lastProgressMessage: nextMessage,
		};
	}

	private buildProgressMessage(reasoning: string, content: string): string {
		const sanitizedContent = this.sanitizeProgressText(content);
		if (sanitizedContent) {
			return 'OpenAI progress: drafting commit message';
		}

		const sanitizedReasoning = this.sanitizeProgressText(reasoning);
		if (sanitizedReasoning) {
			if (sanitizedReasoning.length > 48) {
				return 'OpenAI progress: ranking changes';
			}

			return 'OpenAI progress: analyzing diff';
		}

		return '';
	}

	private sanitizeProgressText(input: string): string {
		const singleLine = input.replace(/\s+/g, ' ').trim();
		if (!singleLine) {
			return '';
		}

		if (singleLine.length <= MAX_PROGRESS_MESSAGE_LENGTH) {
			return singleLine;
		}

		return `...${singleLine.slice(-MAX_PROGRESS_MESSAGE_LENGTH)}`;
	}

	private estimateMaxInputTokens(maxTokens: number): number {
		const reservedOutputTokens = Math.max(
			MIN_RESERVED_OUTPUT_TOKENS,
			Math.ceil(maxTokens * RESERVED_OUTPUT_TOKEN_RATIO),
		);
		return Math.max(48, maxTokens - reservedOutputTokens - PROMPT_OVERHEAD_TOKENS);
	}
}
