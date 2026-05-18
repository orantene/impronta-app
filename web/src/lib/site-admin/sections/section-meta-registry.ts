/**
 * P0-6 — consolidated. This file no longer holds a parallel meta map; it
 * derives section meta from the single canonical `SECTION_REGISTRY`
 * (registry.ts). The public API (`getSectionMeta`, `listSectionMetaKeys`)
 * is unchanged so existing consumers/tests are unaffected — there is now
 * exactly one source of truth for section meta.
 */
import { SECTION_REGISTRY, getSectionType } from "./registry";
import type { SectionMeta } from "./types";

export function getSectionMeta(key: string): SectionMeta | null {
  return getSectionType(key)?.meta ?? null;
}

export function listSectionMetaKeys(): ReadonlyArray<string> {
  return Object.keys(SECTION_REGISTRY).sort();
}
