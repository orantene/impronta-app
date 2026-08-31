/**
 * approve.test.ts
 *
 * Only the pure mappers are tested here — the DB write is not, and does not need
 * to be, because `provisionWorkspaceFromLead` already owns everything downstream
 * of the lead row.
 *
 * What these mappers get wrong is not visible until much later, which is exactly
 * why they are tested. A wrong `audience` puts a salon owner in a roster-shaped
 * workspace and she finds out when her site shows a team page she never asked
 * for. A talent plan key leaking into `tier_interest` tries to sell a workspace
 * upgrade to somebody who only wanted a profile.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  audienceForChoice,
  rosterBucketForCount,
  tierInterestForChoice,
  type ApprovedChoice,
} from "@/lib/tulala/approve.server";

const choice = (over: Partial<ApprovedChoice> = {}): ApprovedChoice => ({
  talentProfile: false,
  workspace: true,
  workspaceType: "business",
  workspacePlan: "website",
  talentPlan: null,
  ...over,
});

// ─── Audience is derived, never asked ─────────────────────────────────────────

test("no workspace means operator", () => {
  assert.equal(
    audienceForChoice(choice({ workspace: false, workspaceType: null, talentProfile: true })),
    "operator",
  );
});

test("a business-shaped workspace maps to the business audience", () => {
  // This is what hides the roster. A spa whose clients book the place, not a
  // named therapist, must not get a team directory.
  assert.equal(audienceForChoice(choice({ workspaceType: "business" })), "business");
});

test("a talent-shaped workspace maps to agency", () => {
  assert.equal(audienceForChoice(choice({ workspaceType: "talent" })), "agency");
});

test("a workspace with an unknown shape does not silently become a roster", () => {
  // Null shape defaults to `business`, the more conservative of the two: a
  // hidden roster is recoverable in settings, whereas a team page nobody asked
  // for has already been published under their name.
  assert.equal(audienceForChoice(choice({ workspaceType: null })), "business");
});

test("organization is never derived", () => {
  // Nothing in the fact vocabulary distinguishes a collective from an agency, so
  // the intake must not guess it. Asserted as an invariant over every input.
  const shapes: Array<ApprovedChoice["workspaceType"]> = ["talent", "business", null];
  for (const workspaceType of shapes) {
    for (const workspace of [true, false]) {
      const result = audienceForChoice(choice({ workspace, workspaceType }));
      assert.notEqual(result, "organization");
    }
  }
});

// ─── Tier interest only ever carries a workspace tier ─────────────────────────

test("each sellable workspace tier passes through", () => {
  for (const plan of ["website", "studio", "agency", "network"]) {
    assert.equal(tierInterestForChoice(choice({ workspacePlan: plan })), plan);
  }
});

test("the free workspace tier is expressed as null, not the string free", () => {
  // The lead column treats null as "free workspace". Writing "free" would make
  // `isPaidWorkspaceTierInterest` and the checkout branch disagree.
  assert.equal(tierInterestForChoice(choice({ workspacePlan: "free" })), null);
});

test("a talent plan never leaks into the workspace tier column", () => {
  for (const plan of ["talent_basic", "talent_premium", "talent_pro"]) {
    assert.equal(
      tierInterestForChoice(choice({ workspacePlan: plan })),
      null,
      `${plan} must not be written as a workspace tier`,
    );
  }
});

test("no workspace means no tier interest at all", () => {
  assert.equal(
    tierInterestForChoice(choice({ workspace: false, workspacePlan: "studio" })),
    null,
  );
});

// ─── Roster bucket ────────────────────────────────────────────────────────────

test("head count maps into the form's buckets", () => {
  assert.equal(rosterBucketForCount(1), "1-5");
  assert.equal(rosterBucketForCount(5), "1-5");
  assert.equal(rosterBucketForCount(6), "6-20");
  assert.equal(rosterBucketForCount(20), "6-20");
  assert.equal(rosterBucketForCount(21), "21-50");
  assert.equal(rosterBucketForCount(50), "21-50");
  assert.equal(rosterBucketForCount(51), "50+");
});

test("boundaries never round upward into a bigger plan", () => {
  // A stated 5 came from a conversation, and rounding it into "6-20" would nudge
  // the recommendation toward a tier the person did not describe needing.
  assert.equal(rosterBucketForCount(5), "1-5");
  assert.equal(rosterBucketForCount(20), "6-20");
});

test("nonsense counts still produce a valid bucket", () => {
  // The value reaches here from an extraction, so zero and negatives are
  // possible. The lead column is NOT NULL, so there is no option to fail.
  assert.equal(rosterBucketForCount(0), "1-5");
  assert.equal(rosterBucketForCount(-3), "1-5");
});
