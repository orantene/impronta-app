/**
 * copy.test.ts: every kit string resolves in EN, ES and FR (no raw dotted key
 * leaks to a screen), no em dashes, "client" never "customer", and ES/FR are
 * real translations rather than English copies.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { MESSAGING_REFUSAL_CODES } from "@/lib/messaging/refusals";

import { fill } from "./copy";
import { EN_COPY, ES_COPY, FR_COPY } from "./test-copy";

function leaves(obj: unknown, path: string[] = []): [string, string][] {
  if (typeof obj === "string") return [[path.join("."), obj]];
  if (typeof obj === "function") return [];
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => leaves(v, [...path, k]));
  return [];
}

for (const [name, copy] of [
  ["en", EN_COPY],
  ["es", ES_COPY],
  ["fr", FR_COPY],
] as const) {
  test(`${name}: every kit string resolves, no em dash, no "customer"`, () => {
    const all = leaves(copy);
    assert.ok(all.length > 250, `expected a full catalogue, got ${all.length}`);
    for (const [key, value] of all) {
      assert.ok(!value.startsWith("dashboard."), `${name} ${key} rendered its own key: ${value}`);
      assert.ok(!value.includes("—"), `${name} ${key} has an em dash`);
      assert.doesNotMatch(value, /customer/i, `${name} ${key} says customer`);
    }
  });
}

test("es and fr are translations, not English copies", () => {
  const en = new Map(leaves(EN_COPY));
  for (const [name, copy] of [
    ["es", ES_COPY],
    ["fr", FR_COPY],
  ] as const) {
    const same = leaves(copy).filter(([k, v]) => en.get(k) === v && v.length > 5 && !/^(WhatsApp|SMS|Total|Email|E-mail)$/.test(v));
    // Short identical words (Total, SMS) are fine; whole sentences copied are not.
    assert.ok(same.length < 12, `${name} has ${same.length} strings identical to EN: ${same.map(([k]) => k).join(", ")}`);
  }
});

test("every refusal code has a sentence in each locale", () => {
  for (const code of MESSAGING_REFUSAL_CODES) {
    for (const copy of [EN_COPY, ES_COPY, FR_COPY]) {
      const s = copy.refusal(code);
      assert.ok(s.length > 5 && !s.startsWith("dashboard."), `refusal ${code} missing: ${s}`);
    }
  }
});

test("fill substitutes holes and leaves unknown ones visible", () => {
  assert.equal(fill("v{version} by {name}", { version: 3, name: "Diego" }), "v3 by Diego");
  assert.equal(fill("{missing}", {}), "{missing}");
});
