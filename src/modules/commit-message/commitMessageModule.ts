import { ExtensionCommand } from '../../core/contracts/extensionCommand';
import { ExtensionModule } from '../../core/contracts/extensionModule';

export class CommitMessageModule implements ExtensionModule {
	constructor(private readonly commands: ExtensionCommand[]) {}

	activate(): void {
		for (const command of this.commands) {
			command.register();
		}
	}
}
