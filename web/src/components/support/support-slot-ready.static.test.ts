import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const rail = readFileSync("src/components/admin/shell/internal/talent.tsx", "utf8");
const launcher = readFileSync("src/components/support/SupportLauncher.tsx", "utf8");

test("TUL-980: the rail support slot is marked data-ready=\"true\" once the sidebar has hydrated", () => {
  // An explicit value, not an empty string: a check that reads the attribute's value
  // treats "" as falsy and reports the slot as not ready.
  assert.match(rail, /data-tulala-support-slot="rail"\s+data-ready=\{supportSlotReady \? "true" : undefined\}/);
  assert.doesNotMatch(rail, /data-ready=\{supportSlotReady \? "" : undefined\}/);
});

test("TUL-980: the ready flag is still set only after mount (a portal child during hydration is a mismatch)", () => {
  assert.match(rail, /const \[supportSlotReady, setSupportSlotReady\] = useState\(false\);/);
  assert.match(rail, /useEffect\(\(\) => setSupportSlotReady\(true\), \[\]\);/);
});

test("TUL-980: the launcher only portals into a ready rail slot and watches the attribute", () => {
  assert.match(launcher, /\[data-tulala-support-slot="rail"\]\[data-ready\]/);
  assert.match(launcher, /attributeFilter: \["data-ready"\]/);
});
