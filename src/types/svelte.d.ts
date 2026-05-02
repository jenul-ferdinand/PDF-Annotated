declare module "*.svelte" {
  import type { Component } from "svelte";

  const component: Component<Record<string, unknown>>;
  export default component;
}

declare function acquireVsCodeApi<State = import("./index").VsCodeWebviewState>():
  import("./index").VsCodeWebviewApi<State>;

interface Window {
  mediaUri?: string;
}

declare let __webpack_public_path__: string;
