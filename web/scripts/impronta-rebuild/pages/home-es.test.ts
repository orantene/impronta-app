import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

import { homePage } from "./home";
import {
  buildSpanishHomeTree,
  collectVisitorText,
  homePageEs,
  isAcceptableInSpanish,
  localizeHomeHref,
} from "./home-es";

test("nothing visitor-facing is left in English", () => {
  // THE gate. Add a sentence to the English homepage and this fails until the
  // Spanish copy exists — instead of a Spanish page quietly serving English,
  // which is exactly how the shell shipped four dead links.
  const missing = collectVisitorText(homePageEs.tree).filter(
    (value) => !isAcceptableInSpanish(value) && /[a-zA-Z]{3,}/.test(value) && isEnglish(value),
  );
  assert.deepEqual(missing, [], `untranslated copy on the Spanish homepage: ${missing.join(" | ")}`);
});

/** A string is "still English" if it appears verbatim in the English tree. */
function isEnglish(value: string): boolean {
  return collectVisitorText(homePage.tree).includes(value);
}

test("structure is identical to the English page", () => {
  // Parity by construction is the whole reason this is a copy map and not a
  // second tree; assert it anyway, because a future edit could break the walk.
  const shape = (nodes: unknown): string =>
    JSON.stringify(nodes, (key, value) =>
      key === "id" || HOME_TEXT_KEYS.has(key) || key === "href" ? undefined : value,
    );
  assert.equal(
    shape(homePageEs.tree),
    shape(homePage.tree),
    "the Spanish tree drifted structurally from the English one",
  );
});

const HOME_TEXT_KEYS = new Set([
  "text","label","title","subtitle","heading","headline","subheadline","eyebrow",
  "eyebrowText","line1","line2","sub","footnote","body","quote","attribution",
  "value","caption","alt","seeAllLabel","emptyStateText","placeholder","note",
]);

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
  walk(homePageEs.tree);
  assert.ok(hrefs.length > 0, "expected internal links");
  const escaped = hrefs.filter((h) => h !== "/es" && !h.startsWith("/es/"));
  assert.deepEqual(escaped, [], "these links drop a Spanish visitor into the English site");
});

test("localizeHomeHref is idempotent and leaves external links alone", () => {
  assert.equal(localizeHomeHref("/"), "/es");
  assert.equal(localizeHomeHref("/directory"), "/es/directory");
  assert.equal(localizeHomeHref("/es/directory"), "/es/directory", "must not double-prefix");
  assert.equal(localizeHomeHref("https://wa.me/529843170816"), "https://wa.me/529843170816");
});

test("node ids cannot collide with the English page", () => {
  const ids: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const node = n as { id?: string; children?: unknown[] };
    if (typeof node.id === "string") ids.push(node.id);
    for (const v of Object.values(n as Record<string, unknown>)) walk(v);
  };
  walk(homePageEs.tree);
  const unprefixed = ids.filter((id) => id.startsWith("rb-"));
  assert.deepEqual(unprefixed, [], "Spanish node ids must be namespaced");
  assert.equal(new Set(ids).size, ids.length, "duplicate node id in the Spanish tree");
});

test("the Spanish tree validates", () => {
  const result = validateBuilderNodeTree(buildSpanishHomeTree(homePage.tree));
  if (!result.ok) {
    assert.fail(`invalid: ${result.issues.map((i) => i.message).join("; ")}`);
  }
});

test("the SEO block is Spanish and self-canonical", () => {
  assert.match(homePageEs.seo.meta_title, /Agencia/);
  assert.equal(homePageEs.seo.canonical_url, "/es/p/home");
  assert.notEqual(
    homePageEs.seo.meta_description,
    homePage.seo.meta_description,
    "a duplicated English description would compete with the English page in search",
  );
});
