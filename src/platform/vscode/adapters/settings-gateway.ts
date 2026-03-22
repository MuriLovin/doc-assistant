import * as vscode from 'vscode';
import { SettingsGateway } from '../../../modules/commit-message/application/contracts';

const CONFIG_SECTION = 'docAssistant';
const OPENAI_KEY_SECRET = 'docAssistant.openaiApiKey';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_MAX_TOKENS = 256;
const DEFAULT_OPENAI_TEMPERATURE = 0;
const DEFAULT_OPENAI_REQUEST_TIMEOUT_MS = 120000;

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

	getMaxTokens(): number {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		return config.get<number>('openaiMaxTokens', DEFAULT_OPENAI_MAX_TOKENS);
	}

	getTemperature(): number {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		return config.get<number>('openaiTemperature', DEFAULT_OPENAI_TEMPERATURE);
	}

	getRequestTimeoutMs(): number {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		return config.get<number>('openaiRequestTimeoutMs', DEFAULT_OPENAI_REQUEST_TIMEOUT_MS);
	}

	async setBaseUrl(value: string): Promise<void> {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		await config.update('openaiBaseUrl', value, vscode.ConfigurationTarget.Global);
	}

	async setModel(value: string): Promise<void> {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		await config.update('openaiModel', value, vscode.ConfigurationTarget.Global);
	}

	async setMaxTokens(value: number): Promise<void> {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		await config.update('openaiMaxTokens', value, vscode.ConfigurationTarget.Global);
	}

	async setTemperature(value: number): Promise<void> {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		await config.update('openaiTemperature', value, vscode.ConfigurationTarget.Global);
	}

	async setRequestTimeoutMs(value: number): Promise<void> {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		await config.update('openaiRequestTimeoutMs', value, vscode.ConfigurationTarget.Global);
	}

	async getApiKey(): Promise<string> {
		return (await this.context.secrets.get(OPENAI_KEY_SECRET)) ?? '';
	}

	async setApiKey(value: string): Promise<void> {
		await this.context.secrets.store(OPENAI_KEY_SECRET, value);
	}
}
