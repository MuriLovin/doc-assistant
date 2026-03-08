import { ExtensionCommand } from '../../core/contracts/extension-command';
import { ExtensionModule } from '../../core/contracts/extension-module';

export class CommitMessageModule implements ExtensionModule {
	constructor(private readonly commands: ExtensionCommand[]) {}

	activate(): void {
		for (const command of this.commands) {
			command.register();
		}
	}
}
