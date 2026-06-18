import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { hydrateTalentTree, type TalentProfileTokens } from "../default-talent-tree";
import {
  MAX_SITE_TEMPLATES,
  MAX_SITE_TEMPLATE_ORDER,
  buildMaxSiteTemplateTrees,
  getMaxSiteTemplate,
  isMaxSiteTemplateKey,
  listMaxSiteTemplateSummaries,
} from "./registry";
import type { MaxSiteTemplateKey } from "./types";

const KEYS = MAX_SITE_TEMPLATE_ORDER;

// Deterministic id factory so each template build produces stable, unique ids.
function seqIds(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

const CTX = { displayName: "Orlando Tene", logoUrl: null as string | null };

const TOKENS: TalentProfileTokens = {
  displayName: "Orlando Tene",
  primaryTypeLabel: "Model",
  secondaryType1: "Photographer",
  secondaryType2: "",
  secondaryType3: "",
  disciplinesLine: "Model · Photographer",
  tagline: "Editorial Model · Cancún",
  bio: "A short public bio.",
  richBio: "A longer, richer public bio that spans a full paragraph of editorial detail.",
  locationLine: "Based in Cancún",
  languagesLine: "Languages: Spanish · English",
  headshotUrl: "https://cdn.example/headshot.jpg",
  profilePath: "/t/TAL-92026",
  inquireHref: "/t/TAL-92026?inquire=1",
  service1: "Editorial",
  service2: "Runway",
  service3: "Commercial",
  gallery: [
    "https://cdn.example/1.jpg",
    "https://cdn.example/2.jpg",
    "https://cdn.example/3.jpg",
  ],
  maxSiteUrl: "",
};

function walk(nodes: ReadonlyArray<BuilderNode>, visit: (n: BuilderNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if ("children" in node && Array.isArray(node.children)) walk(node.children, visit);
  }
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
  }
}

function allText(nodes: ReadonlyArray<BuilderNode>): string {
  const out: string[] = [];
  walk(nodes, (n) => collectStrings((n as { props?: unknown }).props, out));
  return out.join("\n");
}

// ── Registry shape ────────────────────────────────────────────────────────────

test("registry exposes the 5 starter templates in order, default first", () => {
  assert.deepEqual(KEYS, ["default", "editorial", "minimal", "portfolio", "bold"]);
  for (const key of KEYS) {
    const def = MAX_SITE_TEMPLATES[key];
    assert.equal(def.key, key);
    assert.ok(def.label.length > 0, `${key} needs a label`);
    assert.ok(def.description.length > 0, `${key} needs a description`);
    assert.ok(def.emphasis.length > 0, `${key} needs an emphasis`);
  }
});

// ── T1.3 — thumbnailUrl hydration ─────────────────────────────────────────────

test("all 5 max-site templates have a non-empty thumbnailUrl", () => {
  for (const key of KEYS) {
    const def = MAX_SITE_TEMPLATES[key];
    assert.ok(
      def.thumbnailUrl && def.thumbnailUrl.length > 0,
      `${key} must have a non-empty thumbnailUrl`,
    );
  }
});

test("all 5 max-site template thumbnailUrls point at existing files under /public", () => {
  // process.cwd() is the web/ directory when running `tsx --test` from web/.
  // Fallback: if cwd is the worktree root (has a `web/` child), append `web/`.
  const cwd = process.cwd();
  const webRoot = existsSync(join(cwd, "public")) ? cwd : join(cwd, "web");
  const publicRoot = join(webRoot, "public");
  for (const key of KEYS) {
    const def = MAX_SITE_TEMPLATES[key];
    assert.ok(def.thumbnailUrl, `${key} thumbnailUrl must be set before checking existence`);
    const fullPath = join(publicRoot, def.thumbnailUrl as string);
    assert.ok(
      existsSync(fullPath),
      `${key} thumbnailUrl "${def.thumbnailUrl}" not found at ${fullPath}`,
    );
  }
});

test("listMaxSiteTemplateSummaries exposes thumbnailUrl on every summary", () => {
  const summaries = listMaxSiteTemplateSummaries();
  for (const s of summaries) {
    assert.ok(
      s.thumbnailUrl && s.thumbnailUrl.length > 0,
      `summary for ${s.key} must expose a non-empty thumbnailUrl`,
    );
    // Must match the def directly.
    assert.equal(s.thumbnailUrl, MAX_SITE_TEMPLATES[s.key].thumbnailUrl);
  }
});

test("summaries list matches the order and carries no builder fns", () => {
  const summaries = listMaxSiteTemplateSummaries();
  assert.deepEqual(
    summaries.map((s) => s.key),
    KEYS,
  );
  for (const s of summaries) {
    assert.equal("buildShellTree" in s, false);
    assert.equal("buildHomeTree" in s, false);
  }
});

test("isMaxSiteTemplateKey accepts known keys and rejects others", () => {
  for (const key of KEYS) assert.equal(isMaxSiteTemplateKey(key), true);
  assert.equal(isMaxSiteTemplateKey("nope"), false);
  assert.equal(isMaxSiteTemplateKey(""), false);
  assert.equal(isMaxSiteTemplateKey(null), false);
  assert.equal(isMaxSiteTemplateKey(123), false);
});

test("getMaxSiteTemplate returns the def by key", () => {
  assert.equal(getMaxSiteTemplate("editorial")?.label, "Editorial");
});

