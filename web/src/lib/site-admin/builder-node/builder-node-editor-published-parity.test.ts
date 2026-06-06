import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import {
  resolveSnapshotBuilderTree,
  resolveSnapshotBuilderTreeForPublish,
} from "./snapshot-tree";
import {
  resolveBuilderTreeClassRefs,
  type BuilderStyleClass,
  type BuilderStyleClassRegistry,
} from "./style-classes";
import type { BuilderNode, BuilderNodeTree } from "./types";

/**
 * EDITOR ↔ PUBLISHED parity for the P3 builder capabilities (repeaters, media
 * library, sandboxed code node, field bindings).
 *
 * THE REGRESSION THIS GUARDS — "editor-vs-published render drift": a page looks
 * one way in the builder and a different way once published. From the real code
 * the two surfaces differ in exactly two places:
 *
 *   1. The RESOLVE step. The published shell renders
 *      `resolveSnapshotBuilderTreeForPublish(...).tree`; the editor/preview
 *      renders the authored tree (the fidelity harness in
 *      scripts/fidelity/html.ts feeds the raw tree straight to
 *      `renderBuilderNodes`). Publish-resolve runs `validateBuilderNodeTree`,
 *      which `safeParse`s each node's props through its Zod schema and REPLACES
 *      props with the parsed data (validate.ts:114,139,161) — so a schema that
 *      forgot a P3 field (`mediaId`, `dataBinding.repeat`, `fieldBindings`,
 *      code `html`) would silently strip it on publish only. These tests pin
 *      that every P3 field survives resolve byte-for-byte.
 *
 *   2. The threaded dataSources. `homepage-cms-sections.tsx:470` passes the FULL
 *      `builderDataSources` (mediaAssets + collections + featured profiles);
 *      `PublishedShell.tsx:307` passes only `{ mediaAssets }`. Same tree + same
 *      dataSources MUST render identically (pinned below); the dataSources
 *      asymmetry is the genuine drift vector, exercised as a negative control.
 *
 * Pure + deterministic (no browser), matching render-output.test.ts /
 * p7a-reorder-publish-parity.test.ts conventions.
 */

const MEDIA_ID = "11111111-1111-4111-8111-111111111111";

/** Full dataSources, as the editor/homepage render threads them. */
const FULL_DATA_SOURCES = {
  mediaAssets: [
    {
      id: MEDIA_ID,
      publicUrl: "https://cdn.example.com/media-public/tenant/library/portrait.webp",
      alt: "Library portrait",
      width: 1200,
      height: 1600,
    },
  ],
  collections: {
    featured_talent_profiles: [
      { id: "t1", displayName: "Ana", href: "/t/ana", imageUrl: "/assets/ana.jpg" },
      { id: "t2", displayName: "Bea", href: "/t/bea", imageUrl: "/assets/bea.jpg" },
      { id: "t3", displayName: "Cleo", href: "/t/cleo", imageUrl: "/assets/cleo.jpg" },
    ],
  },
} as const;

/**
 * A freeform showcase that uses ALL FOUR P3 capabilities at once:
 *  - media-library image (`mediaId`)
 *  - sandboxed `code` node
 *  - a `fieldBindings` heading
 *  - a collection-bound `repeater` whose card binds text/label/href/src/alt
 */
const SHOWCASE_TREE: BuilderNodeTree = [
  {
    id: "showcase",
    kind: "container",
    props: { layout: "stack", gap: "l" },
    children: [
      {
        id: "media-img",
        kind: "image",
        props: { mediaId: MEDIA_ID, src: "https://example.com/raw-fallback.jpg", alt: "" },
      },
      {
        id: "embed",
        kind: "code",
        props: { html: "<h2>Widget</h2><p>hi</p>", minHeight: 220, style: { borderRadius: "12px" } },
      },
      {
        id: "bound-heading",
        kind: "heading",
        props: { text: "Fallback name", level: 3, fieldBindings: { text: "displayName" } },
      },
      {
        id: "roster",
        kind: "container",
        props: {
          layout: "grid",
          dataBinding: { sourceKey: "featured_talent_profiles", mode: "bound", repeat: true, maxItems: 3 },
        },
        children: [
          {
            id: "roster:card",
            kind: "card",
            props: {},
            children: [
              {
                id: "roster:name",
                kind: "heading",
                props: { text: "Fallback name", level: 3, fieldBindings: { text: "displayName" } },
              },
              {
                id: "roster:cta",
                kind: "button",
                props: { label: "Fallback CTA", href: "/fallback", fieldBindings: { label: "displayName", href: "href" } },
              },
              {
                id: "roster:photo",
                kind: "image",
                props: { src: "https://cdn.example.com/fallback.jpg", alt: "Fallback alt", fieldBindings: { src: "imageUrl", alt: "displayName" } },
              },
            ],
          },
        ],
      },
    ],
  } as BuilderNode,
];

type RenderOptions = Parameters<typeof renderBuilderNodes>[1];

function renderTree(tree: BuilderNodeTree, options: RenderOptions = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(tree, { mode: "freeform", ...options }) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );
}

