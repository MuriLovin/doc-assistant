# Doc Assistant

VS Code extension to generate commit messages using AI.

## Architecture

The extension follows a modular architecture:

- `src/core/contracts`: shared contracts (`ExtensionModule`, `ExtensionCommand`, `ExtensionModuleFactory`)
- `src/modules/<module>`: feature modules
- `src/platform/vscode`: VS Code-specific adapters and lifecycle bootstrap

Each module should follow:

- `application/`
- `infrastructure/`
- `presentation/`

## File Naming Convention

All files under `src` must follow:

- Lowercase only
- Use `-` for compound names (`kebab-case`)

Examples:

- `commit-message-module-factory.ts`
- `extension-module-factory.ts`
- `command-registration-adapter.ts`

## How to Add a New Module

1. Create module folders:
- `src/modules/<new-module>/application`
- `src/modules/<new-module>/infrastructure`
- `src/modules/<new-module>/presentation`

2. Implement the module class implementing `ExtensionModule`:
- Example: `src/modules/<new-module>/<new-module>-module.ts`
- It should receive commands (or registrars) and call `register()` in `activate()`.

3. Implement the factory class in a separate file:
- `src/modules/<new-module>/<new-module>-module-factory.ts`
- Implement `ExtensionModuleFactory`
- Build all module dependencies inside `create()`
- If needed, instantiate VS Code adapters inside this factory

4. Expose only the module public API:
- `src/modules/<new-module>/index.ts`
- Export only the module factory (and only required public types)

5. Register the module factory in:
- [src/modules/index.ts](https://github.com/MuriLovin/doc-assistant/blob/main/src/modules/index.ts)
- Include `new <NewModule>ModuleFactory(context)` in `createExtensionModuleFactories(...)`

No change is required in [extension-lifecycle.ts](https://github.com/MuriLovin/doc-assistant/blob/main/src/platform/vscode/extension-lifecycle.ts) for each new module.

## How to Add a New Command to an Existing Module

1. Create a command class in `presentation/` implementing `ExtensionCommand`.
2. Use `CommandRegistrationAdapter` inside `register()`:
- `registerCommand('<extension.commandId>', handler)`
3. Add command title/menus in `package.json` (`contributes.commands` and `contributes.menus`).
4. Add the command instance to the module constructor list in that module factory.

## Development

- Compile: `pnpm run compile`
- Lint: `pnpm run lint`
