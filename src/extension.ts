import * as vscode from "vscode";
import PDFEdit from "./providers/editorProvider.js";
import PdfViewerApi from "./api/index.js";

export function activate(context: vscode.ExtensionContext) {
  // Register the custom editor provider and add to subscriptions
  const providerDisposable = PDFEdit.register(context);
  context.subscriptions.push(providerDisposable);

  // Register command to force save
  const commandDisposable = vscode.commands.registerCommand("pdfAnnotated.forceSave", () => {
    void PDFEdit.forceSave();
  });
  context.subscriptions.push(commandDisposable);

  if (PDFEdit.isViewerStatusEnabled(context)) {
    const viewerStatusDisposable = vscode.commands.registerCommand(
      "pdfAnnotated.test.getLastViewerStatus",
      (uri?: vscode.Uri | string) => PDFEdit.getLastViewerStatus(uri)
    );
    context.subscriptions.push(viewerStatusDisposable);
  }

  return {
    getV1Api() {
      return PdfViewerApi;
    },
  };
}

// Cleanup function called when extension is deactivated
export function deactivate() {
  // VS Code will automatically dispose all items in context.subscriptions
  // Additional cleanup can be added here if needed
}
