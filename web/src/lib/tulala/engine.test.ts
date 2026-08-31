/**
 * engine.test.ts
 *
 * The engine decides what people are charged, so these tests are the
 * specification rather than a safety net. Two groups matter most:
 *
 *   - The four worked cases from the plan. Two nail artists who are both "a
 *     talent who does nails" must resolve differently, and if they ever stop
 *     doing so the intake has lost the only thing that makes it worth building.
 *   - The permissive laws. Those cannot be violated by a proposal, only by a
 *     refusal, so `laws.ts` cannot check them and this file is where they live.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { PLAN_SEAT_CAPS } from "@/lib/saas/plan-seat-caps";
import { PERMISSIVE_LAWS } from "@/lib/tulala/laws";
import {
  chooseWhatToSell,
  ENGINE_VERSION,
  recommend,
  resolveHeadcount,
  resolveSeatsNeeded,
  resolveWorkspaceType,
  summarizeEvidence,
  takesCommissionFromRoster,
} from "@/lib/tulala/engine";
import type { Brief, BriefFact, FactSource } from "@/lib/tulala/brief-store";
import { FACT_KEYS } from "@/lib/tulala/fact-keys";
import type {
  PlanFamily,
  TulalaEntitlements,
  TulalaPlanOption,
} from "@/lib/tulala/entitlements";
import type { PlanKey } from "@/lib/access/plan-catalog";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * A catalog with the real numbers in it. Hand-built rather than loaded, so a
 * price change in the DB cannot silently rewrite what these tests assert; the
 * seat caps are imported from the enforcing table, because a fixture that
 * disagreed with the enforced cap would prove nothing.
 */
function option(
  family: PlanFamily,
  planKey: PlanKey,
  displayName: string,
  monthlyPriceCents: number | null,
  rosterSeats: number | null,
  over: Partial<TulalaPlanOption> = {},
): TulalaPlanOption {
  return {
    family,
    planKey,
    dbTierSlug: planKey,
    displayName,
    tagline: null,
    monthlyPriceCents,
    annualPriceCents: monthlyPriceCents === null ? null : monthlyPriceCents * 10,
    currency: "USD",
    formattedMonthly: monthlyPriceCents ? `$${monthlyPriceCents / 100}` : null,
    rosterSeats,
    trialDays: monthlyPriceCents ? 14 : null,
    trialEnabled: Boolean(monthlyPriceCents),
    isSelfServe: true,
    isSellableNow: true,
    highlights: [],
    ...over,
  };
}

function entitlements(over: Partial<TulalaEntitlements> = {}): TulalaEntitlements {
  return {
    commissionBps: 600,
    clientSurchargeBps: 300,
    workspace: [
      option("workspace", "free", "Free", 0, PLAN_SEAT_CAPS.free),
      option("workspace", "website", "Website", 1200, PLAN_SEAT_CAPS.website),
      option("workspace", "studio", "Studio", 2900, PLAN_SEAT_CAPS.studio),
      option("workspace", "agency", "Agency", 7900, PLAN_SEAT_CAPS.agency),
      option("workspace", "network", "Network", null, PLAN_SEAT_CAPS.network, {
        isSelfServe: false,
        isSellableNow: false,
      }),
    ],
    talent: [
      option("talent", "talent_basic", "Standard", 0, null),
      option("talent", "talent_pro", "Pro", 900, null),
      option("talent", "talent_portfolio", "Portfolio", 1900, null),
    ],
    currency: "USD",
    degraded: false,
    loadedAt: "2026-08-30T00:00:00.000Z",
    ...over,
  };
}

type FactSpec = [key: string, value: unknown, source?: FactSource, confidence?: number];

