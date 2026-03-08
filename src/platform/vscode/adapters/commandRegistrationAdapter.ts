import * as vscode from 'vscode';
import { CommandRegistrationAdapter } from '../../../core/contracts/commandRegistrationAdapter';

export class VsCodeCommandRegistrationAdapter implements CommandRegistrationAdapter {
	constructor(private readonly context: vscode.ExtensionContext) {}

	registerCommand(commandId: string, handler: () => unknown | Promise<unknown>): void {
		this.context.subscriptions.push(vscode.commands.registerCommand(commandId, handler));
	}
}
