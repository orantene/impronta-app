import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hubCardBookTarget,
  isHubProfileListableOffering,
  ownerBookHref,
  publicOfferingsScope,
} from "./hub-profile-offerings";
import { offeringPriceLabel, type TalentOffering } from "./offerings-types";

const HUB = "00000000-0000-0000-0000-000000000002";
const WORKSPACE = "33333333-3333-4333-8333-333333333333";

const talentRow = (over: Record<string, unknown> = {}) => ({
  owner_kind: "talent",
  tenant_id: WORKSPACE,
  status: "published",
  moderation_state: "approved",
  visibility: "public",
  ...over,
});

// (a) hub host + a talent-owned row that lives on a workspace tenant.
test("hub scope reads the talent's own rows of ANY tenant (no tenant filter, direct channel)", () => {
  assert.deepEqual(publicOfferingsScope({ tenantId: HUB, tenantKind: "hub" }), {
    filterTenantId: null,
    channel: "direct",
    hubCatalog: true,
  });
  assert.equal(isHubProfileListableOffering(talentRow()), true);
});

test("agency hosts keep their tenant scoping (unchanged)", () => {
  assert.deepEqual(publicOfferingsScope({ tenantId: WORKSPACE, tenantKind: "agency" }), {
    filterTenantId: WORKSPACE,
    channel: "agency",
    hubCatalog: false,
  });
  // Unknown kind fails closed to the old tenant scope, never the wide hub read.
  assert.equal(publicOfferingsScope({ tenantId: WORKSPACE, tenantKind: null }).filterTenantId, WORKSPACE);
});

test("no tenant (talent's own site, platform storefront) stays unscoped and direct", () => {
  assert.deepEqual(publicOfferingsScope({ tenantId: null, tenantKind: null }), {
    filterTenantId: null,
    channel: "direct",
    hubCatalog: false,
  });
  assert.equal(publicOfferingsScope({ tenantId: HUB, tenantKind: "hub", channel: "agency" }).channel, "agency");
});

// (b) a business's own catalog never appears on a hub profile.
test("owner_kind='workspace' rows are never listed on a hub profile", () => {
  assert.equal(isHubProfileListableOffering(talentRow({ owner_kind: "workspace" })), false);
  assert.equal(isHubProfileListableOffering(talentRow({ owner_kind: null })), false);
});

// (c) agency_only, pending, draft, rejected are not guest-visible.
test("agency_only, pending, rejected, draft and archived rows are not listed", () => {
  assert.equal(isHubProfileListableOffering(talentRow({ visibility: "agency_only" })), false);
  assert.equal(isHubProfileListableOffering(talentRow({ moderation_state: "pending" })), false);
  assert.equal(isHubProfileListableOffering(talentRow({ moderation_state: "rejected" })), false);
  assert.equal(isHubProfileListableOffering(talentRow({ status: "draft" })), false);
  assert.equal(isHubProfileListableOffering(talentRow({ status: "archived" })), false);
  assert.equal(isHubProfileListableOffering(null), false);
});

test("on_request is listed (shown without a price)", () => {
  assert.equal(isHubProfileListableOffering(talentRow({ visibility: "on_request" })), true);
});

test("D-10a: an on_request card prints no price digits", () => {
  const o = { visibility: "on_request", amountCents: 125000, currency: "MXN", priceType: "fixed" } as unknown as TalentOffering;
  for (const locale of ["en", "es"]) {
    assert.doesNotMatch(offeringPriceLabel(o, locale), /\d/);
  }
});

// (d) MONEY GUARD: a hub card never opens checkout in the hub tenant for another tenant's row.
test("hub card for a workspace-tenant row links to the owner's booking page", () => {
  for (const hostKind of ["marketing", "app", "hub"]) {
    assert.equal(
      hubCardBookTarget({ hostKind, offeringTenantId: WORKSPACE, offeringTenantKind: "agency" }),
      "owner_link",
      hostKind,
    );
  }
});

test("unknown row tenant kind fails closed to the owner link on a hub host", () => {
  assert.equal(hubCardBookTarget({ hostKind: "marketing", offeringTenantId: WORKSPACE, offeringTenantKind: null }), "owner_link");
});

test("a row sold under the hub tenant itself keeps the in-place hub booking", () => {
  assert.equal(hubCardBookTarget({ hostKind: "marketing", offeringTenantId: HUB, offeringTenantKind: "hub" }), "in_place");
});

test("non-hub hosts are unchanged (agency storefront, talent site)", () => {
  for (const hostKind of ["agency", "talent_site"]) {
    assert.equal(
      hubCardBookTarget({ hostKind, offeringTenantId: WORKSPACE, offeringTenantKind: "agency" }),
      "in_place",
      hostKind,
    );
  }
});

test("owner booking href is on the owner's site, never the hub", () => {
  assert.equal(
    ownerBookHref("https://staging-qa-journeys.tulala.digital/", "33330012-0000-4000-8000-000000000001"),
    "https://staging-qa-journeys.tulala.digital/book?service=33330012-0000-4000-8000-000000000001",
  );
  assert.equal(ownerBookHref("https://tulala.digital/w/qa-journeys", "a b"), "https://tulala.digital/w/qa-journeys/book?service=a%20b");
  assert.equal(ownerBookHref("", "x"), null);
  assert.equal(ownerBookHref("javascript:alert(1)", "x"), null);
});
