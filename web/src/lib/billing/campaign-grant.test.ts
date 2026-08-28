import test from "node:test";
import assert from "node:assert/strict";
import { isCampaignLive, resolveCampaignGrant, type CampaignRow } from "./campaign-grant";

const NOW = new Date("2026-06-15T00:00:00.000Z");

function campaign(over: Partial<CampaignRow> = {}): CampaignRow {
  return {
    slug: "LAUNCH2026",
    status: "active",
    grant_plan_tier: "agency",
    grant_duration_days: 60,
    starts_at: null,
    ends_at: null,
    ...over,
  };
}

test("an open-ended active campaign is live", () => {
  assert.equal(isCampaignLive(campaign(), NOW), true);
});

test("an ended campaign grants nothing", () => {
  assert.equal(resolveCampaignGrant(campaign({ status: "ended" }), NOW), null);
});

test("a campaign that has not started yet grants nothing", () => {
  assert.equal(resolveCampaignGrant(campaign({ starts_at: "2026-07-01T00:00:00.000Z" }), NOW), null);
});

test("a campaign past its end date grants nothing", () => {
  assert.equal(resolveCampaignGrant(campaign({ ends_at: "2026-06-01T00:00:00.000Z" }), NOW), null);
});

test("an unparseable window counts as closed, never as open", () => {
  // Handing out an unearned upgrade is harder to undo than withholding one.
  assert.equal(resolveCampaignGrant(campaign({ starts_at: "not-a-date" }), NOW), null);
  assert.equal(resolveCampaignGrant(campaign({ ends_at: "also-bad" }), NOW), null);
});

test("a money-only campaign resolves to no grant", () => {
  assert.equal(resolveCampaignGrant(campaign({ grant_plan_tier: null }), NOW), null);
});

test("a grant returns an ABSOLUTE expiry so a retry cannot extend it", () => {
  const grant = resolveCampaignGrant(campaign({ grant_duration_days: 60 }), NOW);
  assert.equal(grant?.planTier, "agency");
  assert.equal(grant?.expiresAt, "2026-08-14T00:00:00.000Z");
  // Same inputs, same answer — the value never depends on when it is re-read.
  assert.deepEqual(resolveCampaignGrant(campaign({ grant_duration_days: 60 }), NOW), grant);
});

test("a null campaign is simply no grant, not an error", () => {
  assert.equal(resolveCampaignGrant(null, NOW), null);
});
