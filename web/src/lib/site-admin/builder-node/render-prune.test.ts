/**
 * Tests for HYGIENE-1 Q5 — isRenderableEmptySection (render-prune.ts).
 *
 * Verifies the conservative prune predicate:
 *  - A repeater container with an empty resolved collection AND no static
 *    fallback children IS pruned (returns true).
 *  - A repeater container with a non-empty collection is NOT pruned.
 *  - A repeater container with static fallback children is NOT pruned even
 *    when the collection is empty.
 *  - A non-repeater container is never pruned.
 *  - A non-container node is never pruned.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "./types";
import type { BuilderNodeRenderDataSources } from "./render";
import { isRenderableEmptySection } from "./render-prune";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal repeater container node. */
function repeaterContainer(
  id: string,
  sourceKey: string,
  children: BuilderNode[] = [],
): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: { sourceKey, mode: "bound", repeat: true, maxItems: 6 },
    },
    children,
  } as unknown as BuilderNode;
}

/** Build a non-repeater container (bound but NOT repeat). */
function boundContainer(id: string, sourceKey: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: { sourceKey, mode: "bound", repeat: false },
    },
    children: [],
  } as unknown as BuilderNode;
}

/** Build a minimal heading node. */
function heading(text: string): BuilderNode {
  return {
    id: "heading-1",
    kind: "heading",
    props: { text, level: 2 },
  } as unknown as BuilderNode;
}

/** Build a minimal image node. */
function image(src: string): BuilderNode {
  return {
    id: "img-1",
    kind: "image",
    props: { src, alt: "photo" },
  } as unknown as BuilderNode;
}

/** Build a minimal button node. */
function button(label: string, href: string): BuilderNode {
  return {
    id: "btn-1",
    kind: "button",
    props: { label, href },
  } as unknown as BuilderNode;
}

// ---------------------------------------------------------------------------
// dataSources fixtures
// ---------------------------------------------------------------------------

/** Empty custom collection for a given source key. */
function emptyCollection(sourceKey: string): BuilderNodeRenderDataSources {
  return { collections: { [sourceKey]: [] } };
}

/** Non-empty custom collection. */
function nonEmptyCollection(
  sourceKey: string,
): BuilderNodeRenderDataSources {
  return {
    collections: {
      [sourceKey]: [{ id: "item-1", title: "Work item 1", imageUrl: "https://cdn.example/1.jpg" }],
    },
  };
}

