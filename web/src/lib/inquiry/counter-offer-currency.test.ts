/**
 * Follow-up to TUL-313: the counter-offer path and the thread draft use the
 * seller resolver and never default to USD.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/inquiry/counter-offer-currency.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { counterOffer } from "./inquiry-engine-offers";
import { resolveThreadDraftCurrency } from "../messaging/thread-draft-currency";

type World = {
  workspaceType?: string;
  workspaceDefault?: string | null;
  owners?: string[];
  ownerTalentCurrency?: string | null;
  prevCurrency?: string | null;
};

function fake(w: World): SupabaseClient {
  return {
    from: (table: string) => {
      let rows: unknown[] = [];
      if (table === "agencies") {
        rows = [{ workspace_type: w.workspaceType ?? "business", default_currency: w.workspaceDefault ?? null }];
      } else if (table === "agency_memberships") {
        rows = (w.owners ?? []).map((id) => ({ profile_id: id }));
      } else if (table === "inquiry_offers") {
        rows = [{ currency_code: w.prevCurrency ?? null }];
      }
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "limit"]) b[m] = () => b;
      b.maybeSingle = async () =>
        table === "talent_profiles"
          ? { data: { default_currency: w.ownerTalentCurrency ?? null }, error: null }
          : { data: rows[0] ?? null, error: null };
      b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null });
      return b;
    },
  } as unknown as SupabaseClient;
}

const ctx = { inquiryId: "i1", tenantId: "t1", actorUserId: "u1", expectedVersion: 1, previousOfferId: "o1" };

describe("counterOffer currency (TUL-313 follow-up)", () => {
  it("no currency from the caller, the prior offer or the seller: refuses, no USD", async () => {
    const r = await counterOffer(fake({}), ctx);
    assert.equal(r.success, false);
    if (!r.success) assert.equal((r as { reason?: string }).reason, "offer_currency_unresolved");
  });
  it("solo owner-talent in MXN: the counter resolves MXN (passes the resolver, reaches createOffer)", async () => {
    const r = await counterOffer(fake({ workspaceType: "talent", owners: ["u1"], ownerTalentCurrency: "MXN" }), ctx);
    assert.notEqual((r as { reason?: string }).reason, "offer_currency_unresolved");
  });
  it("source: the counter has no USD fallback and routes through the seller resolver", () => {
    const src = readFileSync(new URL("./inquiry-engine-offers.ts", import.meta.url), "utf8");
    const start = src.indexOf("export async function counterOffer");
    const fn = src.slice(start, src.indexOf("return result;", start));
    assert.doesNotMatch(fn, /"USD"/);
    assert.match(fn, /resolveNewOfferCurrency\(/);
    assert.match(fn, /reason: "offer_currency_unresolved"/);
    assert.match(fn, /currencyCode: counterCurrency/);
  });
});

describe("thread draft currency never guesses USD (TUL-313 follow-up)", () => {
  it("nothing resolvable -> null, not USD", async () => {
    assert.equal(await resolveThreadDraftCurrency(fake({}), { tenantId: "t1", inquiryId: "i1" }), null);
  });
  it("solo owner-talent MXN -> MXN", async () => {
    assert.equal(
      await resolveThreadDraftCurrency(fake({ workspaceType: "talent", owners: ["u1"], ownerTalentCurrency: "MXN", workspaceDefault: "USD" }), {
        tenantId: "t1",
        inquiryId: "i1",
      }),
      "MXN",
    );
  });
  it("source: no USD / platform fallback, and the caller refuses with offer_currency_unresolved", () => {
    const own = readFileSync(new URL("../messaging/thread-draft-currency.ts", import.meta.url), "utf8");
    assert.doesNotMatch(own.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /"USD"|resolveOfferCurrency|platformCurrency/);
    const caller = readFileSync(new URL("../server-actions/messaging-client.ts", import.meta.url), "utf8");
    assert.match(caller, /if \(!draftCurrency\) return fail\("offer_currency_unresolved"\)/);
  });
});

describe("the remaining callers map the refusal (TUL-313 follow-up)", () => {
  it("createOfferAction returns the sentence, not the raw reason; talent quote maps the code", () => {
    const pipe = readFileSync(new URL("../../app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts", import.meta.url), "utf8");
    assert.match(pipe, /reason === "offer_currency_unresolved"\) \{\s*return \{ ok: false, error: OFFER_CURRENCY_UNRESOLVED_MESSAGE \}/);
    assert.doesNotMatch(pipe, /loadPlatformOperatingCurrency/);
    const quote = readFileSync(new URL("../server-actions/messaging-talent-quote.ts", import.meta.url), "utf8");
    assert.match(quote, /created\.reason === "offer_currency_unresolved"\) return fail\("offer_currency_unresolved"\)/);
  });
});
