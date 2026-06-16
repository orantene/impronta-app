import assert from "node:assert/strict";
import test from "node:test";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import {
  buildDefaultTalentProfileTree,
  hydrateTalentTree,
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

function collectText(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (n.props) {
    for (const key of ["text", "label", "href", "src", "alt"]) {
      const v = n.props[key];
      if (typeof v === "string") out.push(v);
    }
  }
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
