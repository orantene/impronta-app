/* eslint-disable @typescript-eslint/no-require-imports -- Node --require hooks must be CommonJS. */

// Test-only compatibility hook for Node's built-in test runner.
//
// Next aliases bare `server-only` internally. Plain `tsx --test` does not, so
// server-component modules that are safe to inspect in tests fail resolution
// before assertions can run. Point the marker at Next's own empty server-only
// implementation for Node tests. The same server-component graph can import
// component CSS, which Node cannot execute, so stylesheet imports are stubbed.
// Do not use this hook in application runtime.
const Module = require("node:module");
const path = require("node:path");

const originalResolveFilename = Module._resolveFilename;
const emptyServerOnly = path.join(
  __dirname,
  "..",
  "node_modules",
  "next",
  "dist",
  "compiled",
  "server-only",
  "empty.js",
);

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === "server-only") return emptyServerOnly;
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

for (const extension of [".css", ".scss", ".sass"]) {
  require.extensions[extension] = function stubStylesheet(module) {
    module._compile("", module.filename);
  };
}
