import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  assertFreeTalentSiteTreeMutation,
  collectTalentSiteSectionChildIds,
  freeSiteSectionsLockedMessage,
} from "./free-site-tree-guard";

/**
 * PHASE 1 — the free personal website's structural guard, as an allow/deny
 * table. Every row is an edit a talent can actually perform in the builder.
 */

function node(id: string, kind: string, children: BuilderNode[] = []): BuilderNode {
  return { id, kind, props: {}, children } as unknown as BuilderNode;
}

function section(id: string, children: BuilderNode[]): BuilderNode {
  return {
    id,
    kind: "section",
    props: { sectionTypeKey: "talent_hero", sectionId: id },
    children,
  } as unknown as BuilderNode;
}

/** hero[ heading, text ] + contact[ button ] — a plausible free home tree. */
function baseTree(): BuilderNodeTree {
  return [
    section("s-hero", [node("n-heading", "heading"), node("n-text", "rich_text")]),
    section("s-contact", [node("n-cta", "button")]),
  ] as BuilderNodeTree;
}

const FREE = { canInsertSections: false } as const;

function run(next: BuilderNodeTree, previous: BuilderNodeTree = baseTree()) {
  return assertFreeTalentSiteTreeMutation({
    previousTree: previous,
    nextTree: next,
    ...FREE,
  });
}

// ── collector ────────────────────────────────────────────────────────────────

test("collector takes nested non-section ids, and neither sections nor roots", () => {
  const ids = collectTalentSiteSectionChildIds([
    node("root-loose", "rich_text"),
    section("s-hero", [node("n-heading", "heading", [node("n-deep", "text")])]),
  ] as BuilderNodeTree);
  assert.deepEqual([...ids].sort(), ["n-deep", "n-heading"]);
});

test("collector degrades on junk input instead of throwing", () => {
  assert.equal(collectTalentSiteSectionChildIds(null).size, 0);
  assert.equal(collectTalentSiteSectionChildIds("not a tree").size, 0);
  assert.equal(collectTalentSiteSectionChildIds({ kind: "section" }).size, 0);
});

// ── ALLOW ────────────────────────────────────────────────────────────────────

test("ALLOW: a prop patch (edit the headline text)", () => {
  const next = baseTree();
  const hero = next[0] as unknown as { children: BuilderNode[] };
  hero.children[0] = {
    ...(hero.children[0] as unknown as Record<string, unknown>),
    props: { text: "Sofia Mendez" },
  } as unknown as BuilderNode;
  assert.equal(run(next).ok, true);
});

test("ALLOW: a hidden toggle", () => {
  const next = baseTree();
  const hero = next[0] as unknown as { children: BuilderNode[] };
  hero.children[1] = {
    ...(hero.children[1] as unknown as Record<string, unknown>),
    props: { hidden: true },
  } as unknown as BuilderNode;
  assert.equal(run(next).ok, true);
});

test("ALLOW: reordering blocks inside a section", () => {
  const next = baseTree();
  const hero = next[0] as unknown as { children: BuilderNode[] };
  hero.children.reverse();
  assert.equal(run(next).ok, true);
});

test("ALLOW: reordering whole sections", () => {
  const next = baseTree().slice().reverse() as BuilderNodeTree;
  assert.equal(run(next).ok, true);
});

test("ALLOW: removing a block", () => {
  const next = baseTree();
  const hero = next[0] as unknown as { children: BuilderNode[] };
  hero.children.pop();
  assert.equal(run(next).ok, true);
});

test("ALLOW: removing a whole section", () => {
  const next = [baseTree()[0]!] as BuilderNodeTree;
  assert.equal(run(next).ok, true);
});

test("ALLOW: moving an existing block to a DIFFERENT section (id is stable)", () => {
  const next = baseTree();
  const hero = next[0] as unknown as { children: BuilderNode[] };
  const contact = next[1] as unknown as { children: BuilderNode[] };
  contact.children.push(hero.children.pop()!);
  assert.equal(run(next).ok, true);
});

test("ALLOW: Web Office (canInsertSections) short-circuits every check", () => {
  const next = baseTree();
  (next[0] as unknown as { children: BuilderNode[] }).children.push(
    node("n-brand-new", "image"),
  );
  assert.equal(
    assertFreeTalentSiteTreeMutation({
      previousTree: baseTree(),
      nextTree: next,
      canInsertSections: true,
    }).ok,
    true,
  );
});

test("ALLOW: a save that touches nothing", () => {
  assert.equal(run(baseTree()).ok, true);
});

// ── DENY ─────────────────────────────────────────────────────────────────────

test("DENY: inserting a new block under an existing section", () => {
  const next = baseTree();
  (next[0] as unknown as { children: BuilderNode[] }).children.push(
    node("n-brand-new", "image"),
  );
  const result = run(next);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "sections_locked");
});

test("DENY: duplicating a block (the copy gets a fresh id)", () => {
  const next = baseTree();
  const hero = next[0] as unknown as { children: BuilderNode[] };
  hero.children.push(node("n-heading-copy", "heading"));
  assert.equal(run(next).ok, false);
});

test("DENY: adding a whole new section with content", () => {
  const next = [...baseTree(), section("s-gallery", [node("n-gallery", "gallery")])];
  assert.equal(run(next as BuilderNodeTree).ok, false);
});

test("DENY: a new node nested DEEP inside an existing block", () => {
  const next = baseTree();
  const hero = next[0] as unknown as { children: BuilderNode[] };
  hero.children[0] = node("n-heading", "heading", [node("n-sneaky", "text")]);
  assert.equal(run(next).ok, false);
});

test("DENY message names Web Office and is available in en + es", () => {
  const en = freeSiteSectionsLockedMessage("en");
  const es = freeSiteSectionsLockedMessage("es");
  assert.match(en, /Web Office/);
  assert.match(es, /Web Office/);
  assert.notEqual(en, es, "the Spanish string must actually be translated");
  for (const copy of [en, es]) {
    assert.doesNotMatch(copy, /—/, "no em dashes in user-facing copy");
  }
  // An unknown locale degrades to English rather than throwing.
  assert.equal(freeSiteSectionsLockedMessage("fr"), en);
  assert.equal(freeSiteSectionsLockedMessage(undefined), en);
});

// ── degrade-safety ───────────────────────────────────────────────────────────

test("an empty previous tree with a populated next tree is refused", () => {
  // A free talent whose stored tree is missing cannot use the gap to seed a
  // brand-new composition; a Design apply writes the trees server-side instead.
  assert.equal(run(baseTree(), [] as BuilderNodeTree).ok, false);
});

test("junk trees on either side never throw", () => {
  assert.equal(
    assertFreeTalentSiteTreeMutation({
      previousTree: null,
      nextTree: undefined,
      canInsertSections: false,
    }).ok,
    true,
  );
});
