/**
 * Collection of active editors and their state
 * @type {Map<string, {
 *   panel: import("vscode").WebviewPanel,
 *   resolveSave: Function | null,
 *   messageDisposable: import("vscode").Disposable | null,
 *   changeDisposable?: import("vscode").Disposable | null,
 *   disposeDisposable?: import("vscode").Disposable | null,
 *   lastViewState?: Record<string, unknown> | null,
 *   dataProvider?: unknown
 * }>}
 */
export const activeEditors = new Map();
