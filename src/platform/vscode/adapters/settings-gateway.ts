import * as vscode from 'vscode';
import { SettingsGateway } from '../../../modules/commit-message/application/contracts';

const CONFIG_SECTION = 'docAssistant';
const OPENAI_KEY_SECRET = 'docAssistant.openaiApiKey';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export class VsCodeSettingsGateway implements SettingsGateway {
	constructor(private readonly context: vscode.ExtensionContext) {}

	getBaseUrl(): string {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		return config.get<string>('openaiBaseUrl', DEFAULT_OPENAI_BASE_URL);
	}

	getModel(): string {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		return config.get<string>('openaiModel', DEFAULT_OPENAI_MODEL);
	}

	async setBaseUrl(value: string): Promise<void> {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		await config.update('openaiBaseUrl', value, vscode.ConfigurationTarget.Global);
	}

	async setModel(value: string): Promise<void> {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		await config.update('openaiModel', value, vscode.ConfigurationTarget.Global);
	}

	async getApiKey(): Promise<string> {
		return (await this.context.secrets.get(OPENAI_KEY_SECRET)) ?? '';
	}

	async setApiKey(value: string): Promise<void> {
		await this.context.secrets.store(OPENAI_KEY_SECRET, value);
	}
}
