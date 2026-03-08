import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);
const CONFIG_SECTION = 'docAssistant';
const OPENAI_KEY_SECRET = 'docAssistant.openaiApiKey';

type OpenAIChatResponse = {
	error?: { message?: string };
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
};

type GitExtension = {
	getAPI(version: number): GitApi;
};

type GitApi = {
	repositories: GitRepository[];
};

type GitRepository = {
	rootUri: vscode.Uri;
	inputBox: {
		value: string;
	};
};

export function activate(context: vscode.ExtensionContext): void {
	const generateDisposable = vscode.commands.registerCommand(
		'doc-assistant.generateCommitMessage',
		async () => {
			try {
				const settings = await ensureOpenAISettings(context);
				if (!settings) {
					return;
				}

				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Doc Assistant',
						cancellable: false,
					},
					async (progress) => {
						progress.report({ message: 'Analyzing Git changes...' });
						const diff = await readGitDiff();

						if (!diff) {
							vscode.window.showWarningMessage('No changes found to generate a commit message.');
							return;
						}

						progress.report({ message: 'Generating commit message with OpenAI...' });
						const message = await generateCommitMessageWithOpenAI(settings, diff);

						if (!message) {
							vscode.window.showErrorMessage('Could not generate a commit message.');
							return;
						}

						await setGitCommitInputValue(message);
						vscode.window.showInformationMessage('Commit message filled successfully.');
					},
				);
			} catch (error) {
				const details = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Error generating commit message with AI: ${details}`);
			}
		},
	);

	const configureDisposable = vscode.commands.registerCommand(
		'doc-assistant.configureOpenAI',
		async () => {
			await configureOpenAI(context);
		},
	);

	context.subscriptions.push(generateDisposable, configureDisposable);
}

async function configureOpenAI(context: vscode.ExtensionContext): Promise<boolean> {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const currentBaseUrl = config.get<string>('openaiBaseUrl', 'https://api.openai.com/v1');
	const currentModel = config.get<string>('openaiModel', 'gpt-4o-mini');
	const hasCurrentApiKey = Boolean(await context.secrets.get(OPENAI_KEY_SECRET));

	const baseUrl = await vscode.window.showInputBox({
		title: 'Configure OpenAI',
		prompt: 'OpenAI-compatible API base URL',
		value: currentBaseUrl,
		ignoreFocusOut: true,
		validateInput: (value) => {
			if (!value.trim()) {
				return 'Please provide the API base URL.';
			}

			try {
				new URL(value.trim());
				return null;
			} catch {
				return 'Invalid URL. Example: https://api.openai.com/v1';
			}
		},
	});

	if (!baseUrl) {
		return false;
	}

	const model = await vscode.window.showInputBox({
		title: 'Configure OpenAI',
		prompt: 'Model (e.g. gpt-4o-mini)',
		value: currentModel,
		ignoreFocusOut: true,
		validateInput: (value) => {
			if (!value.trim()) {
				return 'Please provide the model.';
			}

			return null;
		},
	});

	if (!model) {
		return false;
	}

	const apiKey = await vscode.window.showInputBox({
		title: 'Configure OpenAI',
		prompt: hasCurrentApiKey
			? 'API key (leave empty to keep the current one)'
			: 'OpenAI API key',
		password: true,
		ignoreFocusOut: true,
		validateInput: (value) => {
			if (!hasCurrentApiKey && !value.trim()) {
				return 'Please provide the API key.';
			}

			return null;
		},
	});

	if (apiKey === undefined) {
		return false;
	}

	await config.update('openaiBaseUrl', baseUrl.trim(), vscode.ConfigurationTarget.Global);
	await config.update('openaiModel', model.trim(), vscode.ConfigurationTarget.Global);

	if (apiKey.trim()) {
		await context.secrets.store(OPENAI_KEY_SECRET, apiKey.trim());
	}

	vscode.window.showInformationMessage('OpenAI configuration saved.');
	return true;
}

async function ensureOpenAISettings(
	context: vscode.ExtensionContext,
): Promise<{ baseUrl: string; model: string; apiKey: string } | null> {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const baseUrl = config.get<string>('openaiBaseUrl', 'https://api.openai.com/v1').trim();
	const model = config.get<string>('openaiModel', 'gpt-4o-mini').trim();
	const apiKey = (await context.secrets.get(OPENAI_KEY_SECRET))?.trim() ?? '';

	if (baseUrl && model && apiKey) {
		return { baseUrl, model, apiKey };
	}

	const selection = await vscode.window.showInformationMessage(
		'Configure base URL, model, and API key to generate commit messages with OpenAI.',
		'Configure now',
	);

	if (selection !== 'Configure now') {
		return null;
	}

	const configured = await configureOpenAI(context);
	if (!configured) {
		return null;
	}

	const updatedConfig = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const updatedBaseUrl = updatedConfig.get<string>('openaiBaseUrl', 'https://api.openai.com/v1').trim();
	const updatedModel = updatedConfig.get<string>('openaiModel', 'gpt-4o-mini').trim();
	const updatedApiKey = (await context.secrets.get(OPENAI_KEY_SECRET))?.trim() ?? '';

	if (!updatedBaseUrl || !updatedModel || !updatedApiKey) {
		return null;
	}

	return { baseUrl: updatedBaseUrl, model: updatedModel, apiKey: updatedApiKey };
}

async function readGitDiff(): Promise<string> {
	const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!rootPath) {
		throw new Error('Open a project folder to use the commit generator.');
	}

	const stagedDiff = await runGitCommand(rootPath, ['diff', '--cached']);
	if (stagedDiff.trim()) {
		return stagedDiff;
	}

	return runGitCommand(rootPath, ['diff']);
}

async function runGitCommand(cwd: string, args: string[]): Promise<string> {
	try {
		const { stdout } = await execFileAsync('git', args, {
			cwd,
			maxBuffer: 10 * 1024 * 1024,
		});

		return stdout;
	} catch {
		throw new Error('Failed to read Git changes. Check whether this directory is a Git repository.');
	}
}

async function setGitCommitInputValue(message: string): Promise<void> {
	const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
	if (!gitExtension) {
		throw new Error('VS Code Git extension is not available.');
	}

	const gitApi = gitExtension.getAPI(1);
	const repository = gitApi.repositories[0];
	if (!repository) {
		throw new Error('No active Git repository was found in VS Code.');
	}

	repository.inputBox.value = message;
}

async function generateCommitMessageWithOpenAI(
	settings: { baseUrl: string; model: string; apiKey: string },
	diff: string,
): Promise<string> {
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
	return sanitizeCommitMessage(content);
}

function sanitizeCommitMessage(rawMessage: string): string {
	return rawMessage
		.trim()
		.replace(/^['"`]+|['"`]+$/g, '')
		.split('\n')[0]
		.trim();
}

export function deactivate(): void {}
