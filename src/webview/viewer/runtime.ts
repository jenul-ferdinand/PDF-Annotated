import type {
  EmbedPdfContainer,
  PluginRegistry,
  RotateCapability,
  ScrollCapability,
  ScrollStrategy,
  SpreadCapability,
  SpreadMode,
  UICapability,
  ZoomCapability,
  ZoomLevel,
} from "@embedpdf/snippet";
import type { AnnotationCapability } from "@embedpdf/plugin-annotation";
import type { Rotation } from "@embedpdf/models";
import { buildViewState, getPageCoordinates } from "./viewState.js";
import type {
  PdfOpenLinkResult,
  PdfOpenLinkTarget,
  PdfSidebarState,
  PdfStateStore,
  PdfViewState,
  VsCodeWebviewApi,
} from "../../types";

const RESTORE_SETTLE_MS = 700;

type ViewerUICapability = UICapability & {
  getState?: () => { sidebarTabs?: Record<string, string> };
};

interface ViewerRuntimeOptions {
  pdfState: PdfStateStore;
  vscodeService: Pick<VsCodeWebviewApi, "postMessage">;
}

interface QueueViewStateOptions {
  flush?: boolean;
  immediate?: boolean;
  force?: boolean;
}

export function createViewerRuntime({ pdfState, vscodeService }: ViewerRuntimeOptions) {
  let registryDisposables: Array<() => void> = [];
  let extensionSyncTimeout: number | undefined;
  let checkpointSyncTimeout: number | undefined;
  let settleTimeout: number | undefined;
  let restoreFinalizeTimeout: number | undefined;
  let restoreRetryTimeout: number | undefined;
  let scrollSyncTimeout: number | undefined;
  let restoreCompleted = false;
  let restoreAttemptCount = 0;
  let isRestoring = false;
  let settleUntil = 0;
  let lastScrollStrategy: string | null = null;
  let lastSidebarState: PdfSidebarState | null = null;

  let scrollCapability: ScrollCapability | null = null;
  let zoomCapability: ZoomCapability | null = null;
  let spreadCapability: SpreadCapability | null = null;
  let rotateCapability: RotateCapability | null = null;
  let uiCapability: ViewerUICapability | null = null;
  let annotationCapability: AnnotationCapability | null = null;

  function focusSearchInput(): void {
    // EmbedPDF renders inside <embedpdf-container>'s open shadow root, so
    // light-DOM querySelector misses it. Walk into the shadow root, then retry
    // across a few frames because the panel mounts after onSidebarChanged fires.
    const MAX_ATTEMPTS = 30; // ~500ms at 60fps
    let attempts = 0;

    const findInput = (): HTMLInputElement | null => {
      const host = document.querySelector("embedpdf-container") as
        | (Element & { shadowRoot: ShadowRoot | null })
        | null;
      const root: ParentNode = host?.shadowRoot ?? document;
      return (
        root.querySelector<HTMLInputElement>('#search-panel input') ||
        root.querySelector<HTMLInputElement>('[id="search-panel"] input') ||
        root.querySelector<HTMLInputElement>('input[placeholder="Search"]') ||
        // Last resort: any text input that's currently visible inside the shadow root
        root.querySelector<HTMLInputElement>('input[type="text"]')
      );
    };

    const tryFocus = () => {
      attempts += 1;
      const input = findInput();
      if (input) {
        input.focus();
        input.select();
        return;
      }
      if (attempts < MAX_ATTEMPTS) {
        requestAnimationFrame(tryFocus);
      }
    };
    requestAnimationFrame(tryFocus);
  }

  function clearTimers() {
    clearTimeout(extensionSyncTimeout);
    clearTimeout(checkpointSyncTimeout);
    clearTimeout(settleTimeout);
    clearTimeout(scrollSyncTimeout);
    clearTimeout(restoreFinalizeTimeout);
    clearTimeout(restoreRetryTimeout);
  }

  function resetRuntimeState() {
    restoreCompleted = false;
    restoreAttemptCount = 0;
    isRestoring = false;
    settleUntil = 0;
    lastScrollStrategy = null;
    lastSidebarState = null;
    scrollCapability = null;
    zoomCapability = null;
    spreadCapability = null;
    rotateCapability = null;
    uiCapability = null;
    annotationCapability = null;
  }

  function clearRegistryDisposables() {
    clearTimers();
    for (const dispose of registryDisposables) {
      try {
        dispose();
      } catch (error) {
        console.error("[Webview] Failed to dispose registry listener", error);
      }
    }
    registryDisposables = [];
    resetRuntimeState();
  }

  function buildCurrentViewState(overrides: Partial<PdfViewState> = {}): PdfViewState {
    return buildViewState({
      baseViewState: pdfState.persistedViewState,
      scrollCapability,
      zoomCapability,
      spreadCapability,
      rotateCapability,
      uiCapability,
      lastScrollStrategy,
      lastSidebarState,
      overrides,
    });
  }

  function queueViewStateSync(overrides: Partial<PdfViewState> = {}, options: QueueViewStateOptions = {}): void {
    const { flush = false, immediate = false, force = false } = options;
    const settlingDelay = Math.max(0, settleUntil - Date.now());

    if (isRestoring && !force) {
      return;
    }

    const syncState = buildCurrentViewState(overrides);
    pdfState.syncViewState(syncState, { notifyExtension: false, persistLocally: false });

    if (flush) {
      clearTimeout(extensionSyncTimeout);
      clearTimeout(checkpointSyncTimeout);
      pdfState.syncViewState(syncState, {
        notifyExtension: true,
        flush: true,
        persistLocally: true,
      });
      return;
    }

    clearTimeout(extensionSyncTimeout);
    extensionSyncTimeout = window.setTimeout(() => {
      pdfState.syncViewState(buildCurrentViewState(), {
        notifyExtension: true,
        persistLocally: true,
      });
    }, immediate ? 0 : 180);

    clearTimeout(checkpointSyncTimeout);
    checkpointSyncTimeout = window.setTimeout(() => {
      pdfState.syncViewState(buildCurrentViewState(), {
        notifyExtension: true,
        flush: true,
        persistLocally: true,
      });
    }, settlingDelay > 0 ? settlingDelay + 150 : 1600);
  }

  function restoreViewState() {
    if (restoreCompleted) {
      return;
    }

    const savedViewState = pdfState.persistedViewState;
    if (!savedViewState) {
      restoreCompleted = true;
      queueViewStateSync();
      return;
    }

    restoreAttemptCount += 1;
    isRestoring = true;
    restoreCompleted = true;
    vscodeService.postMessage({
      command: "log",
      message: `[Restore] Attempt ${restoreAttemptCount} for page ${savedViewState.pageNumber ?? "unknown"}`,
    });

    try {
      const sidebar = savedViewState.sidebar;

      if (sidebar?.placement && sidebar?.slot && sidebar?.sidebarId && uiCapability) {
        lastSidebarState = {
          placement: sidebar.placement,
          slot: sidebar.slot,
          sidebarId: sidebar.sidebarId,
          tabId: sidebar.tabId || null,
        };
        uiCapability.setActiveSidebar(
          sidebar.placement,
          sidebar.slot,
          sidebar.sidebarId,
          undefined,
          sidebar.tabId || undefined
        );
      }

      if (savedViewState.scrollStrategy && scrollCapability) {
        scrollCapability.setScrollStrategy(savedViewState.scrollStrategy as ScrollStrategy);
      }

      if (savedViewState.spreadMode && spreadCapability) {
        spreadCapability.setSpreadMode(savedViewState.spreadMode as SpreadMode);
      }

      if (typeof savedViewState.rotation === "number" && rotateCapability) {
        rotateCapability.setRotation(savedViewState.rotation as Rotation);
      }

      if (savedViewState.zoomLevel !== undefined && savedViewState.zoomLevel !== null && zoomCapability) {
        zoomCapability.requestZoom(savedViewState.zoomLevel as ZoomLevel);
      }

      if (savedViewState.pageNumber && scrollCapability) {
        scrollCapability.scrollToPage({
          pageNumber: savedViewState.pageNumber,
          pageCoordinates: savedViewState.pageCoordinates || undefined,
          behavior: "instant",
        });
      }
    } finally {
      clearTimeout(restoreRetryTimeout);
      restoreRetryTimeout = window.setTimeout(() => {
        const targetPage = savedViewState.pageNumber;
        const currentPage = scrollCapability?.getCurrentPage();

        if (targetPage && currentPage && currentPage !== targetPage && restoreAttemptCount < 3) {
          restoreCompleted = false;
          restoreViewState();
          return;
        }

        clearTimeout(restoreFinalizeTimeout);
        restoreFinalizeTimeout = window.setTimeout(() => {
          isRestoring = false;
          settleUntil = Date.now() + RESTORE_SETTLE_MS;
          clearTimeout(settleTimeout);
          settleTimeout = window.setTimeout(() => {
            settleUntil = 0;
            queueViewStateSync({}, { flush: true, force: true });
          }, RESTORE_SETTLE_MS);
          queueViewStateSync({}, { force: true });
        }, 250);
      }, 200);
    }
  }

  function bindScrollEvents() {
    if (!scrollCapability) {
      restoreViewState();
      return;
    }

    restoreAttemptCount = 0;
    isRestoring = !!pdfState.persistedViewState;

    if (pdfState.persistedViewState) {
      clearTimeout(restoreRetryTimeout);
      restoreRetryTimeout = window.setTimeout(() => {
        if (!restoreCompleted) {
          restoreViewState();
        }
      }, 250);
    }

    registryDisposables.push(
      scrollCapability.onLayoutReady((event) => {
        if (event.isInitial || !restoreCompleted) {
          restoreViewState();
        }
      })
    );

    registryDisposables.push(
      scrollCapability.onPageChange((event) => {
        queueViewStateSync(
          {
            pageNumber: event.pageNumber,
          },
          { immediate: true }
        );
      })
    );

    registryDisposables.push(
      scrollCapability.onScroll((event) => {
        clearTimeout(scrollSyncTimeout);
        scrollSyncTimeout = window.setTimeout(() => {
          queueViewStateSync({
            pageNumber: event.metrics.currentPage,
            pageCoordinates: getPageCoordinates(event.metrics, event.metrics.currentPage),
          });
        }, 180);
      })
    );

    registryDisposables.push(
      scrollCapability.onStateChange((state) => {
        lastScrollStrategy = state.strategy;
        queueViewStateSync({
          scrollStrategy: state.strategy,
        });
      })
    );
  }

  function bindCapabilityEvents() {
    if (zoomCapability) {
      registryDisposables.push(
        zoomCapability.onZoomChange((event) => {
          queueViewStateSync(
            {
              zoomLevel: event.level,
            },
            { immediate: true }
          );
        })
      );
    }

    if (spreadCapability) {
      registryDisposables.push(
        spreadCapability.onSpreadChange((event) => {
          queueViewStateSync(
            {
              spreadMode: event.spreadMode,
            },
            { immediate: true }
          );
        })
      );
    }

    if (rotateCapability) {
      registryDisposables.push(
        rotateCapability.onRotateChange((event) => {
          queueViewStateSync(
            {
              rotation: event.rotation,
            },
            { immediate: true }
          );
        })
      );
    }

    if (uiCapability) {
      registryDisposables.push(
        uiCapability.onSidebarChanged((event) => {
          const uiState = uiCapability?.getState?.();
          lastSidebarState = {
            placement: event.placement,
            slot: event.slot,
            sidebarId: event.sidebarId,
            tabId: uiState?.sidebarTabs?.[event.sidebarId] || null,
          };

          queueViewStateSync(
            {
              sidebar: lastSidebarState,
            },
            { immediate: true }
          );

          // EmbedPDF opens the search panel without focusing its input.
          // After the panel mounts, locate its input and focus it so the user
          // can type immediately (matches Ctrl+F expectation in any other app).
          if (event.sidebarId === "search-panel") {
            focusSearchInput();
          }
        })
      );
    }

    if (annotationCapability) {
      registryDisposables.push(
        annotationCapability.onNavigate((event) => {
          if (event.result.outcome === "navigated") {
            return;
          }

          vscodeService.postMessage({
            command: "open-link",
            result: event.result as PdfOpenLinkResult,
            target: event.target as unknown as PdfOpenLinkTarget,
          });
        })
      );
    }
  }

  function handleInit(container: EmbedPdfContainer): void {
    console.log("[Webview] PDF Viewer Initialized");
    pdfState.container = container;
  }

  function handleReady(registry: PluginRegistry): void {
    clearRegistryDisposables();

    console.log("[Webview] PDF Viewer Ready with Registry");
    pdfState.registry = registry;
    // EmbedPDF exposes this registry-ready callback as the closest stable loaded signal.
    pdfState.reportViewerStatus("loaded");

    const scrollPlugin = registry.getPlugin("scroll");
    const zoomPlugin = registry.getPlugin("zoom");
    const spreadPlugin = registry.getPlugin("spread");
    const rotatePlugin = registry.getPlugin("rotate");
    const uiPlugin = registry.getPlugin("ui");
    const annotationPlugin = registry.getPlugin("annotation");

    scrollCapability = (scrollPlugin?.provides?.() as ScrollCapability | undefined) || null;
    zoomCapability = (zoomPlugin?.provides?.() as ZoomCapability | undefined) || null;
    spreadCapability = (spreadPlugin?.provides?.() as SpreadCapability | undefined) || null;
    rotateCapability = (rotatePlugin?.provides?.() as RotateCapability | undefined) || null;
    uiCapability = (uiPlugin?.provides?.() as ViewerUICapability | undefined) || null;
    annotationCapability = (annotationPlugin?.provides?.() as AnnotationCapability | undefined) || null;

    bindScrollEvents();
    bindCapabilityEvents();

    if (!scrollCapability) {
      queueViewStateSync();
    }
  }

  function destroy(): void {
    queueViewStateSync({}, { flush: true, force: true });
    clearRegistryDisposables();
  }

  return {
    handleInit,
    handleReady,
    destroy,
  };
}
