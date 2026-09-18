/**
 * copy.test.ts (L9): every client link string resolves in EN, ES and FR, no
 * em dashes, "client" never "customer", and ES/FR are real translations.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { EN_CLIENT, ES_CLIENT, FR_CLIENT } from "./test-copy";

function leaves(obj: unknown, path: string[] = []): [string, string][] {
  if (typeof obj === "string") return [[path.join("."), obj]];
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => leaves(v, [...path, k]));
  return [];
}

for (const [name, copy] of [
  ["en", EN_CLIENT],
  ["es", ES_CLIENT],
  ["fr", FR_CLIENT],
] as const) {
  test(`${name}: every client link string resolves, no em dash, no "customer"`, () => {
    const all = leaves(copy);
    assert.ok(all.length >= 100, `expected the full client catalogue, got ${all.length}`);
    for (const [key, value] of all) {
      assert.ok(!value.startsWith("dashboard."), `${name} ${key} rendered its own key: ${value}`);
      assert.ok(!value.includes("—"), `${name} ${key} has an em dash`);
      assert.doesNotMatch(value, /customer/i, `${name} ${key} says customer`);
    }
  });
}

test("es and fr are translations, not English copies", () => {
  const en = new Map(leaves(EN_CLIENT));
  for (const [name, copy] of [
    ["es", ES_CLIENT],
    ["fr", FR_CLIENT],
  ] as const) {
    const same = leaves(copy).filter(([k, v]) => en.get(k) === v && v.length > 5 && !/^(Total|v\{version\}|× \{units\})$/.test(v));
    assert.ok(same.length < 4, `${name} has ${same.length} strings identical to EN: ${same.map(([k]) => k).join(", ")}`);
  }
});
