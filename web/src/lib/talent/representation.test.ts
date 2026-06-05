import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveEffectiveVisibility,
  type AgencyVisibility,
  type RosterStatus,
} from "./representation";

function resolve(
  status: RosterStatus,
  agencyVisibility: AgencyVisibility,
  talentSiteHidden: boolean,
  globalHidden: boolean,
) {
  return resolveEffectiveVisibility({
    status,
    agencyVisibility,
    talentSiteHidden,
    globalHidden,
  });
}

test("live when active, site_visible, not hidden", () => {
  assert.equal(resolve("active", "site_visible", false, false), "live");
  assert.equal(resolve("active", "featured", false, false), "live");
});

test("you_hid when talent_site_hidden", () => {
  assert.equal(resolve("active", "site_visible", true, false), "you_hid");
});

test("agency_hidden when roster_only", () => {
  assert.equal(resolve("active", "roster_only", false, false), "agency_hidden");
});

test("winding_down when inactive", () => {
  assert.equal(resolve("inactive", "site_visible", false, false), "winding_down");
});

test("pending when pending status", () => {
  assert.equal(resolve("pending", "site_visible", false, false), "pending");
});

test("global_hidden overrides per-roster state", () => {
  assert.equal(resolve("active", "site_visible", false, true), "global_hidden");
  assert.equal(resolve("active", "roster_only", true, true), "global_hidden");
});

test("removed beats all", () => {
  assert.equal(resolve("removed", "site_visible", false, false), "removed");
  assert.equal(resolve("removed", "site_visible", false, true), "removed");
});

test("precedence: global beats you_hid and agency_hidden", () => {
  assert.equal(resolve("active", "roster_only", true, true), "global_hidden");
});
