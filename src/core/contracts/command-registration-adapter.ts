export interface CommandRegistrationAdapter {
	registerCommand(commandId: string, handler: () => unknown | Promise<unknown>): void;
}
