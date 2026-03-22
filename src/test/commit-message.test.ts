import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { CommandRegistrationAdapter } from '../core/contracts/command-registration-adapter';
import { ConfigureOpenAIUseCase } from '../modules/commit-message/application/configure-openai';
import {
	CommitInputGateway,
	CommitMessageAiClient,
	GitDiffReader,
	InputOptions,
	SettingsGateway,
	UiGateway,
	WorkspaceGateway,
} from '../modules/commit-message/application/contracts';
import { GenerateCommitMessageUseCase } from '../modules/commit-message/application/generate-commit-message';
import { GitDiffMetadataExtractor } from '../modules/commit-message/infrastructure/git-diff-metadata-extractor';
import { OpenAiCommitMessageClient } from '../modules/commit-message/infrastructure/open-ai-commit-message-client';
import { ConfigureOpenAICommand } from '../modules/commit-message/presentation/configure-openai-command';
import { GenerateCommitMessageCommand } from '../modules/commit-message/presentation/generate-commit-message-command';
import { MarkdownPromptBuilderProvider } from '../modules/commit-message/infrastructure/providers/prompt-builder-provider';

class InMemorySettings implements SettingsGateway {
	constructor(
		private baseUrl: string,
		private model: string,
		private maxTokens: number,
		private temperature: number,
		private requestTimeoutMs: number,
		private apiKey: string,
	) {}

	getBaseUrl(): string {
		return this.baseUrl;
	}

	getModel(): string {
		return this.model;
	}

	getMaxTokens(): number {
		return this.maxTokens;
	}

	getTemperature(): number {
		return this.temperature;
	}

	getRequestTimeoutMs(): number {
		return this.requestTimeoutMs;
	}

	async setBaseUrl(value: string): Promise<void> {
		this.baseUrl = value;
	}

	async setModel(value: string): Promise<void> {
		this.model = value;
	}

	async setMaxTokens(value: number): Promise<void> {
		this.maxTokens = value;
	}

	async setTemperature(value: number): Promise<void> {
		this.temperature = value;
	}

	async setRequestTimeoutMs(value: number): Promise<void> {
		this.requestTimeoutMs = value;
	}

	async getApiKey(): Promise<string> {
		return this.apiKey;
	}

	async setApiKey(value: string): Promise<void> {
		this.apiKey = value;
	}
}

class MockUi implements UiGateway {
	public infos: string[] = [];
	public warnings: string[] = [];
	public errors: string[] = [];
	public progressMessages: string[] = [];
	public infoResponses: Array<string | undefined> = [];
	public inputResponses: Array<string | undefined> = [];

	async showInfo(message: string): Promise<string | undefined> {
		this.infos.push(message);
		return this.infoResponses.shift();
	}

	showWarning(message: string): void {
		this.warnings.push(message);
	}

	showError(message: string): void {
		this.errors.push(message);
	}

	async showInput(_options: InputOptions): Promise<string | undefined> {
		return this.inputResponses.shift();
	}

	async withProgress<T>(
		_title: string,
		task: (report: (message: string) => void) => Promise<T>,
	): Promise<T> {
		return task((message) => this.progressMessages.push(message));
	}
}

class StaticWorkspace implements WorkspaceGateway {
	constructor(private readonly rootPath: string | null) {}

	getRootPath(): string | null {
		return this.rootPath;
	}
}

class StaticDiffReader implements GitDiffReader {
	constructor(private readonly diff: string) {}

	async readDiff(_rootPath: string): Promise<string> {
		return this.diff;
	}
}

class StaticAiClient implements CommitMessageAiClient {
	constructor(private readonly message: string) {}

	async generateCommitMessage(
		_settings?: unknown,
		_diff?: string,
		options?: { onProgress?: (message: string) => void },
	): Promise<string> {
		options?.onProgress?.('OpenAI progress: drafting commit message');
		return this.message;
	}
}

class CaptureCommitInput implements CommitInputGateway {
	public value = '';

	async setCommitMessage(message: string): Promise<void> {
		this.value = message;
	}
}

