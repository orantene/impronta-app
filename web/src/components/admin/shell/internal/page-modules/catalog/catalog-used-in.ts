/**
 * TUL-1271 #11 — where an item is actually sold, read from the row (the same
 * two channels `itemChannels` knows), so the editor's "Used in" line is never a
 * hard-coded count. A draft is used nowhere.
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { itemChannels } from "./catalog-model";

export type UsedInChannel = "pos" | "web";

export function usedInChannels(o: Pick<TalentOffering, "status" | "visibility">): UsedInChannel[] {
  const ch = itemChannels(o);
  const out: UsedInChannel[] = [];
  if (ch.includes("pos")) out.push("pos");
  if (ch.includes("website")) out.push("web");
  return out;
}
