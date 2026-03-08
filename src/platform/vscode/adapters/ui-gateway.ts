import * as vscode from 'vscode';
import { InputOptions, UiGateway } from '../../../modules/commit-message/application/contracts';

export class VsCodeUiGateway implements UiGateway {
	showInfo(message: string, ...actions: string[]): Promise<string | undefined> {
		return Promise.resolve(vscode.window.showInformationMessage(message, ...actions));
	}

	showWarning(message: string): void {
		vscode.window.showWarningMessage(message);
	}

	showError(message: string): void {
		vscode.window.showErrorMessage(message);
	}

	showInput(options: InputOptions): Promise<string | undefined> {
		return Promise.resolve(
			vscode.window.showInputBox({
				title: options.title,
				prompt: options.prompt,
				value: options.value,
				password: options.password,
				ignoreFocusOut: true,
				validateInput: options.validateInput,
			}),
		);
	}

	withProgress<T>(title: string, task: (report: (message: string) => void) => Promise<T>): Promise<T> {
		return Promise.resolve(
			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title,
					cancellable: false,
				},
				(progress) => task((message) => progress.report({ message })),
			),
		);
	}
}
