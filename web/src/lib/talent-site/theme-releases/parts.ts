/**
 * THEME RELEASES: count merge entries the way a talent thinks about her page.
 *
 * A merge report has one entry per prop path or node, so one hero edit can be
 * ten entries. Talent-facing numbers ("kept your 1 later edit") count DISTINCT
 * PARTS: a top-level section or block, plus one "colours" part for tokens.
 * Pure.
 */
import type { MergeEntry } from "./types";

/** "hero/heading" -> "hero"; every token entry -> "colours". */
export function partOf(e: Pick<MergeEntry, "key" | "change">): string {
  return e.change === "token" ? "colours" : e.key.split("/")[0]!;
}

export function partsOf(entries: ReadonlyArray<Pick<MergeEntry, "key" | "change">>): string[] {
  return [...new Set(entries.map(partOf))];
}

export function countParts(entries: ReadonlyArray<Pick<MergeEntry, "key" | "change">>): number {
  return partsOf(entries).length;
}
