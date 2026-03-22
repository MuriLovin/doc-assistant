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
		const currentMaxTokens = this.settings.getMaxTokens();
		const currentTemperature = this.settings.getTemperature();
		const currentRequestTimeoutMs = this.settings.getRequestTimeoutMs();
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

		const maxTokens = await this.ui.showInput({
			title: 'Configure OpenAI',
			prompt: 'Max output tokens (e.g. 256)',
			value: String(currentMaxTokens),
			validateInput: (value) => {
				const normalizedValue = value.trim();
				if (!normalizedValue) {
					return 'Please provide max output tokens.';
				}

				const parsedValue = Number.parseInt(normalizedValue, 10);
				if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
					return 'Provide a positive integer.';
				}

				if (parsedValue > 8192) {
					return 'Provide a value lower than or equal to 8192.';
				}

				return null;
			},
		});

		if (!maxTokens) {
			return false;
		}

		const temperature = await this.ui.showInput({
			title: 'Configure OpenAI',
			prompt: 'Temperature (e.g. 0 or 0.2)',
			value: String(currentTemperature),
			validateInput: (value) => {
				const normalizedValue = value.trim();
				if (!normalizedValue) {
					return 'Please provide temperature.';
				}

				const parsedValue = Number.parseFloat(normalizedValue);
				if (Number.isNaN(parsedValue) || parsedValue < 0 || parsedValue > 2) {
					return 'Provide a number between 0 and 2.';
				}

				return null;
			},
		});

		if (!temperature) {
			return false;
		}

		const requestTimeoutMs = await this.ui.showInput({
			title: 'Configure OpenAI',
			prompt: 'Request timeout in milliseconds (e.g. 120000)',
			value: String(currentRequestTimeoutMs),
			validateInput: (value) => {
				const normalizedValue = value.trim();
				if (!normalizedValue) {
					return 'Please provide request timeout.';
				}

				const parsedValue = Number.parseInt(normalizedValue, 10);
				if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
					return 'Provide a positive integer.';
				}

				if (parsedValue > 900000) {
					return 'Provide a value lower than or equal to 900000.';
				}

				return null;
			},
		});

		if (!requestTimeoutMs) {
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
		await this.settings.setMaxTokens(Number.parseInt(maxTokens.trim(), 10));
		await this.settings.setTemperature(Number.parseFloat(temperature.trim()));
		await this.settings.setRequestTimeoutMs(Number.parseInt(requestTimeoutMs.trim(), 10));

		if (apiKey.trim()) {
			await this.settings.setApiKey(apiKey.trim());
		}

		if (showSavedMessage) {
			this.ui.showInfo('OpenAI configuration saved.');
		}

		return true;
	}
}
