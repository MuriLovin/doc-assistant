import * as vscode from 'vscode';
import { ConfigureOpenAIUseCase } from '../../modules/commit-message/application/configureOpenAI';
import { GenerateCommitMessageUseCase } from '../../modules/commit-message/application/generateCommitMessage';
import { GitCliDiffReader } from '../../modules/commit-message/infrastructure/gitCliDiffReader';
import { OpenAiCommitMessageClient } from '../../modules/commit-message/infrastructure/openAiCommitMessageClient';
import { createCommitMessageCommands } from '../../modules/commit-message/presentation/commands';
import {
	VsCodeCommitInputGateway,
	VsCodeSettingsGateway,
	VsCodeUiGateway,
	VsCodeWorkspaceGateway,
} from './adapters';

export function activate(context: vscode.ExtensionContext): void {
	const ui = new VsCodeUiGateway();
	const settings = new VsCodeSettingsGateway(context);
	const workspace = new VsCodeWorkspaceGateway();
	const commitInput = new VsCodeCommitInputGateway();
	const gitDiffReader = new GitCliDiffReader();
	const aiClient = new OpenAiCommitMessageClient();

	const configureOpenAIUseCase = new ConfigureOpenAIUseCase(settings, ui);
	const generateCommitMessageUseCase = new GenerateCommitMessageUseCase(
		settings,
		workspace,
		gitDiffReader,
		aiClient,
		commitInput,
		ui,
		configureOpenAIUseCase,
	);

	const commands = createCommitMessageCommands(generateCommitMessageUseCase, configureOpenAIUseCase, ui);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'doc-assistant.generateCommitMessage',
			commands.generateCommitMessage,
		),
		vscode.commands.registerCommand('doc-assistant.configureOpenAI', commands.configureOpenAI),
	);
}

export function deactivate(): void {}
