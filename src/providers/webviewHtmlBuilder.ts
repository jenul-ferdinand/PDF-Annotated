import type * as vscode from "vscode";

export function getWebviewHtml(
  webview: vscode.Webview,
  htmlContent: string,
  webviewBundleUri: vscode.Uri,
  mediaUri: vscode.Uri,
  wasmUri: vscode.Uri
): string {
  return htmlContent
    .replace(/{{CSP_SOURCE}}/g, webview.cspSource)
    .replace(/{{WEBVIEW_BUNDLE_URI}}/g, webviewBundleUri.toString())
    .replace(/{{MEDIA_URI}}/g, webview.asWebviewUri(mediaUri).toString())
    .replace(/{{WASM_URI}}/g, wasmUri.toString());
}

export function getErrorHtml(
  errorType: string,
  errorMessage: string,
  suggestion: string,
  canRetry: boolean,
  duration: number
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: var(--vscode-font-family);
          padding: 40px;
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
        }
        .error-container {
          max-width: 600px;
          margin: 0 auto;
        }
        h1 {
          color: var(--vscode-errorForeground);
          margin-bottom: 20px;
        }
        .error-details {
          background: var(--vscode-textBlockQuote-background);
          border-left: 4px solid var(--vscode-errorForeground);
          padding: 15px;
          margin: 20px 0;
        }
        .suggestion {
          background: var(--vscode-textBlockQuote-background);
          border-left: 4px solid var(--vscode-notificationsInfoIcon-foreground);
          padding: 15px;
          margin: 20px 0;
        }
        button {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          padding: 10px 20px;
          margin: 10px 10px 10px 0;
          cursor: pointer;
          font-size: 14px;
        }
        button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        .error-code {
          font-family: var(--vscode-editor-font-family);
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="error-container">
        <h1>❌ ${errorType}</h1>
        <div class="error-details">
          <strong>Error Message:</strong><br>
          ${errorMessage || 'An unknown error occurred'}
        </div>
        <div class="suggestion">
          <strong>💡 Suggestion:</strong><br>
          ${suggestion}
        </div>
        ${canRetry ? '<button onclick="window.location.reload()">🔄 Retry</button>' : ''}
        <div class="error-code">
          Error occurred ${duration}ms after webview initialization
        </div>
      </div>
    </body>
    </html>
  `;
}
