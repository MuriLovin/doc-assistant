import { CommandRegistrationAdapter } from '../../../core/contracts/commandRegistrationAdapter';
import { ExtensionCommand } from '../../../core/contracts/extensionCommand';
import { UiGateway } from '../application/contracts';
import { ConfigureOpenAIUseCase } from '../application/configureOpenAI';

export class ConfigureOpenAICommand implements ExtensionCommand {
	constructor(
		private readonly commandRegistration: CommandRegistrationAdapter,
		private readonly configureOpenAI: ConfigureOpenAIUseCase,
		private readonly ui: UiGateway,
	) {}

	register(): void {
		this.commandRegistration.registerCommand('doc-assistant.configureOpenAI', async () => {
			try {
				await this.configureOpenAI.execute();
			} catch (error) {
				const details = error instanceof Error ? error.message : String(error);
				this.ui.showError(`Error configuring OpenAI: ${details}`);
			}
		});
	}
}
