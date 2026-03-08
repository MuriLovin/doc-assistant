import { CommandRegistrationAdapter } from '../../../core/contracts/commandRegistrationAdapter';
import { ExtensionCommand } from '../../../core/contracts/extensionCommand';
import { UiGateway } from '../application/contracts';
import { GenerateCommitMessageUseCase } from '../application/generateCommitMessage';

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
			}
		});
	}
}
