import test from "node:test";
import assert from "node:assert/strict";

import { FOLIO_CHAPTER2_KEYS, planFolioChapter2, type GalleryRow } from "./folio-chapter-media";

const row = (id: string, sort_order: number, key?: string): GalleryRow => ({
  id,
  sort_order,
  metadata: key ? { folio_image_key: key } : {},
});

test("mockup chapter II order is stride (lead), feet, shirt", () => {
  assert.deepEqual([...FOLIO_CHAPTER2_KEYS], ["f-d-stride", "f-d-feet", "f-d-shirt"]);
});

test("Mateo today: three uploads at slots 3-5, displaced stock rows move after them", () => {
  const g = [row("a", 0), row("b", 1), row("c", 2), row("d", 3), row("e", 4), row("f", 5)];
  const p = planFolioChapter2(g);
  assert.deepEqual(p.upload, [
    { key: "f-d-stride", sort_order: 3 },
    { key: "f-d-feet", sort_order: 4 },
    { key: "f-d-shirt", sort_order: 5 },
  ]);
  assert.deepEqual(p.reorder, [
    { id: "d", sort_order: 6 },
    { id: "e", sort_order: 7 },
    { id: "f", sort_order: 8 },
  ]);
});

test("idempotent: once applied, the plan is empty", () => {
  const g = [
    row("a", 0), row("b", 1), row("c", 2),
    row("s", 3, "f-d-stride"), row("fe", 4, "f-d-feet"), row("sh", 5, "f-d-shirt"),
    row("d", 6), row("e", 7), row("f", 8),
  ];
  assert.deepEqual(planFolioChapter2(g), { upload: [], reorder: [] });
});

test("a keyed row in the wrong slot is reordered, not re-uploaded", () => {
  const g = [row("a", 0), row("b", 1), row("c", 2), row("fe", 3, "f-d-feet"), row("s", 4, "f-d-stride"), row("sh", 5, "f-d-shirt")];
  const p = planFolioChapter2(g);
  assert.deepEqual(p.upload, []);
  assert.deepEqual(p.reorder.sort((x, y) => x.id.localeCompare(y.id)), [
    { id: "fe", sort_order: 4 },
    { id: "s", sort_order: 3 },
  ]);
});
