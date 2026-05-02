import assert from "node:assert";
import path from "node:path";
import * as vscode from "vscode";

const EXTENSION_ID = "jenul-ferdinand.pdf-annotated";
const VIEW_TYPE = "pdfAnnotated.PDFEdit";
const STATUS_COMMAND = "pdfAnnotated.test.getLastViewerStatus";
const LOAD_TIMEOUT_MS = Number(process.env.PDF_ANNOTATED_LOAD_TIMEOUT_MS || 20000);
const POLL_INTERVAL_MS = 250;

interface ViewerStatus {
  status: string;
  documentUri: string;
  documentKey: string | null;
  message: string | null;
  updatedAt: string;
}

type ViewerStatusResult = string | ViewerStatus | null | undefined;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExtension(): vscode.Extension<unknown> | undefined {
  return (
    vscode.extensions.getExtension(EXTENSION_ID) ||
    vscode.extensions.all.find((extension) => extension.packageJSON?.name === "pdf-annotated")
  );
}

function statusName(viewerStatus: ViewerStatusResult): string | undefined {
  return typeof viewerStatus === "string" ? viewerStatus : viewerStatus?.status;
}

function describeStatus(viewerStatus: ViewerStatusResult): string {
  if (!viewerStatus) {
    return "none";
  }

  if (typeof viewerStatus === "string") {
    return viewerStatus;
  }

  return JSON.stringify(viewerStatus);
}

async function waitForLoaded(uri: vscode.Uri): Promise<ViewerStatusResult> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  let lastStatus: ViewerStatusResult = null;
  let lastCommandError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      lastStatus = await vscode.commands.executeCommand<ViewerStatusResult>(STATUS_COMMAND, uri.toString());
      lastCommandError = null;
    } catch (error) {
      lastCommandError = error instanceof Error ? error : new Error(String(error));
    }

    const name = statusName(lastStatus);
    if (name === "loaded") {
      return lastStatus;
    }

    if (name === "error") {
      throw new Error(`PDF viewer reported error status: ${describeStatus(lastStatus)}`);
    }

    await delay(POLL_INTERVAL_MS);
  }

  const commandErrorText = lastCommandError
    ? ` Last command error: ${lastCommandError.message || String(lastCommandError)}`
    : "";
  throw new Error(
    `Timed out after ${LOAD_TIMEOUT_MS}ms waiting for PDF viewer to report loaded. ` +
      `Last viewer status: ${describeStatus(lastStatus)}.${commandErrorText}`
  );
}

async function testPdfViewerLoadsFixture(): Promise<void> {
  const extension = getExtension();
  assert.ok(extension, `Expected extension ${EXTENSION_ID} to be available`);
  await extension.activate();

  const fixturesRoot = process.env.PDF_ANNOTATED_TEST_FIXTURES || path.resolve(__dirname, "..", "fixtures");
  const fixtureUri = vscode.Uri.file(
    path.resolve(fixturesRoot, "pdf-sample.pdf")
  );
  await vscode.workspace.fs.stat(fixtureUri);

  await vscode.commands.executeCommand("vscode.openWith", fixtureUri, VIEW_TYPE);

  try {
    await waitForLoaded(fixtureUri);
  } finally {
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }
}

export async function run(): Promise<void> {
  console.log("Running PDF Annotated desktop integration tests");
  await testPdfViewerLoadsFixture();
  console.log("PDF Annotated desktop integration tests passed");
}
