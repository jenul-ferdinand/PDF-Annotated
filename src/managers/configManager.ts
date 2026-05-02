import * as vscode from "vscode";
import type { PdfWebviewConfig } from "../types";

export function getPdfConfiguration(): PdfWebviewConfig {
    const config = vscode.workspace.getConfiguration('pdfAnnotated');

    // Map VS Code enum values to @embedpdf/snippet values
    const zoomMap: Record<string, string> = {
        'page-width': 'fit-width',
        'page-fit': 'fit-page',
        'page-height': 'fit-page', // fit-height is not supported by default, fallback to fit-page
        'auto': 'automatic'
    };

    const spreadMap: Record<string, string> = {
        'none': 'none',
        'odd': 'odd',
        'even': 'even'
    };

    let zoomLevel: string | number = config.get('defaultZoomLevel', 'page-width');
    const spreadMode = config.get('defaultSpreadMode', 'none');

    const tabBar = config.get('tabBar', 'never');

    // Handle percentage strings (e.g., "100%")
    if (typeof zoomLevel === 'string' && zoomLevel.endsWith('%')) {
        const percent = parseFloat(zoomLevel);
        if (!isNaN(percent)) {
            zoomLevel = percent / 100;
        }
    } else {
        zoomLevel = zoomMap[zoomLevel] || zoomLevel;
    }

    return {
        zoomLevel: zoomLevel,
        spreadMode: spreadMap[spreadMode] || spreadMode,
        scrollStrategy: 'vertical',
        rotation: 0,
        tabBar: tabBar,
    };
}
