import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import {
  buildDefaultTalentProfileTree,
  hydrateTalentTree,
  selectServiceFocusLabels,
  stripSectionEmbeds,
  treeHasSectionEmbed,
  type TalentProfileTokens,
} from "./default-talent-tree";

const TOKENS: TalentProfileTokens = {
  displayName: "Orlando Tene",
  primaryTypeLabel: "Model",
  secondaryType1: "Photographer",
  secondaryType2: "Stylist",
  secondaryType3: "",
  disciplinesLine: "Model · Photographer · Stylist",
  tagline: "Model · Cancún",
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
};

/** Collect EVERY string value reachable in a value (deep — objects + arrays). */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out);
    }
  }
}

/** Collect all prop strings (deep) across a node tree. */
function collectText(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (n.props) collectStrings(n.props, out);
  if (Array.isArray(n.children)) {
    for (const c of n.children) collectText(c, out);
  }
}

test("default tree validates cleanly through the builder-node validator", () => {
  const result = validateBuilderNodeTree(buildDefaultTalentProfileTree());
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.issues),
  );
  assert.ok(result.tree.length >= 4, "expected hero/about/services/gallery/contact");
});

test("hydrate substitutes {{tokens}} and leaves no raw placeholders", () => {
  const hydrated = hydrateTalentTree(buildDefaultTalentProfileTree(), TOKENS);
  const texts: string[] = [];
  for (const node of hydrated) collectText(node, texts);
  const joined = texts.join("\n");
  assert.match(joined, /Orlando Tene/);
  // About renders the FULL bio (`{{richBio}}`), not the short `{{bio}}` token.
  assert.match(joined, /a full paragraph of editorial detail\./);
  assert.match(joined, /\/t\/TAL-92026\?inquire=1/);
  assert.match(joined, /Editorial/);
  assert.match(joined, /headshot\.jpg/);
  // No raw {{...}} placeholder should survive hydration.
  assert.doesNotMatch(joined, /\{\{/);
});

test("hydrate is non-mutating — the source constant keeps its placeholders", () => {
  const source = buildDefaultTalentProfileTree();
  hydrateTalentTree(source, TOKENS);
  const texts: string[] = [];
  for (const node of source) collectText(node, texts);
  assert.match(texts.join("\n"), /\{\{displayName\}\}/);
});

test("missing gallery slots resolve to empty strings (no broken {{galleryN}})", () => {
  const sparse: TalentProfileTokens = { ...TOKENS, gallery: [] };
  const hydrated = hydrateTalentTree(buildDefaultTalentProfileTree(), sparse);
  const texts: string[] = [];
  for (const node of hydrated) collectText(node, texts);
  assert.doesNotMatch(texts.join("\n"), /\{\{gallery/);
});

/**
 * Walk a hydrated tree and collect surviving `card` nodes. Optional `idPrefix`
 * scopes the collection — discipline chips and service cards are BOTH `card`
 * nodes, so a count assertion must scope to one family by id prefix.
 */
function findCards(node: unknown, out: BuilderNode[], idPrefix?: string): void {
  if (!node || typeof node !== "object") return;
  const n = node as BuilderNode;
  if (n.kind === "card" && (!idPrefix || n.id.startsWith(idPrefix))) out.push(n);
  if ("children" in n && Array.isArray(n.children)) {
    for (const c of n.children) findCards(c, out, idPrefix);
  }
}

const SERVICE_CARD_PREFIX = "default-talent-service-";
const DISCIPLINE_CHIP_PREFIX = "default-talent-discipline-";

test("FIX 1 — empty service cards are pruned (no visible empty bordered boxes)", () => {
  // Only one service label → service2/service3 hydrate to "" → those cards must
  // not survive (they would otherwise render as empty outline boxes).
  const oneService: TalentProfileTokens = {
    ...TOKENS,
    service1: "Editorial",
    service2: "",
    service3: "",
  };
  const hydrated = hydrateTalentTree(buildDefaultTalentProfileTree(), oneService);
  const cards: BuilderNode[] = [];
  for (const node of hydrated) findCards(node, cards, SERVICE_CARD_PREFIX);
  // Exactly one service card remains (the non-empty one); none are empty.
  assert.equal(cards.length, 1, `expected 1 surviving service card, got ${cards.length}`);
  const cardTexts: string[] = [];
  for (const c of cards) collectText(c, cardTexts);
  assert.match(cardTexts.join("\n"), /Editorial/);
  assert.ok(
    cardTexts.every((t) => t.trim() !== ""),
    "no surviving card should have empty heading text",
  );
});

test("FIX 1 — all-empty services prune to zero cards", () => {
  const noServices: TalentProfileTokens = {
    ...TOKENS,
    service1: "",
    service2: "",
    service3: "",
  };
  const hydrated = hydrateTalentTree(buildDefaultTalentProfileTree(), noServices);
  const cards: BuilderNode[] = [];
  for (const node of hydrated) findCards(node, cards, SERVICE_CARD_PREFIX);
  assert.equal(cards.length, 0, "all service cards should be pruned when none have labels");
});

/** Collect every `image` node (deep) in a tree. */
function findImages(node: unknown, out: BuilderNode[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as BuilderNode;
  if (n.kind === "image") out.push(n);
  if ("children" in n && Array.isArray(n.children)) {
    for (const c of n.children) findImages(c, out);
  }
}

test("ENRICH — discipline chips render the primary + secondary talent types", () => {
  const hydrated = hydrateTalentTree(buildDefaultTalentProfileTree(), TOKENS);
  const chips: BuilderNode[] = [];
  for (const node of hydrated) findCards(node, chips, DISCIPLINE_CHIP_PREFIX);
  // Primary (Model) + secondary1 (Photographer) + secondary2 (Stylist); the
  // empty secondary3 chip is pruned.
  assert.equal(chips.length, 3, `expected 3 surviving discipline chips, got ${chips.length}`);
  const texts: string[] = [];
  for (const c of chips) collectText(c, texts);
  const joined = texts.join("\n");
  assert.match(joined, /Model/);
  assert.match(joined, /Photographer/);
  assert.match(joined, /Stylist/);
  assert.ok(
    texts.every((t) => t.trim() !== ""),
    "no surviving chip should have empty label text",
  );
});

test("ENRICH — discipline chips prune to just the primary when no secondary types", () => {
  const onlyPrimary: TalentProfileTokens = {
    ...TOKENS,
    secondaryType1: "",
    secondaryType2: "",
    secondaryType3: "",
    disciplinesLine: "Model",
  };
  const hydrated = hydrateTalentTree(buildDefaultTalentProfileTree(), onlyPrimary);
  const chips: BuilderNode[] = [];
  for (const node of hydrated) findCards(node, chips, DISCIPLINE_CHIP_PREFIX);
  assert.equal(chips.length, 1, `expected only the primary chip, got ${chips.length}`);
  const texts: string[] = [];
  for (const c of chips) collectText(c, texts);
  assert.match(texts.join("\n"), /Model/);
});

test("ENRICH — every discipline chip prunes when the talent has no discipline", () => {
  const noDiscipline: TalentProfileTokens = {
    ...TOKENS,
    primaryTypeLabel: "",
    secondaryType1: "",
    secondaryType2: "",
    secondaryType3: "",
    disciplinesLine: "",
  };
  const hydrated = hydrateTalentTree(buildDefaultTalentProfileTree(), noDiscipline);
  const chips: BuilderNode[] = [];
  for (const node of hydrated) findCards(node, chips, DISCIPLINE_CHIP_PREFIX);
  assert.equal(chips.length, 0, "all discipline chips should be pruned when no type exists");
});

test("ENRICH — About renders the full richBio paragraph", () => {
  const hydrated = hydrateTalentTree(buildDefaultTalentProfileTree(), TOKENS);
  const texts: string[] = [];
  for (const node of hydrated) collectText(node, texts);
  const joined = texts.join("\n");
  // The full bio is present; the short `{{bio}}` token text is NOT rendered.
  assert.match(joined, /a full paragraph of editorial detail\./);
  assert.doesNotMatch(joined, /A short public bio\./);
});

test("ENRICH — languages line renders when present and is empty otherwise", () => {
  const withLangs = hydrateTalentTree(buildDefaultTalentProfileTree(), TOKENS);
  const withTexts: string[] = [];
  for (const node of withLangs) collectText(node, withTexts);
  assert.match(withTexts.join("\n"), /Languages: Spanish · English/);

  const noLangs = hydrateTalentTree(buildDefaultTalentProfileTree(), {
    ...TOKENS,
    languagesLine: "",
  });
  const noTexts: string[] = [];
  for (const node of noLangs) collectText(node, noTexts);
  assert.doesNotMatch(noTexts.join("\n"), /Languages:/);
});

test("ENRICH — only the hero image is priority; gallery images stay lazy", () => {
  const tree = buildDefaultTalentProfileTree();
  const images: BuilderNode[] = [];
  for (const node of tree) findImages(node, images);
  const heroImage = images.find((n) => n.id === "default-talent-hero-image");
  assert.ok(heroImage, "hero image node should exist");
  assert.equal(
    (heroImage!.props as { priority?: boolean }).priority,
    true,
    "the hero image must be priority (eager)",
  );
  // Every non-hero image (the gallery tiles) must NOT be priority.
  const galleryImages = images.filter((n) => n.id !== "default-talent-hero-image");
  assert.ok(galleryImages.length > 0, "expected gallery image nodes");
  assert.ok(
    galleryImages.every((n) => !(n.props as { priority?: boolean }).priority),
    "gallery images must stay lazy (no priority)",
  );
});

test("ENRICH — the enriched default tree still validates cleanly", () => {
  const result = validateBuilderNodeTree(buildDefaultTalentProfileTree());
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues));
});

test("FIX 4 — hydration substitutes tokens in nested/array props (not just allowlist)", () => {
  // A Lab-authored node can place {{token}} in arbitrary props — nested objects
  // and arrays included. They must all hydrate; no raw {{...}} may survive.
  const tree: BuilderNode[] = [
    {
      id: "x",
      kind: "container",
      props: {
        layout: "stack",
        // Non-allowlisted scalar prop:
        title: "{{displayName}}",
        // Nested object prop:
        meta: { caption: "{{tagline}}", deep: { note: "{{primaryTypeLabel}}" } },
        // Array prop:
        links: [{ label: "{{displayName}}", href: "{{inquireHref}}" }],
      },
      children: [],
    } as unknown as BuilderNode,
  ];
  const hydrated = hydrateTalentTree(tree, TOKENS);
  const texts: string[] = [];
  for (const node of hydrated) collectText(node, texts);
  const joined = texts.join("\n");
  assert.match(joined, /Orlando Tene/);
  assert.match(joined, /Model · Cancún/);
  assert.match(joined, /Model/);
  assert.match(joined, /\/t\/TAL-92026\?inquire=1/);
  assert.doesNotMatch(joined, /\{\{/);
});

test("FIX B — service focus labels come from the services menu (top 3, deduped)", () => {
  const labels = selectServiceFocusLabels(
    ["Editorial Shoot", "Runway", "Editorial Shoot", "Commercial", "Brand Day"],
    "Editorial Model",
  );
  // Top 3, de-duped, in menu order — discipline NOT appended when a menu exists.
  assert.deepEqual(labels, ["Editorial Shoot", "Runway", "Commercial"]);
});

test("FIX B — falls back to the discipline when there is no services menu", () => {
  assert.deepEqual(selectServiceFocusLabels([], "Editorial Model"), [
    "Editorial Model",
  ]);
  // Blank / whitespace service names are dropped, then the discipline is used.
  assert.deepEqual(selectServiceFocusLabels(["", "   "], "Photographer"), [
    "Photographer",
  ]);
});

test("FIX B — empty when neither a services menu nor a discipline exists", () => {
  assert.deepEqual(selectServiceFocusLabels([], null), []);
  assert.deepEqual(selectServiceFocusLabels([], ""), []);
});

test("FIX B — service focus NEVER sources geographic service-area labels", () => {
  // Regression guard for the LIVE-QA bug: a location ("Playa del Carmen") must
  // never appear as a "service". The helper has no access to serviceAreaLabels
  // by construction — it takes only services-menu names + the discipline. With
  // no menu and no discipline, the section is empty (and the empty-card prune
  // then drops it) rather than showing a city.
  const cityAsServiceArea = "Playa del Carmen";
  const labels = selectServiceFocusLabels([], null);
  assert.equal(labels.includes(cityAsServiceArea), false);
  assert.deepEqual(labels, []);
});

test("FIX 3 — stripSectionEmbeds drops section_embed nodes (and detects them)", () => {
  const tree: BuilderNode[] = [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "embed",
          kind: "section_embed",
          props: { sectionTypeKey: "featured_talent" },
        } as unknown as BuilderNode,
        {
          id: "keep",
          kind: "heading",
          props: { text: "Keep me", level: 2 },
        } as unknown as BuilderNode,
      ],
    } as unknown as BuilderNode,
  ];
  assert.equal(treeHasSectionEmbed(tree), true);
  const stripped = stripSectionEmbeds(tree);
  assert.equal(treeHasSectionEmbed(stripped), false);
  // The non-embed sibling survives.
  const texts: string[] = [];
  for (const node of stripped) collectText(node, texts);
  assert.match(texts.join("\n"), /Keep me/);
});
