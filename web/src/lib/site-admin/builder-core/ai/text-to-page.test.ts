import { test } from "node:test";
import assert from "node:assert/strict";

import {
  composePageFromBrief,
  type TextToPageSurface,
} from "./text-to-page";
import {
  applyModelPreference,
  planPresetsFromBrief,
  targetsForTextToPageSurface,
} from "./preset-plan";
import { PAGE_DESIGN_SUMMARIES } from "@/lib/site-admin/builder-node/page-designs/summaries";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { INDUSTRY_PRESETS } from "@/lib/words/presets";

// ── Planner: deterministic keyword → ordered presets ──────────────────────

test("planner ranks a portfolio brief onto the editorial preset", () => {
  const plan = planPresetsFromBrief(
    "a clean photography portfolio for my editorial work",
    "talent",
  );
  assert.equal(plan.chosenId, "editorial");
  assert.equal(plan.matched, true);
  assert.ok(plan.ordered.length > 0);
});

test("planner ranks a restaurant brief onto the restaurant preset", () => {
  const plan = planPresetsFromBrief(
    "a menu page for my restaurant and bar",
    "workspace",
  );
  assert.equal(plan.chosenId, "restaurant-orderable");
});

test("planner is deterministic for the same brief + surface", () => {
  const a = planPresetsFromBrief("software product landing page", "workspace");
  const b = planPresetsFromBrief("software product landing page", "workspace");
  assert.deepEqual(a.ordered, b.ordered);
  assert.equal(a.chosenId, "saas");
});

test("a no-match brief still returns a full, non-empty plan (default order)", () => {
  const plan = planPresetsFromBrief("zzz qqq", "workspace");
  assert.equal(plan.matched, false);
  assert.ok(plan.ordered.length > 0);
  // Chosen falls through to the business-first default within the surface.
  assert.equal(typeof plan.chosenId, "string");
});

// ── Brief → fitting design: the deterministic path alone matches common talent
//    briefs WITHOUT a model. Each pair asserts a real-world brief lands on (or
//    near) a sensible design — and crucially NEVER on the SaaS console, the
//    live-QA miss ("wedding photographer" → SaaS billing layout). ───────────

// Briefs that must resolve to exactly one design (high-signal cue overlap).
const BRIEF_EXPECTATIONS: ReadonlyArray<[string, string]> = [
  // The live-QA miss: photography / wedding briefs must NOT land on saas.
  ["wedding photographer", "editorial"],
  ["a wedding photography portfolio", "editorial"],
  ["I'm a portrait and headshot photographer", "editorial"],
  ["my fashion lookbook and editorial shoots", "editorial"],
  // Food. `restaurant-orderable`, NOT the static `restaurant`: the AI pool is
  // now derived from preset ownership, and the restaurant presets name the
  // orderable design — the one with a real `menu_board` and room for
  // `reserve_table`. The static tree ships fabricated dishes and prices, which
  // is what a real restaurant used to be handed on day one.
  ["a chef's tasting menu", "restaurant-orderable"],
  ["our new restaurant and wine bar", "restaurant-orderable"],
  // Live music / performance. `festival` is RETIRED from signup: no preset
  // names it, so it is no longer in the derived pool and these briefs fall to
  // the nearest owned design. The tree itself is kept — Events & Ticketing owns
  // it as the reference for /events/<slug>. Asserting the fallback rather than
  // deleting the rows, so a future preset that claims `festival` shows up here
  // as a change rather than silently restoring old behaviour.

  // Personal brand / creator.
  ["a fitness coach personal brand", "coach"],
  ["a social media influencer and content creator", "coach"],
  // Commerce.
  ["an online store selling fine-art prints", "store-orderable"],
  // Genuine product briefs still reach saas (enrichment didn't break the obvious).
  ["a software product landing page with pricing", "saas"],
  ["our tech startup app", "saas"],
  // Agency roster.
  ["our talent agency roster and bookings", "agency"],
  // Conference.
  ["a developer conference with speakers and a schedule", "conference"],
];

for (const [brief, expected] of BRIEF_EXPECTATIONS) {
  test(`planner: ${JSON.stringify(brief)} → ${expected}`, () => {
    // platform surface = full preset set, so every design is a candidate.
    const plan = planPresetsFromBrief(brief, "platform");
    assert.equal(
      plan.chosenId,
      expected,
      `expected "${brief}" → ${expected} but got ${plan.chosenId} ` +
        `(top: ${plan.ordered.slice(0, 3).map((e) => `${e.id}:${e.score}`).join(", ")})`,
    );
    assert.equal(plan.matched, true, `"${brief}" should be a real match`);
  });
}

