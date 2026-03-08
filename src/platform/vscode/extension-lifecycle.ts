import * as vscode from 'vscode';
import { ExtensionModule } from '../../core/contracts/extension-module';
import { ExtensionModuleFactory } from '../../core/contracts/extension-module-factory';
import { createExtensionModuleFactories } from '../../modules';

export function activate(context: vscode.ExtensionContext): void {
	const moduleFactories: ExtensionModuleFactory[] = createExtensionModuleFactories(context);
	const modules: ExtensionModule[] = moduleFactories.map((factory) => factory.create());
	for (const module of modules) {
		module.activate();
	}
}

export function deactivate(): void {}
