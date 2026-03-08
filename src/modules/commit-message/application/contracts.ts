export type OpenAISettings = {
	baseUrl: string;
	model: string;
	apiKey: string;
};

export type InputOptions = {
	title: string;
	prompt: string;
	value?: string;
	password?: boolean;
	validateInput?: (value: string) => string | null;
};

export interface UiGateway {
	showInfo(message: string, ...actions: string[]): Promise<string | undefined>;
	showWarning(message: string): void;
	showError(message: string): void;
	showInput(options: InputOptions): Promise<string | undefined>;
	withProgress<T>(title: string, task: (report: (message: string) => void) => Promise<T>): Promise<T>;
}

export interface SettingsGateway {
	getBaseUrl(): string;
	getModel(): string;
	setBaseUrl(value: string): Promise<void>;
	setModel(value: string): Promise<void>;
	getApiKey(): Promise<string>;
	setApiKey(value: string): Promise<void>;
}

export interface WorkspaceGateway {
	getRootPath(): string | null;
}

export interface CommitInputGateway {
	setCommitMessage(message: string): Promise<void>;
}

export interface GitDiffReader {
	readDiff(rootPath: string): Promise<string>;
}

export interface CommitMessageAiClient {
	generateCommitMessage(settings: OpenAISettings, diff: string): Promise<string>;
}
