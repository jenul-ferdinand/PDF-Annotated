# Reference Repository Guide

This project includes [`mathematic-inc/vscode-pdf`](https://github.com/mathematic-inc/vscode-pdf) as a Git submodule at `references/vscode-pdf`.

Its purpose is reference only. We use it to study VS Code integration patterns, especially around the custom editor lifecycle and Webview interaction model. We do not build, bundle, or publish code from that repository as part of this extension.

## Clone and Initialize

If you clone this repository from scratch, make sure the submodule is initialized:

```bash
git clone --recurse-submodules <repo-url>
```

If you already cloned the repository without submodules:

```bash
git submodule update --init --recursive
```

To refresh the reference repository later:

```bash
git submodule update --remote references/vscode-pdf
```

## What To Use It For

The reference repository is most useful when you need to compare how another PDF extension integrates with VS Code:

- Custom editor registration
- `openCustomDocument` and `resolveCustomEditor`
- Webview HTML generation and resource URI handling
- `webview.postMessage(...)` and `onDidReceiveMessage(...)`
- Multi-panel tracking and document reload behavior

## Key File Mapping

Start with these files when comparing implementations:

- `references/vscode-pdf/src/extension.ts`: Minimal activation and provider registration
- `references/vscode-pdf/src/pdf-viewer-provider.ts`: Custom editor lifecycle, Webview setup, and message handling
- `references/vscode-pdf/src/webview-collection.ts`: Panel tracking for open PDF views
- `src/extension.js`: Our activation entry point
- `src/providers/editorProvider.js`: Our custom editor provider, save flow, and Webview wiring
- `src/providers/webviewHtmlBuilder.js`: Our HTML and CSP generation
- `src/managers/editorManager.js`: Our active editor tracking

## Practical Comparison Notes

The two projects solve similar VS Code integration problems, but the rendering stack is different:

- `references/vscode-pdf` uses `pdf.js` and is a good baseline for VS Code host and Webview behavior
- This project uses `PDFium WASM` through `@embedpdf/*`, so rendering, save flow, and Webview payloads differ
- If you are changing `CustomEditorProvider` behavior, panel lifecycle handling, or message routing, compare both implementations before editing
- If you are changing viewer internals, prefer our own `src/webview/*` code because the submodule does not share the same rendering engine

## Guardrails

- Do not import runtime code from `references/vscode-pdf` into this extension
- Do not edit the submodule unless you intentionally want to move the pinned reference commit
- Keep architectural decisions in this repository's docs and code comments, not inside the submodule
