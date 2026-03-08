import { CommandRegistrationAdapter } from '../../../core/contracts/command-registration-adapter';
import { ExtensionCommand } from '../../../core/contracts/extension-command';
import { UiGateway } from '../application/contracts';
import { ConfigureOpenAIUseCase } from '../application/configure-openai';

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
