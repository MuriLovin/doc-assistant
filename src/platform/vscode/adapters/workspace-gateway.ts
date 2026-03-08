import * as vscode from 'vscode';
import { WorkspaceGateway } from '../../../modules/commit-message/application/contracts';

export class VsCodeWorkspaceGateway implements WorkspaceGateway {
	getRootPath(): string | null {
		return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
	}
}