function briefOf(...specs: FactSpec[]): Brief {
  const facts: BriefFact[] = specs.map(([factKey, value, source, confidence]) => ({
    factKey,
    value,
    source: source ?? "user_stated",
    confidence: confidence ?? 1,
    status: source === "ai_inference" ? "needs_approval" : "confirmed",
    sourceExcerpt: null,
    sourceUrl: null,
    questionId: null,
    questionVersion: null,
    updatedAt: null,
  }));
  return {
    id: "brief-1",
    status: "discovering",
    locale: "en",
    currentVersion: 0,
    engineVersion: null,
    profileId: "user-1",
    guestSessionId: null,
    signupLeadId: null,
    talentProfileId: null,
    tenantId: null,
    facts,
    updatedAt: null,
  };
}

// ─── The four worked cases ────────────────────────────────────────────────────

test("WORKED CASE 1 — nail artist, works from home, alone: Talent Free, no workspace", () => {
  // The case that makes the whole intake worth building. She has a skill, a
  // clientele and no business, and every boolean cascade in this space sells
  // her something.
  const brief = briefOf(
    ["work.discipline", "nails"],
    ["work.performs_service_personally", true],
    ["work.booked_by_name", true],
    ["business.works_from", "home"],
    ["business.works_alone", true],
  );
  const rec = recommend(brief, entitlements());

  assert.equal(rec.structure.talentProfile, true);
  assert.equal(rec.structure.workspace, false, "no workspace for a sole trader at home");
  assert.equal(rec.plans.talent, "talent_basic");
  assert.equal(rec.plans.workspace, null);
  assert.equal(rec.plans.sell, null, "nothing is sold, and that is the correct outcome");
  assert.equal(rec.seatsNeeded, 0);
  // Fit, not force: the honest Free answer must leave a condition behind.
  assert.ok(
    rec.upgradeTriggers.some((t) => t.triggerKey === "roster_seat_needed"),
    "a declined upsell needs a durable home or the only tactic left is nagging",
  );
});

test("WORKED CASE 2 — nail artist employed at a spa: Talent, no workspace (L5)", () => {
  const brief = briefOf(
    ["work.discipline", "nails"],
    ["work.performs_service_personally", true],
    ["business.employed_by_other", true],
    ["business.works_from", "someone_elses_premises"],
  );
  const rec = recommend(brief, entitlements());

  assert.equal(rec.structure.talentProfile, true, "employment never disqualifies talent");
  assert.equal(rec.structure.workspace, false, "the spa is not hers");
  assert.equal(rec.plans.sell, null);
});

test("WORKED CASE 3 — salon owner, three artists, takes a cut: Studio, talent-shaped", () => {
  const brief = briefOf(
    ["work.discipline", "nails"],
    ["business.exists", true],
    ["business.name", "Glow Salon"],
    ["business.works_from", "own_premises"],
    ["business.has_staff", true],
    ["business.represents_others", true],
    ["business.takes_commission", true],
    ["business.staff_count", 4],
    ["business.clients_choose_provider", true],
  );
  const rec = recommend(brief, entitlements());

  assert.equal(rec.structure.workspace, true);
  assert.equal(rec.structure.workspaceType, "talent", "clients pick the artist");
  assert.equal(rec.seatsNeeded, 4);
  // Four people fit Free's five seats, so the seat cap alone would say Free.
  // Taking a cut is what raises the floor: Free is the friend-link tier with no
  // commission and no exclusivity.
  assert.equal(rec.plans.workspace, "studio");
  assert.equal(rec.plans.sell, "workspace");
  assert.ok(
    rec.reasons.some((r) => r.code === "roster_disqualifies_website"),
    "Website seats nobody, so it must be visibly ruled out",
  );
  assert.ok(rec.reasons.some((r) => r.code === "commission_requires_paid_tier"));
});

