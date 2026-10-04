import assert from "node:assert/strict";
import test from "node:test";

import { ES_TEXT } from "@/components/edit-chrome/editor-i18n-es";
import {
  getAddGalleryCardInfoTooltip,
  getAddGalleryCardShortDescription,
} from "./card-display";
import { ADD_GALLERY_CATEGORIES, ADD_GALLERY_ITEMS } from "./registry";

test("every add-gallery category has a Spanish label", () => {
  const missing = ADD_GALLERY_CATEGORIES.map((c) => c.label).filter((l) => !(l in ES_TEXT));
  assert.deepEqual(missing, []);
});

test("every add-gallery card title, description and tooltip has a Spanish label", () => {
  const missing = new Set<string>();
  for (const item of ADD_GALLERY_ITEMS) {
    const strings = [
      item.label,
      getAddGalleryCardShortDescription(item),
      getAddGalleryCardInfoTooltip(item),
    ];
    for (const s of strings) if (s && !(s in ES_TEXT)) missing.add(s);
  }
  assert.deepEqual([...missing], []);
});
