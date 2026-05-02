import type * as vscode from "vscode";
import type { EmbedPdfContainer, PluginRegistry } from "@embedpdf/snippet";

export type PdfDataType = "base64" | "u8array";
export type PdfDataPayload = string | Uint8Array | ArrayBuffer | ArrayLike<number>;

export interface PdfPageCoordinates {
  x: number;
  y: number;
}

export interface PdfSidebarState {
  placement: string;
  slot: string;
  sidebarId: string;
  tabId?: string | null;
}

export interface PdfViewState {
  pageNumber?: number;
  totalPages?: number;
  pageCoordinates?: PdfPageCoordinates;
  zoomLevel?: string | number;
  spreadMode?: string;
  rotation?: number;
  scrollStrategy?: string;
  sidebar?: PdfSidebarState;
}

export interface PdfWebviewConfig {
  zoomLevel: string | number;
  spreadMode: string;
  scrollStrategy: string;
  rotation: number;
  tabBar: string;
  [key: string]: unknown;
}

export interface PdfPreviewOptions {
  name?: string;
  documentKey?: string;
  config?: Partial<PdfWebviewConfig> & Record<string, unknown>;
  viewState?: PdfViewState;
}

export interface PdfDataProvider {
  uri?: vscode.Uri;
  name?: string;
  onDidChange?: vscode.Event<vscode.Uri>;
  getRawData?: () => Uint8Array | string;
  getFileData?: () => Promise<Uint8Array> | Uint8Array;
  dispose?: () => void;
}

export interface ViewerStatus {
  status: string;
  documentUri: string;
  documentKey: string | null;
  message: string | null;
  updatedAt: string;
}

export interface PendingSave {
  requestId: string;
  destinationUri: vscode.Uri;
  timeout: ReturnType<typeof setTimeout>;
  cancellationDisposable: vscode.Disposable;
  resolve: () => void;
  reject: (error: Error) => void;
}

export interface ActiveEditorEntry {
  panel: vscode.WebviewPanel;
  stateKey: string;
  messageDisposable: vscode.Disposable | null;
  changeDisposable?: vscode.Disposable | null;
  disposeDisposable?: vscode.Disposable | null;
  lastViewState: PdfViewState | null;
  lastViewerStatus: ViewerStatus | null;
  dataProvider: PdfDataProvider;
  pendingSave: PendingSave | null;
}

export interface PdfPreviewMessage {
  command: "preview" | "reload";
  documentKey: string;
  wasmUri: string;
  wasmData?: string;
  viewerStatusEnabled: boolean;
  config: PdfWebviewConfig;
  viewState: PdfViewState | null;
  pdfUri?: string;
  data?: string;
}

export interface PdfSaveRequestMessage {
  command: "save";
  requestId: string;
}

export interface PdfErrorMessage {
  command: "error";
  error: string;
  requestId?: string;
}

export type ExtensionToWebviewMessage =
  | PdfPreviewMessage
  | PdfSaveRequestMessage
  | PdfErrorMessage;

export interface WebviewReadyMessage {
  command: "ready";
}

export interface WebviewLogMessage {
  command: "log";
  message: string;
}

export interface WebviewViewerStatusMessage {
  command: "viewer-status";
  status: string;
  documentKey?: string;
  message?: string;
  error?: string;
}

export interface WebviewStateChangedMessage {
  command: "viewer-state-changed";
  documentKey?: string;
  viewState?: PdfViewState | null;
  flush?: boolean;
}

export interface PdfOpenLinkTarget {
  type?: string;
  action?: {
    type?: number;
    uri?: string;
    path?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PdfOpenLinkResult {
  outcome?: string;
  uri?: string;
  [key: string]: unknown;
}

export interface WebviewOpenLinkMessage {
  command: "open-link";
  result?: PdfOpenLinkResult;
  target?: PdfOpenLinkTarget;
}

export interface WebviewDirtyMessage {
  command: "dirty";
}

export interface WebviewCloseMessage {
  command: "close";
}

export interface WebviewSaveResponseMessage {
  command: "save-response";
  requestId?: string;
  data?: Uint8Array | ArrayBuffer | ArrayLike<number>;
}

export type WebviewToExtensionMessage =
  | WebviewReadyMessage
  | WebviewLogMessage
  | WebviewViewerStatusMessage
  | PdfErrorMessage
  | WebviewStateChangedMessage
  | WebviewOpenLinkMessage
  | WebviewDirtyMessage
  | WebviewCloseMessage
  | WebviewSaveResponseMessage;

export interface VsCodeWebviewState {
  documentKey?: string | null;
  viewState?: PdfViewState | null;
  config?: PdfWebviewConfig | null;
}

export interface VsCodeWebviewApi<State = VsCodeWebviewState> {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): State | undefined;
  setState(state: State): void;
}

export type ThemePreference = "light" | "dark";

export interface ViewStateSyncOptions {
  notifyExtension?: boolean;
  flush?: boolean;
  persistLocally?: boolean;
}

export interface PdfPreviewStateOptions {
  forceReload?: boolean;
}

export interface PdfStateStore {
  pdfSrc: string | null;
  wasmUrl: string;
  loading: boolean;
  error: string | null;
  themePreference: ThemePreference;
  messageConfig: PdfWebviewConfig | null;
  activeBlobUrl: string | null;
  activeWasmBlobUrl: string | null;
  viewerKey: number;
  currentDocumentUri: string | null;
  currentDocumentKey: string | null;
  persistedViewState: PdfViewState | null;
  registry: PluginRegistry | null;
  container: EmbedPdfContainer | null;
  statusReportingEnabled: boolean;
  reportViewerStatus(status: string, details?: { message?: string; error?: string }): void;
  updateTheme(): void;
  syncViewState(viewState: PdfViewState | null | undefined, options?: ViewStateSyncOptions): void;
  setPreview(message: PdfPreviewMessage, options?: PdfPreviewStateOptions): void;
  disposeBlobUrls(): void;
  handleSave(message: PdfSaveRequestMessage): Promise<void>;
}
