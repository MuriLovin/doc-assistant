import { CommandRegistrationAdapter } from '../../../core/contracts/command-registration-adapter';
import { ExtensionCommand } from '../../../core/contracts/extension-command';
import { UiGateway } from '../application/contracts';
import { GenerateCommitMessageUseCase } from '../application/generate-commit-message';

export class GenerateCommitMessageCommand implements ExtensionCommand {
	constructor(
		private readonly commandRegistration: CommandRegistrationAdapter,
		private readonly generateCommitMessage: GenerateCommitMessageUseCase,
		private readonly ui: UiGateway,
	) {}

	register(): void {
		this.commandRegistration.registerCommand('doc-assistant.generateCommitMessage', async () => {
			try {
				await this.generateCommitMessage.execute();
			} catch (error) {
				const details = error instanceof Error ? error.message : String(error);
				this.ui.showError(`Error generating commit message with AI: ${details}`);

                console.error('Doc assistant - Error details:', error);
			}
		});
	}
}
