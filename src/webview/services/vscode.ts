import type { VsCodeWebviewApi, VsCodeWebviewState, WebviewToExtensionMessage } from "../../types";

class VsCodeService {
  private readonly vscode: VsCodeWebviewApi | null =
    typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;

  postMessage(message: WebviewToExtensionMessage): void {
    if (this.vscode) {
      this.vscode.postMessage(message);
    }
  }

  getState(): VsCodeWebviewState | null {
    return this.vscode ? this.vscode.getState() ?? null : null;
  }

  setState(state: VsCodeWebviewState): void {
    if (this.vscode) {
      this.vscode.setState(state);
    }
  }
}

export const vscodeService = new VsCodeService();
