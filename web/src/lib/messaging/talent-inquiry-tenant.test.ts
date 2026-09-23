import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { pickTalentSiteInquiryTenant, type TalentRosterFact } from "./talent-inquiry-tenant";

const HUB = "hub-tenant";
const AGENCY = "agency-a";
const OTHER = "agency-b";

function row(partial: Partial<TalentRosterFact> & Pick<TalentRosterFact, "tenantId">): TalentRosterFact {
  return {
    status: "active",
    agencyVisibility: "site_visible",
    talentSiteHidden: false,
    ...partial,
  };
}

test("independent talent on her own site: the platform hub owns the inquiry", () => {
  const pick = pickTalentSiteInquiryTenant({
    hubTenantId: HUB,
    rosters: [row({ tenantId: HUB })],
  });
  assert.deepEqual(pick, { ok: true, tenantId: HUB, seller: "hub", reason: "independent" });
});

test("rostered to one selling agency: that agency owns the inquiry", () => {
  const pick = pickTalentSiteInquiryTenant({
    hubTenantId: HUB,
    rosters: [row({ tenantId: HUB }), row({ tenantId: AGENCY })],
  });
  assert.deepEqual(pick, { ok: true, tenantId: AGENCY, seller: "agency", reason: "single_agency" });
});

test("rostered to several selling agencies: the hub wins on her own site", () => {
  const pick = pickTalentSiteInquiryTenant({
    hubTenantId: HUB,
    rosters: [row({ tenantId: HUB }), row({ tenantId: AGENCY }), row({ tenantId: OTHER, agencyVisibility: "featured" })],
  });
  assert.deepEqual(pick, { ok: true, tenantId: HUB, seller: "hub", reason: "several_agencies" });
});

test("pending roster does not make the agency the seller", () => {
  const pick = pickTalentSiteInquiryTenant({
    hubTenantId: HUB,
    rosters: [row({ tenantId: HUB }), row({ tenantId: AGENCY, status: "pending" })],
  });
  assert.deepEqual(pick, { ok: true, tenantId: HUB, seller: "hub", reason: "pending_roster" });
});

test("a hidden roster wins over a pending roster", () => {
  const pick = pickTalentSiteInquiryTenant({
    hubTenantId: HUB,
    rosters: [
      row({ tenantId: AGENCY, talentSiteHidden: true }),
      row({ tenantId: OTHER, status: "pending" }),
    ],
  });
  assert.deepEqual(pick, { ok: true, tenantId: HUB, seller: "hub", reason: "hidden_roster" });
});

test("hidden roster does not make the agency the seller", () => {
  const hidden = pickTalentSiteInquiryTenant({
    hubTenantId: HUB,
    rosters: [row({ tenantId: AGENCY, talentSiteHidden: true })],
  });
  assert.equal(hidden.ok && hidden.reason, "hidden_roster");
  assert.equal(hidden.ok && hidden.tenantId, HUB);

  const rosterOnly = pickTalentSiteInquiryTenant({
    hubTenantId: HUB,
    rosters: [row({ tenantId: AGENCY, agencyVisibility: "roster_only" })],
  });
  assert.equal(rosterOnly.ok && rosterOnly.reason, "hidden_roster");
  assert.equal(rosterOnly.ok && rosterOnly.seller, "hub");
});

test("no platform hub fails closed", () => {
  const pick = pickTalentSiteInquiryTenant({
    hubTenantId: null,
    rosters: [row({ tenantId: AGENCY })],
  });
  assert.deepEqual(pick, { ok: false, reason: "no_hub" });
});

test("the talent-site dock mount does not hand a tenant id to the client", () => {
  const mount = readFileSync(
    new URL("../../app/t/[profileCode]/_chat/TalentProfileChatLauncherMount.tsx", import.meta.url),
    "utf8",
  );
  const dock = readFileSync(new URL("../../app/_talent-site/TalentSiteMessagesDock.tsx", import.meta.url), "utf8");
  assert.match(mount, /exposeTenantToClient \? tenantId : null/);
  assert.match(dock, /exposeTenantToClient=\{false\}/);
  assert.doesNotMatch(dock, /tenantId=\{resolved\.tenantId\}[\s\S]*exposeTenantToClient=\{true\}/);
});
