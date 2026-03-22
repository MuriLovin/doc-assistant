# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.0.4] - 2026-03-22

### Added

- Markdown-based prompt templates for commit message generation, with dedicated system and user prompts loaded from `resources/prompts`.
- Static git diff metadata extraction with file categorization, symbol detection, line statistics, top areas, and prioritized file summaries.
- Diff scoring and prioritization for commit generation based on file category, change volume, and change type.
- Budget-aware diff compression that preserves the most relevant files and summarizes omitted changes when the configured token budget is low.
- Streaming progress updates during commit generation with generic AI states for analysis, ranking, and drafting.
- Extended automated coverage for prompt loading, prompt caching, diff summarization, file ranking, category classification, streaming behavior, and empty-response handling.

### Changed

- Large git diffs are now pre-processed into compact static metadata before being sent to the AI instead of forwarding large raw patches directly.
- Commit generation now derives its request context from the configured `maxTokens`, reserving output space and shrinking the diff summary to fit the available budget.
- The OpenAI client now supports prompt-builder injection, streamed responses, timeout-aware retries, response sanitization, and Conventional Commit extraction from verbose model output.
- The commit message flow now reports intermediate AI progress through the VS Code progress UI while generating the message.
- OpenAI settings now include `maxTokens`, `temperature`, and `requestTimeoutMs` in addition to base URL, model, and API key.
- The configuration flow and VS Code settings gateway now persist and validate the expanded OpenAI settings set.

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
