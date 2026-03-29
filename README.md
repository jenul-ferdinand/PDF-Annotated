# Modern PDF Preview (WASM)

<!-- markdownlint-disable MD033 -->

<div align="center">

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/chocolatedesue.modern-pdf-preview?color=darkblue&logo=visual%20studio%20code&logoColor=007acc)][vsc-marketplace]
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/chocolatedesue.modern-pdf-preview?color=darkblue&label=Install%20Count&logo=visual%20studio%20code&logoColor=007acc)][vsc-marketplace]
[![GitHub license](https://img.shields.io/github/license/chocolatedesue/vscode-pdf)](https://github.com/chocolatedesue/vscode-pdf/blob/main/LICENSE)

</div>

Fast PDF preview for VS Code, built on `PDFium WASM` and `@embedpdf/*`.

## Features

- Fast rendering with WASM
- Annotation support
- Save with `Ctrl+S` / `Cmd+S`
- Desktop and Web support
- Theme sync
- Public API for other extensions

## Settings

- `modernPdfViewer.defaultZoomLevel`
- `modernPdfViewer.defaultSpreadMode`
- `modernPdfViewer.tabBar`

## Notes

- Hidden PDF tabs keep their webview context to preserve state.
- Memory usage grows with the number of open PDFs.
- Close unused PDF tabs if you work with large files.

## Install

- VS Code Marketplace: [chocolatedesue.modern-pdf-preview](https://marketplace.visualstudio.com/items?itemName=chocolatedesue.modern-pdf-preview)
- Open VSX: [chocolatedesue.modern-pdf-preview](https://open-vsx.org/extension/chocolatedesue/modern-pdf-preview)

## Docs

- [API](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Reference Repository](docs/REFERENCE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Credits

- [embed-pdf-viewer](https://github.com/embedpdf/embed-pdf-viewer)
- [PDFium WASM](https://github.com/bblanchon/pdfium-binaries)
- [mathematic-inc/vscode-pdf](https://github.com/mathematic-inc/vscode-pdf) as reference only

License: MIT

[vsc-marketplace]: https://marketplace.visualstudio.com/items?itemName=chocolatedesue.modern-pdf-preview