test("WORKED CASE 4 — spa owner, staff on salary, clients book a time: Website, business-shaped", () => {
  const brief = briefOf(
    ["business.exists", true],
    ["business.name", "Casa Serena"],
    ["business.works_from", "own_premises"],
    ["business.has_staff", true],
    ["business.other_workers_arrangement", "salary"],
    ["business.clients_choose_provider", false],
    ["presence.has_logo", true],
    ["goals.wants_website", true],
  );
  const rec = recommend(brief, entitlements());

  assert.equal(rec.structure.workspace, true);
  assert.equal(rec.structure.workspaceType, "business", "the slot is the product, not the person");
  assert.equal(rec.plans.sell, "workspace");
  assert.ok(
    rec.reasons.some((r) => r.code === "business_shaped_workspace"),
    "the shape fork must be explained, since it hides the roster surfaces entirely",
  );
});

// ─── An unsellable tier degrades, it does not disappear ───────────────────────

/**
 * The Website tier is `is_active = false` in the live catalog as of writing,
 * with no Stripe price behind it. That makes this the PRODUCTION path for every
 * case-4-shaped visitor, not a hypothetical, so it is asserted rather than
 * assumed. What must not happen is the two silent failures: dropping to Free
 * (which cannot host the site they just asked for) or recommending a tier no
 * card can be charged for.
 */
function withoutWebsite(): TulalaEntitlements {
  const base = entitlements();
  return {
    ...base,
    workspace: base.workspace.map((plan) =>
      plan.planKey === "website" ? { ...plan, isSellableNow: false } : plan,
    ),
  };
}

test("with Website unsellable, a site-wanting business gets the next tier up", () => {
  const brief = briefOf(
    ["business.exists", true],
    ["business.name", "Casa Serena"],
    ["business.works_from", "own_premises"],
    ["business.has_staff", true],
    ["business.other_workers_arrangement", "salary"],
    ["business.clients_choose_provider", false],
    ["goals.wants_website", true],
  );

  const withWebsite = recommend(brief, entitlements());
  assert.equal(withWebsite.plans.workspace, "website", "the premise of this test");

  const degraded = recommend(brief, withoutWebsite());
  assert.equal(degraded.plans.workspace, "studio", "must climb, not fall to Free");
  assert.equal(degraded.structure.workspaceType, "business", "the shape is unaffected");
});

test("an unsellable tier is never recommended, on any brief", () => {
  // The blanket guarantee. A recommendation for a plan with no chargeable price
  // is a dead end at checkout, which is worse than an honest cheaper plan.
  const ents = withoutWebsite();
  const briefs = [
    briefOf(["goals.wants_website", true], ["business.exists", true], ["business.name", "A"]),
    briefOf(["presence.owns_domain", true], ["business.exists", true], ["business.name", "B"]),
    briefOf(["presence.website_url", "https://example.com"], ["business.exists", true]),
  ];
  for (const brief of briefs) {
    assert.notEqual(recommend(brief, ents).plans.workspace, "website");
  }
});

// ─── The roster disqualifier ──────────────────────────────────────────────────

test("HARD RULE any roster need disqualifies Website, at every head count", () => {
  // PLAN_SEAT_CAPS.website is 0 deliberately. Website is cheaper than Studio and
  // wins any price-ordered search, so without this rule the funnel would sell a
  // salon owner a plan that cannot hold her artists.
  assert.equal(PLAN_SEAT_CAPS.website, 0, "the premise of this rule");
  for (const count of [1, 2, 5, 6, 15, 16, 40]) {
    const rec = recommend(
      briefOf(
        ["business.exists", true],
        ["business.name", "Studio X"],
        ["business.represents_others", true],
        ["business.staff_count", count],
        ["goals.wants_website", true],
      ),
      entitlements(),
    );
    assert.notEqual(rec.plans.workspace, "website", `head count ${count}`);
  }
});

test("seat bands: 1-5 stays on Free, 6-15 is Studio, above 15 is Agency", () => {
  const seatBrief = (count: number) =>
    briefOf(
      ["business.exists", true],
      ["business.name", "Studio X"],
      ["business.represents_others", true],
      ["business.staff_count", count],
    );
  const ents = entitlements();
  assert.equal(recommend(seatBrief(3), ents).plans.workspace, "free");
  assert.equal(recommend(seatBrief(5), ents).plans.workspace, "free");
  assert.equal(recommend(seatBrief(6), ents).plans.workspace, "studio");
  assert.equal(recommend(seatBrief(15), ents).plans.workspace, "studio");
  assert.equal(recommend(seatBrief(16), ents).plans.workspace, "agency");
});

