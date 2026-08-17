/**
 * background-slide-model.ts — the background slideshow list's pure vocabulary.
 *
 * Sibling of `carousel-slide-model.ts`, and deliberately NOT a copy of it: that
 * module derives rows from BuilderNode CHILDREN, this one from a plain
 * `BackgroundSlideProps[]` stored on one node's props. What the two share —
 * "where should the pin land after a removal" — is imported from there rather
 * than reimplemented here.
 *
 * WHY EVERY SLIDE CARRIES AN ID. The rows are drag-reorderable, and a
 * `DraggableList` keyed by array index cannot express a move: after the splice
 * the keys are the same keys in the same order, so React reuses the wrong DOM
 * node and the pinned-row highlight follows the POSITION instead of the image.
 * Two rows can also hold the same URL (duplicate is one click), so the URL is
 * not a key either. An explicit id is the only thing that survives both.
 */

import type { BackgroundSlideProps } from "@/lib/site-admin/builder-node/background-media";

export interface BackgroundSlideModel {
  /** Stable React/drag key — the slide's id, or an index fallback. */
  key: string;
  /** 1-based, for the "Image 3" label. */
  position: number;
  /** The picture, or "" when the row is a placeholder the author has not filled. */
  url: string;
  /** Operator-facing row name. */
  label: string;
}

/**
 * A collision-resistant id that needs no crypto import. Ids are local to one
 * node's prop array (never a database key), so "unique among at most 20
 * siblings written by one operator" is the entire requirement.
 */
export function makeBackgroundSlideId(): string {
  return `bgs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The key for a slide, tolerating values written before ids existed. */
export function backgroundSlideKey(slide: BackgroundSlideProps, index: number): string {
  return slide.id && slide.id.trim() ? slide.id : `idx-${index}`;
}

/**
 * Build the row list. `fallbackLabel` is injected so this module stays free of
 * the i18n hook and can be tested with a one-line fake.
 */
export function buildBackgroundSlideModels(
  slides: readonly BackgroundSlideProps[],
  fallbackLabel: (position: number) => string,
  filename: (url: string) => string,
): BackgroundSlideModel[] {
  return slides.map((slide, index) => {
    const url = typeof slide.url === "string" ? slide.url : "";
    const derived = url ? filename(url).trim() : "";
    return {
      key: backgroundSlideKey(slide, index),
      position: index + 1,
      url,
      label: derived.length > 0 ? derived : fallbackLabel(index + 1),
    };
  });
}

/** Append a picture, always with an id so the row is drag-stable from birth. */
export function appendBackgroundSlide(
  slides: readonly BackgroundSlideProps[],
  slide: Omit<BackgroundSlideProps, "id">,
): BackgroundSlideProps[] {
  return [...slides, { ...slide, id: makeBackgroundSlideId() }];
}

/** Duplicate the slide at `index`, placing the copy directly after it. */
export function duplicateBackgroundSlideAt(
  slides: readonly BackgroundSlideProps[],
  index: number,
): BackgroundSlideProps[] {
  const source = slides[index];
  if (!source) return [...slides];
  const next = [...slides];
  next.splice(index + 1, 0, { ...source, id: makeBackgroundSlideId() });
  return next;
}

export function removeBackgroundSlideAt(
  slides: readonly BackgroundSlideProps[],
  index: number,
): BackgroundSlideProps[] {
  if (index < 0 || index >= slides.length) return [...slides];
  return slides.filter((_, i) => i !== index);
}

/** Replace one slide's fields, leaving its id (and therefore its row) intact. */
export function patchBackgroundSlideAt(
  slides: readonly BackgroundSlideProps[],
  index: number,
  patch: Partial<BackgroundSlideProps>,
): BackgroundSlideProps[] {
  return slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide));
}

/**
 * Re-order to match a key order handed back by `DraggableList`. Keys that the
 * list does not name are dropped and unknown keys ignored, so a stale drag can
 * never invent or duplicate a slide.
 */
export function reorderBackgroundSlides(
  slides: readonly BackgroundSlideProps[],
  keyOrder: readonly string[],
): BackgroundSlideProps[] {
  const byKey = new Map<string, BackgroundSlideProps>();
  slides.forEach((slide, index) => byKey.set(backgroundSlideKey(slide, index), slide));
  const next: BackgroundSlideProps[] = [];
  for (const key of keyOrder) {
    const slide = byKey.get(key);
    if (!slide) continue;
    byKey.delete(key);
    next.push(slide);
  }
  // Anything the drag did not mention keeps its relative order at the end,
  // rather than vanishing.
  for (const slide of byKey.values()) next.push(slide);
  return next;
}

/**
 * Where the pin lands after a drag: on the image the operator just moved, not
 * on whatever slid into the old position.
 */
export function pinAfterReorder(
  keyOrder: readonly string[],
  movedKey: string,
  fallback: number,
): number {
  const index = keyOrder.indexOf(movedKey);
  return index >= 0 ? index : fallback;
}
