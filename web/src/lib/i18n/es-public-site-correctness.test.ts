import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { AUTH_EN, AUTH_ES } from "@/lib/notifications/email-copy/auth";
import { translateDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

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

describe("talent plan names follow the dashboard language (TUL-1059)", () => {
  it("Web Office reads Oficina Web in Spanish and stays in English", () => {
    assert.equal(translateDashboardText("Web Office", "es"), "Oficina Web");
    assert.equal(translateDashboardText("Web Office", "en"), "Web Office");
  });
  it("no drawer prints a raw TALENT_TIER_META label", () => {
    for (const f of [
      "src/components/admin/shell/internal/talent-drawers/premium-pages.tsx",
      "src/components/admin/shell/internal/talent-drawers/profile-extras.tsx",
    ]) {
      const src = readFileSync(join(root, f), "utf8");
      const raw = src.split("\n").filter((l) => /TALENT_TIER_META\[[^\]]+\]\.label/.test(l) && !/(?:\.t\(|translateDashboardText\(|copy\.t\()/.test(l));
      assert.deepEqual(raw, [], `${f} prints an untranslated tier label`);
    }
  });
});

describe("+ alias copy never blames the user's inbox (TUL-851)", () => {
  for (const key of ["public.onboarding.code.plusSub", "public.onboarding.code.plusResent"]) {
    it(`${key} keeps the neutral tone in en + es`, () => {
      for (const cat of [en, es]) {
        const v = String(dig(cat, key));
        assert.doesNotMatch(v, /Inboxes often|never deliver|Muchas bandejas|no entregan/i);
        assert.match(v, /main address|dirección principal/);
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
