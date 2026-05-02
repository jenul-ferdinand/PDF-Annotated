import type {
  RotateCapability,
  ScrollCapability,
  ScrollMetrics,
  SpreadCapability,
  UICapability,
  ZoomCapability,
} from "@embedpdf/snippet";
import type { PdfPageCoordinates, PdfSidebarState, PdfViewState } from "../../types";

type ViewerUICapability = UICapability & {
  getState?: () => { sidebarTabs?: Record<string, string> };
};

interface BuildViewStateOptions {
  baseViewState?: PdfViewState | null;
  scrollCapability?: ScrollCapability | null;
  zoomCapability?: ZoomCapability | null;
  spreadCapability?: SpreadCapability | null;
  rotateCapability?: RotateCapability | null;
  uiCapability?: ViewerUICapability | null;
  lastScrollStrategy?: string | null;
  lastSidebarState?: PdfSidebarState | null;
  overrides?: Partial<PdfViewState>;
}

export function getPageCoordinates(
  metrics: ScrollMetrics | null | undefined,
  pageNumber: number
): PdfPageCoordinates | undefined {
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
}: BuildViewStateOptions): PdfViewState {
  const nextViewState: PdfViewState = { ...(baseViewState || {}) };

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
