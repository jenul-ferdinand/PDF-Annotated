import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "../constants/index.js";

class Logger {
    private static _channel: vscode.OutputChannel | null = null;

    static get channel(): vscode.OutputChannel {
        if (!this._channel) {
            this._channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
        }
        return this._channel;
    }

    static log(message: string) {
        const timestamp = new Date().toLocaleTimeString();
        this.channel.appendLine(`[${timestamp}] ${message}`);
    }

    static logPerformance(operation: string, durationMs: number, metadata: Record<string, unknown> = {}) {
        const metaStr = Object.keys(metadata).length
            ? ` | ${JSON.stringify(metadata)}`
            : '';
        this.log(`[PERF] ${operation}: ${durationMs}ms${metaStr}`);
    }

    static show() {
        this.channel.show(true);
    }
}

export default Logger;
