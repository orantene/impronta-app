/**
 * Theme collection v1 designs: validate, deterministic, flag-gated, distinct.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { validateDesign } from "../validate";
import { isMaisonCatalogSlug } from "../maison/catalog-visibility";
import { COLLECTION_DESIGNS, COLLECTION_DESIGN_GAPS, isCollectionDesignSlug } from "./designs";

for (const d of COLLECTION_DESIGNS) {
  test(`${d.slug} validates as a Design`, () => {
    const res = validateDesign(d.buildPayload());
    assert.deepEqual(res.errors, []);
    assert.equal(res.ok, true);
  });
}

test("payloads are deterministic (stable sync hash)", () => {
  for (const d of COLLECTION_DESIGNS) {
    assert.equal(JSON.stringify(d.buildPayload()), JSON.stringify(d.buildPayload()));
  }
});

test("every collection slug is flag-gated with Maison", () => {
  for (const d of COLLECTION_DESIGNS) {
    assert.equal(isCollectionDesignSlug(d.slug), true);
    assert.equal(isMaisonCatalogSlug(d.slug), true);
  }
  assert.equal(isMaisonCatalogSlug("editorial"), false);
});

test("the five designs are structurally distinct (section order differs)", () => {
  const orders = COLLECTION_DESIGNS.map((d) =>
    d
      .buildPayload()
      .homeTree.map((n) => String((n.props as Record<string, unknown>).slotKey))
      .join(">"),
  );
  assert.equal(new Set(orders).size, orders.length);
});

/** W-01 — Maison v2 menu uses sticky category rail (chips on phone via CSS). */
test("maison-v2 services_catalog uses categoryNav rail + rows", () => {
  const maison = COLLECTION_DESIGNS.find((d) => d.slug === "maison-v2");
  assert.ok(maison);
  const found: Array<Record<string, unknown>> = [];
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const node = n as { kind?: string; props?: Record<string, unknown>; children?: unknown };
      if (node.kind === "services_catalog" && node.props) found.push(node.props);
      walk(node.children);
    }
  };
  walk(maison!.buildPayload().homeTree);
  assert.equal(found.length, 1);
  assert.equal(found[0].categoryNav, "rail");
  assert.equal(found[0].layout, "rows");
  assert.equal(found[0].showPhoto, true);
});

/** Maison v2 hero — inset photo, italic name token, next-free chip; no reveal wrapper. */
test("maison-v2 hero has inset, italic accent name, next_free_chip, and no reveal", () => {
  const maison = COLLECTION_DESIGNS.find((d) => d.slug === "maison-v2");
  assert.ok(maison);
  const payload = maison!.buildPayload();
  const hero = payload.homeTree[0];
  assert.ok(hero);
  assert.equal(hero.kind, "split");
  assert.equal((hero.props as { slotKey?: string }).slotKey, "hero");

  const kinds: string[] = [];
  const texts: string[] = [];
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const node = n as {
        kind?: string;
        props?: { text?: string; src?: string; style?: { position?: string; fontFamily?: string } };
        children?: unknown;
      };
      if (node.kind) kinds.push(node.kind);
      if (typeof node.props?.text === "string") texts.push(node.props.text);
      walk(node.children);
    }
  };
  walk([hero]);

  assert.ok(!kinds.includes("reveal"), "hero must stay visible at rest (no reveal wrapper)");
  assert.ok(kinds.includes("next_free_chip"), "next free chip in hero copy");
  assert.ok(
    texts.some((t) => t.includes("{i}") && t.includes("{{displayName}}")),
    "display name uses italic marker",
  );
  assert.ok(
    kinds.filter((k) => k === "image").length >= 2,
    "main headshot + inset gallery1",
  );
  const json = JSON.stringify(hero);
  assert.match(json, /gallery1/);
  assert.match(json, /token:typography\.heading-font-family/);
  assert.doesNotMatch(json, /#[0-9a-fA-F]{3,8}/);
});

/** W-14 — Maison v2 binds live reviews quote cards after visit/FAQ. */
test("maison-v2 includes reviews block on shared slider and clears W-14 gap", () => {
  const maison = COLLECTION_DESIGNS.find((d) => d.slug === "maison-v2");
  assert.ok(maison);
  const payload = maison!.buildPayload();
  const found: Array<Record<string, unknown>> = [];
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const node = n as { kind?: string; props?: Record<string, unknown>; children?: unknown };
      if (node.kind === "reviews" && node.props) found.push(node.props);
      walk(node.children);
    }
  };
  walk(payload.homeTree);
  assert.equal(found.length, 1);
  assert.equal(found[0].layout, "row");
  assert.equal(found[0].title, "What clients say");
  assert.ok(!COLLECTION_DESIGN_GAPS["maison-v2"]?.includes("W-14 bound reviews"));
});