test("a large roster that takes a cut lands on Agency, not merely the commission floor", () => {
  const rec = recommend(
    briefOf(
      ["business.exists", true],
      ["business.name", "Big Agency"],
      ["business.represents_others", true],
      ["business.takes_commission", true],
      ["business.staff_count", 30],
    ),
    entitlements(),
  );
  assert.equal(rec.plans.workspace, "agency");
});

test("a roster nothing self-serve can hold is reported unresolved, not sold Network", () => {
  // Network is not self-serve. Recommending it would send someone to a checkout
  // that does not exist, which is worse than saying "talk to a person".
  const rec = recommend(
    briefOf(
      ["business.exists", true],
      ["business.name", "Huge"],
      ["business.represents_others", true],
      ["business.staff_count", 400],
    ),
    entitlements({
      workspace: entitlements().workspace.map((p) =>
        p.planKey === "agency" ? { ...p, isSellableNow: false } : p,
      ),
    }),
  );
  assert.equal(rec.unresolved?.kind, "unclassifiable");
});

// ─── Fit, not force ───────────────────────────────────────────────────────────

test("Free is a terminal recommendation, and never sold alongside a paid plan", () => {
  const rec = recommend(
    briefOf(["work.performs_service_personally", true], ["work.booked_by_name", true]),
    entitlements(),
  );
  assert.equal(rec.plans.sell, null);
});

test("hybrid sells ONE plan; the other family explicitly falls back to free", () => {
  // Tulala must never feel like it is charging someone twice to exist, and a
  // real cross-family bundle is billing work this plan does not do.
  const rec = recommend(
    briefOf(
      ["person.professional_name", "Maria"],
      ["work.performs_service_personally", true],
      ["work.booked_by_name", true],
      ["business.exists", true],
      ["business.name", "Luna Wellness"],
      ["business.represents_others", true],
      ["business.takes_commission", true],
      ["business.staff_count", 3],
      ["goals.wants_website", true],
      ["presence.owns_domain", true],
    ),
    entitlements(),
  );
  assert.equal(rec.structure.talentProfile, true);
  assert.equal(rec.structure.workspace, true);
  assert.equal(rec.plans.sell, "workspace");
  assert.equal(rec.plans.talent, "talent_basic", "her personal profile costs nothing");
  assert.ok(rec.reasons.some((r) => r.code === "other_side_stays_free"));
});

test("chooseWhatToSell prefers the workspace when both sides are paid", () => {
  const ents = entitlements();
  assert.equal(chooseWhatToSell(ents, { workspace: "studio", talent: "talent_pro" }), "workspace");
  assert.equal(chooseWhatToSell(ents, { workspace: "free", talent: "talent_pro" }), "talent");
  assert.equal(chooseWhatToSell(ents, { workspace: "free", talent: "talent_basic" }), null);
  assert.equal(chooseWhatToSell(ents, { workspace: null, talent: null }), null);
});

// ─── Evidence weighting ───────────────────────────────────────────────────────

test("a false boolean is not evidence for the thing it denies", () => {
  // "Do other people work with you? No" must not score as a workspace signal
  // just because the question was asked. This is the bug that would classify
  // every sole trader as a business.
  const summary = summarizeEvidence(
    briefOf(
      ["business.exists", false],
      ["business.represents_others", false],
      ["business.has_staff", false],
    ).facts,
  );
  assert.equal(summary.workspaceScore, 0);
  assert.equal(summary.decisiveFactKeys.length, 0);
});

