import * as vscode from "vscode";
import Logger from "../services/logger";
import { VIEW_TYPE, WEBVIEW_OPTIONS, MEDIA_FILES } from "../constants/index.js";
import { getPdfConfiguration } from "../managers/configManager";
import { editorRegistry } from "../managers/editorRegistry";
import { ViewStateManager } from "../managers/viewStateManager";
import { PDFDoc } from "../models/document";
import { getWebviewHtml, getErrorHtml } from "./webviewHtmlBuilder";
import type {
  ActiveEditorEntry,
  ExtensionToWebviewMessage,
  PdfDataProvider,
  PdfOpenLinkTarget,
  PdfPreviewMessage,
  PdfPreviewOptions,
  ViewerStatus,
  WebviewOpenLinkMessage,
  WebviewToExtensionMessage,
} from "../types";

export default class PDFEdit implements vscode.CustomEditorProvider<PDFDoc> {
  static viewType = VIEW_TYPE;
  static globalContext: vscode.ExtensionContext | null = null;
  static htmlTemplateCache: string | null = null;
  static wasmBase64Cache: string | null = null;
  static lastViewerStatus: ViewerStatus | null = null;

  private readonly context: vscode.ExtensionContext;
  private readonly viewStateManager: ViewStateManager;
  private readonly _onDidChangeCustomDocument: vscode.EventEmitter<vscode.CustomDocumentEditEvent<PDFDoc>>;
  readonly onDidChangeCustomDocument: vscode.Event<vscode.CustomDocumentEditEvent<PDFDoc>>;

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    PDFEdit.globalContext = context;
    const provider = new PDFEdit(context);
    return vscode.window.registerCustomEditorProvider(PDFEdit.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    });
  }

  static async forceSave(): Promise<void> {
    const active = editorRegistry.findActive();
    if (!active) {
      Logger.log('[Force Save] No active PDF editor found');
      return;
    }

    const { uriString } = active;
    const uri = vscode.Uri.parse(uriString);
    Logger.log(`[Force Save] Triggering save for ${uriString}`);

    const tokenSource = new vscode.CancellationTokenSource();
    try {
      await editorRegistry.startSave(uriString, uri, tokenSource.token);
      vscode.window.showInformationMessage("PDF Saved Successfully");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Failed to save PDF: ${message}`);
    } finally {
      tokenSource.dispose();
    }
  }

  static isViewerStatusEnabled(context: vscode.ExtensionContext | null | undefined): boolean {
    return (
      context?.extensionMode === vscode.ExtensionMode.Test ||
      context?.extensionMode === vscode.ExtensionMode.Development
    );
  }

  static getLastViewerStatus(uri?: vscode.Uri | string): ViewerStatus | null {
    const uriString = typeof uri === "string" ? uri : uri?.toString?.();

    if (uriString) {
      const entry = editorRegistry.get(uriString);
      return entry?.lastViewerStatus || (
        PDFEdit.lastViewerStatus?.documentUri === uriString
          ? PDFEdit.lastViewerStatus
          : null
      );
    }

    const active = editorRegistry.findActive();
    if (active?.entry.lastViewerStatus) {
      return active.entry.lastViewerStatus;
    }

    return PDFEdit.lastViewerStatus;
  }

  static async previewPdfFile(
    provider: PdfDataProvider,
    panel: vscode.WebviewPanel,
    previewOptions: PdfPreviewOptions = {}
  ): Promise<void> {
    panel.webview.options = WEBVIEW_OPTIONS;

    if (!PDFEdit.globalContext) {
      Logger.log('[Error] Extension context not initialized. Call register() first.');
      return;
    }

    const editor = new PDFEdit(PDFEdit.globalContext);
    await editor.setupWebview(provider, panel, previewOptions);
  }

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.viewStateManager = new ViewStateManager(context);
    this._onDidChangeCustomDocument = new vscode.EventEmitter();
    this.onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;
  }

  #getDataProviderUri(dataProvider: PdfDataProvider): vscode.Uri | null {
    if (dataProvider?.uri) {
      return dataProvider.uri;
    }

    if (typeof dataProvider?.getRawData === "function") {
      return vscode.Uri.parse(`pdf-api:///${encodeURIComponent(dataProvider.name || "PDF Annotated")}`);
    }

    return null;
  }

  #isViewerStatusEnabled(): boolean {
    return PDFEdit.isViewerStatusEnabled(this.context);
  }

  #recordViewerStatus(
    uriString: string,
    status: string | undefined,
    details: { documentKey?: string | null; message?: string | null; error?: string | null } = {}
  ): void {
    if (!this.#isViewerStatusEnabled() || !status) {
      return;
    }

    const entry = editorRegistry.get(uriString);
    const nextStatus = {
      status,
      documentUri: uriString,
      documentKey: details.documentKey || entry?.stateKey || null,
      message: details.message || details.error || null,
      updatedAt: new Date().toISOString(),
    };

    if (entry) {
      entry.lastViewerStatus = nextStatus;
    }
    PDFEdit.lastViewerStatus = nextStatus;

    const suffix = nextStatus.message ? `: ${nextStatus.message}` : "";
    Logger.log(`[Viewer Status] ${status} for ${uriString}${suffix}`);
  }

  #binaryToBase64(data: Uint8Array | ArrayBuffer | ArrayLike<number>): string {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
    }

    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async #getWasmBase64(): Promise<string> {
    if (!PDFEdit.wasmBase64Cache) {
      const wasmPath = vscode.Uri.joinPath(this.context.extensionUri, "media", MEDIA_FILES.WASM);
      const wasmData = await vscode.workspace.fs.readFile(wasmPath);
      PDFEdit.wasmBase64Cache = this.#binaryToBase64(wasmData);
      Logger.log(`[Cache] WASM binary loaded and encoded (${wasmData.byteLength} bytes)`);
    }

    return PDFEdit.wasmBase64Cache;
  }

  async saveCustomDocument(document: PDFDoc, cancellation: vscode.CancellationToken): Promise<void> {
    const uriString = document.uri.toString();
    const editorEntry = editorRegistry.get(uriString);

    if (!editorEntry || !editorEntry.panel) {
      Logger.log(`[Error] No active panel found for ${uriString}`);
      return;
    }

    return editorRegistry.startSave(uriString, document.uri, cancellation);
  }

  async saveCustomDocumentAs(
    document: PDFDoc,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    const uriString = document.uri.toString();
    const editorEntry = editorRegistry.get(uriString);

    if (!editorEntry || !editorEntry.panel) {
      throw new Error("No active PDF editor found for Save As");
    }

    await this.#ensureParentDirectory(destination);
    await editorRegistry.startSave(uriString, destination, cancellation);
  }

  async #writeFileData(uri: vscode.Uri, data: Uint8Array | ArrayBuffer | ArrayLike<number>): Promise<void> {
    const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
    const editorEntry = editorRegistry.get(uri.toString());
    if (editorEntry?.dataProvider instanceof PDFDoc) {
      editorEntry.dataProvider.clearTransientSource();
      editorEntry.dataProvider.markPendingWrite();
    }
    Logger.log(`[Save] Writing ${buffer.byteLength} bytes`);
    await vscode.workspace.fs.writeFile(uri, buffer);
  }

  #isAllowedExternalUri(uri: vscode.Uri | undefined): boolean {
    return ["http", "https", "mailto"].includes((uri?.scheme || "").toLowerCase());
  }

  #getParentUri(uri: vscode.Uri): vscode.Uri {
    const lastSlash = uri.path.lastIndexOf("/");
    return uri.with({
      path: lastSlash > 0 ? uri.path.slice(0, lastSlash) : "/",
    });
  }

  async #ensureParentDirectory(uri: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.#getParentUri(uri));
  }

  async #handleOpenLink(message: WebviewOpenLinkMessage, documentUri: vscode.Uri | null): Promise<void> {
    const target = message.target;
    const result = message.result;

    try {
      if (result?.outcome === "uri" && result.uri) {
        const externalUri = vscode.Uri.parse(result.uri);
        if (!this.#isAllowedExternalUri(externalUri)) {
          Logger.log(`[Open Link] Blocked unsupported external URI scheme: ${externalUri.scheme}`);
          void vscode.window.showWarningMessage("Blocked an unsupported external link embedded in the PDF.");
          return;
        }
        await vscode.env.openExternal(externalUri);
        return;
      }

      if (!target || target.type !== "action" || !target.action) {
        return;
      }

      const action = target.action;

      if (action.type === 3 && action.uri) {
        const externalUri = vscode.Uri.parse(action.uri);
        if (!this.#isAllowedExternalUri(externalUri)) {
          Logger.log(`[Open Link] Blocked unsupported external URI scheme: ${externalUri.scheme}`);
          void vscode.window.showWarningMessage("Blocked an unsupported external link embedded in the PDF.");
          return;
        }
        await vscode.env.openExternal(externalUri);
        return;
      }

      if (action.type !== 4 || !action.path || !documentUri) {
        return;
      }

      const normalizedPath = action.path.replace(/\\/g, "/");
      if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(normalizedPath) || normalizedPath.startsWith("/")) {
        Logger.log(`[Open Link] Blocked absolute or scheme-based file link`);
        void vscode.window.showWarningMessage("Blocked a PDF link that points to an absolute path or unsupported URI.");
        return;
      }

      const resourceUri = vscode.Uri.joinPath(this.#getParentUri(documentUri), normalizedPath);
      const targetLabel = resourceUri.path.split("/").pop() || resourceUri.toString(true);
      const selection = await vscode.window.showWarningMessage(
        `This PDF wants to open "${targetLabel}".`,
        { modal: true },
        "Open"
      );

      if (selection !== "Open") {
        return;
      }

      await vscode.commands.executeCommand("vscode.open", resourceUri);
    } catch (error) {
      Logger.log(`[Open Link] Failed to open link: ${error}`);
    }
  }

  async revertCustomDocument(document: PDFDoc, _cancellation: vscode.CancellationToken): Promise<void> {
    const uriString = document.uri.toString();
    const editorEntry = editorRegistry.get(uriString);
    const stateKey = editorEntry?.stateKey || uriString;

    Logger.log(`[Revert] Reverting document: ${uriString}`);

    if (document instanceof PDFDoc) {
      document.clearTransientSource();
    }

    if (editorEntry && editorEntry.panel) {
      await this.viewStateManager.flush(stateKey);
      await this.#postViewerMessage(document, editorEntry.panel, "reload");
    }
  }

  async backupCustomDocument(
    document: PDFDoc,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    await this.#ensureParentDirectory(context.destination);

    const uriString = document.uri.toString();
    const editorEntry = editorRegistry.get(uriString);

    if (editorEntry?.panel) {
      await editorRegistry.startSave(uriString, context.destination, cancellation);
    } else if (typeof document.getFileData === "function") {
      await this.#writeFileData(context.destination, await document.getFileData());
    } else {
      throw new Error("Unable to back up PDF without an active editor");
    }

    return {
      id: context.destination.toString(),
      delete: () => {
        void (async () => {
          try {
            await vscode.workspace.fs.delete(context.destination);
          } catch {
            // Backup cleanup is best-effort.
          }
        })();
      }
    };
  }

  async resolveCustomEditor(
    document: PDFDoc,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const uriString = document.uri.toString();
    Logger.log(`Resolving Custom Editor for: ${uriString}`);

    const existingEntry = editorRegistry.get(uriString);

    // Register editor instance
    editorRegistry.set(uriString, {
      panel,
      stateKey: existingEntry?.stateKey || uriString,
      messageDisposable: existingEntry?.messageDisposable || null,
      changeDisposable: existingEntry?.changeDisposable || null,
      disposeDisposable: existingEntry?.disposeDisposable || null,
      lastViewState: existingEntry?.lastViewState || this.viewStateManager.getPersisted(uriString),
      lastViewerStatus: existingEntry?.lastViewerStatus || null,
      dataProvider: document,
      pendingSave: existingEntry?.pendingSave || null
    });

    const changeEntry = editorRegistry.get(uriString);
    if (!changeEntry) {
      throw new Error(`Failed to register active editor for ${uriString}`);
    }

    if (typeof document.onDidChange === "function" && !changeEntry?.changeDisposable) {
      changeEntry.changeDisposable = document.onDidChange(async () => {
        Logger.log(`[Reload] Posting reload for ${uriString}`);
        const entry = editorRegistry.get(uriString);
        const stateKey = entry?.stateKey || uriString;
        if (entry?.panel) {
          await this.viewStateManager.flush(stateKey);
          await this.#postViewerMessage(document, entry.panel, "reload");
        }
      });
    }

    if (!changeEntry?.disposeDisposable) {
      changeEntry.disposeDisposable = panel.onDidDispose(() => {
        editorRegistry.abortSave(uriString, "Editor was closed before the save completed");
        const entry = editorRegistry.get(uriString);
        if (entry?.messageDisposable) {
          entry.messageDisposable.dispose();
        }
        if (entry?.changeDisposable) {
          entry.changeDisposable.dispose();
        }
        editorRegistry.delete(uriString);
        const stateKey = entry?.stateKey || uriString;
        void this.viewStateManager.flush(stateKey).finally(() => {
          this.viewStateManager.disposeUri(stateKey);
        });
        Logger.log(`Webview panel disposed for ${uriString}`);
      });
    }

    // Check if webview is already set up (to prevent reinitialization on tab switch)
    if (panel.webview.html && panel.webview.html.length > 0) {
      Logger.log('Webview already initialized, skipping setup');
      return;
    }

    await this.setupWebview(document, panel);
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _context: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<PDFDoc> {
    Logger.log(`Opening Custom Document: ${uri.toString()}`);
    const backupUri = _context?.backupId ? vscode.Uri.parse(_context.backupId) : null;
    const initialData = _context?.untitledDocumentData || null;
    return new PDFDoc(uri, { backupUri, initialData });
  }

  async setupWebview(
    dataProvider: PdfDataProvider,
    panel: vscode.WebviewPanel,
    previewOptions: PdfPreviewOptions = {}
  ): Promise<void> {
    const startTime = Date.now();
    const extUri = this.context.extensionUri;
    const mediaUri = vscode.Uri.joinPath(extUri, "media");

    const uri = this.#getDataProviderUri(dataProvider);
    const uriString = uri ? uri.toString() : 'unknown-uri';
    const stateKey = previewOptions.documentKey || editorRegistry.get(uriString)?.stateKey || uriString;

    let localResourceRoots = [mediaUri];

    if (uri && uri.scheme !== 'pdf-api') {
      try {
        // Correctly handle both local and remote URIs by getting the parent directory URI
        // while preserving the original scheme and authority.
        // For file:///path/to/doc.pdf -> file:///path/to
        // For vscode-remote://ssh/path/to/doc.pdf -> vscode-remote://ssh/path/to
        const pdfDir = uri.with({ path: uri.path.substring(0, uri.path.lastIndexOf('/')) });
        localResourceRoots.push(pdfDir);
      } catch (e) {
        Logger.log(`[Warning] Could not resolve PDF directory for localResourceRoots: ${e}`);
      }
    }

    panel.webview.options = {
      ...WEBVIEW_OPTIONS,
      localResourceRoots: localResourceRoots
    };
    Logger.log(`[Performance] Webview setup started for ${uriString}`);

    try {
      // Load HTML template (cached)
      if (!PDFEdit.htmlTemplateCache) {
        const htmlPath = vscode.Uri.joinPath(mediaUri, MEDIA_FILES.WEBVIEW_HTML);
        PDFEdit.htmlTemplateCache = new TextDecoder("utf-8").decode(
          await vscode.workspace.fs.readFile(htmlPath)
        );
        Logger.log('[Cache] HTML template loaded and cached');
      }
      const htmlContent = PDFEdit.htmlTemplateCache;

      // Resolve resources
      const webviewBundleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, MEDIA_FILES.WEBVIEW_BUNDLE));
      const wasmUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, MEDIA_FILES.WASM));

      // Inject variables into HTML
      panel.webview.html = getWebviewHtml(panel.webview, htmlContent, webviewBundleUri, mediaUri, wasmUri);

      // Replace any previous message listener before re-initializing
      const existingEntry = editorRegistry.get(uriString);
      if (existingEntry && existingEntry.messageDisposable) {
        existingEntry.messageDisposable.dispose();
      }

      // Message Handling
      const messageDisposable = panel.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
        if (message.command === 'ready') {
          this.#recordViewerStatus(uriString, "mounted", { documentKey: stateKey });
          await this.handleWebviewReady(dataProvider, panel, previewOptions);
        } else if (message.command === 'log') {
          Logger.log(`[Webview] ${message.message}`);
        } else if (message.command === 'viewer-status') {
          this.#recordViewerStatus(uriString, message.status, {
            documentKey: message.documentKey || stateKey,
            message: message.message,
            error: message.error,
          });
        } else if (message.command === 'error') {
          if (!editorRegistry.rejectSave(uriString, message.requestId, message.error)) {
            Logger.log(`[Webview Error] ${message.error}`);
          }
        } else if (message.command === 'viewer-state-changed') {
          const nextViewState = message.viewState || null;
          const incomingStateKey = message.documentKey || stateKey;
          await this.viewStateManager.record(incomingStateKey, uriString, nextViewState, { flush: message.flush });
        } else if (message.command === "open-link") {
          await this.#handleOpenLink(message, uri);
        } else if (message.command === 'dirty') {
          Logger.log(`[Webview] Document marked dirty`);
          this._onDidChangeCustomDocument.fire({
            document: dataProvider as PDFDoc,
            undo: () => { },
            redo: () => { }
          });
        } else if (message.command === 'close') {
          void vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        } else if (message.command === 'save-response') {
          await editorRegistry.resolveSave(uriString, message.requestId, message.data,
            (dest, data) => this.#writeFileData(dest, data));
        }
      });

      // Update entry with new disposable and current panel
      editorRegistry.set(uriString, {
        panel,
        stateKey,
        messageDisposable,
        changeDisposable: existingEntry ? existingEntry.changeDisposable : null,
        disposeDisposable: existingEntry ? existingEntry.disposeDisposable : null,
        lastViewState: existingEntry ? existingEntry.lastViewState : this.viewStateManager.getPersisted(uriString),
        lastViewerStatus: existingEntry ? existingEntry.lastViewerStatus : null,
        dataProvider,
        pendingSave: existingEntry ? existingEntry.pendingSave : null
      });

      const duration = Date.now() - startTime;
      Logger.logPerformance('Webview setup completed', duration);

    } catch (e) {
      const duration = Date.now() - startTime;
      const error = e instanceof Error ? e : new Error(String(e));
      const codedError = e as { code?: string };
      Logger.log(`[Performance] Webview setup failed after ${duration}ms: ${error.stack || error.message}`);
      this.#recordViewerStatus(uriString, "error", {
        documentKey: stateKey,
        message: error.message,
      });

      // Classify error type and provide helpful suggestions
      let errorType = 'Unknown Error';
      let suggestion = 'Please try reopening the file.';
      let canRetry = true;

      if (error.message.includes('WASM')) {
        errorType = 'WASM Loading Failed';
        suggestion = 'The WebAssembly module failed to load. Try reinstalling the extension.';
        canRetry = false;
      } else if (codedError.code === 'ENOENT' || error.message.includes('ENOENT')) {
        errorType = 'File Not Found';
        suggestion = 'The PDF file may have been moved or deleted.';
        canRetry = false;
      } else if (codedError.code === 'EACCES' || error.message.includes('EACCES')) {
        errorType = 'Permission Denied';
        suggestion = 'Check file permissions and try again.';
      } else if (error.message.includes('fetch')) {
        errorType = 'Network Error';
        suggestion = 'Failed to load required resources. Check your connection.';
      }

      // Display user-friendly error page
      panel.webview.html = getErrorHtml(errorType, error.message, suggestion, canRetry, duration);

      // Show VS Code notification with actions
      vscode.window.showErrorMessage(
        `PDF Viewer: ${errorType}`,
        'View Logs',
        'Report Issue'
      ).then(selection => {
        if (selection === 'View Logs') {
          Logger.show();
        } else if (selection === 'Report Issue') {
          void vscode.env.openExternal(vscode.Uri.parse(
            'https://github.com/jenul-ferdinand/PDF-Annotated/issues/new'
          ));
        }
      });
    }
  }

  async handleWebviewReady(
    dataProvider: PdfDataProvider,
    panel: vscode.WebviewPanel,
    previewOptions: PdfPreviewOptions = {}
  ): Promise<void> {
    const isWeb = vscode.env.uiKind === vscode.UIKind.Web;
    Logger.log(`[Webview Ready] Environment: ${isWeb ? "Web" : "Desktop"} (UIKind: ${vscode.env.uiKind})`);
    await this.#postViewerMessage(dataProvider, panel, "preview", previewOptions);
  }

  async #postViewerMessage(
    dataProvider: PdfDataProvider,
    panel: vscode.WebviewPanel,
    command: PdfPreviewMessage["command"],
    previewOptions: PdfPreviewOptions = {}
  ): Promise<void> {
    const uri = this.#getDataProviderUri(dataProvider);
    const uriString = uri ? uri.toString() : "unknown-uri";
    const documentKey = previewOptions.documentKey || editorRegistry.get(uriString)?.stateKey || uriString;
    const extUri = this.context.extensionUri;
    const mediaUri = vscode.Uri.joinPath(extUri, "media");
    const wasmUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, MEDIA_FILES.WASM));
    const persistedViewState =
      this.viewStateManager.getPersisted(documentKey) ||
      editorRegistry.get(uriString)?.lastViewState ||
      null;

    const msg: PdfPreviewMessage = {
      command,
      documentKey,
      wasmUri: wasmUri.toString(),
      viewerStatusEnabled: this.#isViewerStatusEnabled(),
      config: {
        ...getPdfConfiguration(),
        ...(previewOptions.config || {}),
      },
      viewState: previewOptions.viewState
        ? {
          ...(persistedViewState || {}),
          ...previewOptions.viewState,
        }
        : persistedViewState,
    };

    Logger.log(`[View State] Sending ${command} payload to webview`);

    try {
      msg.wasmData = await this.#getWasmBase64();
    } catch (err) {
      Logger.log(`[Warning] Failed to inline WASM data, falling back to webview URI: ${err}`);
    }

    const canInjectData =
      dataProvider instanceof PDFDoc ||
      typeof dataProvider.getRawData === "function" ||
      typeof dataProvider.getFileData === "function";

    if (dataProvider.uri && !canInjectData) {
      Logger.log(`Strategy: URI Mode (${command})`);
      msg.pdfUri = panel.webview.asWebviewUri(dataProvider.uri).toString();
      panel.webview.postMessage(msg);
      return;
    }

    Logger.log(`Strategy: Data Injection Mode (${command})`);

    try {
      let data;
      if (dataProvider instanceof PDFDoc) {
        data = await dataProvider.getFileData();
      } else if (typeof dataProvider.getRawData === 'function') {
        data = dataProvider.getRawData();
      } else {
        if (!dataProvider.getFileData) {
          throw new Error("PDF data provider does not expose file data");
        }
        data = await dataProvider.getFileData();
      }

      msg.data = typeof data === "string" ? data : this.#binaryToBase64(data);

      // Use base64 instead of webview local-resource URLs so VS Code's webview
      // service worker is not in the PDF/WASM loading path.
      panel.webview.postMessage(msg satisfies ExtensionToWebviewMessage);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.log(`Error loading file data: ${err}`);
      this.#recordViewerStatus(uriString, "error", {
        documentKey,
        message: error.message,
      });
      panel.webview.postMessage({
        command: 'error',
        error: error.message
      } satisfies ExtensionToWebviewMessage);
    }
  }

}
