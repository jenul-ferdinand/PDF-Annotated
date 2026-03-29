export function getPageCoordinates(metrics, pageNumber) {
  const currentMetric =
    metrics?.pageVisibilityMetrics?.find((item) => item.pageNumber === pageNumber) ||
    metrics?.pageVisibilityMetrics?.[0];

  if (!currentMetric?.original) {
    return undefined;
  }

  return {
    x: currentMetric.original.pageX,
    y: currentMetric.original.pageY,
  };
}

export function buildViewState({
  baseViewState,
  scrollCapability,
  zoomCapability,
  spreadCapability,
  rotateCapability,
  uiCapability,
  lastScrollStrategy,
  lastSidebarState,
  overrides = {},
}) {
  const nextViewState = { ...(baseViewState || {}) };

  if (scrollCapability) {
    const pageNumber = scrollCapability.getCurrentPage();
    const totalPages = scrollCapability.getTotalPages();
    const metrics = scrollCapability.getMetrics();
    const pageCoordinates = getPageCoordinates(metrics, pageNumber);

    nextViewState.pageNumber = pageNumber;
    nextViewState.totalPages = totalPages;

    if (pageCoordinates) {
      nextViewState.pageCoordinates = pageCoordinates;
    }
  }

  if (zoomCapability) {
    nextViewState.zoomLevel = zoomCapability.getState().zoomLevel;
  }

  if (spreadCapability) {
    nextViewState.spreadMode = spreadCapability.getSpreadMode();
  }

  if (rotateCapability) {
    nextViewState.rotation = rotateCapability.getRotation();
  }

  if (lastScrollStrategy) {
    nextViewState.scrollStrategy = lastScrollStrategy;
  }

  if (lastSidebarState) {
    const uiState = uiCapability?.getState?.();
    nextViewState.sidebar = {
      ...lastSidebarState,
      tabId: uiState?.sidebarTabs?.[lastSidebarState.sidebarId] || lastSidebarState.tabId || null,
    };
  }

  return {
    ...nextViewState,
    ...overrides,
  };
}
