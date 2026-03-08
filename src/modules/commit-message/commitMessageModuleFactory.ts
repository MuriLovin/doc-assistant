import * as vscode from 'vscode';
import { ExtensionModule } from '../../core/contracts/extensionModule';
import { ExtensionModuleFactory } from '../../core/contracts/extensionModuleFactory';
import {
	VsCodeCommandRegistrationAdapter,
	VsCodeCommitInputGateway,
	VsCodeSettingsGateway,
	VsCodeUiGateway,
	VsCodeWorkspaceGateway,
} from '../../platform/vscode/adapters/index';
import { ConfigureOpenAIUseCase } from './application/configureOpenAI';
import { GenerateCommitMessageUseCase } from './application/generateCommitMessage';
import { GitCliDiffReader } from './infrastructure/gitCliDiffReader';
import { OpenAiCommitMessageClient } from './infrastructure/openAiCommitMessageClient';
import { CommitMessageModule } from './commitMessageModule';
import { ConfigureOpenAICommand } from './presentation/configureOpenAICommand';
import { GenerateCommitMessageCommand } from './presentation/generateCommitMessageCommand';

export class CommitMessageModuleFactory implements ExtensionModuleFactory {
	constructor(private readonly context: vscode.ExtensionContext) {}

	create(): ExtensionModule {
		const ui = new VsCodeUiGateway();
		const settings = new VsCodeSettingsGateway(this.context);
		const workspace = new VsCodeWorkspaceGateway();
		const commitInput = new VsCodeCommitInputGateway();
		const commandRegistration = new VsCodeCommandRegistrationAdapter(this.context);
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

		return new CommitMessageModule([
			new GenerateCommitMessageCommand(commandRegistration, generateCommitMessageUseCase, ui),
			new ConfigureOpenAICommand(commandRegistration, configureOpenAIUseCase, ui),
		]);
	}
}
