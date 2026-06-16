import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import {
  buildDefaultTalentProfileTree,
  hydrateTalentTree,
  stripSectionEmbeds,
  treeHasSectionEmbed,
  type TalentProfileTokens,
} from "./default-talent-tree";

const TOKENS: TalentProfileTokens = {
  displayName: "Orlando Tene",
  primaryTypeLabel: "Model",
  tagline: "Model · Cancún",
  bio: "A short public bio.",
  locationLine: "Based in Cancún",
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
  assert.match(joined, /A short public bio\./);
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

/** Walk a hydrated tree and count surviving `card` nodes by descendant heading. */
function findCards(node: unknown, out: BuilderNode[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as BuilderNode;
  if (n.kind === "card") out.push(n);
  if ("children" in n && Array.isArray(n.children)) {
    for (const c of n.children) findCards(c, out);
  }
}

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
  for (const node of hydrated) findCards(node, cards);
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
  for (const node of hydrated) findCards(node, cards);
  assert.equal(cards.length, 0, "all service cards should be pruned when none have labels");
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