/** Visit / about / FAQ presets — Maison v2 Experience band. */
test("maison-v2 uses split about, visit facts, and FAQ contact presets", () => {
  const maison = COLLECTION_DESIGNS.find((d) => d.slug === "maison-v2");
  assert.ok(maison);
  const payload = maison!.buildPayload();
  const slots = payload.homeTree.map((n) => String((n.props as { slotKey?: string }).slotKey));
  assert.ok(slots.includes("about"));
  assert.ok(slots.includes("visit"));
  assert.ok(slots.includes("contact"));
  assert.ok(slots.includes("reviews"));

  let aboutIsSplit = false;
  let visitLayout: string | undefined;
  let faqBound = false;
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const node = n as {
        kind?: string;
        props?: Record<string, unknown>;
        children?: unknown;
      };
      if (node.kind === "split" && node.props?.slotKey === "about") aboutIsSplit = true;
      if (node.kind === "visit") visitLayout = String(node.props?.layout ?? "");
      if (
        node.kind === "accordion" &&
        node.props?.bindSource === "talent_faq_items"
      ) {
        faqBound = true;
      }
      walk(node.children);
    }
  };
  walk(payload.homeTree);
  assert.equal(aboutIsSplit, true);
  assert.equal(visitLayout, "split");
  assert.equal(faqBound, true);
  assert.doesNotMatch(JSON.stringify(payload), /#[0-9a-fA-F]{3,8}/);
});

/** Shared Header navChrome stamps (not Maison-only). */
test("collection Designs stamp shared navChrome modes on kit nav", () => {
  const expected: Record<string, string | undefined> = {
    "maison-v2": undefined,
    solace: "overlay",
    mono: undefined,
    frame: "filter_bar",
    folio: "chapter_dots",
  };
  for (const d of COLLECTION_DESIGNS) {
    let chrome: string | undefined;
    const walk = (nodes: unknown) => {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        const node = n as {
          kind?: string;
          props?: Record<string, unknown>;
          children?: unknown;
        };
        if (node.kind === "nav" && node.props) {
          chrome = node.props.navChrome as string | undefined;
        }
        walk(node.children);
      }
    };
    walk(d.buildPayload().shellTree);
    assert.equal(chrome, expected[d.slug], `${d.slug} navChrome`);
  }
  assert.ok(!COLLECTION_DESIGN_GAPS.solace.includes("overlay menu nav style"));
  assert.ok(!COLLECTION_DESIGN_GAPS.frame.includes("filter-bar header style"));
});

/** Folio stamps shared W-12 chapter layout (not Folio-only renderer). */
test("folio uses portfolio chapter layout and clears project-story gap", () => {
  const folio = COLLECTION_DESIGNS.find((d) => d.slug === "folio");
  assert.ok(folio);
  const payload = folio!.buildPayload();
  const chapters: Array<{
    layout?: string;
    chapterNumber?: number;
    title?: string;
    anchorId?: string;
  }> = [];
  const contentsFound: Array<{
    kind?: string;
    props?: Record<string, unknown>;
  }> = [];
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const node = n as {
        kind?: string;
        anchorId?: string;
        props?: Record<string, unknown>;
        children?: unknown;
      };
      if (node.kind === "portfolio") {
        chapters.push({
          layout: node.props?.layout as string | undefined,
          chapterNumber: node.props?.chapterNumber as number | undefined,
          title: node.props?.title as string | undefined,
          anchorId: node.anchorId,
        });
      }
      if (node.kind === "contents") {
        contentsFound.push({ kind: node.kind, props: node.props });
      }
      walk(node.children);
    }
  };
  walk(payload.homeTree);
  assert.equal(chapters.length, 3);
  assert.deepEqual(
    chapters.map((c) => c.layout),
    ["chapter", "chapter", "chapter"],
  );
  assert.deepEqual(
    chapters.map((c) => c.chapterNumber),
    [1, 2, 3],
  );
  assert.deepEqual(
    chapters.map((c) => c.anchorId),
    ["chapter-1", "chapter-2", "chapter-3"],
  );
  assert.equal(contentsFound.length, 1, "folio stamps shared contents block");
  const items =
    (contentsFound[0]!.props?.items as Array<{ label: string; anchor: string }>) ??
    [];
  assert.ok(items.length >= 3);
  assert.deepEqual(
    items.slice(0, 3).map((it) => it.anchor),
    ["chapter-1", "chapter-2", "chapter-3"],
  );
  assert.ok(!COLLECTION_DESIGN_GAPS.folio.includes("W-12 project-story chapters"));
  assert.ok(!COLLECTION_DESIGN_GAPS.folio.includes("W-11 C2 contents page"));
  assert.doesNotMatch(JSON.stringify(payload), /#[0-9a-fA-F]{3,8}/);
  assert.doesNotMatch(JSON.stringify(payload), /\u2014/);
});
