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
  assert.equal(plan.chosenId, "restaurant");
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
  // Food.
  ["a chef's tasting menu", "restaurant"],
  ["our new restaurant and wine bar", "restaurant"],
  // Live music / performance.
  ["DJ live set", "festival"],
  ["I'm a musician releasing an album", "festival"],
  ["a singer announcing a tour", "festival"],
  ["music festival lineup and tickets", "festival"],
  // Personal brand / creator.
  ["a fitness coach personal brand", "coach"],
  ["a social media influencer and content creator", "coach"],
  // Commerce.
  ["an online store selling fine-art prints", "store"],
  // Genuine product briefs still reach saas (enrichment didn't break the obvious).
  ["a software product landing page with pricing", "saas"],
  ["our tech startup app", "saas"],
  // Agency roster.
  ["our talent agency roster and bookings", "impronta"],
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
  assert.equal(plan.ordered.length, PAGE_DESIGN_SUMMARIES.length);
});

// ── Model re-rank seam: closed candidate set, hallucinations discarded ─────

test("applyModelPreference re-orders by model preference", () => {
  const plan = planPresetsFromBrief("zzz", "platform");
  const reranked = applyModelPreference(plan, ["coach", "store"]);
  assert.equal(reranked.chosenId, "coach");
  assert.equal(reranked.ordered[1].id, "store");
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
  // A stub ranker forces 'store' to the front — proves the optional model seam
  // re-orders the deterministic plan without bypassing validation.
  const result = await composePageFromBrief({
    brief: "a place to show my work",
    surface: "talent",
    useModel: true,
    rankWithModel: async (_brief, candidateIds) => {
      assert.ok(candidateIds.includes("store"));
      return ["store"];
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.designId, "store");
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
