import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

import {
  collectVisitorText,
  isAcceptableInSpanishLegal,
  legalPagesEs,
  legalSourcePagesEn,
} from "./legal-es";

const englishStrings = new Set(
  legalSourcePagesEn.flatMap((page) => collectVisitorText(page.tree)),
);

test("nothing visitor-facing is left in English", () => {
  // THE gate. Add a sentence to an English legal page and this fails until its
  // Spanish exists, rather than the Spanish page quietly serving English.
  const missing: string[] = [];
  for (const page of legalPagesEs) {
    for (const value of collectVisitorText(page.tree)) {
      if (isAcceptableInSpanishLegal(value)) continue;
      if (englishStrings.has(value)) missing.push(`${page.slug}: ${value}`);
    }
  }
  assert.deepEqual(missing, [], `untranslated copy:\n${missing.join("\n")}`);
});

test("all three pages are built", () => {
  assert.deepEqual(
    legalPagesEs.map((p) => p.slug).sort(),
    ["404", "privacy", "terms"],
  );
});

const PAGE_TEXT_KEYS = new Set([
  "text","label","title","subtitle","heading","headline","subheadline","eyebrow",
  "eyebrowText","line1","line2","sub","footnote","body","quote","attribution",
  "value","caption","alt","seeAllLabel","emptyStateText","placeholder","note",
]);

test("structure matches the English page it came from", () => {
  const shape = (nodes: unknown): string =>
    JSON.stringify(nodes, (key, value) =>
      key === "id" || key === "href" || PAGE_TEXT_KEYS.has(key) ? undefined : value,
    );
  for (const [i, page] of legalPagesEs.entries()) {
    assert.equal(
      shape(page.tree),
      shape(legalSourcePagesEn[i]!.tree),
      `${page.slug} drifted structurally from its English source`,
    );
  }
});

test("the template-draft disclaimer survives translation", () => {
  // Translating a draft does not make it reviewed. Both legal pages must keep
  // saying so, in Spanish, or the site presents unreviewed terms as final.
  for (const slug of ["terms", "privacy"]) {
    const page = legalPagesEs.find((p) => p.slug === slug)!;
    const text = collectVisitorText(page.tree).join(" ");
    assert.match(text, /Borrador de plantilla/, `${slug} lost its draft disclaimer`);
    assert.match(text, /abogado/, `${slug} lost the counsel-review caveat`);
  }
});

test("every internal link stays inside the Spanish site", () => {
  const hrefs: string[] = [];
  const walk = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((v) => walk(v));
    if (!value || typeof value !== "object") {
      if (key === "href" && typeof value === "string" && value.startsWith("/")) {
        hrefs.push(value);
      }
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k);
  };
  legalPagesEs.forEach((p) => walk(p.tree));
  assert.ok(hrefs.length > 0);
  assert.deepEqual(
    hrefs.filter((h) => h !== "/es" && !h.startsWith("/es/")),
    [],
    "these links drop a Spanish visitor into the English site",
  );
});

test("in-prose page references are localized too", () => {
  // The legal copy names paths inside sentences ("/p/privacy", "/p/contact"),
  // which the href walker never sees. A Spanish page citing an English path
  // sends the reader across the language boundary mid-policy.
  for (const page of legalPagesEs) {
    for (const value of collectVisitorText(page.tree)) {
      assert.ok(
        !/(?<!\/es)\/p\/(privacy|contact|terms)/.test(value),
        `${page.slug} cites an English path in prose: "${value.slice(0, 80)}"`,
      );
    }
  }
});

test("ids are namespaced, so the two locales cannot collide", () => {
  for (const page of legalPagesEs) {
    const ids: string[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      const node = n as { id?: string };
      if (typeof node.id === "string") ids.push(node.id);
      for (const v of Object.values(n as Record<string, unknown>)) walk(v);
    };
    walk(page.tree);
    assert.deepEqual(
      ids.filter((id) => !id.startsWith("es-")),
      [],
      `${page.slug} has un-namespaced ids`,
    );
    assert.equal(new Set(ids).size, ids.length, `${page.slug} has duplicate ids`);
  }
});

test("each tree validates", () => {
  for (const page of legalPagesEs) {
    const result = validateBuilderNodeTree(page.tree);
    if (!result.ok) {
      assert.fail(`${page.slug}: ${result.issues.map((i) => i.message).join("; ")}`);
    }
  }
});

test("SEO is Spanish and self-canonical, and the 404 keeps noindex", () => {
  for (const page of legalPagesEs) {
    const seo = page.seo as unknown as Record<string, unknown>;
    assert.equal(seo.canonical_url, `/es/p/${page.slug}`);
    const english = legalSourcePagesEn.find((p) => p.slug === page.slug)!;
    assert.notEqual(
      seo.meta_description,
      (english.seo as unknown as Record<string, unknown>).meta_description,
    );
  }
  const notFound = legalPagesEs.find((p) => p.slug === "404")!;
  assert.equal((notFound.seo as unknown as Record<string, unknown>).noindex, true);
});
