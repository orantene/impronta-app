import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

import {
  collectVisitorText,
  divisionPagesEs,
  divisionSourcePagesEn,
  isAcceptableInSpanishDivision,
} from "./divisions-es";

const englishStrings = new Set(
  divisionSourcePagesEn.flatMap((page) => collectVisitorText(page.tree)),
);

test("nothing visitor-facing is left in English", () => {
  // THE gate. Add a sentence to an English division page and this fails until
  // its Spanish exists, rather than the Spanish page quietly serving English.
  const missing: string[] = [];
  for (const page of divisionPagesEs) {
    for (const value of collectVisitorText(page.tree)) {
      if (isAcceptableInSpanishDivision(value)) continue;
      if (englishStrings.has(value)) missing.push(`${page.slug}: ${value}`);
    }
  }
  assert.deepEqual(missing, [], `untranslated copy:\n${missing.join("\n")}`);
});

test("all four divisions are built", () => {
  assert.deepEqual(
    divisionPagesEs.map((p) => p.slug).sort(),
    ["fashion-models", "hosts-promoters", "music-djs", "performers"],
  );
});

test("structure matches the English page it came from", () => {
  const shape = (nodes: unknown): string =>
    JSON.stringify(nodes, (key, value) =>
      key === "id" || key === "href" || PAGE_TEXT_KEYS.has(key) ? undefined : value,
    );
  for (const [i, page] of divisionPagesEs.entries()) {
    assert.equal(
      shape(page.tree),
      shape(divisionSourcePagesEn[i]!.tree),
      `${page.slug} drifted structurally from its English source`,
    );
  }
});

const PAGE_TEXT_KEYS = new Set([
  "text","label","title","subtitle","heading","headline","subheadline","eyebrow",
  "eyebrowText","line1","line2","sub","footnote","body","quote","attribution",
  "value","caption","alt","seeAllLabel","emptyStateText","placeholder","note",
]);

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
  divisionPagesEs.forEach((p) => walk(p.tree));
  assert.ok(hrefs.length > 0);
  assert.deepEqual(
    hrefs.filter((h) => h !== "/es" && !h.startsWith("/es/")),
    [],
    "these links drop a Spanish visitor into the English site",
  );
});

test("ids are namespaced, so the two locales cannot collide", () => {
  for (const page of divisionPagesEs) {
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
  for (const page of divisionPagesEs) {
    const result = validateBuilderNodeTree(page.tree);
    if (!result.ok) {
      assert.fail(`${page.slug}: ${result.issues.map((i) => i.message).join("; ")}`);
    }
  }
});

test("SEO is Spanish and self-canonical", () => {
  for (const page of divisionPagesEs) {
    const seo = page.seo as unknown as Record<string, string>;
    assert.equal(seo.canonical_url, `/es/p/${page.slug}`);
    // A duplicated English description would compete with the English page in
    // search rather than serving the Spanish one.
    const english = divisionSourcePagesEn.find((p) => p.slug === page.slug)!;
    assert.notEqual(
      seo.meta_description,
      (english.seo as unknown as Record<string, string>).meta_description,
    );
  }
});
