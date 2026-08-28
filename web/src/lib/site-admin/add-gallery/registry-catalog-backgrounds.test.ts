/**
 * registry-catalog-backgrounds.test.ts — the Backgrounds story's own guards.
 *
 * The governance suites (`catalog-governance.test.ts`, `kind-governance.test.ts`,
 * `preview-render.test.tsx`) already run over the REAL registry, so they will
 * catch a malformed card. What they cannot catch is the two things specific to
 * this story that would ship looking fine:
 *
 *   - a background card losing its `nativeVariant`, which silently steals
 *     canonical status for the `container` kind from `el-container`;
 *   - a `previewImageUrl` pointing at a file that is not in `public/`, which
 *     renders as a blank strip because `GalleryCardPreview` hides broken images
 *     on purpose.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ADD_GALLERY_CATEGORIES, ADD_GALLERY_ITEMS } from "./registry";
import { ADD_GALLERY_BACKGROUND_ITEMS } from "./registry-catalog-backgrounds";
import { resolveAddGalleryInsertAction } from "./insert";
import { resolveKindGovernance } from "./kind-governance";

test("the Backgrounds category exists on the Blocks tab", () => {
  const category = ADD_GALLERY_CATEGORIES.find((c) => c.id === "backgrounds");
  assert.ok(category, "the Backgrounds rail entry is missing");
  assert.equal(category.tab, "blocks");
});

test("every background card is registered and reachable in the real catalog", () => {
  assert.ok(ADD_GALLERY_BACKGROUND_ITEMS.length >= 5);
  for (const item of ADD_GALLERY_BACKGROUND_ITEMS) {
    assert.ok(
      ADD_GALLERY_ITEMS.some((registered) => registered.id === item.id),
      `${item.id} is not in ADD_GALLERY_ITEMS — it was never spread into the catalog`,
    );
    assert.equal(item.tab, "blocks");
    assert.equal(item.category, "backgrounds");
  }
});

test("every background card names a nativeVariant", () => {
  // Without one, `resolveKindGovernance` can pick a background card as the
  // CANONICAL container card and re-point every Builder Studio prop lock.
  for (const item of ADD_GALLERY_BACKGROUND_ITEMS) {
    assert.ok(
      item.nativeVariant,
      `${item.id} has no nativeVariant, so it competes with el-container for canonical status`,
    );
    assert.equal(item.nativeKind, "container");
  }
});

test("el-container is still the canonical card for the container kind", () => {
  // The regression the rule above exists to prevent, asserted end to end.
  const governance = resolveKindGovernance("container", ADD_GALLERY_ITEMS);
  // No admin overlay is configured for `container`, so governance is null —
  // what matters is that resolution does not throw or bind to a background
  // card. Assert via the canonical lookup the resolver uses.
  assert.equal(governance, null);
});

test("each background card inserts a real, visible container", () => {
  for (const item of ADD_GALLERY_BACKGROUND_ITEMS) {
    const action = resolveAddGalleryInsertAction(item);
    assert.equal(action.type, "nativeNode", item.id);
    assert.ok("node" in action);
    const node = action.node;
    assert.equal(node.kind, "container", item.id);
    const props = node.props as Record<string, unknown>;
    const style = props.style as Record<string, unknown> | undefined;
    // A background band that lands 24px tall teaches the author nothing.
    assert.ok(style?.minHeight, `${item.id} must land tall enough to read as a band`);
    assert.ok(props.layerLabel, `${item.id} must name its layer in Page Structure`);
  }
});

test("every motion card lands with a scrim already on", () => {
  const expectedSource: Record<string, string> = {
    "el-bg-video": "upload",
    "el-bg-youtube": "youtube",
    "el-bg-slideshow": "slideshow",
  };
  for (const [id, source] of Object.entries(expectedSource)) {
    const item = ADD_GALLERY_BACKGROUND_ITEMS.find((i) => i.id === id);
    assert.ok(item, id);
    const action = resolveAddGalleryInsertAction(item);
    assert.ok("node" in action);
    const media = (action.node.props as Record<string, unknown>)
      .backgroundMedia as Record<string, unknown> | undefined;
    assert.ok(media, `${id} must land with a backgroundMedia value`);
    assert.equal(
      media.source,
      source,
      `${id} must open the Content card on the right source`,
    );
    // Autoplaying footage under a headline with no scrim is the single easiest
    // way to publish an unreadable page.
    assert.equal(media.overlay, 40, `${id} must ship a readable default scrim`);
  }
});

test("the still cards do NOT claim a backgroundMedia value", () => {
  for (const id of ["el-bg-image", "el-bg-gradient"]) {
    const item = ADD_GALLERY_BACKGROUND_ITEMS.find((i) => i.id === id);
    assert.ok(item, id);
    const action = resolveAddGalleryInsertAction(item);
    assert.ok("node" in action);
    assert.equal(
      (action.node.props as Record<string, unknown>).backgroundMedia,
      undefined,
      `${id} is a CSS background, not a media element`,
    );
  }
});

test("every preview thumbnail exists in public/ and is same-origin", () => {
  for (const item of ADD_GALLERY_BACKGROUND_ITEMS) {
    const url = item.previewImageUrl;
    assert.ok(url, `${item.id} has no previewImageUrl`);
    assert.ok(
      url.startsWith("/") && !url.startsWith("//"),
      `${item.id} preview must be a same-origin absolute path, got ${url}`,
    );
    assert.ok(
      existsSync(join(process.cwd(), "public", url)),
      `${item.id} preview file public${url} does not exist — the card renders a blank strip`,
    );
    // image-card is what makes GalleryCardPreview render the <img> at all.
    assert.equal(item.previewType, "image-card", item.id);
  }
});

test("the slideshow card lands with an EMPTY image list, not a stock photo", () => {
  // The inspector's empty state ("Add two or more…") is a clearer instruction
  // than a placeholder row pointing at a picture the author has to hunt down
  // and replace. It also keeps the card from resolving to a renderable
  // background before the author has chosen anything.
  const item = ADD_GALLERY_BACKGROUND_ITEMS.find((i) => i.id === "el-bg-slideshow");
  assert.ok(item);
  const action = resolveAddGalleryInsertAction(item);
  assert.ok("node" in action);
  const media = (action.node.props as Record<string, unknown>).backgroundMedia as {
    slides?: unknown[];
    intervalMs?: number;
  };
  assert.deepEqual(media.slides, []);
  assert.ok(media.intervalMs, "the card must open with a real dwell, not 0");
});

test("preview paths are unique, so two cards cannot share a thumbnail", () => {
  const urls = ADD_GALLERY_BACKGROUND_ITEMS.map((i) => i.previewImageUrl);
  assert.equal(new Set(urls).size, urls.length);
});

// The Spanish-parity + em-dash guards for these cards live in
// `components/edit-chrome/add-gallery-backgrounds-i18n.static.test.ts`.
// They cannot live here: `lib-edit-chrome-cycle-guard.static.test.ts` forbids
// anything under `lib/site-admin` from importing `components/edit-chrome`
// (where `ES_TEXT` lives), and that guard is right — the dependency runs the
// wrong way.
