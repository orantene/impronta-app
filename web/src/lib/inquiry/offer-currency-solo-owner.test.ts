/**
 * Solo owner-talent is the seller when the inquiry has no participant row.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/inquiry/offer-currency-solo-owner.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkInquiryCurrencyMatchesSeller, resolveNewOfferCurrency } from "./offer-currency-seller";

type World = {
  workspaceType: string;
  workspaceCurrency?: string | null;
  roster: string[];
  talentCurrency?: string | null;
  rosterError?: boolean;
};

function fake(w: World): SupabaseClient {
  const rows: Record<string, unknown[]> = {
    inquiry_participants: [],
    inquiries: [{ tenant_id: "t1" }],
    agencies: [{ workspace_type: w.workspaceType, default_currency: w.workspaceCurrency ?? null }],
    agency_talent_roster: w.roster.map((id) => ({ talent_profile_id: id })),
    talent_profiles: w.roster.map((id) => ({ id, default_currency: w.talentCurrency ?? null, stripe_account_platform: "mx" })),
  };
  return {
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "neq"]) b[m] = () => b;
      b.maybeSingle = () => Promise.resolve({ data: rows[table]?.[0] ?? null, error: null });
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve(table === "agency_talent_roster" && w.rosterError ? { data: null, error: { message: "x" } } : { data: rows[table] ?? [], error: null });
      return b;
    },
  } as unknown as SupabaseClient;
}

const cur = (w: World) => resolveNewOfferCurrency(fake(w), { inquiryId: "i1", platformCurrency: "USD", followSeller: true });

describe("solo owner-talent as seller", () => {
  it("talent workspace, one roster talent in MXN -> MXN", async () =>
    assert.equal(await cur({ workspaceType: "talent", roster: ["a"], talentCurrency: "MXN" }), "MXN"));
  it("talent has no currency, workspace default MXN -> MXN", async () =>
    assert.equal(await cur({ workspaceType: "talent", roster: ["a"], workspaceCurrency: "MXN" }), "MXN"));
  it("business workspace never infers a seller -> platform", async () =>
    assert.equal(await cur({ workspaceType: "business", roster: ["a"], talentCurrency: "MXN" }), "USD"));
  it("talent workspace with two roster talents -> platform", async () =>
    assert.equal(await cur({ workspaceType: "talent", roster: ["a", "b"], talentCurrency: "MXN" }), "USD"));
  it("charge guard refuses USD for the MXN solo seller", async () => {
    const r = await checkInquiryCurrencyMatchesSeller(fake({ workspaceType: "talent", roster: ["a"], talentCurrency: "MXN" }), {
      inquiryId: "i1",
      currency: "USD",
      mode: "charge",
    });
    assert.equal(r.ok, false);
  });
  it("roster read error: charge fails closed", async () => {
    const r = await checkInquiryCurrencyMatchesSeller(fake({ workspaceType: "talent", roster: ["a"], rosterError: true }), {
      inquiryId: "i1",
      currency: "USD",
      mode: "charge",
    });
    assert.equal(r.ok, false);
  });
});
