/**
 * Unit tests for the Builder Lab command-palette pure logic (O6): fuzzy match
 * ranking, index construction across the three sources, search ranking, and
 * group-by-source. No React — exercises command-search.ts directly.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCommandIndex,
  flattenGroups,
  fuzzyScore,
  groupBySource,
  searchCommandIndex,
  type IndexComponentInput,
  type IndexTemplateInput,
} from "./command-search";

const components: IndexComponentInput[] = [
  {
    id: "hero",
    tab: "headers",
    effectiveLabel: "Hero Banner",
    effectiveCategory: "Headers",
    baseLabel: "Hero",
  },
  {
    id: "gallery-grid",
    tab: "media",
    effectiveLabel: "Gallery Grid",
    effectiveCategory: "Media",
    baseLabel: "Gallery",
  },
];

const templates: IndexTemplateInput[] = [
  {
    id: "tmpl-1",
    title: "Chef One-Pager",
    slug: "chef-one-pager",
    status: "published",
    kind: "section",
  },
];

const drafts: IndexTemplateInput[] = [
  {
    id: "draft-1",
    title: "Untitled draft",
    slug: "playground-abc",
    status: "draft",
    kind: "page_template",
  },
];

function buildAll() {
  return buildCommandIndex({
    components,
    templates,
    drafts,
    templateTab: "templates",
    playgroundTab: "playground",
  });
}

test("fuzzyScore: empty query matches everything with neutral score", () => {
  assert.equal(fuzzyScore("", "anything"), 0);
  assert.equal(fuzzyScore("   ", "anything"), 0);
});

test("fuzzyScore: substring beats subsequence", () => {
  const sub = fuzzyScore("gallery", "Gallery Grid");
  const subseq = fuzzyScore("glry", "Gallery Grid");
  assert.notEqual(sub, null);
  assert.notEqual(subseq, null);
  assert.ok((sub as number) > (subseq as number), "substring should outrank subsequence");
});

test("fuzzyScore: prefix match outranks mid-string match", () => {
  const prefix = fuzzyScore("hero", "Hero Banner");
  const mid = fuzzyScore("hero", "Super Hero");
  assert.ok((prefix as number) > (mid as number));
});

test("fuzzyScore: a query char never appearing in order → null", () => {
  assert.equal(fuzzyScore("xyz", "Hero Banner"), null);
  // out-of-order chars also fail (subsequence is order-sensitive)
  assert.equal(fuzzyScore("oreh", "hero"), null);
});

test("fuzzyScore: case-insensitive", () => {
  assert.notEqual(fuzzyScore("HERO", "hero banner"), null);
  assert.notEqual(fuzzyScore("hero", "HERO BANNER"), null);
});

test("buildCommandIndex: covers all three sources with correct jump targets", () => {
  const index = buildAll();
  assert.equal(index.length, 4);

  const hero = index.find((e) => e.key === "component:hero");
  assert.ok(hero);
  assert.equal(hero!.source, "component");
  assert.equal(hero!.tab, "headers"); // jumps to the gallery tab
  assert.equal(hero!.rowId, "hero"); // expand target = catalog row id

  const tmpl = index.find((e) => e.key === "template:tmpl-1");
  assert.ok(tmpl);
  assert.equal(tmpl!.source, "template");
  assert.equal(tmpl!.tab, "templates");

  const draft = index.find((e) => e.key === "draft:draft-1");
  assert.ok(draft);
  assert.equal(draft!.source, "draft");
  assert.equal(draft!.tab, "playground");
  assert.equal(draft!.rowId, "draft-1");
});

test("searchCommandIndex: empty query returns the whole index", () => {
  const index = buildAll();
  const all = searchCommandIndex(index, "");
  assert.equal(all.length, index.length);
});

test("searchCommandIndex: finds a component by label and ranks it first", () => {
  const index = buildAll();
  const res = searchCommandIndex(index, "gallery");
  assert.ok(res.length >= 1);
  assert.equal(res[0].key, "component:gallery-grid");
});

test("searchCommandIndex: finds a template by slug keyword", () => {
  const index = buildAll();
  const res = searchCommandIndex(index, "chef-one");
  assert.ok(res.some((e) => e.key === "template:tmpl-1"));
});

test("searchCommandIndex: drops non-matches", () => {
  const index = buildAll();
  const res = searchCommandIndex(index, "zzzznotathing");
  assert.equal(res.length, 0);
});

test("searchCommandIndex: respects the limit", () => {
  const index = buildAll();
  const res = searchCommandIndex(index, "", 2);
  assert.equal(res.length, 2);
});

test("groupBySource: groups in fixed order, dropping empty groups", () => {
  const index = buildAll();
  const groups = groupBySource(searchCommandIndex(index, ""));
  assert.deepEqual(
    groups.map((g) => g.source),
    ["component", "template", "draft"],
  );
  // a query hitting only components yields exactly one group
  const onlyComp = groupBySource(searchCommandIndex(index, "hero"));
  assert.equal(onlyComp.length, 1);
  assert.equal(onlyComp[0].source, "component");
});

test("flattenGroups: walks groups in display order for keyboard nav", () => {
  const index = buildAll();
  const groups = groupBySource(searchCommandIndex(index, ""));
  const flat = flattenGroups(groups);
  assert.equal(flat.length, index.length);
  // first flat entry is from the first group (components)
  assert.equal(flat[0].source, "component");
  // last flat entry is from the last non-empty group (draft)
  assert.equal(flat[flat.length - 1].source, "draft");
});
