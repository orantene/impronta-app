import assert from "node:assert/strict";
import test from "node:test";

import {
  AddGalleryForbiddenInsertError,
  assertAddGalleryBuilderTreeOnly,
  resolveAddGalleryInsertAction,
} from "./insert";
import type { AddGalleryItem } from "./types";

const baseItem: AddGalleryItem = {
  id: "test",
  label: "Test",
  description: "Test item",
  tab: "elements",
  category: "text",
  icon: "text",
  previewType: "icon-card",
  itemKind: "static",
  insertMethod: "nativeNode",
  dragSupported: true,
  availability: "available",
  sourceType: "native-freeform",
  nativeKind: "paragraph",
};

test("assertAddGalleryBuilderTreeOnly throws for legacyCompositionSlot", () => {
  assert.throws(
    () =>
      assertAddGalleryBuilderTreeOnly({
        id: "legacy",
        insertMethod: "legacyCompositionSlot",
      }),
    AddGalleryForbiddenInsertError,
  );
});

test("assertAddGalleryBuilderTreeOnly throws for cmsPageSectionSlot", () => {
  assert.throws(
    () =>
      assertAddGalleryBuilderTreeOnly({
        id: "cms",
        insertMethod: "cmsPageSectionSlot",
      }),
    AddGalleryForbiddenInsertError,
  );
});

test("resolveAddGalleryInsertAction returns native node for paragraph", () => {
  const action = resolveAddGalleryInsertAction(baseItem);
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    assert.equal(action.node.kind, "paragraph");
  }
});

test("resolveAddGalleryInsertAction returns noop for coming soon", () => {
  const action = resolveAddGalleryInsertAction({
    ...baseItem,
    insertMethod: "disabledComingSoon",
    availability: "coming-soon",
    sourceType: "coming-soon",
  });
  assert.equal(action.type, "noop");
});

test("resolveAddGalleryInsertAction builds hero section template", () => {
  const action = resolveAddGalleryInsertAction({
    ...baseItem,
    id: "sec-hero",
    insertMethod: "sectionTemplate",
    sectionTemplateId: "hero",
  });
  assert.equal(action.type, "sectionTemplate");
  if (action.type === "sectionTemplate") {
    assert.equal(action.node.kind, "section");
  }
});
