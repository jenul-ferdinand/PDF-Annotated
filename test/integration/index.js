const assert = require("assert");
const path = require("path");
const vscode = require("vscode");

const EXTENSION_ID = "jenul-ferdinand.pdf-annotated";
const VIEW_TYPE = "pdfAnnotated.PDFEdit";
const STATUS_COMMAND = "pdfAnnotated.test.getLastViewerStatus";
const LOAD_TIMEOUT_MS = Number(process.env.PDF_ANNOTATED_LOAD_TIMEOUT_MS || 20000);
const POLL_INTERVAL_MS = 250;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExtension() {
  return (
    vscode.extensions.getExtension(EXTENSION_ID) ||
    vscode.extensions.all.find((extension) => extension.packageJSON?.name === "pdf-annotated")
  );
}

function statusName(viewerStatus) {
  return typeof viewerStatus === "string" ? viewerStatus : viewerStatus?.status;
}

function describeStatus(viewerStatus) {
  if (!viewerStatus) {
    return "none";
  }

  if (typeof viewerStatus === "string") {
    return viewerStatus;
  }

  return JSON.stringify(viewerStatus);
}

async function waitForLoaded(uri) {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  let lastStatus = null;
  let lastCommandError = null;

  while (Date.now() < deadline) {
    try {
      lastStatus = await vscode.commands.executeCommand(STATUS_COMMAND, uri.toString());
      lastCommandError = null;
    } catch (error) {
      lastCommandError = error;
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

async function testPdfViewerLoadsFixture() {
  const extension = getExtension();
  assert.ok(extension, `Expected extension ${EXTENSION_ID} to be available`);
  await extension.activate();

  const fixtureUri = vscode.Uri.file(
    path.resolve(__dirname, "..", "fixtures", "pdf-sample.pdf")
  );
  await vscode.workspace.fs.stat(fixtureUri);

  await vscode.commands.executeCommand("vscode.openWith", fixtureUri, VIEW_TYPE);

  try {
    await waitForLoaded(fixtureUri);
  } finally {
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }
}

exports.run = async function run() {
  console.log("Running PDF Annotated desktop integration tests");
  await testPdfViewerLoadsFixture();
  console.log("PDF Annotated desktop integration tests passed");
};
