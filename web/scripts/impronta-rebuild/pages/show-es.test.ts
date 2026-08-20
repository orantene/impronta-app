import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

import { showPage } from "./show";
import { collectVisitorText, isAcceptableInSpanishShow, showPageEs } from "./show-es";

const englishStrings = new Set(collectVisitorText(showPage.tree));

test("nothing visitor-facing is left in English", () => {
  // THE gate. Add a sentence to the English show page and this fails until its
  // Spanish exists, rather than the Spanish page quietly serving English.
  const missing: string[] = [];
  for (const value of collectVisitorText(showPageEs.tree)) {
    if (isAcceptableInSpanishShow(value)) continue;
    if (englishStrings.has(value)) missing.push(value);
  }
  assert.deepEqual(missing, [], `untranslated copy:\n${missing.join("\n")}`);
});

const PAGE_TEXT_KEYS = new Set([
  "text","label","title","subtitle","heading","headline","subheadline","eyebrow",
  "eyebrowText","line1","line2","sub","footnote","body","quote","attribution",
  "value","caption","alt","seeAllLabel","emptyStateText","placeholder","note",
  "layerLabel",
]);

test("structure matches the English page it came from", () => {
  const shape = (nodes: unknown): string =>
    JSON.stringify(nodes, (key, value) =>
      key === "id" || key === "href" || PAGE_TEXT_KEYS.has(key) ? undefined : value,
    );
  assert.equal(shape(showPageEs.tree), shape(showPage.tree));
});

test("every internal link stays inside the Spanish site", () => {
  const hrefs: string[] = [];
  const walk = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((v) => walk(v));
    if (!value || typeof value !== "object") {
      if (key === "href" && typeof value === "string" && value.startsWith("/")) hrefs.push(value);
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k);
  };
  walk(showPageEs.tree);
  assert.ok(hrefs.length > 0);
  assert.deepEqual(
    hrefs.filter((h) => h !== "/es" && !h.startsWith("/es/")),
    [],
    "these links drop a Spanish visitor into the English site",
  );
});

test("ids are namespaced, so the two locales cannot collide", () => {
  const ids: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const node = n as { id?: string };
    if (typeof node.id === "string") ids.push(node.id);
    for (const v of Object.values(n as Record<string, unknown>)) walk(v);
  };
  walk(showPageEs.tree);
  assert.deepEqual(ids.filter((id) => !id.startsWith("es-")), [], "un-namespaced ids");
  assert.equal(new Set(ids).size, ids.length, "duplicate ids");
});

test("both trees validate", () => {
  for (const [name, tree] of [["en", showPage.tree], ["es", showPageEs.tree]] as const) {
    const result = validateBuilderNodeTree(tree);
    if (!result.ok) assert.fail(`${name}: ${result.issues.map((i) => i.message).join("; ")}`);
  }
});

test("an unannounced production stays out of the index, in both languages", () => {
  for (const page of [showPage, showPageEs]) {
    const seo = page.seo as unknown as Record<string, unknown>;
    assert.equal(seo.noindex, true, `${page.slug} must be noindex until the owner announces it`);
    assert.equal(seo.include_in_sitemap, false);
  }
  assert.equal((showPageEs.seo as unknown as Record<string, unknown>).canonical_url, "/es/p/show");
});
