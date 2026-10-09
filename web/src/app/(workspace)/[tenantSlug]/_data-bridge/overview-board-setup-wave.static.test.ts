import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Studio sign-in landed in 20-38 s because `loadSetupItems` (which reads the
 * whole People surface for one performer name) ran AFTER the Overview wave and
 * the money read. It must stay inside the first Promise.all, and its output
 * must still be passed through unchanged as `setup`.
 */
const src = readFileSync(new URL("./overview-board.ts", import.meta.url), "utf8");

test("setup checklist rides in the first Overview wave", () => {
  const waveStart = src.indexOf("await Promise.all([");
  const waveEnd = src.indexOf("const day = dayRead.ok");
  assert.ok(waveStart > 0 && waveEnd > waveStart);
  const wave = src.slice(waveStart, waveEnd);
  assert.match(wave, /loadClassesDay/);
  assert.match(wave, /loadSetupItems\(input\.tenantId, agency\)/);
});

test("setup items are returned as read, not re-awaited after the wave", () => {
  const afterWave = src.slice(src.indexOf("const day = dayRead.ok"));
  assert.doesNotMatch(afterWave, /await loadSetupItems/);
  assert.match(afterWave, /\n\s+setup,\n/);
});
