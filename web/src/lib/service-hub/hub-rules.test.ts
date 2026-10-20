/**
 * TUL-1378: the service hub rules from the approved 20 rules (TUL-1365), as pure,
 * capability-scoped functions (no client or trade named): plan caps and downgrade,
 * leaving, reviews per model, whose customer, currency, safety officer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chargeCurrency,
  customerListVisible,
  hubPriceCurrency,
  leavingOutcome,
  pickVisibleWithinCap,
  reviewRoute,
  safetyOfficerApplies,
  type HubModel,
} from "./hub-rules";

const MODELS: HubModel[] = ["coordinator_agency", "friends_collective", "open_network", "rental_studio", "team_studio"];

// ── plan caps and downgrade ───────────────────────────────────────────────────

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, pinned: false, joinedAt: `2026-01-${String(i + 1).padStart(2, "0")}` }));

test("within the cap everyone stays visible; unlimited (null) shows everyone", () => {
  assert.deepEqual(pickVisibleWithinCap(people(5), 5).hiddenIds, []);
  assert.deepEqual(pickVisibleWithinCap(people(40), null).hiddenIds, []);
});

test("a downgrade HIDES the extra people and never removes them: the cap is Free 5", () => {
  const r = pickVisibleWithinCap(people(8), 5);
  assert.equal(r.visibleIds.length, 5);
  assert.equal(r.hiddenIds.length, 3);
  assert.equal(r.visibleIds.length + r.hiddenIds.length, 8, "nobody is dropped");
  assert.equal(r.removedIds.length, 0);
});

test("the owner's picks stay visible first, then the longest-standing members", () => {
  const list = people(8).map((p) => (["p7", "p8"].includes(p.id) ? { ...p, pinned: true } : p));
  const r = pickVisibleWithinCap(list, 5);
  assert.deepEqual([...r.visibleIds].sort(), ["p1", "p2", "p3", "p7", "p8"]);
  assert.deepEqual([...r.hiddenIds].sort(), ["p4", "p5", "p6"]);
});

test("more picks than the cap: the earliest-joined picks win; the rest are hidden, not removed", () => {
  const list = people(8).map((p) => ({ ...p, pinned: true }));
  const r = pickVisibleWithinCap(list, 5);
  assert.deepEqual(r.visibleIds, ["p1", "p2", "p3", "p4", "p5"]);
  assert.equal(r.removedIds.length, 0);
});

test("open jobs continue: a hidden member keeps their open bookings", () => {
  const r = pickVisibleWithinCap(people(8), 5, { openJobIds: new Set(["p8"]) });
  assert.ok(r.hiddenIds.includes("p8"));
  assert.deepEqual(r.keepOpenJobsFor, ["p8"], "hidden from the site, still serving the open job");
});

// ── leaving ────────────────────────────────────────────────────────────────────

test("leaving: entries leave the hub, open bookings are honoured, links redirect", () => {
  for (const who of ["member", "talent", "owner"] as const) {
    const o = leavingOutcome({ who, hasOpenBookings: true, groupStillExists: who !== "owner", talentHasPublicProfile: true });
    assert.equal(o.entriesLeaveHub, true, who);
    assert.equal(o.honourOpenBookings, true, who);
  }
});

test("leaving: links go to the group when it exists, else the talent's public profile, else a plain 404", () => {
  assert.equal(leavingOutcome({ who: "member", hasOpenBookings: false, groupStillExists: true, talentHasPublicProfile: true }).redirectTo, "group");
  assert.equal(leavingOutcome({ who: "owner", hasOpenBookings: false, groupStillExists: false, talentHasPublicProfile: true }).redirectTo, "talent_profile");
  assert.equal(leavingOutcome({ who: "owner", hasOpenBookings: false, groupStillExists: false, talentHasPublicProfile: false }).redirectTo, "none");
});

// ── reviews ────────────────────────────────────────────────────────────────────

test("reviews: coordinator models review the workspace entry with private feedback to the talent", () => {
  for (const m of ["coordinator_agency", "friends_collective"] as const) {
    assert.deepEqual(reviewRoute(m), { publicOn: "workspace_entry", privateFeedbackToTalent: true, withLabel: false });
  }
});

test("reviews: direct models review the talent; the studio adds a 'with <talent>' label", () => {
  assert.deepEqual(reviewRoute("open_network"), { publicOn: "talent", privateFeedbackToTalent: false, withLabel: false });
  assert.deepEqual(reviewRoute("rental_studio"), { publicOn: "talent", privateFeedbackToTalent: false, withLabel: false });
  assert.deepEqual(reviewRoute("team_studio"), { publicOn: "workspace_entry", privateFeedbackToTalent: false, withLabel: true });
});

// ── whose customer ─────────────────────────────────────────────────────────────

test("talents never get the workspace's customer list; staff of that workspace do", () => {
  assert.equal(customerListVisible({ role: "talent", sameWorkspaceStaff: false }), false);
  assert.equal(customerListVisible({ role: "talent", sameWorkspaceStaff: true }), false, "a talent role never sees it, even on the roster");
  assert.equal(customerListVisible({ role: "staff", sameWorkspaceStaff: true }), true);
  assert.equal(customerListVisible({ role: "staff", sameWorkspaceStaff: false }), false, "another workspace's staff never");
});

// ── currency ───────────────────────────────────────────────────────────────────

test("currency: the service keeps the talent's currency, the hub shows the workspace currency, the charge is the seller's", () => {
  assert.equal(hubPriceCurrency({ workspaceCurrency: "USD", serviceCurrency: "MXN" }), "USD");
  assert.equal(chargeCurrency({ seller: "workspace", workspaceCurrency: "USD", talentCurrency: "MXN" }), "USD");
  assert.equal(chargeCurrency({ seller: "talent", workspaceCurrency: "USD", talentCurrency: "MXN" }), "MXN");
  assert.equal(hubPriceCurrency({ workspaceCurrency: null, serviceCurrency: "MXN" }), "MXN");
});

// ── safety officer ─────────────────────────────────────────────────────────────

test("a safety officer only where the talent talks to the client directly (open network, rental studio)", () => {
  assert.deepEqual(MODELS.filter(safetyOfficerApplies).sort(), ["open_network", "rental_studio"]);
});
