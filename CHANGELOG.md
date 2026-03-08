# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.0.3] - 2026-03-08

### Added

- VS Code Marketplace publishing metadata in `package.json` (`publisher`, `license`, `icon`, `homepage`, `bugs`).
- `resources/icon.png` as extension icon for marketplace listing.
- Workflow `.github/workflows/publish-marketplace.yml` to build and upload VSIX artifacts (without publishing).

### Changed

- Publishing scripts now focus on VS Code Marketplace (`package:vsix` and `publish:vscode`).
- `.vscodeignore` updated to exclude SVG and packaging leftovers from the VSIX.
- `README.md` publishing section updated to VS Code Marketplace flow.

## [0.0.2] - 2026-03-08

### Added

- Initial release of the extension.
- Command to generate AI commit messages from the Source Control view.
- Command to configure OpenAI-compatible API settings.

### Changed

- Updated Source Control command icon assets from SVG to PNG for `vsce` publishing compatibility.
