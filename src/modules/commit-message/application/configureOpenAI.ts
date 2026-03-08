import { SettingsGateway, UiGateway } from './contracts';

export class ConfigureOpenAIUseCase {
	constructor(
		private readonly settings: SettingsGateway,
		private readonly ui: UiGateway,
	) {}

	async execute(options?: { showSavedMessage?: boolean }): Promise<boolean> {
		const showSavedMessage = options?.showSavedMessage ?? true;
		const currentBaseUrl = this.settings.getBaseUrl();
		const currentModel = this.settings.getModel();
		const hasCurrentApiKey = Boolean(await this.settings.getApiKey());

		const baseUrl = await this.ui.showInput({
			title: 'Configure OpenAI',
			prompt: 'OpenAI-compatible API base URL',
			value: currentBaseUrl,
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

		const model = await this.ui.showInput({
			title: 'Configure OpenAI',
			prompt: 'Model (e.g. gpt-4o-mini)',
			value: currentModel,
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

		const apiKey = await this.ui.showInput({
			title: 'Configure OpenAI',
			prompt: hasCurrentApiKey
				? 'API key (leave empty to keep the current one)'
				: 'OpenAI API key',
			password: true,
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

		await this.settings.setBaseUrl(baseUrl.trim());
		await this.settings.setModel(model.trim());

		if (apiKey.trim()) {
			await this.settings.setApiKey(apiKey.trim());
		}

		if (showSavedMessage) {
			this.ui.showInfo('OpenAI configuration saved.');
		}

		return true;
	}
}
