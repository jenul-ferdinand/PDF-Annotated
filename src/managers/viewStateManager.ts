import type * as vscode from "vscode";
import Logger from "../services/logger";
import { editorRegistry } from "./editorRegistry";
import type { PdfViewState } from "../types";

const VIEW_STATE_STORAGE_PREFIX = "pdfAnnotated.viewState:";
const VIEW_STATE_CHECKPOINT_DELAY = 1500;
const viewStateMemoryCache = new Map<string, PdfViewState | null>();
const viewStateCheckpointTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastCheckpointedViewStateCache = new Map<string, PdfViewState | null>();

function areViewStatesEqual(left: PdfViewState | null | undefined, right: PdfViewState | null | undefined): boolean {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

export class ViewStateManager {
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  #getViewStateKey(stateKey: string): string {
    return `${VIEW_STATE_STORAGE_PREFIX}${stateKey}`;
  }

  #clearCheckpointTimer(stateKey: string): void {
    const existingTimer = viewStateCheckpointTimers.get(stateKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      viewStateCheckpointTimers.delete(stateKey);
    }
  }

  getPersisted(stateKey: string): PdfViewState | null {
    if (!stateKey || stateKey === "unknown-uri") {
      return null;
    }

    if (viewStateMemoryCache.has(stateKey)) {
      return viewStateMemoryCache.get(stateKey) ?? null;
    }

    const persistedViewState = this.context.workspaceState.get<PdfViewState | null>(this.#getViewStateKey(stateKey), null) ?? null;
    lastCheckpointedViewStateCache.set(stateKey, persistedViewState);
    return persistedViewState;
  }

  async record(stateKey: string, uriString: string, state: PdfViewState | null, options?: { flush?: boolean }): Promise<void> {
    if (!stateKey || stateKey === "unknown-uri") {
      return;
    }

    const normalizedViewState = state || null;
    viewStateMemoryCache.set(stateKey, normalizedViewState);

    const editorEntry = editorRegistry.get(uriString);
    if (editorEntry) {
      editorEntry.lastViewState = normalizedViewState;
    }

    if (options?.flush) {
      await this.flush(stateKey);
    } else {
      this.#scheduleCheckpoint(stateKey);
    }
  }

  async flush(stateKey: string): Promise<void> {
    if (!stateKey || stateKey === "unknown-uri") {
      return;
    }

    this.#clearCheckpointTimer(stateKey);

    const normalizedViewState = viewStateMemoryCache.get(stateKey) || null;
    const lastCheckpointedViewState = lastCheckpointedViewStateCache.get(stateKey);
    if (areViewStatesEqual(lastCheckpointedViewState, normalizedViewState)) {
      return;
    }

    Logger.log(`[View State] Checkpointing updated viewer state`);
    await this.context.workspaceState.update(this.#getViewStateKey(stateKey), normalizedViewState);
    lastCheckpointedViewStateCache.set(stateKey, normalizedViewState);
  }

  #scheduleCheckpoint(stateKey: string): void {
    if (!stateKey || stateKey === "unknown-uri") {
      return;
    }

    this.#clearCheckpointTimer(stateKey);
    viewStateCheckpointTimers.set(
      stateKey,
      setTimeout(() => {
        viewStateCheckpointTimers.delete(stateKey);
        void this.flush(stateKey);
      }, VIEW_STATE_CHECKPOINT_DELAY)
    );
  }

  disposeUri(stateKey: string): void {
    if (!stateKey || stateKey === "unknown-uri") {
      return;
    }

    this.#clearCheckpointTimer(stateKey);
    viewStateMemoryCache.delete(stateKey);
    lastCheckpointedViewStateCache.delete(stateKey);
  }
}
