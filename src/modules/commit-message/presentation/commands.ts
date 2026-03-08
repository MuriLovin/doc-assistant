import { ConfigureOpenAIUseCase } from '../application/configureOpenAI';
import { GenerateCommitMessageUseCase } from '../application/generateCommitMessage';
import { UiGateway } from '../application/contracts';

export type CommitMessageCommands = {
	generateCommitMessage: () => Promise<void>;
	configureOpenAI: () => Promise<void>;
};

export function createCommitMessageCommands(
	generateCommitMessageUseCase: GenerateCommitMessageUseCase,
	configureOpenAIUseCase: ConfigureOpenAIUseCase,
	ui: UiGateway,
): CommitMessageCommands {
	return {
		generateCommitMessage: async () => {
			try {
				await generateCommitMessageUseCase.execute();
			} catch (error) {
				const details = error instanceof Error ? error.message : String(error);
				ui.showError(`Error generating commit message with AI: ${details}`);
			}
		},
		configureOpenAI: async () => {
			try {
				await configureOpenAIUseCase.execute();
			} catch (error) {
				const details = error instanceof Error ? error.message : String(error);
				ui.showError(`Error configuring OpenAI: ${details}`);
			}
		},
	};
}
