import * as vscode from 'vscode';
import { CommitInputGateway } from '../../../modules/commit-message/application/contracts';

type GitExtension = {
	getAPI(version: number): GitApi;
};

type GitApi = {
	repositories: GitRepository[];
};

type GitRepository = {
	inputBox: {
		value: string;
	};
};

export class VsCodeCommitInputGateway implements CommitInputGateway {
	async setCommitMessage(message: string): Promise<void> {
		const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
		if (!gitExtension) {
			throw new Error('VS Code Git extension is not available.');
		}

		const gitApi = gitExtension.getAPI(1);
		const repository = gitApi.repositories[0];
		if (!repository) {
			throw new Error('No active Git repository was found in VS Code.');
		}

		repository.inputBox.value = message;
	}
}
