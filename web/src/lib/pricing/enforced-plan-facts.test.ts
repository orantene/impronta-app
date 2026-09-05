import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enforcedFactsForPlan,
  countMatchesClaim,
  findCompareTableDrift,
  type CompareRowClaim,
} from "./enforced-plan-facts";

test("the enforced facts are read from the modules that enforce them", () => {
  const free = enforcedFactsForPlan("free");
  assert.equal(free.rosterProfiles, 5);
  assert.equal(free.teamSeats, 2);
  assert.equal(free.publicPages, 5);
  assert.equal(free.customDomain, false);

  const studio = enforcedFactsForPlan("studio");
  assert.equal(studio.rosterProfiles, 15);
  assert.equal(studio.teamSeats, 3);
  assert.equal(studio.publicPages, null);
  // Not a ladder: Website ($12, ranked below Studio) gets a custom domain and
  // Studio does not. Any rank-comparison refactor breaks this silently.
  assert.equal(studio.customDomain, false);

  assert.equal(enforcedFactsForPlan("website").customDomain, true);
  assert.equal(enforcedFactsForPlan("website").rosterProfiles, 0);
  assert.equal(enforcedFactsForPlan("agency").rosterProfiles, null);
});

test("a count claim matches on meaning, not punctuation", () => {
  assert.equal(countMatchesClaim(15, "Up to 15"), true);
  assert.equal(countMatchesClaim(15, "15"), true);
  assert.equal(countMatchesClaim(15, "up to 15 profiles"), true);
  assert.equal(countMatchesClaim(null, "Unlimited"), true);
  assert.equal(countMatchesClaim(null, "∞"), true);
});

test("a finite cap may never be written as unlimited, or vice versa", () => {
  assert.equal(countMatchesClaim(15, "Unlimited"), false);
  assert.equal(countMatchesClaim(null, "Up to 50"), false);
  assert.equal(countMatchesClaim(5, null), false);
});

/**
 * The three drifts live on /pricing on 2026-09-05. Each is pinned as a
 * regression case so the guard is proven to catch the exact rows that got
 * through, not merely to compile.
 */
test("catches Studio's People profiles saying 50 when 15 is enforced", () => {
  const rows: CompareRowClaim[] = [
    { tierSlug: "studio", label: "People profiles", valueText: "Up to 50", included: true },
  ];
  const drift = findCompareTableDrift(rows);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].claimed, "Up to 50");
  assert.equal(drift[0].enforced, "15");
});

test("catches a count fact written as an excluded checkmark", () => {
  // This is the shape that said Free gets no CMS pages while the product
  // allows five, and that Studio gets none while it has unlimited.
  const rows: CompareRowClaim[] = [
    { tierSlug: "free", label: "CMS pages / posts / nav", valueText: null, included: false },
    { tierSlug: "studio", label: "CMS pages / posts / nav", valueText: null, included: false },
  ];
  const drift = findCompareTableDrift(rows);
  assert.equal(drift.length, 2);
  assert.equal(drift[0].enforced, "5");
  assert.equal(drift[1].enforced, "unlimited");
});

test("passes the rows that are already correct", () => {
  const rows: CompareRowClaim[] = [
    { tierSlug: "free", label: "People profiles", valueText: "Up to 5", included: true },
    { tierSlug: "agency", label: "People profiles", valueText: "Unlimited", included: true },
    { tierSlug: "free", label: "Seats", valueText: "2", included: true },
    { tierSlug: "studio", label: "Seats", valueText: "Up to 3", included: true },
    { tierSlug: "agency", label: "Seats", valueText: "Unlimited", included: true },
    { tierSlug: "free", label: "Custom domain", valueText: null, included: false },
    { tierSlug: "agency", label: "Custom domain", valueText: null, included: true },
  ];
  assert.deepEqual(findCompareTableDrift(rows), []);
});

test("says nothing about labels it does not own", () => {
  // Unenforceable marketing copy stays plainly authored. A guard that absorbed
  // it would launder an unverifiable claim into looking checked.
  const rows: CompareRowClaim[] = [
    { tierSlug: "free", label: "Priority support", valueText: "Best effort", included: true },
    { tierSlug: "hub", label: "SSO (SAML, Google, Okta)", valueText: "On request", included: true },
  ];
  assert.deepEqual(findCompareTableDrift(rows), []);
});

test("a tier slug with no plan key is skipped, not guessed", () => {
  // `client` family tiers (basic/verified/silver/gold) are the earned trust
  // ladder and have no builder policy. Mapping them onto one would invent a
  // fact about a product nobody sells.
  const rows: CompareRowClaim[] = [
    { tierSlug: "gold", label: "Seats", valueText: "Up to 99", included: true },
  ];
  assert.deepEqual(findCompareTableDrift(rows), []);
});
