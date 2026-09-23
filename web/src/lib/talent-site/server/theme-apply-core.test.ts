import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { TalentProfileTokens } from "../default-talent-tree";
import { buildMaxSiteTemplateTrees } from "../max-site-templates/registry";
import { resolveEffectiveSiteTokens } from "../site-theme-tokens";
import { talentPlanAllowsThemeTier, themeTiersAllowedForPlan } from "../theme-catalog/tier";
import {
  buildDesignTrees,
  coerceTokenMap,
  fallbackHydrationTokens,
  isLookOwnedTokenKey,
  mergeLookIntoTokens,
  resolveYearToken,
} from "./theme-apply-core";

const TOKENS: TalentProfileTokens = {
  ...fallbackHydrationTokens("Orlando Tene"),
  primaryTypeLabel: "Model",
  tagline: "Editorial Model",
  headshotUrl: "https://cdn.example/headshot.jpg",
  inquireHref: "/t/TAL-1?inquire=1",
  service1: "Editorial",
  gallery: ["https://cdn.example/1.jpg"],
};

function seqIds(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

function allStrings(nodes: ReadonlyArray<BuilderNode>): string {
  return JSON.stringify(nodes);
}

// ── mergeLookIntoTokens: the Look-layer rule ─────────────────────────────────
//
// RULE: a Look owns the WHOLE colour + typography layer plus background.mode.
// Applying one drops every look-owned key from the draft (so nothing leaks from
// the previous Look, including fonts a colour-only Look does not mention) and
// never touches radius / spacing / shadow / motion keys.

test("mergeLookIntoTokens replaces only look-owned keys and keeps radius/spacing", () => {
  const draft = {
    "color.primary": "#111111",
    "color.accent": "#ff0000",
    "typography.heading-preset": "editorial-serif",
    "background.mode": "aurora",
    "radius.scale-preset": "pill",
    "spacing.scale": "airy",
    "shadow.preset": "soft",
  };
  const look = { "color.primary": "#222222", "color.background": "#ffffff", "background.mode": "plain" };
  const merged = mergeLookIntoTokens(draft, look);
  assert.deepEqual(merged, {
    "radius.scale-preset": "pill",
    "spacing.scale": "airy",
    "shadow.preset": "soft",
    "color.primary": "#222222",
    "color.background": "#ffffff",
    "background.mode": "plain",
  });
  // The previous Look's accent + heading preset do not leak through.
  assert.equal("color.accent" in merged, false);
  assert.equal("typography.heading-preset" in merged, false);
});

test("a colour-only Look clears the previous Look's font keys (a Look is a colour + font pair)", () => {
  const draft = {
    "typography.heading-font-family": '"Playfair Display", serif',
    "color.ink": "#000000",
  };
  const merged = mergeLookIntoTokens(draft, { "color.ink": "#111111" });
  assert.deepEqual(merged, { "color.ink": "#111111" });
});

test("mergeLookIntoTokens ignores non-look keys smuggled in the Look and never mutates inputs", () => {
  const draft = Object.freeze({ "radius.scale-preset": "soft" });
  const look = Object.freeze({ "radius.scale-preset": "pill", "color.ink": "#111111" });
  const merged = mergeLookIntoTokens(draft, look);
  assert.equal(merged["radius.scale-preset"], "soft");
  assert.equal(merged["color.ink"], "#111111");
});

test("isLookOwnedTokenKey covers color.*, typography.* and background.mode only", () => {
  for (const key of ["color.primary", "typography.body-font-family", "background.mode"]) {
    assert.equal(isLookOwnedTokenKey(key), true, key);
  }
  for (const key of ["radius.scale-preset", "spacing.scale", "shadow.preset", "motion.preset", "background"]) {
    assert.equal(isLookOwnedTokenKey(key), false, key);
  }
});

// ── Design application (pure half) ───────────────────────────────────────────

test("buildDesignTrees hydrates talent content + year and returns valid trees", () => {
  const design = buildMaxSiteTemplateTrees(
    "minimal",
    { displayName: "{{displayName}}" },
    seqIds("min"),
  );
  const built = buildDesignTrees(design, TOKENS, 2031);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const text = allStrings([...built.shellTree, ...built.homeTree]);
  assert.match(text, /Orlando Tene/);
  assert.doesNotMatch(text, /\{\{/);
  // Provenance survives hydration + validation.
  const slots = built.homeTree.map((n) => (n.props as { slotKey?: string }).slotKey);
  assert.deepEqual(slots, ["hero", "about", "services", "gallery", "contact"]);
});

test("resolveYearToken substitutes {{year}} deep in props", () => {
  const tree = [
    { id: "p", kind: "paragraph", props: { text: "© {{year}} {{displayName}}" } },
  ] as BuilderNode[];
  const out = resolveYearToken(tree, 2030);
  assert.equal((out[0]!.props as { text: string }).text, "© 2030 {{displayName}}");
  assert.equal((tree[0]!.props as { text: string }).text, "© {{year}} {{displayName}}");
});

test("applying a design twice is deterministic apart from node ids (version pin inputs)", () => {
  const a = buildDesignTrees(
    buildMaxSiteTemplateTrees("bold", { displayName: "{{displayName}}" }, seqIds("x")),
    TOKENS,
    2030,
  );
  const b = buildDesignTrees(
    buildMaxSiteTemplateTrees("bold", { displayName: "{{displayName}}" }, seqIds("x")),
    TOKENS,
    2030,
  );
  assert.deepEqual(a, b);
});

test("coerceTokenMap keeps string entries only", () => {
  assert.deepEqual(coerceTokenMap({ a: "1", b: 2, c: null }), { a: "1" });
  assert.deepEqual(coerceTokenMap(null), {});
  assert.deepEqual(coerceTokenMap(["x"]), {});
});

// ── Render cascade (flags-off parity) ────────────────────────────────────────

test("resolveEffectiveSiteTokens: empty site tokens reproduce today's expression exactly", () => {
  const platform = { "color.primary": "#111111", "color.background": "#ffffff" };
  const page = { "color.primary": "#333333" };
  // Today: page non-empty ? page : platformDefault (same object identity).
  assert.equal(resolveEffectiveSiteTokens(page, {}, platform), page);
  assert.equal(resolveEffectiveSiteTokens({}, {}, platform), platform);
});

test("resolveEffectiveSiteTokens layers site tokens over the platform default; page still wins", () => {
  const platform = { "color.primary": "#111111", "radius.scale-preset": "soft" };
  const site = { "color.primary": "#8a6d3b" };
  assert.deepEqual(resolveEffectiveSiteTokens({}, site, platform), {
    "color.primary": "#8a6d3b",
    "radius.scale-preset": "soft",
  });
  const page = { "color.primary": "#000000" };
  assert.equal(resolveEffectiveSiteTokens(page, site, platform), page);
});

// ── Catalog tier gate ────────────────────────────────────────────────────────

test("talentPlanAllowsThemeTier orders basic < pro < portfolio and fails closed", () => {
  assert.equal(talentPlanAllowsThemeTier("talent_portfolio", "talent_portfolio"), true);
  assert.equal(talentPlanAllowsThemeTier("talent_portfolio", "talent_basic"), true);
  assert.equal(talentPlanAllowsThemeTier("talent_pro", "talent_portfolio"), false);
  assert.equal(talentPlanAllowsThemeTier("talent_basic", "talent_pro"), false);
  assert.equal(talentPlanAllowsThemeTier(null, "talent_basic"), true);
  assert.equal(talentPlanAllowsThemeTier("garbage", "talent_pro"), false);
  assert.deepEqual(themeTiersAllowedForPlan("talent_pro"), ["talent_basic", "talent_pro"]);
});
