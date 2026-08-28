import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("HQ queue keydown binds j/k/Enter/r/e/a", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(dir, "SupportQueueClient.tsx"), "utf8");
  assert.match(src, /addEventListener\("keydown"/);
  for (const key of ["j", "k", "Enter", "r", "e", "a"]) {
    assert.match(src, new RegExp(`e\\.key === "${key}"`));
  }
});
