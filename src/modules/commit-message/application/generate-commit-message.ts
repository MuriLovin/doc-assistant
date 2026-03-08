import {
	CommitInputGateway,
	CommitMessageAiClient,
	GitDiffReader,
	OpenAISettings,
	SettingsGateway,
	UiGateway,
	WorkspaceGateway,
} from './contracts';
import { ConfigureOpenAIUseCase } from './configure-openai';

export class GenerateCommitMessageUseCase {
	constructor(
		private readonly settings: SettingsGateway,
		private readonly workspace: WorkspaceGateway,
		private readonly gitDiffReader: GitDiffReader,
		private readonly aiClient: CommitMessageAiClient,
		private readonly commitInput: CommitInputGateway,
		private readonly ui: UiGateway,
		private readonly configureOpenAI: ConfigureOpenAIUseCase,
	) {}

	async execute(): Promise<void> {
		const openAISettings = await this.resolveSettings();
		if (!openAISettings) {
			return;
		}

		await this.ui.withProgress('Doc Assistant', async (report) => {
			report('Analyzing Git changes...');
			const rootPath = this.workspace.getRootPath();
			if (!rootPath) {
				throw new Error('Open a project folder to use the commit generator.');
			}

			const diff = await this.gitDiffReader.readDiff(rootPath);
			if (!diff.trim()) {
				this.ui.showWarning('No changes found to generate a commit message.');
				return;
			}

			report('Generating commit message with OpenAI...');
			const message = await this.aiClient.generateCommitMessage(openAISettings, diff);
			if (!message) {
				this.ui.showError('Could not generate a commit message.');
				return;
			}

			await this.commitInput.setCommitMessage(message);
			this.ui.showInfo('Commit message filled successfully.');
		});
	}

	private async resolveSettings(): Promise<OpenAISettings | null> {
		const baseUrl = this.settings.getBaseUrl().trim();
		const model = this.settings.getModel().trim();
		const apiKey = (await this.settings.getApiKey()).trim();

		if (baseUrl && model && apiKey) {
			return { baseUrl, model, apiKey };
		}

		const selection = await this.ui.showInfo(
			'Configure base URL, model, and API key to generate commit messages with OpenAI.',
			'Configure now',
		);
		if (selection !== 'Configure now') {
			return null;
		}

		const configured = await this.configureOpenAI.execute({ showSavedMessage: true });
		if (!configured) {
			return null;
		}

		const updatedBaseUrl = this.settings.getBaseUrl().trim();
		const updatedModel = this.settings.getModel().trim();
		const updatedApiKey = (await this.settings.getApiKey()).trim();
		if (!updatedBaseUrl || !updatedModel || !updatedApiKey) {
			return null;
		}

		return {
			baseUrl: updatedBaseUrl,
			model: updatedModel,
			apiKey: updatedApiKey,
		};
	}
}