function findNode(tree: BuilderNodeTree, id: string): BuilderNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if ("children" in node && Array.isArray(node.children)) {
      const hit = findNode(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

test("parity: publish-resolve preserves every P3 field byte-for-byte (no strip on publish)", () => {
  const editorResolve = resolveSnapshotBuilderTree({ slots: [], builderTree: SHOWCASE_TREE });
  const publishResolve = resolveSnapshotBuilderTreeForPublish({ slots: [], builderTree: SHOWCASE_TREE });

  // The freeform tree is taken as-is (validated), NOT fallen back to legacy slots.
  assert.equal(editorResolve.source, "snapshot_builder_tree", "freeform tree survives validation");
  assert.equal(publishResolve.ok, true, "publish resolution succeeds");
  if (!publishResolve.ok) return;

  // The publish gate returns the SAME tree the editor resolves — no drift.
  assert.deepEqual(publishResolve.tree, editorResolve.tree, "publish resolve == editor resolve");

  // Every P3 field survived the Zod round-trip on the published tree.
  const img = findNode(publishResolve.tree, "media-img");
  assert.equal((img?.props as { mediaId?: string }).mediaId, MEDIA_ID, "mediaId preserved");

  const code = findNode(publishResolve.tree, "embed");
  assert.equal((code?.props as { html?: string }).html, "<h2>Widget</h2><p>hi</p>", "code html preserved");

  const roster = findNode(publishResolve.tree, "roster");
  assert.equal(
    (roster?.props as { dataBinding?: { repeat?: boolean } }).dataBinding?.repeat,
    true,
    "repeater dataBinding preserved",
  );

  const boundCta = findNode(publishResolve.tree, "roster:cta");
  assert.deepEqual(
    (boundCta?.props as { fieldBindings?: Record<string, string> }).fieldBindings,
    { label: "displayName", href: "href" },
    "field bindings preserved",
  );
});

test("parity: editor render and published render are byte-identical given identical dataSources", () => {
  const publishResolve = resolveSnapshotBuilderTreeForPublish({ slots: [], builderTree: SHOWCASE_TREE });
  assert.equal(publishResolve.ok, true);
  if (!publishResolve.ok) return;

  // "freeform editor render": the authored tree (what the fidelity harness /
  // preview renders). "published render": the publish-resolved tree. Same
  // dataSources both sides.
  const editorHtml = renderTree(SHOWCASE_TREE, { dataSources: FULL_DATA_SOURCES });
  const publishedHtml = renderTree(publishResolve.tree, { dataSources: FULL_DATA_SOURCES });

  assert.equal(editorHtml, publishedHtml, "editor and published render identically");

  // Presence guards — prove the equality above is NOT two empty renders.
  // media src resolved from the library asset (not the raw fallback).
  assert.ok(publishedHtml.includes("portrait.webp"), "media library src resolved");
  assert.ok(!publishedHtml.includes("raw-fallback.jpg"), "raw fallback did not win");
  assert.ok(
    publishedHtml.includes(`data-builder-media-id="${MEDIA_ID}"`),
    "media id marker present",
  );
  // code node: exactly one opaque-origin sandboxed iframe, scripts-only.
  assert.equal((publishedHtml.match(/<iframe/g) ?? []).length, 1, "single code iframe");
  assert.ok(publishedHtml.includes('sandbox="allow-scripts"'), "scripts-only sandbox");
  assert.ok(!publishedHtml.includes("allow-same-origin"), "no same-origin escape");
  // repeater: one card per collection item, bound text replacing the fallback.
  assert.equal(
    (publishedHtml.match(/data-builder-node-kind="card"/g) ?? []).length,
    3,
    "three bound repeater cards",
  );
  assert.ok(
    publishedHtml.includes(">Ana<") && publishedHtml.includes(">Bea<") && publishedHtml.includes(">Cleo<"),
    "bound names rendered",
  );
  assert.ok(publishedHtml.includes('href="/t/ana"'), "bound href rendered");
});

test("parity: render mode 'all' and 'freeform' agree on the P3 node kinds", () => {
  // The interactive editor canvas may render in mode 'all' while published uses
  // 'freeform'. None of the P3 kinds are editor-only (role) nodes, so the two
  // modes must produce identical markup for them — otherwise the canvas and the
  // published page would drift.
  const allHtml = renderTree(SHOWCASE_TREE, { mode: "all", dataSources: FULL_DATA_SOURCES });
  const freeformHtml = renderTree(SHOWCASE_TREE, { mode: "freeform", dataSources: FULL_DATA_SOURCES });
  assert.equal(allHtml, freeformHtml, "mode does not drift the P3 node kinds");
});

test("parity negative control: the test has teeth — dropping a threaded dataSource diverges the published render", () => {
  // Mirrors the real asymmetry: PublishedShell.tsx:307 threads only
  // `{ mediaAssets }`, while homepage-cms-sections.tsx:470 threads collections
  // too. With collections withheld, the repeater collapses to a single fallback
  // card (render.tsx renderRepeatContainerChildren: items.length === 0 →
  // template rendered once), so the published render MUST diverge from the
  // full-dataSources editor render. This proves the parity assertion above is
  // not vacuously comparing two empty/equal renders.
  const publishResolve = resolveSnapshotBuilderTreeForPublish({ slots: [], builderTree: SHOWCASE_TREE });
  assert.equal(publishResolve.ok, true);
  if (!publishResolve.ok) return;

  const editorHtml = renderTree(SHOWCASE_TREE, { dataSources: FULL_DATA_SOURCES });
  const publishedMissingCollections = renderTree(publishResolve.tree, {
    dataSources: { mediaAssets: FULL_DATA_SOURCES.mediaAssets },
  });

  assert.notEqual(editorHtml, publishedMissingCollections, "withholding collections diverges the render");
  assert.equal(
    (publishedMissingCollections.match(/data-builder-node-kind="card"/g) ?? []).length,
    1,
    "repeater collapses to a single fallback card without collections",
  );
  assert.ok(
    publishedMissingCollections.includes("Fallback name"),
    "fallback design text shows when the collection is missing",
  );
  assert.ok(!publishedMissingCollections.includes(">Ana<"), "no bound names without the collection");
});

// ── W1-T2 — linked style classes: editor (registry threaded) ↔ published
//    (registry BAKED) parity ──────────────────────────────────────────────────
//
// The editor canvas threads the LIVE registry into renderBuilderNodes
// (client-builder-canvas.tsx:101, W1-T2c). The publish path BAKES the registry
// into the snapshot via resolveBuilderTreeClassRefs (homepage.ts, W1-T2a) and
// the public page renders that baked tree with NO registry. These two renders
// MUST be byte-identical — that is the definition of "classes publish."

const LINKED_REGISTRY: BuilderStyleClassRegistry = ((
  ...classes: BuilderStyleClass[]
): BuilderStyleClassRegistry => {
  const out: Record<string, BuilderStyleClass> = {};
  for (const c of classes) out[c.id] = c;
  return out;
})({
  id: "promo",
  name: "Promo",
  style: { textColor: "#cc0000", fontWeight: 800 },
});

const LINKED_TREE: BuilderNodeTree = [
  {
    id: "linked-heading",
    kind: "heading",
    // The block carries ONLY a classRef plus one local override that must win
    // over the class (fontWeight 600 beats the class's 800).
    props: { text: "Member offer", level: 2, style: { classRef: "promo", fontWeight: 600 } },
  },
];

/** Isolate the linked heading's OPENING tag so presence guards assert on ITS
 *  inline style, not on the renderer's global keyframes/stylesheet block (which
 *  contains unrelated weight/color tokens). Mirrors classes-publish-parity. */
function linkedHeadingTag(html: string): string {
  return (html.match(/<h2[^>]*>/) ?? ["<no-heading>"])[0];
}

test("parity (W1-T2 linked class): editor-with-registry == published-baked-without-registry", () => {
  // EDITOR canvas path — registry threaded at render time.
  const editorHtml = renderTree(LINKED_TREE, { styleClasses: LINKED_REGISTRY });

  // PUBLISH path — resolveBuilderTreeClassRefs is the exact transform
  // publishHomepage now runs before writing the snapshot; the public page then
  // renders the baked tree with NO registry.
  const bakedTree = resolveBuilderTreeClassRefs(LINKED_TREE, LINKED_REGISTRY);
  const publishedHtml = renderTree(bakedTree /* no styleClasses — mirrors public render */);

  // THE parity contract: the two renders are byte-identical.
  assert.equal(editorHtml, publishedHtml, "linked-class editor and published render identically");

  // Presence guards on the heading's OWN inline style — prove the equality is
  // not two empty/unstyled renders.
  const tag = linkedHeadingTag(publishedHtml);
  assert.ok(/color:#cc0000/i.test(tag), "baked class textColor reaches the published heading style");
  assert.ok(/font-weight:600/.test(tag), "the node's local override (600) wins over the class (800)");
  assert.ok(!/font-weight:800/.test(tag), "the class fontWeight is overridden in the inline style, not emitted");
  // No dangling classRef survives into the baked tree (it would resolve to
  // nothing on the registry-less public render).
  assert.equal(
    "classRef" in ((bakedTree[0] as Extract<BuilderNode, { kind: "heading" }>).props.style ?? {}),
    false,
    "classRef stripped from the baked published tree",
  );
});

test("parity negative control (W1-T2): WITHOUT baking, the published render LOSES the class style", () => {
  // The pre-W1 bug, pinned as a teeth check: if publish did NOT bake (tree kept
  // its bare classRef) and the public render has no registry, the class color is
  // silently dropped → the published render diverges from the editor render.
  const editorTag = linkedHeadingTag(renderTree(LINKED_TREE, { styleClasses: LINKED_REGISTRY }));
  const unbakedTag = linkedHeadingTag(renderTree(LINKED_TREE /* bare classRef, no registry */));

  assert.notEqual(editorTag, unbakedTag, "unbaked publish heading diverges from the editor heading");
  assert.ok(/color:#cc0000/i.test(editorTag), "editor heading HAS the class color");
  assert.ok(!/color:#cc0000/i.test(unbakedTag), "class color absent from the heading when publish does not bake");
});
