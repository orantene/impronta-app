/**
 * TUL-708: on the Hoy "Up next" card the client name must not wrap badly at
 * 390px. The name line in the shared appointment row truncates with an
 * ellipsis, via classes (no inline styles).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = readFileSync(join(__dirname, "AgendaTodayPage.tsx"), "utf8");

test("appointment row name line truncates", () => {
  const m = SRC.match(/<div className="([^"]*)">\s*\{copy\.t\(item\.client\?\.name/);
  assert.ok(m, "name line not found");
  assert.match(m[1], /\btruncate\b/);
  assert.doesNotMatch(SRC.slice(SRC.indexOf("const apptRow"), SRC.indexOf("const apptRow") + 3000), /style=\{\{/);
});
