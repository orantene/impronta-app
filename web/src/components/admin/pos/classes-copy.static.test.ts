import test from "node:test";
import assert from "node:assert/strict";

import { createTranslator } from "@/i18n/messages";
import { POS_MODE_META } from "@/lib/pos/modes";

import { classesCopy, classesRailCopy, classesRailNavLabel } from "./classes-copy";

/**
 * Every sentence the Classes mode can show resolves in all three shipped
 * languages. `createTranslator` answers a missing key with the KEY ITSELF,
 * so a value that looks like a dotted key is a hole in the catalogue, and a
 * hole in es or fr is a refusal an operator reads in a language they did not
 * pick. Walked recursively over the whole copy bag: a new leaf added to the
 * type without its three strings fails here, not on a tablet.
 */
function leaves(value: unknown, path: string[] = []): Array<[string, string]> {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k]));
  }
  return [];
}

for (const locale of ["en", "es", "fr"] as const) {
  test(`every Classes mode sentence resolves in ${locale}`, async () => {
    const t = await createTranslator(locale);
    const all = [
      ...leaves(classesCopy(t)),
      ...leaves(classesRailCopy(t)),
      ["railNavLabel", classesRailNavLabel(t)] as [string, string],
    ];
    assert.ok(all.length > 100, `expected a full copy bag, got ${all.length} leaves`);
    const holes = all.filter(([, v]) => /^dashboard\.[a-zA-Z0-9_.]+$/.test(v) || v.trim() === "");
    assert.deepEqual(holes, [], `${locale} is missing: ${holes.map(([k]) => k).join(", ")}`);
    // No em dashes in user-facing copy.
    const dashes = all.filter(([, v]) => v.includes("—"));
    assert.deepEqual(dashes.map(([k]) => k), []);
  });
}

test("the rail labels cover exactly the mode's destinations", async () => {
  const t = await createTranslator("en");
  const labels = classesRailCopy(t);
  assert.deepEqual(Object.keys(labels).sort(), [...POS_MODE_META.classes.destinations].sort());
  assert.equal(POS_MODE_META.classes.built, true);
});
