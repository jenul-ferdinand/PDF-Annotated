import type * as vscode from "vscode";
import Logger from "../services/logger";
import { activeEditors } from "./editorManager";
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

  #getViewStateKey(uriString: string): string {
    return `${VIEW_STATE_STORAGE_PREFIX}${uriString}`;
  }

  #clearCheckpointTimer(uriString: string): void {
    const existingTimer = viewStateCheckpointTimers.get(uriString);
    if (existingTimer) {
      clearTimeout(existingTimer);
      viewStateCheckpointTimers.delete(uriString);
    }
  }

  getPersisted(uriString: string): PdfViewState | null {
    if (!uriString || uriString === "unknown-uri") {
      return null;
    }

    if (viewStateMemoryCache.has(uriString)) {
      return viewStateMemoryCache.get(uriString) ?? null;
    }

    const persistedViewState = this.context.workspaceState.get<PdfViewState | null>(this.#getViewStateKey(uriString), null) ?? null;
    lastCheckpointedViewStateCache.set(uriString, persistedViewState);
    return persistedViewState;
  }

  updateHot(uriString: string, viewState: PdfViewState | null | undefined): void {
    if (!uriString || uriString === "unknown-uri") {
      return;
    }

    const normalizedViewState = viewState || null;
    viewStateMemoryCache.set(uriString, normalizedViewState);

    const editorEntry = activeEditors.get(uriString);
    if (editorEntry) {
      editorEntry.lastViewState = normalizedViewState;
    }
  }

  async flush(uriString: string): Promise<void> {
    if (!uriString || uriString === "unknown-uri") {
      return;
    }

    this.#clearCheckpointTimer(uriString);

    const normalizedViewState = viewStateMemoryCache.get(uriString) || null;
    const lastCheckpointedViewState = lastCheckpointedViewStateCache.get(uriString);
    if (areViewStatesEqual(lastCheckpointedViewState, normalizedViewState)) {
      return;
    }

    Logger.log(`[View State] Checkpointing updated viewer state`);
    await this.context.workspaceState.update(this.#getViewStateKey(uriString), normalizedViewState);
    lastCheckpointedViewStateCache.set(uriString, normalizedViewState);
  }

  scheduleCheckpoint(uriString: string): void {
    if (!uriString || uriString === "unknown-uri") {
      return;
    }

    this.#clearCheckpointTimer(uriString);
    viewStateCheckpointTimers.set(
      uriString,
      setTimeout(() => {
        viewStateCheckpointTimers.delete(uriString);
        void this.flush(uriString);
      }, VIEW_STATE_CHECKPOINT_DELAY)
    );
  }

  clearTimer(uriString: string): void {
    if (!uriString || uriString === "unknown-uri") {
      return;
    }

    this.#clearCheckpointTimer(uriString);
  }

  disposeUri(uriString: string): void {
    if (!uriString || uriString === "unknown-uri") {
      return;
    }

    this.#clearCheckpointTimer(uriString);
    viewStateMemoryCache.delete(uriString);
    lastCheckpointedViewStateCache.delete(uriString);
  }
}
