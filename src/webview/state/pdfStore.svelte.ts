import type { ExportCapability } from "@embedpdf/plugin-export";
import { base64ToArrayBuffer } from "../utils/binary.js";
import { vscodeService } from "../services/vscode.js";
import type {
  PdfPreviewMessage,
  PdfPreviewStateOptions,
  PdfSaveRequestMessage,
  PdfSidebarState,
  PdfStateStore,
  PdfViewState,
  ThemePreference,
  ViewStateSyncOptions,
} from "../../types";

const DEFAULT_VIEW_STATE = {
  zoomLevel: "fit-width",
  spreadMode: "odd",
  rotation: 0,
  scrollStrategy: "vertical",
} satisfies Required<Pick<PdfViewState, "zoomLevel" | "spreadMode" | "rotation" | "scrollStrategy">>;

function roundCoordinate(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.round(value * 10) / 10;
}

function normalizeSidebar(sidebar: PdfSidebarState | null | undefined): PdfSidebarState | undefined {
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

function normalizeViewState(viewState: PdfViewState | null | undefined): PdfViewState | null {
  if (!viewState) {
    return null;
  }

  const normalized: PdfViewState = {};

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

function areViewStatesEqual(left: PdfViewState | null | undefined, right: PdfViewState | null | undefined): boolean {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function getInitialTheme(): ThemePreference {
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

function messageDataToUint8Array(data: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(base64ToArrayBuffer(data));
}

function toBlobArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export const pdfState = $state<PdfStateStore>({
  pdfSrc: null,
  wasmUrl: "",
  loading: true,
  error: null,
  themePreference: getInitialTheme(),
  messageConfig: null,
  activeBlobUrl: null,
  activeWasmBlobUrl: null,
  viewerKey: 0,
  currentDocumentUri: null,
  currentDocumentKey: null,
  persistedViewState: null,
  registry: null,
  container: null,
  statusReportingEnabled: false,

  reportViewerStatus(status: string, details: { message?: string; error?: string } = {}) {
    if (!this.statusReportingEnabled) {
      return;
    }

    vscodeService.postMessage({
      command: "viewer-status",
      status,
      documentKey: this.currentDocumentKey ?? undefined,
      ...details,
    });
  },

  updateTheme() {
    const newTheme = getInitialTheme();
    if (this.themePreference !== newTheme) {
      this.themePreference = newTheme;
    }
  },

  syncViewState(viewState: PdfViewState | null | undefined, options: ViewStateSyncOptions = {}) {
    const { notifyExtension = true, flush = false, persistLocally = true } = options;
    const nextViewState = normalizeViewState(viewState);
    const viewStateChanged = !areViewStatesEqual(this.persistedViewState, nextViewState);

    if (viewStateChanged) {
      this.persistedViewState = nextViewState;
    }

    if (persistLocally) {
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
    }

    if (notifyExtension && (viewStateChanged || flush)) {
      vscodeService.postMessage({
        command: "viewer-state-changed",
        documentKey: this.currentDocumentKey ?? undefined,
        viewState: nextViewState,
        flush,
      });
    }
  },

  setPreview(message: PdfPreviewMessage, options: PdfPreviewStateOptions = {}) {
    const { forceReload = false } = options;
    const newDocUri = message.pdfUri || "base64-data";
    const newDocKey = message.documentKey || newDocUri;
    const docChanged = this.currentDocumentKey !== newDocKey;
    const srcChanged = this.currentDocumentUri !== newDocUri;

    this.currentDocumentKey = newDocKey;
    this.currentDocumentUri = newDocUri;
    if (message.wasmData) {
      if (!this.activeWasmBlobUrl) {
        const wasmBuffer = messageDataToUint8Array(message.wasmData);
        this.activeWasmBlobUrl = URL.createObjectURL(
          new Blob([toBlobArrayBuffer(wasmBuffer)], { type: "application/wasm" })
        );
      }
      this.wasmUrl = this.activeWasmBlobUrl;
    } else {
      if (this.activeWasmBlobUrl) {
        URL.revokeObjectURL(this.activeWasmBlobUrl);
        this.activeWasmBlobUrl = null;
      }
      this.wasmUrl = message.wasmUri;
    }
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
      const buffer = messageDataToUint8Array(message.data);

      if (this.activeBlobUrl) {
        URL.revokeObjectURL(this.activeBlobUrl);
      }
      const blob = new Blob([toBlobArrayBuffer(buffer)], { type: "application/pdf" });
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
      this.reportViewerStatus("error", { message: this.error });
    }

    // Note: We do NOT persist pdfUri in state because asWebviewUri() tokens
    // are session-specific and become invalid after VSCode restarts.
    // The extension will always send a fresh URI when the webview is restored.
    this.syncViewState(this.persistedViewState, { notifyExtension: false });
  },

  disposeBlobUrls() {
    if (this.activeBlobUrl) {
      URL.revokeObjectURL(this.activeBlobUrl);
      this.activeBlobUrl = null;
    }

    if (this.activeWasmBlobUrl) {
      URL.revokeObjectURL(this.activeWasmBlobUrl);
      this.activeWasmBlobUrl = null;
    }
  },

  async handleSave(message: PdfSaveRequestMessage) {
    try {
      if (!this.registry) {
        throw new Error("PDF viewer is not ready to save yet.");
      }

      const exportPlugin = this.registry.getPlugin("export")?.provides?.() as ExportCapability | undefined;
      if (!exportPlugin) {
        throw new Error("Export plugin is unavailable.");
      }

      const arrayBuffer = await exportPlugin.saveAsCopy().toPromise();
      vscodeService.postMessage({
        command: "save-response",
        data: new Uint8Array(arrayBuffer),
        requestId: message.requestId,
      });
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      vscodeService.postMessage({
        command: "error",
        error: error.message,
        requestId: message.requestId,
      });
    }
  }
});
