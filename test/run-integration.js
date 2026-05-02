const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "integration", "index.js");
  const testWorkspace = path.resolve(__dirname, "fixtures");

  const options = {
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      testWorkspace,
      "--disable-extensions",
    ],
  };

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
