import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// TUL-602 (Batch 11): the hub landing fell back to a tenant-specific
// "Impronta Hub" brand. (The client Help tab landed separately on main.)

const read = (p: string) => readFileSync(p, "utf8");

test("the hub landing fallback brand is platform-neutral", () => {
  assert.doesNotMatch(read("src/components/home/hub-landing.tsx"), /Impronta Hub/);
});
