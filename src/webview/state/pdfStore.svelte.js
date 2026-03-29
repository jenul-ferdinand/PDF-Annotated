import { base64ToArrayBuffer } from "../utils/binary.js";
import { vscodeService } from "../services/vscode.js";

const DEFAULT_VIEW_STATE = {
  zoomLevel: "fit-width",
  spreadMode: "odd",
  rotation: 0,
  scrollStrategy: "vertical",
};

function roundCoordinate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.round(value * 10) / 10;
}

function normalizeSidebar(sidebar) {
  if (!sidebar?.placement || !sidebar?.slot || !sidebar?.sidebarId) {
    return undefined;
  }

  return {
    placement: sidebar.placement,
    slot: sidebar.slot,
    sidebarId: sidebar.sidebarId,
    ...(sidebar.tabId ? { tabId: sidebar.tabId } : {}),
  };
}

function normalizeViewState(viewState) {
  if (!viewState) {
    return null;
  }

  const normalized = {};

  if (typeof viewState.pageNumber === "number" && Number.isFinite(viewState.pageNumber)) {
    normalized.pageNumber = viewState.pageNumber;
  }

  const x = roundCoordinate(viewState.pageCoordinates?.x);
  const y = roundCoordinate(viewState.pageCoordinates?.y);
  if (x !== undefined && y !== undefined) {
    normalized.pageCoordinates = { x, y };
  }

  if (viewState.zoomLevel && viewState.zoomLevel !== DEFAULT_VIEW_STATE.zoomLevel) {
    normalized.zoomLevel = viewState.zoomLevel;
  }

  if (viewState.spreadMode && viewState.spreadMode !== DEFAULT_VIEW_STATE.spreadMode) {
    normalized.spreadMode = viewState.spreadMode;
  }

  if (
    typeof viewState.rotation === "number" &&
    Number.isFinite(viewState.rotation) &&
    viewState.rotation !== DEFAULT_VIEW_STATE.rotation
  ) {
    normalized.rotation = viewState.rotation;
  }

  if (
    viewState.scrollStrategy &&
    viewState.scrollStrategy !== DEFAULT_VIEW_STATE.scrollStrategy
  ) {
    normalized.scrollStrategy = viewState.scrollStrategy;
  }

  const sidebar = normalizeSidebar(viewState.sidebar);
  if (sidebar) {
    normalized.sidebar = sidebar;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function areViewStatesEqual(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function getInitialTheme() {
  if (typeof document !== "undefined") {
    if (
      document.body.classList.contains("vscode-dark") ||
      document.body.classList.contains("vscode-high-contrast")
    ) {
      return "dark";
    }
  }
  return "light";
}

export const pdfState = $state({
  pdfSrc: null,
  wasmUrl: "",
  loading: true,
  error: null,
  themePreference: getInitialTheme(),
  messageConfig: null,
  activeBlobUrl: null,
  viewerKey: 0,
  currentDocumentUri: null,
  currentDocumentKey: null,
  persistedViewState: null,
  registry: null,
  container: null,

  updateTheme() {
    const newTheme = getInitialTheme();
    if (this.themePreference !== newTheme) {
      this.themePreference = newTheme;
    }
  },

  syncViewState(viewState, options = {}) {
    const { notifyExtension = true, flush = false } = options;
    const nextViewState = normalizeViewState(viewState);
    const viewStateChanged = !areViewStatesEqual(this.persistedViewState, nextViewState);

    if (viewStateChanged) {
      this.persistedViewState = nextViewState;
    }

    const currentState = vscodeService.getState() || {};
    const shouldPersistLocally =
      viewStateChanged ||
      currentState.documentKey !== this.currentDocumentKey ||
      !areViewStatesEqual(currentState.viewState, nextViewState) ||
      currentState.config !== this.messageConfig;

    if (shouldPersistLocally) {
      vscodeService.setState({
        ...currentState,
        documentKey: this.currentDocumentKey,
        viewState: nextViewState,
        config: this.messageConfig,
      });
    }

    if (notifyExtension && (viewStateChanged || flush)) {
      vscodeService.postMessage({
        command: "viewer-state-changed",
        viewState: nextViewState,
        flush,
      });
    }
  },

  setPreview(message, options = {}) {
    const { forceReload = false } = options;
    const newDocUri = message.pdfUri || "base64-data";
    const newDocKey = message.documentKey || newDocUri;
    const docChanged = this.currentDocumentKey !== newDocKey;
    const srcChanged = this.currentDocumentUri !== newDocUri;

    this.currentDocumentKey = newDocKey;
    this.currentDocumentUri = newDocUri;
    this.wasmUrl = message.wasmUri;
    this.messageConfig = message.config;
    this.error = null;

    const restoredViewState = message.viewState ?? vscodeService.getState()?.viewState ?? null;
    this.syncViewState(restoredViewState, { notifyExtension: false });

    let src = message.pdfUri;
    if (src && this.activeBlobUrl) {
      URL.revokeObjectURL(this.activeBlobUrl);
      this.activeBlobUrl = null;
    }
    if (!src && message.data) {
      let buffer;
      if (message.data instanceof Uint8Array) {
        buffer = message.data;
      } else if (message.data instanceof ArrayBuffer) {
        buffer = new Uint8Array(message.data);
      } else {
        buffer = new Uint8Array(base64ToArrayBuffer(message.data));
      }

      if (this.activeBlobUrl) {
        URL.revokeObjectURL(this.activeBlobUrl);
      }
      const blob = new Blob([buffer.buffer], { type: "application/pdf" });
      src = URL.createObjectURL(blob);
      this.activeBlobUrl = src;
    }

    const shouldReloadViewer = forceReload || docChanged || srcChanged || !!message.data || !this.pdfSrc;

    if (src) {
      this.pdfSrc = src;
      this.loading = false;
      if (shouldReloadViewer) {
        this.viewerKey += 1;
      }
    } else {
      this.error = "Failed to resolve PDF source";
      this.loading = false;
    }

    // Note: We do NOT persist pdfUri in state because asWebviewUri() tokens
    // are session-specific and become invalid after VSCode restarts.
    // The extension will always send a fresh URI when the webview is restored.
    this.syncViewState(this.persistedViewState, { notifyExtension: false });
  },

  async handleSave(message) {
    if (this.registry) {
      try {
        const exportPlugin = this.registry.getPlugin("export")?.provides();
        if (exportPlugin) {
          const arrayBuffer = await exportPlugin.saveAsCopy().toPromise();
          vscodeService.postMessage({
            command: "save-response",
            data: new Uint8Array(arrayBuffer),
            requestId: message.requestId,
          });
        }
      } catch (e) {
        vscodeService.postMessage({
          command: "error",
          error: e.message,
          requestId: message.requestId,
        });
      }
    }
  }
});
