import { ExtensionModule } from './extension-module';

export interface ExtensionModuleFactory {
	create(): ExtensionModule;
}
