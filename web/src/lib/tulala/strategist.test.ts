/**
 * strategist.test.ts — trigger matching is the whole product of Phase 8.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { Brief, BriefFact } from "./brief-store";
import {
  evaluatePendingTriggers,
  strategistNotes,
  type PendingUpgradeTrigger,
} from "./strategist";

function fact(key: string, value: unknown): BriefFact {
  return {
    factKey: key,
    value,
    source: "user_stated",
    confidence: 1,
    status: "confirmed",
    sourceExcerpt: null,
    sourceUrl: null,
    questionId: null,
    questionVersion: null,
    updatedAt: null,
  };
}

function briefOf(...facts: BriefFact[]): Brief {
  return {
    id: "b1",
    status: "provisioned",
    locale: "en",
    currentVersion: 1,
    engineVersion: null,
    profileId: "p1",
    guestSessionId: null,
    signupLeadId: null,
    talentProfileId: null,
    tenantId: null,
    facts,
    updatedAt: null,
  };
}

function trigger(key: string, tier = "studio"): PendingUpgradeTrigger {
  return {
    id: `t-${key}`,
    triggerKey: key,
    targetPackage: "workspace",
    targetTier: tier,
    rationale: "test rationale",
  };
}

test("roster_seat_needed fires only when staff AND commission are both true", () => {
  const pending = [trigger("roster_seat_needed")];
  assert.equal(
    evaluatePendingTriggers(briefOf(fact("business.has_staff", true)), pending).length,
    0,
  );
  assert.equal(
    evaluatePendingTriggers(
      briefOf(fact("business.has_staff", true), fact("business.takes_commission", true)),
      pending,
    ).length,
    1,
  );
});

test("stated_hiring_intent waits for actual headcount", () => {
  const pending = [trigger("stated_hiring_intent")];
  assert.equal(
    evaluatePendingTriggers(briefOf(fact("goals.wants_to_grow_team", true)), pending).length,
    0,
  );
  assert.equal(
    evaluatePendingTriggers(briefOf(fact("business.staff_count", 2)), pending).length,
    1,
  );
});

test("own_domain_wanted fires when a website appears", () => {
  const pending = [trigger("own_domain_wanted", "website")];
  assert.equal(evaluatePendingTriggers(briefOf(), pending).length, 0);
  assert.equal(
    evaluatePendingTriggers(
      briefOf(fact("presence.website_url", "https://glow.mx")),
      pending,
    ).length,
    1,
  );
});

test("unknown trigger keys never fire", () => {
  assert.equal(
    evaluatePendingTriggers(briefOf(fact("business.has_staff", true)), [
      trigger("made_up_key"),
    ]).length,
    0,
  );
});

test("strategist notes geography and team changes without inventing upgrades", () => {
  const notes = strategistNotes(
    briefOf(fact("person.city", "Cancun"), fact("business.staff_count", 2)),
    ["person.city", "business.staff_count"],
  );
  assert.ok(notes.some((n) => n.kind === "note" && /Cancun/.test(n.text)));
  assert.ok(notes.some((n) => n.kind === "note" && /2 people/.test(n.text)));
  assert.ok(notes.every((n) => n.kind === "note"));
});