/** Empty dataSources (nothing injected). */
const EMPTY_SOURCES: BuilderNodeRenderDataSources = {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("Q5 — repeater with empty known collection AND no children IS pruned", () => {
  const node = repeaterContainer("gallery-grid", "agency_work");
  const sources = emptyCollection("agency_work");
  assert.equal(
    isRenderableEmptySection(node, sources),
    true,
    "empty collection + no children should be pruned",
  );
});

test("Q5 — repeater with non-empty collection is NOT pruned", () => {
  const node = repeaterContainer("gallery-grid", "agency_work");
  const sources = nonEmptyCollection("agency_work");
  assert.equal(
    isRenderableEmptySection(node, sources),
    false,
    "non-empty collection → keep the section",
  );
});

test("Q5 — repeater with empty collection but static heading child is NOT pruned", () => {
  const node = repeaterContainer("gallery-grid", "agency_work", [
    heading("Selected work"),
  ]);
  const sources = emptyCollection("agency_work");
  assert.equal(
    isRenderableEmptySection(node, sources),
    false,
    "has a non-empty heading child → manual fallback → keep",
  );
});

test("Q5 — repeater with empty collection and empty-text heading IS pruned", () => {
  // A heading with an empty text string is not real content.
  const node = repeaterContainer("gallery-grid", "agency_work", [
    heading(""),
  ]);
  const sources = emptyCollection("agency_work");
  assert.equal(
    isRenderableEmptySection(node, sources),
    true,
    "empty-text heading is not real content → prune",
  );
});

test("Q5 — repeater with empty collection but image child with src is NOT pruned", () => {
  const node = repeaterContainer("gallery-grid", "store_gallery", [
    image("https://cdn.example/cover.jpg"),
  ]);
  const sources = emptyCollection("store_gallery");
  assert.equal(
    isRenderableEmptySection(node, sources),
    false,
    "has an image with src → manual fallback → keep",
  );
});

test("Q5 — repeater with empty collection but image with empty src IS pruned", () => {
  const node = repeaterContainer("gallery-grid", "store_gallery", [
    image(""),
  ]);
  const sources = emptyCollection("store_gallery");
  assert.equal(
    isRenderableEmptySection(node, sources),
    true,
    "empty src image is not content → prune",
  );
});

test("Q5 — repeater with empty collection and button with label is NOT pruned", () => {
  const node = repeaterContainer("cta-grid", "saas_capabilities", [
    button("See more", "/more"),
  ]);
  const sources = emptyCollection("saas_capabilities");
  assert.equal(
    isRenderableEmptySection(node, sources),
    false,
    "button with label/href is manual content → keep",
  );
});

test("Q5 — non-repeater bound container is NEVER pruned", () => {
  const node = boundContainer("featured-section", "featured_talent_profiles");
  const sources = emptyCollection("featured_talent_profiles");
  assert.equal(
    isRenderableEmptySection(node, sources),
    false,
    "non-repeater container must never be pruned by this guard",
  );
});

test("Q5 — non-container node is NEVER pruned", () => {
  const hNode = heading("Services & focus") as BuilderNode;
  assert.equal(
    isRenderableEmptySection(hNode, EMPTY_SOURCES),
    false,
    "non-container node must never be pruned",
  );
});

test("Q5 — well-known empty built-in source (featured_talent_profiles) IS pruned", () => {
  const node = repeaterContainer("talent-grid", "featured_talent_profiles");
  const sources: BuilderNodeRenderDataSources = {
    featuredTalentProfiles: [],
  };
  assert.equal(
    isRenderableEmptySection(node, sources),
    true,
    "empty built-in featured_talent_profiles → prune",
  );
});

test("Q5 — well-known non-empty built-in source is NOT pruned", () => {
  const node = repeaterContainer("talent-grid", "featured_talent_profiles");
  const sources: BuilderNodeRenderDataSources = {
    featuredTalentProfiles: [
      {
        id: "t1",
        profileCode: "TAL-001",
        slugPart: null,
        displayName: "Sofía",
        primaryTalentTypeLabel: "Model",
        secondaryTalentTypeLabel: null,
        locationLabel: "CDMX",
        thumbnailUrl: "https://cdn.example/t1.jpg",
        isFeatured: true,
      },
    ],
  };
  assert.equal(
    isRenderableEmptySection(node, sources),
    false,
    "non-empty built-in featured_talent_profiles → keep",
  );
});

test("Q5 — unknown source key is NOT pruned (conservative)", () => {
  // An unrecognised source key is treated as 'not inspectable' — keep it.
  const node = repeaterContainer("my-grid", "some_future_source_type");
  assert.equal(
    isRenderableEmptySection(node, EMPTY_SOURCES),
    false,
    "unknown source key → conservative: do not prune",
  );
});

test("Q5 — empty dataSources with no collection for the key: unknown → NOT pruned", () => {
  // If dataSources is empty and the key is not a built-in, we can't know if the
  // source is empty (caller may not have injected it yet). Do not prune.
  const node = repeaterContainer("items-grid", "conf_speakers");
  assert.equal(
    isRenderableEmptySection(node, EMPTY_SOURCES),
    false,
    "empty dataSources + non-built-in source → conservative: do not prune",
  );
});

test("Q5 — empty dataSources for built-in cms_page source IS pruned", () => {
  // cms_page and cms_posts are always injected via collections when present;
  // if absent, the data was not provided → treat as empty.
  const node = repeaterContainer("nav-pages", "cms_page");
  assert.equal(
    isRenderableEmptySection(node, EMPTY_SOURCES),
    true,
    "cms_page with no injection → treat as empty → prune",
  );
});

test("Q5 — deeply nested static content within a child container is NOT pruned", () => {
  // A child container that itself has a heading child with real text.
  const childContainer: BuilderNode = {
    id: "child",
    kind: "container",
    props: { layout: "stack" },
    children: [heading("Work item title")],
  } as unknown as BuilderNode;
  const node = repeaterContainer("gallery", "agency_work", [childContainer]);
  const sources = emptyCollection("agency_work");
  assert.equal(
    isRenderableEmptySection(node, sources),
    false,
    "nested static heading under child container → has content → keep",
  );
});
