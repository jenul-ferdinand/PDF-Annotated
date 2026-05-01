# API Reference

`PDF Annotated` exposes a small API that other VS Code extensions can use to open PDF previews.

## Get API

```js
const ext = vscode.extensions.getExtension("jenul-ferdinand.pdf-annotated");
const api = await ext.activate();
const pdfApi = api.getV1Api();
```

## Preview

```js
pdfApi.previewPdfFile(provider, options);
```

- `provider`: `PdfFileDataProvider`
- `options.name`: overrides the tab title
- `options.documentKey`: persistence key for viewer state
- `options.config`: per-preview configuration
- `options.viewState`: initial viewer state

Common `viewState` fields:

- `pageNumber`
- `pageCoordinates`
- `zoomLevel`
- `spreadMode`
- `rotation`
- `scrollStrategy`

## Data Provider

```js
const provider = pdfApi.PdfFileDataProvider.fromUint8Array(fileData);
```

Available methods:

- `fromUint8Array(data)`
- `fromBase64String(data)`
- `withName(name)`

## Example

```js
const fileData = await vscode.workspace.fs.readFile(uri);

const provider = pdfApi.PdfFileDataProvider
  .fromUint8Array(fileData)
  .withName("Release Notes");

pdfApi.previewPdfFile(provider, {
  documentKey: `preview:${uri.toString()}`,
  viewState: {
    pageNumber: 5,
    zoomLevel: "fit-width",
  },
  config: {
    tabBar: "never",
  },
});
```
