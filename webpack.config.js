const path = require("path");
const webpack = require("webpack");

const tsRule = {
  test: /(?<!\.svelte)\.ts$/,
  exclude: /node_modules/,
  use: {
    loader: "ts-loader",
    options: {
      configFile: "tsconfig.json",
    },
  },
};

const svelteLoaderOptions = {
  compilerOptions: {
    dev: false,
  },
  emitCss: false,
  hotReload: false,
};

const typescriptResolve = {
  extensions: [".ts", ".mjs", ".js", ".svelte", ".svelte.ts"],
  extensionAlias: {
    ".js": [".ts", ".js"],
    ".mjs": [".mts", ".mjs"],
  },
};

const extensionNodeConfig = {
  entry: {
    extension: "./src/extension.ts",
  },
  output: {
    filename: "[name].node.js",
    path: path.resolve(__dirname, "dist"),
    libraryTarget: "commonjs2",
  },
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode",
  },
  resolve: typescriptResolve,
  module: {
    rules: [tsRule],
  },
  mode: "production",
  target: "node",
  optimization: {
    minimize: true,
  },
};

const extensionWebConfig = {
  entry: {
    extension: "./src/extension.ts",
  },
  output: {
    filename: "[name].browser.js",
    path: path.resolve(__dirname, "dist"),
    libraryTarget: "commonjs",
  },
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode",
  },
  resolve: {
    ...typescriptResolve,
    fallback: {
      path: false,
      fs: false,
    },
  },
  module: {
    rules: [tsRule],
  },
  mode: "production",
  target: "webworker",
  optimization: {
    minimize: true,
  },
};

const webviewConfig = {
  entry: {
    webview: "./src/webview/index.ts",
  },
  output: {
    filename: "webview-bundle.js",
    path: path.resolve(__dirname, "media"),
    publicPath: "auto",
  },
  resolve: {
    ...typescriptResolve,
    mainFields: ["svelte", "browser", "module", "main"],
    conditionNames: ["svelte", "browser", "import"],
  },
  module: {
    rules: [
      {
        test: /\.svelte\.ts$/,
        use: [
          {
            loader: "svelte-loader",
            options: svelteLoaderOptions,
          },
          {
            loader: "ts-loader",
            options: {
              configFile: "tsconfig.json",
            },
          },
        ],
      },
      tsRule,
      {
        test: /\.(svelte|svelte\.js)$/,
        use: {
          loader: "svelte-loader",
          options: svelteLoaderOptions,
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.wasm$/,
        type: 'asset/resource',
        generator: {
          filename: 'pdfium.wasm'
        }
      },
      {
        // required to prevent errors from Svelte on Webpack 5+
        test: /node_modules\/svelte\/.*\.mjs$/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  mode: "production",
  target: "web",
  optimization: {
    minimize: true,
    splitChunks: false,
    moduleIds: 'deterministic',
    chunkIds: 'deterministic',
  },
  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
  ],
};

module.exports = [extensionNodeConfig, extensionWebConfig, webviewConfig];
