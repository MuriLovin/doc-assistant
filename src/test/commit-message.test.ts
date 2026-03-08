import test from 'node:test';
import assert from 'node:assert/strict';

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
import { ConfigureOpenAICommand } from '../modules/commit-message/presentation/configure-openai-command';
import { GenerateCommitMessageCommand } from '../modules/commit-message/presentation/generate-commit-message-command';

class InMemorySettings implements SettingsGateway {
	constructor(
		private baseUrl: string,
		private model: string,
		private apiKey: string,
	) {}

	getBaseUrl(): string {
		return this.baseUrl;
	}

	getModel(): string {
		return this.model;
	}

	async setBaseUrl(value: string): Promise<void> {
		this.baseUrl = value;
	}

	async setModel(value: string): Promise<void> {
		this.model = value;
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

	async generateCommitMessage(): Promise<string> {
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
	const settings = new InMemorySettings('https://api.openai.com/v1', 'gpt-4o-mini', 'key');
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
});

test('GenerateCommitMessageUseCase warns when there is no diff', async () => {
	const settings = new InMemorySettings('https://api.openai.com/v1', 'gpt-4o-mini', 'key');
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
	const settings = new InMemorySettings('https://api.openai.com/v1', 'gpt-4o-mini', '');
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
