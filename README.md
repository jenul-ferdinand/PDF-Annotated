# PDF Annotated

Fast PDF preview and annotation editing for VS Code, built on `PDFium WASM` and `@embedpdf/*`.

## Features

- Fast rendering with WASM
- Annotation support
- Save with `Ctrl+S` / `Cmd+S`
- Desktop and Web support
- Theme sync
- Public API for other extensions

## Settings

- `pdfAnnotated.defaultZoomLevel`
- `pdfAnnotated.defaultSpreadMode`
- `pdfAnnotated.tabBar`

## Notes

- Hidden PDF tabs keep their webview context to preserve state.
- Memory usage grows with the number of open PDFs.
- Close unused PDF tabs if you work with large files.

## Install

This extension is being migrated to:

- Repository: [jenul-ferdinand/PDF-Annotated](https://github.com/jenul-ferdinand/PDF-Annotated)

Marketplace publishing is not set up yet.

## Docs

- [API](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Reference Repository](docs/REFERENCE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Credits

- [embed-pdf-viewer](https://github.com/embedpdf/embed-pdf-viewer)
- [PDFium WASM](https://github.com/bblanchon/pdfium-binaries)
- Derived from [chocolatedesue/vscode-pdf](https://github.com/chocolatedesue/vscode-pdf) under MIT
- [mathematic-inc/vscode-pdf](https://github.com/mathematic-inc/vscode-pdf) as reference only

License: MIT
