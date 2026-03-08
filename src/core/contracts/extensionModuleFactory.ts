import { ExtensionModule } from './extensionModule';

export interface ExtensionModuleFactory {
	create(): ExtensionModule;
}
