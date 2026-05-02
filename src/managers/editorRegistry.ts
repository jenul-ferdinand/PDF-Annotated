import * as vscode from "vscode";
import type { ActiveEditorEntry } from "../types";
import Logger from "../services/logger";

const SAVE_TIMEOUT_MS = 30_000;

class EditorRegistry {
  readonly #entries = new Map<string, ActiveEditorEntry>();

  get(uriString: string): ActiveEditorEntry | undefined {
    return this.#entries.get(uriString);
  }

  set(uriString: string, entry: ActiveEditorEntry): void {
    this.#entries.set(uriString, entry);
  }

  delete(uriString: string): void {
    this.#entries.delete(uriString);
  }

  findActive(): { uriString: string; entry: ActiveEditorEntry } | null {
    for (const [uriString, entry] of this.#entries) {
      if (entry.panel.active) {
        return { uriString, entry };
      }
    }
    return null;
  }

  startSave(
    uriString: string,
    destinationUri: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    const entry = this.#entries.get(uriString);
    if (!entry) {
      throw new Error(`No active editor entry for ${uriString}`);
    }
    if (entry.pendingSave) {
      throw new Error("A save is already in progress for this document");
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    Logger.log(`[Save] Initiating save request ${requestId}`);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const e = this.#entries.get(uriString);
        if (e?.pendingSave?.requestId === requestId) {
          Logger.log(`[Save] Timeout waiting for webview response`);
          this.#cleanup(e);
          reject(new Error("Save timed out"));
        }
      }, SAVE_TIMEOUT_MS);

      const cancellationDisposable = cancellation.onCancellationRequested(() => {
        const e = this.#entries.get(uriString);
        if (e?.pendingSave?.requestId === requestId) {
          Logger.log(`[Save] Save request cancelled`);
          this.#cleanup(e);
          reject(new Error("Save cancelled"));
        }
      });

      entry.pendingSave = {
        requestId,
        destinationUri,
        timeout,
        cancellationDisposable,
        resolve,
        reject,
      };

      entry.panel.webview.postMessage({ command: "save", requestId });
    });
  }

  async resolveSave(
    uriString: string,
    requestId: string | undefined,
    rawData: Uint8Array | ArrayBuffer | ArrayLike<number> | undefined,
    write: (dest: vscode.Uri, data: Uint8Array) => Promise<void>
  ): Promise<boolean> {
    const entry = this.#entries.get(uriString);
    if (!entry) {
      return false;
    }
    const pendingSave = entry.pendingSave;
    if (!pendingSave || pendingSave.requestId !== requestId) {
      return false;
    }

    this.#cleanup(entry);

    try {
      if (!rawData) {
        throw new Error("No data received from webview");
      }
      await write(pendingSave.destinationUri, new Uint8Array(rawData as ArrayLike<number>));
      Logger.log(`[Save] File saved successfully`);
      pendingSave.resolve();
    } catch (error) {
      Logger.log(`[Save] Error writing file: ${error}`);
      pendingSave.reject(error instanceof Error ? error : new Error(String(error)));
    }

    return true;
  }

  rejectSave(
    uriString: string,
    requestId: string | undefined,
    errorMessage: string | undefined
  ): boolean {
    const entry = this.#entries.get(uriString);
    if (!entry) {
      return false;
    }
    const pendingSave = entry.pendingSave;
    if (!pendingSave || pendingSave.requestId !== requestId) {
      return false;
    }

    this.#cleanup(entry);
    pendingSave.reject(new Error(errorMessage || "Save failed"));
    return true;
  }

  abortSave(uriString: string, reason: string): void {
    const entry = this.#entries.get(uriString);
    if (!entry?.pendingSave) {
      return;
    }
    const pendingSave = entry.pendingSave;
    this.#cleanup(entry);
    pendingSave.reject(new Error(reason));
  }

  #cleanup(entry: ActiveEditorEntry): void {
    if (!entry.pendingSave) {
      return;
    }
    clearTimeout(entry.pendingSave.timeout);
    entry.pendingSave.cancellationDisposable.dispose();
    entry.pendingSave = null;
  }
}

export const editorRegistry = new EditorRegistry();
