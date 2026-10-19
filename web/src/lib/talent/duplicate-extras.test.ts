/**
 * TUL-1337: Duplicate also copies components and live/upcoming price phases,
 * names the copy in the workspace language, and links with next/link.
 *
 * Run: node_modules/.bin/tsx --test src/lib/talent/duplicate-extras.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { copyTitle, remapPhases } from "./duplicate-extras";

const NOW = "2026-10-19T12:00:00Z";

test("remapPhases: keeps live and upcoming phases, drops ended ones, maps option ids by position", () => {
  const phases = [
    { id: "p1", label: "Early", startsAt: "2026-10-01T00:00:00Z", endsAt: null, priceCents: 900, variantId: null },
    { id: "p2", label: "Past", startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-02-01T00:00:00Z", priceCents: 500, variantId: null },
    { id: "p3", label: "Soon L", startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z", priceCents: 1200, variantId: "old-large" },
    { id: "p4", label: "Orphan", startsAt: "2026-12-01T00:00:00Z", endsAt: null, priceCents: 1, variantId: "old-gone" },
  ];
  const out = remapPhases(phases, new Map([["old-large", "new-large"]]), NOW);
  assert.deepEqual(out.map((p) => p.label), ["Early", "Soon L"]);
  assert.equal(out[1]!.variantId, "new-large");
  assert.equal(out[0]!.variantId, null);
  assert.equal(out[0]!.priceCents, 900);
});

test("copyTitle puts the localized suffix after the name", () => {
  assert.equal(copyTitle("Latte", "copy"), "Latte (copy)");
  assert.equal(copyTitle("Latte", "copia"), "Latte (copia)");
});

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the editor's duplicate copies components and phases for a workspace item and localizes the suffix", () => {
  const hook = src("../../components/talent/services/use-offerings-editor.ts");
  const dup = hook.slice(hook.indexOf("const duplicate = useCallback"), hook.indexOf("const startAdd"));
  assert.match(dup, /copyCatalogExtras\(/);
  assert.match(dup, /copyTitle\(/);
  assert.doesNotMatch(dup, /\(copy\)/);
});

test("the provider-owned notice links with next/link, not a bare anchor", () => {
  const page = src("../../components/admin/shell/internal/page-modules/catalog/CatalogPage.tsx");
  assert.match(page, /import Link from "next\/link"/);
  assert.doesNotMatch(page, /<a href="\/talent\/services"/);
});