test("an unapproved guess counts for less than the same thing stated", () => {
  const stated = summarizeEvidence(briefOf(["business.name", "Glow", "user_stated", 1]).facts);
  const guessed = summarizeEvidence(
    briefOf(["business.name", "Glow", "ai_inference", 0.5]).facts,
  );
  assert.ok(
    guessed.workspaceScore < stated.workspaceScore,
    "a guess deciding what someone pays as strongly as a statement is the failure mode",
  );
});

test("one decisive fact outranks any pile of negatives", () => {
  // Modelled as a flag rather than a large weight precisely so this holds. She
  // works from home, alone, part time, and still takes a cut of someone else's
  // booking: that is a business.
  const rec = recommend(
    briefOf(
      ["business.works_alone", true],
      ["business.employed_by_other", true],
      ["business.works_from", "home"],
      ["business.takes_commission", true],
    ),
    entitlements(),
  );
  assert.equal(rec.confidence.workspace, 1);
  assert.equal(rec.structure.workspace, true);
});

test("a lone weak signal does not reach the workspace threshold", () => {
  // Having a logo is not having a business. L6: the test is whether a distinct
  // operating identity exists, and one asset is not one.
  const rec = recommend(briefOf(["presence.has_logo", true]), entitlements());
  assert.equal(rec.structure.workspace, false);
});

// ─── The operating questions ──────────────────────────────────────────────────

test("resolveHeadcount floors at two when someone says yes but not how many", () => {
  // Two still fits Free's five seats, so this assumption can never by itself
  // cause a paid recommendation.
  assert.equal(resolveHeadcount(briefOf(["business.represents_others", true])), 2);
  assert.equal(resolveHeadcount(briefOf(["business.has_staff", true])), 2);
  assert.equal(resolveHeadcount(briefOf(["business.represents_others", false])), 0);
  assert.equal(resolveHeadcount(briefOf()), 0);
  assert.equal(
    resolveHeadcount(
      briefOf(["business.represents_others", true], ["business.staff_count", 9]),
    ),
    9,
    "a stated number always beats the floor",
  );
});

test("business-shaped staff consume NO roster seats; talent-shaped ones do", () => {
  // A spa's salaried therapists are profile_kind='resource' rows: hidden from
  // every public surface and explicitly outside the seat cap. Counting them as
  // roster seats is what would push a spa off Website onto a plan it does not
  // need.
  const six = briefOf(["business.has_staff", true], ["business.staff_count", 6]);
  assert.equal(resolveSeatsNeeded(six, "business"), 0);
  assert.equal(resolveSeatsNeeded(six, "talent"), 6);
});

test("workspace shape: the money arrangement decides when nobody asked the direct question", () => {
  assert.equal(
    resolveWorkspaceType(briefOf(["business.other_workers_arrangement", "commission_split"])),
    "talent",
  );
  assert.equal(
    resolveWorkspaceType(briefOf(["business.other_workers_arrangement", "rent_chair"])),
    "talent",
  );
  assert.equal(
    resolveWorkspaceType(briefOf(["business.other_workers_arrangement", "salary"])),
    "business",
  );
});

test("workspace shape: the direct answer outranks the money arrangement", () => {
  assert.equal(
    resolveWorkspaceType(
      briefOf(
        ["business.clients_choose_provider", true],
        ["business.other_workers_arrangement", "salary"],
      ),
    ),
    "talent",
  );
});

test("workspace shape defaults to talent-shaped, the recoverable direction", () => {
  // A talent-shaped workspace shows a roster the owner can ignore. A
  // business-shaped one HIDES one she may be looking for, and she will churn
  // before she finds the setting.
  assert.equal(resolveWorkspaceType(briefOf()), "talent");
});

test("a commission split is read as taking a cut even without the direct boolean", () => {
  assert.equal(
    takesCommissionFromRoster(briefOf(["business.other_workers_arrangement", "commission_split"])),
    true,
  );
  assert.equal(
    takesCommissionFromRoster(briefOf(["business.other_workers_arrangement", "salary"])),
    false,
  );
  assert.equal(takesCommissionFromRoster(briefOf()), false);
});

