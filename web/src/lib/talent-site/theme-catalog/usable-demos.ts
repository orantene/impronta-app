/**
 * Wave 2: gallery "N demos" counts only selectable (built) demos.
 * Planned tiles stay visible but do not inflate the count.
 */
import type { GalleryDemo } from "./gallery-meta";

export function isUsableDemo(demo: GalleryDemo): boolean {
  return demo.status === "built";
}

export function usableDemos(demos: readonly GalleryDemo[]): GalleryDemo[] {
  return demos.filter(isUsableDemo);
}

export function countUsableDemos(demos: readonly GalleryDemo[]): number {
  return demos.reduce((n, d) => n + (isUsableDemo(d) ? 1 : 0), 0);
}
