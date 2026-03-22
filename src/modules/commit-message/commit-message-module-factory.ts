import * as vscode from 'vscode';
import * as path from 'node:path';
import { ExtensionModule } from '../../core/contracts/extension-module';
import { ExtensionModuleFactory } from '../../core/contracts/extension-module-factory';
import {
	VsCodeCommandRegistrationAdapter,
	VsCodeCommitInputGateway,
	VsCodeSettingsGateway,
	VsCodeUiGateway,
	VsCodeWorkspaceGateway,
} from '../../platform/vscode/adapters/index';
import { ConfigureOpenAIUseCase } from './application/configure-openai';
import { GenerateCommitMessageUseCase } from './application/generate-commit-message';
import { GitCliDiffReader } from './infrastructure/git-cli-diff-reader';
import { OpenAiCommitMessageClient } from './infrastructure/open-ai-commit-message-client';
import { MarkdownPromptBuilderProvider } from './infrastructure/providers/prompt-builder-provider';
import { CommitMessageModule } from './commit-message-module';
import { ConfigureOpenAICommand } from './presentation/configure-openai-command';
import { GenerateCommitMessageCommand } from './presentation/generate-commit-message-command';

export class CommitMessageModuleFactory implements ExtensionModuleFactory {
	constructor(private readonly context: vscode.ExtensionContext) {}

	create(): ExtensionModule {
		const ui = new VsCodeUiGateway();
		const settings = new VsCodeSettingsGateway(this.context);
		const workspace = new VsCodeWorkspaceGateway();
		const commitInput = new VsCodeCommitInputGateway();
		const commandRegistration = new VsCodeCommandRegistrationAdapter(this.context);
		const gitDiffReader = new GitCliDiffReader();
		const promptBuilder = new MarkdownPromptBuilderProvider(
			path.join(this.context.extensionPath, 'resources', 'prompts', 'commit-message-system-prompt.md'),
			path.join(this.context.extensionPath, 'resources', 'prompts', 'commit-message-user-prompt.md'),
		);
		const aiClient = new OpenAiCommitMessageClient(promptBuilder);

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

		return new CommitMessageModule([
			new GenerateCommitMessageCommand(commandRegistration, generateCommitMessageUseCase, ui),
			new ConfigureOpenAICommand(commandRegistration, configureOpenAIUseCase, ui),
		]);
	}
}
