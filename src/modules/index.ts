import * as vscode from 'vscode';
import { ExtensionModuleFactory } from '../core/contracts/extension-module-factory';
import { CommitMessageModuleFactory } from './commit-message';

export function createExtensionModuleFactories(
	context: vscode.ExtensionContext,
): ExtensionModuleFactory[] {
	return [new CommitMessageModuleFactory(context)];
}
