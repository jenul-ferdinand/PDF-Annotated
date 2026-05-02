import path from "node:path";
import { runTests } from "@vscode/test-electron";

type RunTestsOptions = Parameters<typeof runTests>[0];

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "integration", "index.js");
  const testWorkspace = path.resolve(extensionDevelopmentPath, "test", "fixtures");

  const options: RunTestsOptions = {
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      testWorkspace,
      "--disable-extensions",
    ],
  };
  process.env.PDF_ANNOTATED_TEST_FIXTURES = testWorkspace;

  if (process.env.VSCODE_TEST_EXECUTABLE) {
    options.vscodeExecutablePath = process.env.VSCODE_TEST_EXECUTABLE;
  }

  if (process.env.VSCODE_TEST_VERSION) {
    options.version = process.env.VSCODE_TEST_VERSION;
  }

  await runTests(options);
}

main().catch((error) => {
  console.error("Failed to run VS Code integration tests");
  console.error(error);
  process.exit(1);
});
