import { buildViewState, getPageCoordinates } from "./viewState.js";

const RESTORE_SETTLE_MS = 700;

export function createViewerRuntime({ pdfState, vscodeService }) {
  let registryDisposables = [];
  let localSyncTimeout;
  let extensionSyncTimeout;
  let checkpointSyncTimeout;
  let settleTimeout;
  let restoreFinalizeTimeout;
  let restoreRetryTimeout;
  let scrollSyncTimeout;
  let restoreCompleted = false;
  let restoreAttemptCount = 0;
  let isRestoring = false;
  let settleUntil = 0;
  let lastScrollStrategy = null;
  let lastSidebarState = null;

  let scrollCapability = null;
  let zoomCapability = null;
  let spreadCapability = null;
  let rotateCapability = null;
  let uiCapability = null;
  let annotationCapability = null;

  function clearTimers() {
    clearTimeout(localSyncTimeout);
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

  function buildCurrentViewState(overrides = {}) {
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

  function queueViewStateSync(overrides = {}, options = {}) {
    const { flush = false, immediate = false, force = false } = options;
    const settlingDelay = Math.max(0, settleUntil - Date.now());

    if (isRestoring && !force) {
      return;
    }

    const syncState = buildCurrentViewState(overrides);
    pdfState.syncViewState(syncState, { notifyExtension: false });

    if (!force && !flush) {
      clearTimeout(localSyncTimeout);
      localSyncTimeout = window.setTimeout(() => {
        pdfState.syncViewState(buildCurrentViewState(), { notifyExtension: false });
      }, 120);
    }

    if (flush) {
      clearTimeout(extensionSyncTimeout);
      clearTimeout(checkpointSyncTimeout);
      pdfState.syncViewState(syncState, { notifyExtension: true, flush: true });
      return;
    }

    clearTimeout(extensionSyncTimeout);
    extensionSyncTimeout = window.setTimeout(() => {
      pdfState.syncViewState(buildCurrentViewState(), { notifyExtension: true });
    }, immediate ? 0 : 180);

    clearTimeout(checkpointSyncTimeout);
    checkpointSyncTimeout = window.setTimeout(() => {
      pdfState.syncViewState(buildCurrentViewState(), { notifyExtension: true, flush: true });
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
        scrollCapability.setScrollStrategy(savedViewState.scrollStrategy);
      }

      if (savedViewState.spreadMode && spreadCapability) {
        spreadCapability.setSpreadMode(savedViewState.spreadMode);
      }

      if (typeof savedViewState.rotation === "number" && rotateCapability) {
        rotateCapability.setRotation(savedViewState.rotation);
      }

      if (savedViewState.zoomLevel !== undefined && savedViewState.zoomLevel !== null && zoomCapability) {
        zoomCapability.requestZoom(savedViewState.zoomLevel);
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
        }, 120);
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
            result: event.result,
            target: event.target,
          });
        })
      );
    }
  }

  function handleInit(container) {
    console.log("[Webview] PDF Viewer Initialized");
    pdfState.container = container;
  }

  function handleReady(registry) {
    clearRegistryDisposables();

    console.log("[Webview] PDF Viewer Ready with Registry");
    pdfState.registry = registry;

    window.markDirty = () => {
      console.log("[Webview] Sending dirty signal");
      vscodeService.postMessage({ command: "dirty" });
    };

    const scrollPlugin = registry.getPlugin("scroll");
    const zoomPlugin = registry.getPlugin("zoom");
    const spreadPlugin = registry.getPlugin("spread");
    const rotatePlugin = registry.getPlugin("rotate");
    const uiPlugin = registry.getPlugin("ui");
    const annotationPlugin = registry.getPlugin("annotation");

    scrollCapability = scrollPlugin?.provides() || null;
    zoomCapability = zoomPlugin?.provides() || null;
    spreadCapability = spreadPlugin?.provides() || null;
    rotateCapability = rotatePlugin?.provides() || null;
    uiCapability = uiPlugin?.provides() || null;
    annotationCapability = annotationPlugin?.provides() || null;

    bindScrollEvents();
    bindCapabilityEvents();

    if (!scrollCapability) {
      queueViewStateSync();
    }
  }

  function destroy() {
    queueViewStateSync({}, { flush: true, force: true });
    clearRegistryDisposables();
  }

  return {
    handleInit,
    handleReady,
    destroy,
  };
}
