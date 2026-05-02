# Development

## Prerequisites

- Bun recommended
- Node.js 16+ supported
- VS Code for local testing

## Setup

```bash
bun install
git submodule update --init --recursive
```

## Build

```bash
bun run build
bunx webpack --watch
```

## Test

Desktop integration:

```bash
bun run test:integration
```

This launches a real VS Code Extension Development Host, opens
`test/fixtures/pdf-sample.pdf` with `pdfAnnotated.PDFEdit`, and waits for the
webview to report `loaded`. It fails immediately on a viewer `error` status and
times out if the viewer never finishes loading. Set `VSCODE_TEST_EXECUTABLE` to
use a local VS Code build, or `VSCODE_TEST_VERSION` to run against a specific
downloaded VS Code version.

Web:

```bash
bun run test-web
```

Headless Web:

```bash
bun run test-web-headless
```

Desktop:

1. Open the repo in VS Code.
2. Press `F5`.
3. Open a `.pdf`.

## Release

Update:

- `package.json` version
- `CHANGELOG.md`

Package:

```bash
bun run package
```

Publish:

```bash
bun run deploy
```

If direct publishing is needed:

```bash
set -a; source .env
bunx vsce publish -p "$VSCE_PAT" -i ./pdf-annotated-<version>.vsix --no-dependencies
bunx ovsx publish -p "$OVSX_TOKEN" -i ./pdf-annotated-<version>.vsix
```

## Notes

- `references/vscode-pdf` is reference-only.
- Do not import runtime code from the reference submodule.
