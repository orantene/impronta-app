import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-397 / TUL-79: mobile device iframes must receive the parent's
 * editing locale so seeded labels (Menú y precios) stay Spanish.
 */
test("iframe bridge syncs content locale parent → child on ready and change", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/edit-chrome/iframe-bridge.tsx"),
    "utf8",
  );
  assert.match(src, /editor:setContentLocale/);
  assert.match(src, /publishActiveContentLocale/);
  assert.match(src, /contentLocaleMessage/);
  assert.match(src, /postToAllDeviceIframes/);
  assert.match(src, /useActiveContentLocale/);
});
