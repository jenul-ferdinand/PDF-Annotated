# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.7] - 2026-03-29

### Improved
- **Viewer Restore**: Reduced restore-time persistence churn by deduplicating checkpoints, delaying post-restore flushes, and moving more viewer defaults into startup configuration.
- **Code Structure**: Extracted view state persistence and viewer runtime logic into dedicated modules for easier maintenance and future extension.

## [1.5.6] - 2026-03-29

### Updated
- **Dependencies**: Refreshed Bun-managed dependencies, including the EmbedPDF stack and build tooling.
- **Packaging**: Realigned `@types/vscode` with `engines.vscode` so VSIX packaging works reliably with `vsce`.

### Added
- **Reference Submodule**: Added `references/vscode-pdf` as a Git submodule for VS Code custom editor and Webview integration reference.
- **Documentation**: Added submodule usage guidance and development notes for the reference repository.

## [1.5.5] - 2026-01-17

### Fixed
- **Session Persistence**: Fixed issue where PDFs failed to load after VSCode restart due to expired webview URIs.
- **View State Restoration**: Implemented automatic page position restoration after VSCode restart.

### Optimized
- **Performance**: Added HTML template caching to reduce file I/O operations (1-2ms improvement per PDF load).
- **Code Quality**: Unified file save logic, removing duplicate code paths for better maintainability.
- **State Management**: Added debounce (300ms) to view state saves to prevent excessive serialization during rapid page changes.
- **Configuration**: Centralized webview options to ensure consistency across the extension.

### Removed
- **Code Cleanup**: Removed unused constants (`EDITOR_JS`, `BASE64_CHUNK_SIZE`) and imports for cleaner codebase.