test('GenerateCommitMessageUseCase fills commit input on success', async () => {
	const settings = new InMemorySettings('https://api.openai.com/v1', 'gpt-4o-mini', 256, 0, 120000, 'key');
	const ui = new MockUi();
	const commitInput = new CaptureCommitInput();
	const configureOpenAI = new ConfigureOpenAIUseCase(settings, ui);
	const useCase = new GenerateCommitMessageUseCase(
		settings,
		new StaticWorkspace('/repo'),
		new StaticDiffReader('diff --git a/file b/file'),
		new StaticAiClient('feat: add commit command'),
		commitInput,
		ui,
		configureOpenAI,
	);

	await useCase.execute();

	assert.equal(commitInput.value, 'feat: add commit command');
	assert.equal(ui.errors.length, 0);
	assert.equal(ui.warnings.length, 0);
	assert.ok(ui.progressMessages.some((message) => message.includes('OpenAI progress:')));
});

test('GenerateCommitMessageUseCase warns when there is no diff', async () => {
	const settings = new InMemorySettings('https://api.openai.com/v1', 'gpt-4o-mini', 256, 0, 120000, 'key');
	const ui = new MockUi();
	const commitInput = new CaptureCommitInput();
	const configureOpenAI = new ConfigureOpenAIUseCase(settings, ui);
	const useCase = new GenerateCommitMessageUseCase(
		settings,
		new StaticWorkspace('/repo'),
		new StaticDiffReader('   '),
		new StaticAiClient('feat: should not be used'),
		commitInput,
		ui,
		configureOpenAI,
	);

	await useCase.execute();

	assert.equal(commitInput.value, '');
	assert.equal(ui.warnings[0], 'No changes found to generate a commit message.');
});

test('GenerateCommitMessageUseCase stops when user cancels configuration', async () => {
	const settings = new InMemorySettings('https://api.openai.com/v1', 'gpt-4o-mini', 256, 0, 120000, '');
	const ui = new MockUi();
	ui.infoResponses.push(undefined);
	const commitInput = new CaptureCommitInput();
	const configureOpenAI = new ConfigureOpenAIUseCase(settings, ui);
	const useCase = new GenerateCommitMessageUseCase(
		settings,
		new StaticWorkspace('/repo'),
		new StaticDiffReader('diff --git a/file b/file'),
		new StaticAiClient('feat: should not be used'),
		commitInput,
		ui,
		configureOpenAI,
	);

	await useCase.execute();

	assert.equal(commitInput.value, '');
});

test('GenerateCommitMessageCommand registers expected command id', async () => {
	const registrations = new Map<string, () => unknown | Promise<unknown>>();
	const commandRegistration: CommandRegistrationAdapter = {
		registerCommand(commandId, handler) {
			registrations.set(commandId, handler);
		},
	};
	const ui = new MockUi();
	let executed = false;
	const useCase = {
		execute: async () => {
			executed = true;
		},
	} as unknown as GenerateCommitMessageUseCase;

	const command = new GenerateCommitMessageCommand(commandRegistration, useCase, ui);
	command.register();

	const handler = registrations.get('doc-assistant.generateCommitMessage');
	assert.ok(handler);
	await handler?.();
	assert.equal(executed, true);
});

test('ConfigureOpenAICommand registers expected command id', async () => {
	const registrations = new Map<string, () => unknown | Promise<unknown>>();
	const commandRegistration: CommandRegistrationAdapter = {
		registerCommand(commandId, handler) {
			registrations.set(commandId, handler);
		},
	};
	const ui = new MockUi();
	let executed = false;
	const useCase = {
		execute: async () => {
			executed = true;
			return true;
		},
	} as unknown as ConfigureOpenAIUseCase;

	const command = new ConfigureOpenAICommand(commandRegistration, useCase, ui);
	command.register();

	const handler = registrations.get('doc-assistant.configureOpenAI');
	assert.ok(handler);
	await handler?.();
	assert.equal(executed, true);
});

