import PDFEdit from "./providers/editorProvider.js";
import PdfViewerApi from "./api/index.js";

exports.activate = function (context) {
  // Register the custom editor provider and add to subscriptions
  const providerDisposable = PDFEdit.register(context);
  context.subscriptions.push(providerDisposable);

  // Register command to force save
  const commandDisposable = require('vscode').commands.registerCommand("pdfAnnotated.forceSave", () => {
    PDFEdit.forceSave(context);
  });
  context.subscriptions.push(commandDisposable);

  if (PDFEdit.isViewerStatusEnabled(context)) {
    const viewerStatusDisposable = require('vscode').commands.registerCommand(
      "pdfAnnotated.test.getLastViewerStatus",
      (uri) => PDFEdit.getLastViewerStatus(uri)
    );
    context.subscriptions.push(viewerStatusDisposable);
  }

  return {
    getV1Api: function () {
      return PdfViewerApi;
    },
  };
};

// Cleanup function called when extension is deactivated
exports.deactivate = function () {
  // VS Code will automatically dispose all items in context.subscriptions
  // Additional cleanup can be added here if needed
};