// ── Each template builds VALID trees ──────────────────────────────────────────

for (const key of KEYS) {
  test(`${key} — shell + home trees validate cleanly (un-hydrated)`, () => {
    const { shellTree, homeTree } = buildMaxSiteTemplateTrees(key, CTX, seqIds(`${key}-u`));

    const shell = validateBuilderNodeTree(shellTree);
    assert.equal(shell.ok, true, shell.ok ? "" : JSON.stringify(shell.issues, null, 2));

    const home = validateBuilderNodeTree(homeTree);
    assert.equal(home.ok, true, home.ok ? "" : JSON.stringify(home.issues, null, 2));

    assert.ok(shellTree.length >= 2, `${key} shell needs a header + footer`);
    assert.ok(homeTree.length >= 1, `${key} home needs at least a hero`);
  });

  test(`${key} — home tree validates after hydration with talent data`, () => {
    const { homeTree } = buildMaxSiteTemplateTrees(key, CTX, seqIds(`${key}-h`));
    const hydrated = hydrateTalentTree(homeTree, TOKENS);
    const result = validateBuilderNodeTree(hydrated);
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues, null, 2));
  });

  test(`${key} — hydrated home is data-driven (talent name) with no raw {{tokens}}`, () => {
    const { homeTree } = buildMaxSiteTemplateTrees(key, CTX, seqIds(`${key}-d`));
    const hydrated = hydrateTalentTree(homeTree, TOKENS);
    const text = allText(hydrated);
    assert.match(text, /Orlando Tene/, `${key} must render the talent's name`);
    assert.match(text, /\/t\/TAL-92026\?inquire=1/, `${key} must wire the inquiry CTA`);
    assert.doesNotMatch(text, /\{\{/, `${key} must leave no raw {{token}} after hydration`);
  });

  test(`${key} — every node id is unique`, () => {
    const { shellTree, homeTree } = buildMaxSiteTemplateTrees(key, CTX, seqIds(`${key}-id`));
    const ids = new Set<string>();
    walk([...shellTree, ...homeTree], (n) => {
      assert.ok(n.id && n.id.length > 0, "node id must be non-empty");
      assert.ok(!ids.has(n.id), `duplicate id ${n.id}`);
      ids.add(n.id);
    });
  });
}

// ── default template === provisioning builders ────────────────────────────────

test("default template reproduces the platform-default tree (shared source)", async () => {
  const { buildDefaultTalentProfileTree } = await import("../default-talent-tree");
  const { homeTree } = buildMaxSiteTemplateTrees("default", CTX);
  // The default home tree IS the platform default profile tree (same ids).
  const reference = buildDefaultTalentProfileTree();
  assert.deepEqual(
    homeTree.map((n) => n.id),
    reference.map((n) => n.id),
  );
});

// ── Variation guarantees ──────────────────────────────────────────────────────

test("minimal hero has NO headshot image; bold paints a cover background", () => {
  const { homeTree: minimal } = buildMaxSiteTemplateTrees("minimal", CTX, seqIds("min"));
  let minimalHasImage = false;
  walk(minimal, (n) => {
    if (n.kind === "image") minimalHasImage = true;
  });
  // Minimal home uses a centered type hero + grid gallery (gallery tiles ARE
  // images), so assert specifically there's no HERO headshot in the first node.
  const minimalHero = minimal[0]!;
  let heroHasImage = false;
  walk([minimalHero], (n) => {
    if (n.kind === "image") heroHasImage = true;
  });
  assert.equal(heroHasImage, false, "minimal hero must not carry a headshot image");
  assert.equal(minimalHasImage, true, "minimal still has gallery images");

  const { homeTree: bold } = buildMaxSiteTemplateTrees("bold", CTX, seqIds("bold"));
  const boldHero = bold[0]!;
  const bg = (boldHero.props as { style?: { backgroundImage?: string } }).style?.backgroundImage;
  assert.ok(bg && bg.includes("{{headshotUrl}}"), "bold hero must paint the headshot as a cover background");
});

test("editorial uses a 40-60 split hero; portfolio puts the gallery before about", () => {
  const { homeTree: editorial } = buildMaxSiteTemplateTrees("editorial", CTX, seqIds("ed"));
  const edHero = editorial[0]!;
  assert.equal(edHero.kind, "split");
  assert.equal((edHero.props as { ratio?: string }).ratio, "40-60");

  const { homeTree: portfolio } = buildMaxSiteTemplateTrees("portfolio", CTX, seqIds("pf"));
  // hero, then gallery (the work leads), then about.
  const labels = portfolio.map((n) => (n.props as { layerLabel?: string }).layerLabel);
  const galleryIdx = labels.indexOf("Gallery");
  const aboutIdx = labels.indexOf("About");
  assert.ok(galleryIdx >= 0 && aboutIdx >= 0, "portfolio needs a gallery + about");
  assert.ok(galleryIdx < aboutIdx, "portfolio gallery must come before about");
});

test("unknown key falls back to minimal valid trees (never throws)", () => {
  const { shellTree, homeTree } = buildMaxSiteTemplateTrees(
    "does-not-exist" as MaxSiteTemplateKey,
    CTX,
    seqIds("fallback"),
  );
  assert.ok(validateBuilderNodeTree(shellTree).ok);
  assert.ok(validateBuilderNodeTree(homeTree).ok);
});
