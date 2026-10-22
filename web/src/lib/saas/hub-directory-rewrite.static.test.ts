/** TUL-1866: a hub host's /directory renders the platform directory (rewrite), not the branded 404. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const proxy = readFileSync(join(HERE, "..", "..", "proxy.ts"), "utf8");

test("proxy rewrites /directory to /global-directory on hub hosts as well as marketing", () => {
  assert.match(
    proxy,
    /\(effectiveHostContext\.kind === "marketing" \|\| effectiveHostContext\.kind === "hub"\) && pathnameForAuth === "\/directory"/,
  );
});

test("proxy.ts stays within the 800-line cap", () => {
  assert.ok(proxy.split("\n").length <= 800);
});
