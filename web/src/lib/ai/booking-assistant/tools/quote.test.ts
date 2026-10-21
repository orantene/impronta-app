/**
 * TUL-36 slice 2: the read-only quote tool. Server-priced from catalog rows, one sellable rule,
 * workspace-scoped, nothing about an unquotable service leaks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Catalog } from "@/lib/orders/purchase-catalog";

import { clampQuoteUnits, quoteFromCatalog, quoteReplyText } from "./quote";
import { runQuoteTool } from "./quote.server";

type Over = {
  status?: string; moderation?: string | null; visibility?: string | null; tenant?: string; amount?: number | null;
  currency?: string | null; priceType?: string; variants?: boolean;
};

function catalog(over: Over = {}): Extract<Catalog, { ok: true }> {
  const id = "off1";
  return {
    ok: true,
    policies: new Map([[id, {
      offeringId: id, status: (over.status ?? "published") as "published", tenantId: over.tenant ?? "T1", reserveMode: "none",
      depositPct: null, allowPayInPerson: false, requireAccountToBook: false, cancellationHours: null,
    } as never]]),
    rawOfferings: new Map([[id, {
      kind: "service", durationMinutes: 60, talentProfileId: "tp1", requiresIdentity: false, identityReason: null,
      visibility: over.visibility === undefined ? "public" : over.visibility,
      moderationState: over.moderation === undefined ? "approved" : over.moderation,
    }]]),
    offerings: new Map([[id, {
      offeringId: id, label: "Haircut", amountCents: over.amount === undefined ? 70_000 : over.amount,
      currency: over.currency === undefined ? "mxn" : over.currency, priceType: over.priceType ?? "fixed",
      talentProfileId: "tp1", ownerTenantId: null, talentCostCents: 0,
    }]]),
    variants: new Map(over.variants ? [["v1", { variantId: "v1", offeringId: id, label: "Long", amountCents: 90_000 }]] : []),
    addons: new Map(),
  };
}

const base = { offeringId: "off1", catalogTenantId: null, locale: "en" };

test("a public published service is quoted from the catalog price, units multiply, currency is formatted", () => {
  const q = quoteFromCatalog(catalog(), { ...base, units: 3 });
  assert.equal(q.kind, "quote");
  if (q.kind !== "quote") return;
  assert.equal(q.unitCents, 70_000);
  assert.equal(q.totalCents, 210_000);
  assert.equal(q.currency, "MXN");
  assert.match(q.priceLabel, /2,?100/);
  assert.equal(q.bookable, true);
});

test("units are clamped 1..20 and junk reads as 1", () => {
  assert.equal(clampQuoteUnits(0), 1);
  assert.equal(clampQuoteUnits(-5), 1);
  assert.equal(clampQuoteUnits(2.9), 2);
  assert.equal(clampQuoteUnits(500), 20);
  assert.equal(clampQuoteUnits(null), 1);
  assert.equal(clampQuoteUnits(Number.NaN), 1);
});

test("the one sellable rule: draft, unapproved, agency_only and missing values all answer as an unknown service", () => {
  for (const over of [{ status: "draft" }, { status: "archived" }, { moderation: "pending" }, { moderation: null }, { visibility: "agency_only" }, { visibility: null }]) {
    assert.deepEqual(quoteFromCatalog(catalog(over), base), { kind: "handoff", reason: "unknown_service" }, JSON.stringify(over));
  }
});

test("a service the model names that the catalog did not load is unknown", () => {
  assert.deepEqual(quoteFromCatalog(catalog(), { ...base, offeringId: "other" }), { kind: "handoff", reason: "unknown_service" });
  assert.deepEqual(quoteFromCatalog({ ok: false, error: "x" }, base), { kind: "handoff", reason: "unsure" });
});

test("workspace scope: on an agency host another workspace's service is unknown; no scope (talent site) allows it", () => {
  assert.deepEqual(quoteFromCatalog(catalog({ tenant: "T2" }), { ...base, catalogTenantId: "T1" }), { kind: "handoff", reason: "unknown_service" });
  assert.equal(quoteFromCatalog(catalog({ tenant: "T1" }), { ...base, catalogTenantId: "T1" }).kind, "quote");
  assert.equal(quoteFromCatalog(catalog({ tenant: "T2" }), base).kind, "quote");
});

test("on_request, optioned, custom, unpriced and currency-less services give no number", () => {
  const np = (over: Over, reason: string) => {
    const q = quoteFromCatalog(catalog(over), base);
    assert.equal(q.kind, "needs_person", JSON.stringify(over));
    assert.equal(q.kind === "needs_person" && q.reason, reason);
    assert.doesNotMatch(JSON.stringify(q), /70000|700/);
  };
  np({ visibility: "on_request" }, "price_on_request");
  np({ variants: true }, "options");
  np({ priceType: "custom" }, "not_fixed_price");
  np({ amount: null }, "not_fixed_price");
  np({ currency: null }, "no_currency");
  np({ amount: 0 }, "not_fixed_price");
});

test("an over-limit total gives no number", () => {
  const q = quoteFromCatalog(catalog({ amount: 4_000_000 }), { ...base, units: 5 });
  assert.deepEqual(q, { kind: "needs_person", title: "Haircut", reason: "amount_out_of_range" });
});

test("reply text is deterministic ES/EN, carries the computed price, no em dash", () => {
  const q = quoteFromCatalog(catalog(), { ...base, units: 2 });
  const en = quoteReplyText(q, "en", 2);
  const es = quoteReplyText(q, "es", 2);
  assert.match(en, /^2 x Haircut: /);
  assert.match(es, /^2 x Haircut: /);
  assert.match(quoteReplyText(quoteFromCatalog(catalog({ visibility: "on_request" }), base), "es", 1), /lo confirma una persona/);
  assert.match(quoteReplyText({ kind: "handoff", reason: "unknown_service" }, "en", 1), /A person on the team/);
  assert.doesNotMatch(en + es, /—/);
});

test("runQuoteTool reads only through the injected catalog reader and returns result + reply", async () => {
  const calls: string[][] = [];
  const out = await runQuoteTool({} as SupabaseClient, { ...base, units: 1 }, {
    loadCatalog: async (_a, ids) => {
      calls.push(ids);
      return catalog();
    },
  });
  assert.deepEqual(calls, [["off1"]]);
  assert.equal(out.result.kind, "quote");
  assert.match(out.reply, /Haircut/);
});

test("static: the quote tool never imports a money writer", () => {
  const dir = "src/lib/ai/booking-assistant/tools";
  for (const f of ["quote.ts", "quote.server.ts"]) {
    const src = readFileSync(join(process.cwd(), dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /createPurchase|createPaymentLink|stripe|\.insert\(|\.update\(|\.upsert\(|\.delete\(/i, f);
  }
});
