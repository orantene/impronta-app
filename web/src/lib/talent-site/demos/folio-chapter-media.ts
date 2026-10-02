/**
 * Folio chapter II media for Mateo (TAL-93011).
 *
 * The mockup (design-references/folio/content.json) opens chapter II with
 * f-d-stride (landscape lead), then f-d-feet, then f-d-shirt. The Folio chapters read the
 * talent gallery in sort order (chapter I = slots 0-2, chapter II = slots 3-5), so the
 * demo must hold those three images at gallery slots 3, 4 and 5. Pure planner: the apply
 * script (scripts/folio-apply-mateo-chapter2.mts) does the I/O. Idempotent: rows already
 * carrying `metadata.folio_image_key` are matched by key and never uploaded twice.
 */
export const FOLIO_CHAPTER2_FIRST_SLOT = 3;

/** Mockup order; files live in web/design-references/folio/img/<key>.jpg. */
export const FOLIO_CHAPTER2_KEYS = ["f-d-stride", "f-d-feet", "f-d-shirt"] as const;
export type FolioChapter2Key = (typeof FOLIO_CHAPTER2_KEYS)[number];

export interface GalleryRow {
  id: string;
  sort_order: number;
  metadata: Record<string, unknown> | null;
}

export interface Chapter2Plan {
  /** Keys with no media row yet: upload, then insert at `sort_order`. */
  upload: { key: FolioChapter2Key; sort_order: number }[];
  /** Existing rows to move to a new sort order (existing chapter II keyed rows, then displaced rows). */
  reorder: { id: string; sort_order: number }[];
}

const keyOf = (r: GalleryRow) => (r.metadata?.folio_image_key as string | undefined) ?? null;

/** `gallery` = Mateo's variant_kind "gallery" rows. */
export function planFolioChapter2(gallery: GalleryRow[]): Chapter2Plan {
  const sorted = [...gallery].sort((a, b) => a.sort_order - b.sort_order);
  const byKey = new Map(sorted.filter((r) => keyOf(r)).map((r) => [keyOf(r)!, r]));
  const reorder: Chapter2Plan["reorder"] = [];
  const upload: Chapter2Plan["upload"] = [];
  const slot = (i: number) => FOLIO_CHAPTER2_FIRST_SLOT + i;
  const wanted = new Set<string>(FOLIO_CHAPTER2_KEYS);
  // Everything that is not a chapter II image keeps its relative order, pushed after slot 5 if it sat in 3..5.
  const others = sorted.filter((r) => !wanted.has(keyOf(r) ?? ""));
  let next = slot(FOLIO_CHAPTER2_KEYS.length);
  for (const r of others) {
    if (r.sort_order >= FOLIO_CHAPTER2_FIRST_SLOT) {
      if (r.sort_order !== next) reorder.push({ id: r.id, sort_order: next });
      next += 1;
    }
  }
  FOLIO_CHAPTER2_KEYS.forEach((k, i) => {
    const have = byKey.get(k);
    if (!have) upload.push({ key: k, sort_order: slot(i) });
    else if (have.sort_order !== slot(i)) reorder.push({ id: have.id, sort_order: slot(i) });
  });
  return { upload, reorder };
}
