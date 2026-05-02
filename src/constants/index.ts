import type * as vscode from "vscode";

// Extension configuration constants
export const VIEW_TYPE = "pdfAnnotated.PDFEdit";
export const OUTPUT_CHANNEL_NAME = "PDF Annotated";

// Media files
export const MEDIA_FILES = {
    WASM: "pdfium.wasm",
    WEBVIEW_HTML: "webview.html",
    WEBVIEW_BUNDLE: "webview-bundle.js"
} as const;

// Webview configuration
export const WEBVIEW_OPTIONS: vscode.WebviewOptions & vscode.WebviewPanelOptions = {
    enableScripts: true,
    retainContextWhenHidden: true,
};
