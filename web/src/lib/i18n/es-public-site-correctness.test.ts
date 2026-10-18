import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { AUTH_EN, AUTH_ES } from "@/lib/notifications/email-copy/auth";

// Lane: ES / public-site correctness (TUL-814, TUL-864/892, TUL-1259).
const root = process.cwd();
const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8"));
const es = JSON.parse(readFileSync(join(root, "messages/es.json"), "utf8"));

function dig(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o);
}

describe("language option labels are native names in every UI language (TUL-1259)", () => {
  // Find the namespace holding langEn/langEs (client account settings).
  function find(o: unknown, trail: string[] = []): string[] | null {
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    if (typeof rec.langEn === "string" && typeof rec.langEs === "string") return trail;
    for (const [k, v] of Object.entries(rec)) {
      const r = find(v, [...trail, k]);
      if (r) return r;
    }
    return null;
  }
  const ns = find(en)!;

  it("exists in both catalogs", () => {
    assert.ok(ns, "langEn/langEs namespace found");
    assert.deepEqual(find(es), ns);
  });
  it("English and Spanish catalogs show the same native labels", () => {
    const p = ns.join(".");
    assert.equal(dig(en, `${p}.langEn`), "English");
    assert.equal(dig(es, `${p}.langEn`), "English");
    assert.equal(dig(en, `${p}.langEs`), "Español");
    assert.equal(dig(es, `${p}.langEs`), "Español");
  });
});

describe("auth email copy has no untranslated Spanish strings (TUL-814)", () => {
  for (const key of Object.keys(AUTH_EN) as (keyof typeof AUTH_EN)[]) {
    it(`${key}: every ES field differs from EN and names no 'talent account'`, () => {
      const e = AUTH_EN[key] as Record<string, string>;
      const s = AUTH_ES[key] as Record<string, string>;
      assert.deepEqual(Object.keys(s).sort(), Object.keys(e).sort());
      for (const f of Object.keys(e)) {
        assert.notEqual(s[f], e[f], `${key}.${f} is still English`);
        assert.doesNotMatch(s[f], /talent account/i);
      }
    });
  }
});

describe("pricing interval copy carries the approximate-currency note (TUL-864)", () => {
  it("en + es both define approxNote and es is Spanish", () => {
    const e = dig(en, "public.pricingInterval.approxNote");
    const s = dig(es, "public.pricingInterval.approxNote");
    assert.equal(typeof e, "string");
    assert.equal(typeof s, "string");
    assert.notEqual(e, s);
    assert.match(String(s), /USD/);
    assert.doesNotMatch(String(s), /—/); // no em dash in product copy
  });
});