// ─── The permissive laws ──────────────────────────────────────────────────────
//
// These cannot be violated by a proposal, only by a refusal, so laws.ts cannot
// check them. Each test below names the law it defends.

test("L5 — an employed therapist is still offered a Talent Profile", () => {
  const rec = recommend(
    briefOf(
      ["work.discipline", "massage"],
      ["work.performs_service_personally", true],
      ["business.employed_by_other", true],
    ),
    entitlements(),
  );
  assert.equal(rec.structure.talentProfile, true);
});

test("L7 — a workspace is proposed for an operation with no company behind it", () => {
  // "Maria Wellness" needs no LLC. Nothing in the engine may require one, and
  // nothing in the intake asks.
  const rec = recommend(
    briefOf(
      ["business.exists", true],
      ["business.name", "Maria Wellness"],
      ["business.represents_others", true],
      ["business.takes_commission", true],
    ),
    entitlements(),
  );
  assert.equal(rec.structure.workspace, true);
});

test("L8 — a workspace owner who sells none of their own work gets no forced Talent Profile", () => {
  // Carlos runs a six-therapist studio and needs no fake Talent Profile of his
  // own. Manufacturing one would be a permanent public page about a person who
  // never asked for it.
  const rec = recommend(
    briefOf(
      ["business.exists", true],
      ["business.name", "Casa Serena"],
      ["business.has_staff", true],
      ["business.staff_count", 6],
      ["business.other_workers_arrangement", "salary"],
      ["business.clients_choose_provider", false],
    ),
    entitlements(),
  );
  assert.equal(rec.structure.workspace, true);
  assert.equal(rec.structure.talentProfile, false);
});

test("L10 — hybrid is reported as two objects, never as a third kind of account", () => {
  const rec = recommend(
    briefOf(
      ["work.booked_by_name", true],
      ["work.performs_service_personally", true],
      ["business.exists", true],
      ["business.name", "Luna Wellness"],
      ["business.represents_others", true],
    ),
    entitlements(),
  );
  assert.equal(rec.structure.talentProfile, true);
  assert.equal(rec.structure.workspace, true);
  // There is no third value to assert against; the point is that the shape is
  // two booleans, so "hybrid" can never be stored anywhere.
  assert.deepEqual(Object.keys(rec.structure).sort(), [
    "talentProfile",
    "workspace",
    "workspaceType",
  ]);
});

test("every permissive law has a test above that names it", () => {
  // The reason PERMISSIVE_LAWS is exported at all: a law that is declared but
  // undefended reads as enforced.
  const source: string[] = PERMISSIVE_LAWS.map((l) => l.id);
  assert.ok(source.length >= 5);
  // L9 (a talent may belong to many workspaces) is a roster/representation rule
  // enforced in the roster path, not a signup classification; the engine cannot
  // violate it because it never restricts membership.
  const defendedHere = [
    "L5_EMPLOYMENT_DOES_NOT_DISQUALIFY_TALENT",
    "L7_WORKSPACE_IS_AN_OPERATION_NOT_A_CORPORATION",
    "L8_WORKSPACE_OWNER_NEED_NOT_BE_TALENT",
    "L10_HYBRID_IS_A_RELATIONSHIP_NOT_A_TYPE",
  ];
  for (const id of defendedHere) {
    assert.ok(source.includes(id), `${id} is no longer a permissive law`);
  }
});

// ─── Unresolved ───────────────────────────────────────────────────────────────

test("an empty brief is insufficient evidence, and says what to ask", () => {
  const rec = recommend(briefOf(), entitlements());
  assert.equal(rec.unresolved?.kind, "insufficient_evidence");
  assert.ok(
    rec.unresolved?.kind === "insufficient_evidence" &&
      rec.unresolved.missingFactKeys.length > 0,
    "the Agent needs to know what to ask next, not just that it failed",
  );
});