test("no creative talent brief is ever miscategorised as the SaaS console", () => {
  // The whole class of live-QA bug: a creative/portfolio/performance brief must
  // not fall through to saas. saas is reserved for explicit product/app briefs.
  const creativeBriefs = [
    "wedding photographer",
    "portrait photography portfolio",
    "I shoot fashion editorials",
    "a DJ and music producer",
    "a singer-songwriter",
    "my painting and illustration portfolio",
    "a private chef",
  ];
  for (const brief of creativeBriefs) {
    const plan = planPresetsFromBrief(brief, "platform");
    assert.notEqual(
      plan.chosenId,
      "saas",
      `"${brief}" wrongly matched the SaaS console`,
    );
  }
});

test("an ambiguous / no-match brief defaults to a flattering portfolio, not saas", () => {
  // Reserve the SaaS console for product briefs; a blank-slate creative falls
  // back to editorial (the most common greenfield intent), never the billing page.
  const plan = planPresetsFromBrief("zzz qqq nonsense words", "platform");
  assert.equal(plan.matched, false);
  assert.notEqual(plan.chosenId, "saas");
  assert.equal(plan.chosenId, "editorial");
});

// ── Surface filtering: respects the talent/workspace audience split ───────

test("talent surface never offers a workspace-only preset", () => {
  const allowed = targetsForTextToPageSurface("talent");
  assert.ok(allowed);
  const plan = planPresetsFromBrief("an agency roster home", "talent");
  for (const entry of plan.ordered) {
    const summary = PAGE_DESIGN_SUMMARIES.find((s) => s.id === entry.id);
    assert.ok(summary);
    assert.ok(allowed!.includes(summary!.target));
  }
});

test("platform surface sees the full preset set", () => {
  assert.equal(targetsForTextToPageSurface("platform"), null);
  const plan = planPresetsFromBrief("anything at all", "platform");
  // The pool is every PRESET-OWNED design, not the whole registry: a design no
  // preset names cannot be ranked, which is what makes preset.designId the
  // single source of design truth rather than one of two lists.
  const presetOwned = new Set(
    INDUSTRY_PRESETS.map((p) => p.designId).filter(
      (id): id is string => Boolean(id),
    ),
  );
  assert.ok(
    plan.ordered.every((e) => presetOwned.has(e.id)),
    "an unowned design reached the AI candidate pool",
  );
  // The pool is preset-owned INTERSECTED with the summaries registry, and the
  // difference is a real gap: `services` is named by SIX presets and has no
  // PAGE_DESIGN_SUMMARIES entry, so the AI planner can never rank it. It
  // resolves fine through getPageDesign (the fallback path uses it), which is
  // why nobody has noticed. Pinned here so adding the summary turns this green
  // rather than leaving six industries unable to reach their own design by AI.
  const rankable = new Set(PAGE_DESIGN_SUMMARIES.map((d) => d.id));
  const ownedButUnrankable = [...presetOwned].filter((id) => !rankable.has(id));
  assert.deepEqual(
    ownedButUnrankable,
    ["services"],
    "the set of preset-owned-but-unrankable designs changed; if you added a summary for `services`, delete this assertion",
  );
  assert.equal(
    plan.ordered.length,
    [...presetOwned].filter((id) => rankable.has(id)).length,
  );
});

// ── Model re-rank seam: closed candidate set, hallucinations discarded ─────

test("applyModelPreference re-orders by model preference", () => {
  const plan = planPresetsFromBrief("zzz", "platform");
  const reranked = applyModelPreference(plan, ["coach", "store-orderable"]);
  assert.equal(reranked.chosenId, "coach");
  assert.equal(reranked.ordered[1].id, "store-orderable");
  // Every candidate is still present (model only re-orders, never drops).
  assert.equal(reranked.ordered.length, plan.ordered.length);
});

test("applyModelPreference discards ids not in the candidate set", () => {
  const plan = planPresetsFromBrief("zzz", "talent");
  // "impronta" is workspace-only, so not a talent candidate; a hallucinated id
  // must be ignored, never widening the set.
  const reranked = applyModelPreference(plan, ["impronta", "__made_up__"]);
  assert.ok(reranked.ordered.every((e) => e.id !== "__made_up__"));
  assert.ok(reranked.ordered.every((e) => e.id !== "impronta"));
  assert.equal(reranked.ordered.length, plan.ordered.length);
});

