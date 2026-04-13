/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload; require() is intentional */
/**
 * ESLint 9 expects Node 18+ APIs. Preload for older Node (e.g. 16):
 *   node -r ./scripts/eslint-node-polyfill.cjs node_modules/eslint/bin/eslint.js .
 */
const { deserialize, serialize } = require("node:v8");

if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = (value) => deserialize(serialize(value));
}

if (
  typeof AbortSignal !== "undefined" &&
  typeof AbortSignal.prototype.throwIfAborted !== "function"
) {
  AbortSignal.prototype.throwIfAborted = function throwIfAborted() {
    if (this.aborted) {
      const reason = this.reason;
      throw reason instanceof Error ? reason : new Error("Aborted");
    }
  };
}

// Node 16.11+ — ESLint 9 formatters call this (missing on 16.10 and below).
const util = require("node:util");
if (typeof util.stripVTControlCharacters !== "function") {
  util.stripVTControlCharacters = function stripVTControlCharacters(str) {
    return String(str).replace(/\u001b\[[\d;]*m/g, "");
  };
}
