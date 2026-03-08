import { CommitMessageAiClient, OpenAISettings } from '../application/contracts';

type OpenAIChatResponse = {
	error?: { message?: string };
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
};

export class OpenAiCommitMessageClient implements CommitMessageAiClient {
	async generateCommitMessage(settings: OpenAISettings, diff: string): Promise<string> {
		const prompt = [
			'You are an assistant that writes short, objective commit messages.',
			'Rules:',
			'- Generate only one line.',
			'- Use Conventional Commits in English (e.g. feat:, fix:, chore:, refactor:, docs:, test:).',
			'- Do not use quotes, markdown, or extra explanations.',
			'- Maximum 72 characters.',
			'',
			'Git diff:',
			diff.slice(0, 20000),
		].join('\n');

		const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${settings.apiKey}`,
			},
			body: JSON.stringify({
				model: settings.model,
				temperature: 0.2,
				max_tokens: 1024,
				messages: [
					{
						role: 'system',
						content:
							'You generate concise git commit messages following Conventional Commits, one line only.',
					},
					{
						role: 'user',
						content: prompt,
					},
				],
			}),
		});

		if (!response.ok) {
			throw new Error(`OpenAI returned HTTP ${response.status}.`);
		}

		const data = (await response.json()) as OpenAIChatResponse;
		if (data.error?.message) {
			throw new Error(data.error.message);
		}

		const content = data.choices?.[0]?.message?.content ?? '';
		return this.sanitizeCommitMessage(content);
	}

	private sanitizeCommitMessage(rawMessage: string): string {
		return rawMessage
			.trim()
			.replace(/^['"`]+|['"`]+$/g, '')
			.split('\n')[0]
			.trim();
	}
}