// ── Composer: brief → validated, registry-resolved BuilderNode tree ───────

const SURFACES: TextToPageSurface[] = [
  "workspace",
  "talent",
  "talent-site",
  "platform",
];

test("composePageFromBrief returns a validateBuilderNodeTree-passing tree on every surface", async () => {
  for (const surface of SURFACES) {
    const result = await composePageFromBrief({
      brief: "a portfolio for my creative studio",
      surface,
    });
    assert.equal(result.ok, true, `compose failed on surface ${surface}`);
    if (!result.ok) return;
    assert.ok(Array.isArray(result.tree));
    assert.ok(result.tree.length > 0, `empty tree on surface ${surface}`);
    // The composed design id resolves to a real registry preset.
    assert.ok(
      PAGE_DESIGN_SUMMARIES.some((s) => s.id === result.designId),
      `designId ${result.designId} not in registry`,
    );
    // The returned tree passes the SAME governance/schema gate the insert uses.
    const validation = validateBuilderNodeTree(result.tree);
    assert.equal(
      validation.ok,
      true,
      `composed tree failed validation on ${surface}: ${
        validation.ok ? "" : JSON.stringify(validation.issues)
      }`,
    );
    assert.equal(result.source, "keyword");
  }
});

test("composePageFromBrief rejects a too-short brief", async () => {
  const result = await composePageFromBrief({ brief: "a", surface: "workspace" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "BRIEF_TOO_SHORT");
});

test("composePageFromBrief uses the model re-rank seam when supplied", async () => {
  // A stub ranker forces a NON-default design to the front — proves the
  // optional model seam re-orders the deterministic plan without bypassing
  // validation. Uses `coach` rather than the old `store`: the candidate pool is
  // now preset-owned, and `store` retired in favour of `store-orderable`, which
  // is not a talent-surface design. The point of the test is the seam, not the
  // id, so it needs an id the talent surface actually offers.
  const result = await composePageFromBrief({
    brief: "a place to show my work",
    surface: "talent",
    useModel: true,
    rankWithModel: async (_brief, candidateIds) => {
      assert.ok(candidateIds.includes("coach"));
      return ["coach"];
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.designId, "coach");
  assert.equal(result.source, "model");
  const validation = validateBuilderNodeTree(result.tree);
  assert.equal(validation.ok, true);
});

test("composePageFromBrief degrades to keyword when the model ranker throws", async () => {
  const result = await composePageFromBrief({
    brief: "editorial photography portfolio",
    surface: "talent",
    useModel: true,
    rankWithModel: async () => {
      throw new Error("provider down");
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Falls back to the deterministic keyword pick (editorial), still validated.
  assert.equal(result.designId, "editorial");
  assert.equal(result.source, "keyword");
});

test("RETIRED IDS: a music brief no longer matches any owned design", () => {
  // Not a bug in the planner — a PRODUCT GAP the `festival` retirement created,
  // pinned here so it is visible rather than discovered by a musician.
  //
  // `festival` was the only design whose cues covered DJs, bands, tours and
  // album releases. No preset owns it, so it left the derived pool, and its
  // cues were deliberately NOT re-homed: unlike `store`→`store-orderable` and
  // `impronta`→`agency`, there is no music-shaped design to move them to.
  // Inventing a mapping here would silently hand a touring band a design nobody
  // chose for them.
  //
  // So these briefs fall to the audience default with NO keyword match, which
  // is the honest outcome. When a music preset lands, this test goes red and
  // whoever adds it re-homes the cues.
  for (const brief of [
    "DJ live set",
    "I'm a musician releasing an album",
    "a singer announcing a tour",
  ]) {
    const plan = planPresetsFromBrief(brief, "platform");
    assert.notEqual(
      plan.chosenId,
      "festival",
      `"${brief}" still reaches the retired festival design`,
    );
    // What it DOES reach is `editorial` — a photography/portfolio design. A
    // touring band gets a lookbook. That is the gap: not broken, not right
    // either, and invisible until someone signs up as a musician.
    assert.equal(
      plan.chosenId,
      "editorial",
      `"${brief}" now lands on ${plan.chosenId}; if a music preset was added, re-home festival's cues onto it and update this`,
    );
  }
});
