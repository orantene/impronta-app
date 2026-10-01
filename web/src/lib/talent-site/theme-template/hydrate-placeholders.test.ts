import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { flattenProfileTokens, hydrateTalentTree, type TalentProfileTokens } from "../default-talent-tree";
import { EMPTY_GHOST, hydratePlaceholders } from "./hydrate-placeholders";

const node = (id: string, kind: string, props: Record<string, unknown>, children?: BuilderNode[]): BuilderNode =>
  ({ id, kind, props, ...(children ? { children } : {}) }) as unknown as BuilderNode;

const TREE: BuilderNode[] = [
  node("a", "container", {}, [
    node("b", "heading", { text: "Hi {{displayName}}" }),
    node("c", "paragraph", { text: "{{service2}}" }),
    node("d", "image", { src: "{{gallery3}}", alt: "{{displayName}}" }),
    node("e", "card", {}, [node("f", "heading", { text: "{{service3}}" })]),
  ]),
];

function ids(tree: BuilderNode[]): string[] {
  const out: string[] = [];
  const walk = (n: BuilderNode) => {
    out.push(n.id);
    if ("children" in n && Array.isArray(n.children)) n.children.forEach(walk);
  };
  tree.forEach(walk);
  return out;
}

test("hydratePlaceholders keeps every node and id, never prunes empty cards", () => {
  const out = hydratePlaceholders(TREE, { displayName: "Alba" }, "en");
  assert.deepEqual(ids(out), ids(TREE));
});

test("hydratePlaceholders fills text and does not mutate the source", () => {
  const out = hydratePlaceholders(TREE, { displayName: "Alba" }, "en");
  const heading = (out[0] as unknown as { children: BuilderNode[] }).children[0];
  assert.equal((heading.props as { text: string }).text, "Hi Alba");
  const src = (TREE[0] as unknown as { children: BuilderNode[] }).children[0];
  assert.equal((src.props as { text: string }).text, "Hi {{displayName}}");
});

test("empty values show a localized ghost, but URL props stay empty", () => {
  const en = hydratePlaceholders(TREE, { displayName: "Alba" }, "en");
  const es = hydratePlaceholders(TREE, { displayName: "Alba" }, "es-MX");
  const kids = (t: BuilderNode[]) => (t[0] as unknown as { children: BuilderNode[] }).children;
  assert.equal((kids(en)[1].props as { text: string }).text, EMPTY_GHOST.en);
  assert.equal((kids(es)[1].props as { text: string }).text, EMPTY_GHOST.es);
  assert.equal((kids(en)[2].props as { src: string }).src, "");
});

const TOKENS: TalentProfileTokens = {
  displayName: "Orlando Tene",
  primaryTypeLabel: "Model",
  secondaryType1: "Photographer",
  secondaryType2: "",
  secondaryType3: "",
  disciplinesLine: "Model · Photographer",
  tagline: "Model · Cancún",
  bio: "Bio.",
  richBio: "Rich bio.",
  locationLine: "Based in Cancún",
  languagesLine: "",
  headshotUrl: "https://cdn.example/h.jpg",
  profilePath: "/t/TAL-1",
  inquireHref: "/t/TAL-1?inquire=1",
  service1: "Editorial",
  service2: "",
  service3: "",
  gallery: ["https://cdn.example/g0.jpg", "https://cdn.example/g1.jpg"],
  maxSiteUrl: "",
};

test("flattenProfileTokens: stable key set and defaults (parity with hydrateTalentTree)", () => {
  const flat = flattenProfileTokens(TOKENS);
  assert.equal(flat.displayName, "Orlando Tene");
  assert.equal(flat.heroEyebrow, "Model");
  assert.equal(flat.headline, "{i}Orlando Tene{/i}");
  assert.equal(flat.gallery0, "https://cdn.example/g0.jpg");
  assert.equal(flat.gallery5, "");
  assert.deepEqual(Object.keys(flat).sort(), [
    "bio", "callHref", "contactCopy", "disciplinesLine", "displayName", "emailHref", "gallery0", "gallery1",
    "gallery2", "gallery3", "gallery4", "gallery5", "headline", "headshotUrl", "heroEyebrow", "inquireHref",
    "languagesLine", "locationLine", "maxSiteUrl", "menuSubtitle", "primaryTypeLabel", "profilePath",
    "proofLine", "richBio", "secondaryType1", "secondaryType2", "secondaryType3", "service1", "service2",
    "service3", "tagline", "whatsappHref",
  ]);
  const hydrated = hydrateTalentTree([node("x", "heading", { text: "{{displayName}} {{service1}}" })], TOKENS);
  assert.equal((hydrated[0].props as { text: string }).text, "Orlando Tene Editorial");
});