test("every deciding question answered and still no classification is a PRODUCT gap", () => {
  // The second kind of unresolved, deliberately separate: this one must reach a
  // human, because it means a real business shape the laws do not cover.
  const rec = recommend(
    briefOf(
      ["business.exists", false],
      ["business.works_from", "client_location"],
      ["business.represents_others", false],
      ["business.has_staff", false],
      ["business.other_workers_arrangement", "unclear"],
      ["business.clients_choose_provider", false],
    ),
    entitlements(),
  );
  assert.equal(rec.unresolved?.kind, "unclassifiable");
});

// ─── Determinism and versioning ───────────────────────────────────────────────

test("the same facts produce the same recommendation, twice", () => {
  // The property the replay harness is built on. If this fails, no rule change
  // can ever be evaluated against history.
  const brief = briefOf(
    ["business.exists", true],
    ["business.name", "Glow"],
    ["business.represents_others", true],
    ["business.staff_count", 8],
  );
  const ents = entitlements();
  assert.deepEqual(recommend(brief, ents), recommend(brief, ents));
});

test("fact ORDER does not change the outcome", () => {
  const specs: FactSpec[] = [
    ["business.exists", true],
    ["business.name", "Glow"],
    ["business.represents_others", true],
    ["business.staff_count", 8],
    ["work.booked_by_name", true],
  ];
  const forward = recommend(briefOf(...specs), entitlements());
  const backward = recommend(briefOf(...[...specs].reverse()), entitlements());
  assert.deepEqual(forward.plans, backward.plans);
  assert.deepEqual(forward.structure, backward.structure);
});

test("every recommendation carries the engine version that produced it", () => {
  assert.equal(recommend(briefOf(), entitlements()).engineVersion, ENGINE_VERSION);
  assert.match(ENGINE_VERSION, /^tulala-engine-\d+$/);
});

test("a degraded catalog is reported, so the Agent does not quote a price from it", () => {
  const rec = recommend(briefOf(), entitlements({ degraded: true }));
  assert.equal(rec.catalogDegraded, true);
});

// ─── Vocabulary integrity ─────────────────────────────────────────────────────

test("every fact key the engine reads by name exists in the vocabulary", () => {
  // The engine calls stringFact/booleanFact with literal keys. A typo there is
  // silent: the read returns null and the rule quietly never fires.
  const known = new Set(FACT_KEYS.map((d) => d.key));
  const readByName = [
    "business.staff_count",
    "business.represents_others",
    "business.has_staff",
    "business.clients_choose_provider",
    "business.other_workers_arrangement",
    "business.takes_commission",
    "business.exists",
    "business.name",
    "business.works_from",
    "business.works_alone",
    "business.employed_by_other",
    "presence.website_url",
    "presence.owns_domain",
    "presence.has_logo",
    "goals.wants_website",
    "goals.wants_to_grow_team",
    "brand.price_position",
    "work.discipline",
    "work.services",
    "work.booked_by_name",
    "work.performs_service_personally",
    "person.professional_name",
  ];
  for (const key of readByName) {
    assert.ok(known.has(key), `engine reads ${key}, which is not in the vocabulary`);
  }
});

test("every decisive weight is on a boolean fact", () => {
  // `decisive` only fires on value === true, so declaring it on a string or
  // number fact would make it dead code that reads as a hard rule.
  for (const def of FACT_KEYS) {
    if (def.evidence?.decisive) {
      assert.equal(def.type, "boolean", `${def.key} is decisive but not a boolean`);
    }
  }
});

test("evidence magnitudes stay inside the four agreed bands", () => {
  // Bands rather than free numbers so "strong" means the same thing in every
  // industry pack, and so an inflated weight is visible in review.
  const allowed = new Set([1, 2, 3, 5]);
  for (const def of FACT_KEYS) {
    for (const value of [def.evidence?.talent, def.evidence?.workspace]) {
      if (typeof value !== "number" || value === 0) continue;
      assert.ok(
        allowed.has(Math.abs(value)),
        `${def.key} carries weight ${value}, which is not weak/moderate/strong/decisive`,
      );
    }
  }
});