test('MarkdownPromptBuilderProvider builds trimmed system prompt from markdown template', async () => {
	const tempDir = await mkdtemp(join(tmpdir(), 'doc-assistant-prompt-test-'));
	const systemTemplatePath = join(tempDir, 'system.md');
	const userTemplatePath = join(tempDir, 'user.md');

	try {
		await writeFile(systemTemplatePath, '\nSystem prompt content\n');
		await writeFile(userTemplatePath, '<INPUT></INPUT>');

		const provider = new MarkdownPromptBuilderProvider(systemTemplatePath, userTemplatePath);
		const prompt = await provider.buildSystemPrompt();

		assert.equal(prompt, 'System prompt content');
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test('MarkdownPromptBuilderProvider injects input inside INPUT xml tag', async () => {
	const tempDir = await mkdtemp(join(tmpdir(), 'doc-assistant-prompt-test-'));
	const systemTemplatePath = join(tempDir, 'system.md');
	const userTemplatePath = join(tempDir, 'user.md');

	try {
		await writeFile(systemTemplatePath, 'System prompt');
		await writeFile(userTemplatePath, 'Header\n<INPUT></INPUT>\nFooter');

		const provider = new MarkdownPromptBuilderProvider(systemTemplatePath, userTemplatePath);
		const prompt = await provider.buildUserPrompt('diff --git a/file b/file');

		assert.equal(
			prompt,
			'Header\n<INPUT>\ndiff --git a/file b/file\n</INPUT>\nFooter',
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test('MarkdownPromptBuilderProvider caches templates after first read', async () => {
	const tempDir = await mkdtemp(join(tmpdir(), 'doc-assistant-prompt-test-'));
	const systemTemplatePath = join(tempDir, 'system.md');
	const userTemplatePath = join(tempDir, 'user.md');

	try {
		await writeFile(systemTemplatePath, 'Original system prompt');
		await writeFile(userTemplatePath, '<INPUT></INPUT>');

		const provider = new MarkdownPromptBuilderProvider(systemTemplatePath, userTemplatePath);
		const firstPrompt = await provider.buildSystemPrompt();
		assert.equal(firstPrompt, 'Original system prompt');

		await writeFile(systemTemplatePath, 'Updated system prompt');
		const cachedPrompt = await provider.buildSystemPrompt();

		assert.equal(cachedPrompt, 'Original system prompt');
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

const createPromptBuilderStub = (capture?: {
	userPrompts?: string[];
}) => ({
	buildSystemPrompt: async () => 'System prompt',
	buildUserPrompt: async (input: string) => {
		capture?.userPrompts?.push(input);
		return `DIRECT:\n${input}`;
	},
});

const createEventStreamResponse = (chunks: string[]): Response =>
	new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(new TextEncoder().encode(chunk));
				}
				controller.close();
			},
		}),
		{
			status: 200,
			headers: { 'Content-Type': 'text/event-stream' },
		},
	);

test('GitDiffMetadataExtractor summarizes files, paths, line stats, and symbols', () => {
	const extractor = new GitDiffMetadataExtractor();
	const metadata = extractor.extract(`diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,6 @@
-export function oldHandler() {}
+export function newHandler() {}
+export class CommitService {}
+const useCommitMessage = () => {};
diff --git a/src/app.test.ts b/src/app.test.ts
new file mode 100644
--- /dev/null
+++ b/src/app.test.ts
@@ -0,0 +1,3 @@
+describe('app', () => {
+	it('works', () => {});
+});`);

	assert.match(metadata, /Files changed: 2/);
	assert.match(metadata, /Line stats: \+6 -1/);
	assert.match(metadata, /src\/app\.ts/);
	assert.match(metadata, /business/);
	assert.match(metadata, /symbols: .*newHandler.*CommitService.*useCommitMessage/);
	assert.match(metadata, /signals: tests/);
});

test('GitDiffMetadataExtractor prioritizes business files over larger style changes', () => {
	const extractor = new GitDiffMetadataExtractor();
	const metadata = extractor.extract(`diff --git a/src/service.ts b/src/service.ts
index 1111111..2222222 100644
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,2 +1,5 @@
-export function oldService() {}
+export function createCommitMessage() {}
+export class CommitMessageService {}
+export const validateCommit = () => true;
diff --git a/src/styles/site.css b/src/styles/site.css
index 1111111..2222222 100644
--- a/src/styles/site.css
+++ b/src/styles/site.css
@@ -1,2 +1,40 @@
-body { color: black; }
+body { color: #111; }
+h1 { margin: 0; }
+h2 { margin: 0; }
+h3 { margin: 0; }
+h4 { margin: 0; }
+h5 { margin: 0; }
+h6 { margin: 0; }
+p { margin: 0; }
+a { text-decoration: none; }
+ul { list-style: none; }
+li { padding: 0; }
+main { display: grid; }
+section { display: block; }
+article { display: block; }
+aside { display: block; }
+footer { display: block; }
+header { display: block; }
+nav { display: block; }
+button { border: 0; }
+input { border: 0; }
+textarea { border: 0; }
+label { font-weight: 600; }
+strong { font-weight: 700; }
+em { font-style: italic; }
+small { font-size: 12px; }
+code { font-family: monospace; }
+pre { overflow: auto; }
+table { border-collapse: collapse; }
+tr { border-bottom: 1px solid #eee; }
+td { padding: 4px; }
+th { padding: 4px; }
+form { gap: 8px; }
+fieldset { border: 1px solid #ddd; }
+legend { padding: 0 4px; }
+img { max-width: 100%; }
+svg { display: block; }
+figure { margin: 0; }
+figcaption { color: #666; }`);

	const lines = metadata.split('\n');
	const businessLineIndex = lines.findIndex((line) => line.includes('src/service.ts'));
	const styleLineIndex = lines.findIndex((line) => line.includes('src/styles/site.css'));

	assert.notEqual(businessLineIndex, -1);
	assert.notEqual(styleLineIndex, -1);
	assert.ok(businessLineIndex < styleLineIndex);
});

test('GitDiffMetadataExtractor classifies common file categories', () => {
	const extractor = new GitDiffMetadataExtractor();
	const metadata = extractor.extract(`diff --git a/src/index.ts b/src/index.ts
index 1111111..2222222 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1,2 @@
-export const oldValue = 1;
+export const newValue = 2;
diff --git a/src/index.test.ts b/src/index.test.ts
new file mode 100644
--- /dev/null
+++ b/src/index.test.ts
@@ -0,0 +1,2 @@
+describe('index', () => {});
+it('works', () => {});
diff --git a/eslint.config.mjs b/eslint.config.mjs
index 1111111..2222222 100644
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -1 +1,2 @@
-export default [];
+export default [];
+// update
diff --git a/src/index.css b/src/index.css
index 1111111..2222222 100644
--- a/src/index.css
+++ b/src/index.css
@@ -1 +1,2 @@
-body {}
+body {}
+main {}
diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
-# Title
+# Title
+More docs
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index 1111111..2222222 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1 +1,2 @@
-lockfileVersion: '9.0'
+lockfileVersion: '9.0'
+settings: {}`);

	assert.match(metadata, /business/);
	assert.match(metadata, /test/);
	assert.match(metadata, /config/);
	assert.match(metadata, /style/);
	assert.match(metadata, /docs/);
	assert.match(metadata, /lock\/deps/);
});

test('OpenAiCommitMessageClient limits generation and extracts conventional commit from verbose output', async () => {
	const originalFetch = globalThis.fetch;
	const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
	const progressMessages: string[] = [];

	globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
		requests.push({ url: String(url), init });
		return createEventStreamResponse([
			'data: {"choices":[{"delta":{"reasoning":"Inspecting files\\nand changes"}}]}\n\n',
			'data: {"choices":[{"delta":{"content":"Here is the commit message:\\n"}}]}\n\n',
			'data: {"choices":[{"delta":{"content":"feat: add commit message sanitizer for verbose model output"},"finish_reason":"stop"}]}\n\n',
			'data: [DONE]\n\n',
		]);
	}) as typeof fetch;

	try {
		const client = new OpenAiCommitMessageClient(createPromptBuilderStub());

		const message = await client.generateCommitMessage(
			{
				baseUrl: 'https://api.openai.com/v1',
				model: 'gpt-4o-mini',
				maxTokens: 256,
				temperature: 0,
				requestTimeoutMs: 120000,
				apiKey: 'key',
			},
			'diff --git a/file b/file',
			{
				onProgress: (message) => progressMessages.push(message),
			},
		);

		assert.equal(message, 'feat: add commit message sanitizer for verbose model output');
		assert.equal(requests.length, 1);
		assert.ok(progressMessages.includes('OpenAI progress: analyzing diff'));
		assert.ok(progressMessages.includes('OpenAI progress: drafting commit message'));
		assert.ok(progressMessages.every((entry) => !entry.includes('Inspecting files')));
		assert.ok(progressMessages.every((entry) => !entry.includes('\n')));

		const requestBody = JSON.parse(String(requests[0]?.init?.body));
		assert.equal(requestBody.temperature, 0);
		assert.equal(requestBody.max_tokens, 256);
		assert.equal(requestBody.stream, true);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('OpenAiCommitMessageClient supports non-stream JSON responses as fallback', async () => {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				choices: [
					{
						message: {
							content: 'fix: keep compatibility with non-streaming backends',
						},
					},
				],
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			},
		)) as typeof fetch;

	try {
		const client = new OpenAiCommitMessageClient(createPromptBuilderStub());

		const message = await client.generateCommitMessage(
			{
				baseUrl: 'https://api.openai.com/v1',
				model: 'gpt-4o-mini',
				maxTokens: 256,
				temperature: 0,
				requestTimeoutMs: 120000,
				apiKey: 'key',
			},
			'diff --git a/file b/file',
		);

		assert.equal(message, 'fix: keep compatibility with non-streaming backends');
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('OpenAiCommitMessageClient truncates long commit messages to 72 characters', async () => {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				choices: [
					{
						message: {
							content:
								'fix: ensure generated commit messages remain short and never include extra explanatory text from the model',
						},
					},
				],
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			},
		)) as typeof fetch;

	try {
		const client = new OpenAiCommitMessageClient(createPromptBuilderStub());

		const message = await client.generateCommitMessage(
			{
				baseUrl: 'https://api.openai.com/v1',
				model: 'gpt-4o-mini',
				maxTokens: 256,
				temperature: 0,
				requestTimeoutMs: 120000,
				apiKey: 'key',
			},
			'diff --git a/file b/file',
		);

		assert.ok(message.length <= 72);
		assert.equal(
			message,
			'fix: ensure generated commit messages remain short and never include',
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('OpenAiCommitMessageClient sends extracted metadata instead of the raw diff', async () => {
	const originalFetch = globalThis.fetch;
	const capturedPrompts = {
		userPrompts: [] as string[],
	};

	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				choices: [
					{
						message: {
							content: 'feat: summarize large diffs safely',
						},
					},
				],
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			},
		)) as typeof fetch;

	try {
		const longDiff = `diff --git a/src/file.ts b/src/file.ts
index 1111111..2222222 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,2 +1,4 @@
-export function oldName() {}
+export function newName() {}
+export class CommitGenerator {}
+const useCommitGenerator = () => {};
${'diff --git a/src/extra.ts b/src/extra.ts\nindex 1111111..2222222 100644\n--- a/src/extra.ts\n+++ b/src/extra.ts\n@@ -1 +1,2 @@\n-export const oldValue = 1;\n+export const newValue = 2;\n'.repeat(20)}`;
		const client = new OpenAiCommitMessageClient(createPromptBuilderStub(capturedPrompts));

		await client.generateCommitMessage(
			{
				baseUrl: 'https://api.openai.com/v1',
				model: 'gpt-4o-mini',
				maxTokens: 256,
				temperature: 0,
				requestTimeoutMs: 120000,
				apiKey: 'key',
			},
			longDiff,
		);

		assert.equal(capturedPrompts.userPrompts.length, 1);
		assert.match(capturedPrompts.userPrompts[0] ?? '', /Static diff metadata extracted/);
		assert.match(capturedPrompts.userPrompts[0] ?? '', /src\/file\.ts/);
		assert.doesNotMatch(capturedPrompts.userPrompts[0] ?? '', /@@ -1,2 \+1,4 @@/);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('OpenAiCommitMessageClient compresses diff metadata when token budget is low', async () => {
	const originalFetch = globalThis.fetch;
	const capturedPrompts = {
		userPrompts: [] as string[],
	};

	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				choices: [
					{
						message: {
							content: 'chore: summarize prioritized diff metadata',
						},
					},
				],
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			},
		)) as typeof fetch;

	try {
		const diff = `diff --git a/src/core/service.ts b/src/core/service.ts
index 1111111..2222222 100644
--- a/src/core/service.ts
+++ b/src/core/service.ts
@@ -1,2 +1,6 @@
-export function oldService() {}
+export function newService() {}
+export class CommitSummaryService {}
+export const useCommitSummary = () => {};
+export const buildCommitSummary = () => {};
diff --git a/src/core/service.test.ts b/src/core/service.test.ts
new file mode 100644
--- /dev/null
+++ b/src/core/service.test.ts
@@ -0,0 +1,4 @@
+describe('service', () => {});
+it('summarizes', () => {});
+it('orders files', () => {});
+it('keeps context', () => {});
diff --git a/src/styles/layout.css b/src/styles/layout.css
index 1111111..2222222 100644
--- a/src/styles/layout.css
+++ b/src/styles/layout.css
@@ -1,2 +1,22 @@
-body {}
+body {}
+main {}
+section {}
+article {}
+aside {}
+footer {}
+header {}
+nav {}
+ul {}
+li {}
+a {}
+button {}
+input {}
+textarea {}
+label {}
+small {}
+strong {}
+code {}
+pre {}
+table {}
+tr {}
+td {}
diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,3 @@
-# Doc Assistant
+# Doc Assistant
+Added more usage docs
+Added examples`;
		const client = new OpenAiCommitMessageClient(createPromptBuilderStub(capturedPrompts));

		await client.generateCommitMessage(
			{
				baseUrl: 'https://api.openai.com/v1',
				model: 'gpt-4o-mini',
				maxTokens: 160,
				temperature: 0,
				requestTimeoutMs: 120000,
				apiKey: 'key',
			},
			diff,
		);

		const prompt = capturedPrompts.userPrompts[0] ?? '';
		assert.match(prompt, /Prioritized file summaries:/);
		assert.match(prompt, /Omitted files:/);
		assert.match(prompt, /Priority categories:/);
		assert.doesNotMatch(prompt, /@@ -1,2 \+1,6 @@/);
		assert.ok(prompt.length < diff.length);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('OpenAiCommitMessageClient reports generic ranking progress for extended reasoning', async () => {
	const originalFetch = globalThis.fetch;
	const progressMessages: string[] = [];

	globalThis.fetch = (async () =>
		createEventStreamResponse([
			'data: {"choices":[{"delta":{"reasoning":"Inspecting files and grouping related changes before selecting the most relevant ones for the final summary"}}]}\n\n',
			'data: {"choices":[{"delta":{"content":"feat: rank large diffs before drafting commit messages"},"finish_reason":"stop"}]}\n\n',
			'data: [DONE]\n\n',
		])) as typeof fetch;

	try {
		const client = new OpenAiCommitMessageClient(createPromptBuilderStub());

		await client.generateCommitMessage(
			{
				baseUrl: 'https://api.openai.com/v1',
				model: 'gpt-4o-mini',
				maxTokens: 256,
				temperature: 0,
				requestTimeoutMs: 120000,
				apiKey: 'key',
			},
			'diff --git a/file b/file',
			{
				onProgress: (message) => progressMessages.push(message),
			},
		);

		assert.ok(progressMessages.includes('OpenAI progress: ranking changes'));
		assert.ok(progressMessages.every((message) => !message.includes('Inspecting files')));
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('OpenAiCommitMessageClient throws when the model returns empty content after metadata extraction', async () => {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				choices: [
					{
						message: {
							content: '',
						},
					},
				],
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			},
		)) as typeof fetch;

	try {
		const client = new OpenAiCommitMessageClient(createPromptBuilderStub());

		await assert.rejects(
			client.generateCommitMessage(
			{
				baseUrl: 'https://api.openai.com/v1',
				model: 'gpt-4o-mini',
				maxTokens: 256,
				temperature: 0,
				requestTimeoutMs: 120000,
				apiKey: 'key',
			},
				'diff --git a/file b/file',
			),
			/The model returned an empty commit message after processing the diff metadata/,
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
