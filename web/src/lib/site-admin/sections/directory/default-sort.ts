import type { DirectoryV1 } from "./schema";

/**
 * The sort values the cached first-page reader accepts — a narrower set than
 * the engine's `DirectorySortValue` (no `top_rated`, which is gated on the
 * reviews entitlement and never seeded server-side).
 */
export type DirectorySeedSortValue =
  | "recommended"
  | "featured"
  | "recent"
  | "updated";

/**
 * Map the section's editor-facing `defaultSort` onto an engine sort value.
 *
 * Pure + framework-free on purpose: BOTH the server section (seeding the SSR
 * first page) and the client island (building its query key) must resolve the
 * default identically, or the seed never matches the first client key and the
 * server-rendered rows are discarded on hydration.
 */
export function mapDirectoryDefaultSort(
  s: DirectoryV1["defaultSort"],
): DirectorySeedSortValue {
  if (s === "newest") return "recent";
  if (s === "recommended") return "recommended";
  // az / availability / curated → fall back honestly to recommended
  return "recommended";
}
