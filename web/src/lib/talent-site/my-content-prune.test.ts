import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { TalentPortfolioShot } from "@/lib/site-admin/builder-node/portfolio-types";
import { buildFolioPayload } from "./theme-catalog/collection/designs";
import { distributeChapterShots, pruneEmptyMyContentBlocks } from "./my-content-prune";

function shot(i: number, albumId: string | null = null): TalentPortfolioShot {
  return {
    id: `m${i}`,
    url: `https://cdn.example/m${i}.jpg`,
    alt: "Photo",
    caption: null,
    offeringId: null,
    offeringTitle: null,
    albumId,
    width: 800,
    height: 1000,
    sortOrder: i,
  };
}

function kinds(nodes: readonly BuilderNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    out.push(n.kind);
    const kids = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) kinds(kids, out);
  }
  return out;
}

function find(nodes: readonly BuilderNode[], kind: string, out: BuilderNode[] = []): BuilderNode[] {
  for (const n of nodes) {
    if (n.kind === kind) out.push(n);
    const kids = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) find(kids, kind, out);
  }
  return out;
}

const offering = (amountCents: number | null, priceDisplay = "exact") =>
  ({ id: "o1", title: "Lash lift", amountCents, priceDisplay, priceType: "flat_package" }) as never;

test("chapters with no album split the photos instead of repeating or emptying", () => {
  const chapters = find(buildFolioPayload().homeTree, "portfolio");
  assert.equal(chapters.length, 2);
  const shots = Array.from({ length: 7 }, (_, i) => shot(i));
  const map = distributeChapterShots(chapters, shots);
  const all = chapters.flatMap((c) => map.get(c.id) ?? []);
  assert.deepEqual(map.get(chapters[0]!.id), ["m0", "m1", "m2"]);
  assert.equal(new Set(all).size, all.length, "no photo repeats across chapters");
  // Each chapter limit is 3 → 6 of 7 photos placed.
  assert.equal(all.length, 6);
});

test("a chapter keyed to an album she has keeps it; missing albums fall back", () => {
  const chapters = find(buildFolioPayload().homeTree, "portfolio").map((c, i) =>
    i === 0 ? ({ ...c, props: { ...c.props, albumId: "brides" } } as BuilderNode) : c,
  );
  const shots = [shot(0, "brides"), shot(1), shot(2)];
  const map = distributeChapterShots(chapters, shots);
  assert.deepEqual(map.get(chapters[0]!.id), ["m0"]);
  assert.deepEqual(map.get(chapters[1]!.id), ["m1", "m2"]);
});

test("Folio My content hides empty measures, rates and chapters and their Contents entries", () => {
  const tree = buildFolioPayload().homeTree;
  const out = pruneEmptyMyContentBlocks(
    tree,
    { talentPortfolioShots: [shot(0), shot(1)], talentOfferings: [offering(null, "quote")], talentCompCard: { rows: [] } },
    "es",
  );
  const k = kinds(out);
  assert.ok(!k.includes("comp_card"), "comp card with no rows is hidden");
  assert.ok(!k.includes("services_catalog"), "rate card with no priced service is hidden");
  const chapters = find(out, "portfolio");
  assert.equal(chapters.length, 2, "both chapters keep a photo");
  for (const ch of chapters) {
    const p = ch.props as { selectionMode?: string; selectedMediaIds?: string[] };
    assert.equal(p.selectionMode, "ids");
    assert.equal(p.selectedMediaIds?.length, 1);
  }
  const contents = find(out, "contents")[0]!;
  const anchors = (contents.props as { items: Array<{ anchor: string }> }).items.map((i) => i.anchor);
  // Rates dropped with the empty catalog; chapters remain.
  assert.deepEqual(anchors, ["chapter-1", "chapter-2"]);
});

test("real content is kept", () => {
  const tree = buildFolioPayload().homeTree;
  const out = pruneEmptyMyContentBlocks(tree, {
    talentPortfolioShots: Array.from({ length: 9 }, (_, i) => shot(i)),
    talentOfferings: [offering(45000)],
    talentCompCard: {
      rows: [
        { fieldKey: "height", label: "Height", value: "170 cm", group: "Measurements" },
        { fieldKey: "bust", label: "Bust", value: "86 cm", group: "Measurements" },
        { fieldKey: "waist", label: "Waist", value: "62 cm", group: "Measurements" },
        { fieldKey: "hips", label: "Hips", value: "90 cm", group: "Measurements" },
      ],
    },
  });
  const k = kinds(out);
  assert.ok(k.includes("comp_card"));
  assert.ok(k.includes("services_catalog"));
  assert.equal(find(out, "portfolio").length, 2);
  const items = (find(out, "contents")[0]!.props as { items: unknown[] }).items;
  assert.equal(items.length, 3);
});
