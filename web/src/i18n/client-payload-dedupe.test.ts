import assert from "node:assert/strict";
import { test } from "node:test";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { missingFrom, pickClientSubtrees } from "./client-subtrees";
import { getClientMessagesPayload } from "./messages";

type Catalog = Record<string, unknown>;

/** The browser translator's per-key walk over whatever was inlined (messages.client.ts). */
function lookup(payload: Record<string, Catalog>, chain: string[], key: string): unknown {
  for (const code of chain) {
    let cur: unknown = payload[code];
    for (const p of key.split(".")) cur = cur && typeof cur === "object" ? (cur as Catalog)[p] : undefined;
    if (typeof cur === "string") return cur;
  }
  return undefined;
}

function leafKeys(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (!node || typeof node !== "object" || Array.isArray(node)) return [];
  return Object.entries(node as Catalog).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}

test("TUL-1156: missingFrom keeps only what the base cannot answer", () => {
  const base = { a: { x: "1", y: "2" }, list: ["p"] };
  const fallback = { a: { x: "F1", y: "F2", z: "F3" }, b: { c: "F4" }, list: ["q"], s: "F5" };
  assert.deepEqual(missingFrom(base, fallback), { a: { z: "F3" }, b: { c: "F4" }, s: "F5" });
  assert.deepEqual(missingFrom(fallback, fallback), {});
});

test("TUL-1156: the inline payload for es carries es once and no copy of the en strings es already has", () => {
  const payload = getClientMessagesPayload("es");
  const esSize = JSON.stringify(payload.es).length;
  const enSize = JSON.stringify(payload.en ?? {}).length;
  const fullEn = JSON.stringify(pickClientSubtrees(en as Catalog)).length;
  assert.ok(esSize > 10_000, "es subtrees are inlined");
  assert.ok(enSize < fullEn / 4, `en fallback shrank (${enSize} vs full ${fullEn})`);
});

test("TUL-1156: every key resolves to the same string as before the dedupe, in en and es", () => {
  for (const [locale, catalog] of [["en", en], ["es", es]] as const) {
    const payload = getClientMessagesPayload(locale);
    const full = {
      [locale]: pickClientSubtrees(catalog as Catalog),
      en: pickClientSubtrees(en as Catalog),
    } as Record<string, Catalog>;
    const chain = locale === "en" ? ["en"] : [locale, "en"];
    for (const key of leafKeys(pickClientSubtrees(catalog as Catalog))) {
      assert.equal(lookup(payload, chain, key), lookup(full, chain, key), key);
    }
  }
});
