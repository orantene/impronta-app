import { test } from "node:test";
import assert from "node:assert/strict";
import { profileMayPublishTerms, refuseUnclaimedSellers } from "./purchase-seller";
import type { Catalog } from "./purchase-catalog";

type Row = Record<string, unknown>;

function fakeAdmin(profiles: Row[]) {
  return {
    from: (table: string) => {
      const preds: Array<(row: Row) => boolean> = [];
      const match = () => profiles.filter((row) => preds.every((p) => p(row)));
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => {
          preds.push((row) => row[k] === v);
          return api;
        },
        in: (k: string, vals: unknown[]) => {
          preds.push((row) => vals.includes(row[k]));
          return api;
        },
        maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
          resolve({ data: match(), error: null }),
      };
      assert.equal(table, "talent_profiles");
      return api;
    },
  };
}

function catalogWithTalent(talentProfileId: string): Extract<Catalog, { ok: true }> {
  return {
    ok: true,
    policies: new Map(),
    rawOfferings: new Map(),
    offerings: new Map([
      [
        "off_1",
        {
          offeringId: "off_1",
          label: "Headshot",
          amountCents: 1000,
          currency: "USD",
          priceType: "fixed",
          talentProfileId,
          ownerTenantId: null,
          talentCostCents: 1000,
        },
      ],
    ]),
    variants: new Map(),
    addons: new Map(),
  };
}

test("unclaimed talent cannot take money", async () => {
  const out = await refuseUnclaimedSellers(
    fakeAdmin([{ id: "tal_1", user_id: null, claimed_at: null }]) as never,
    catalogWithTalent("tal_1"),
  );
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, "unclaimed_seller");
});

test("claimed talent can take money; agency-owned offerings skip the check", async () => {
  const claimed = await refuseUnclaimedSellers(
    fakeAdmin([{ id: "tal_1", user_id: "user_1", claimed_at: "2026-01-01" }]) as never,
    catalogWithTalent("tal_1"),
  );
  assert.equal(claimed.ok, true);

  const agency: Extract<Catalog, { ok: true }> = {
    ...catalogWithTalent("ignored"),
    offerings: new Map([
      [
        "off_agency",
        {
          offeringId: "off_agency",
          label: "Menu item",
          amountCents: 500,
          currency: "USD",
          priceType: "fixed",
          talentProfileId: null,
          ownerTenantId: "t1",
          talentCostCents: 0,
        },
      ],
    ]),
  };
  const skip = await refuseUnclaimedSellers(fakeAdmin([]) as never, agency);
  assert.equal(skip.ok, true);
});

test("provisional profile cannot publish terms until claimed", async () => {
  assert.equal(
    await profileMayPublishTerms(fakeAdmin([{ id: "tal_1", user_id: null, claimed_at: null }]) as never, "tal_1"),
    false,
  );
  assert.equal(
    await profileMayPublishTerms(
      fakeAdmin([{ id: "tal_1", user_id: "u1", claimed_at: "2026-01-01" }]) as never,
      "tal_1",
    ),
    true,
  );
});
