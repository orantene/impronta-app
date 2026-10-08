import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "ClientsPage.tsx"), "utf8");

// TUL-303: toLocaleDateString without a timeZone rendered "jue 8 de oct" on the
// server and "vie 9 de oct" in a Tokyo browser (React #418 candidate). Every
// date formatted on this page must pass the hydration-gated zone.
test("clients page formats every date with the hydration-gated time zone", () => {
  assert.match(src, /useHydrated\(\) \? undefined : "UTC"/);
  const calls = src.match(/formatDay\([^\n]*\)/g) ?? [];
  const call = calls.filter((c) => !c.startsWith("formatDay(iso"));
  assert.ok(call.length >= 6, "expected the formatDay call sites");
  for (const c of call) assert.match(c, /dateZone/, c);
  for (const c of src.match(/formatMonthYear\([^\n]*\)/g) ?? []) {
    if (!c.startsWith("formatMonthYear(iso")) assert.match(c, /dateZone/, c);
  }
  assert.match(src, /timeZone,\n\s*\}\);/);
});
