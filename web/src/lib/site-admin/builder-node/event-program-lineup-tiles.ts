/**
 * event_program `lineup` layout — who is playing. Pure.
 *
 * Only items that name a performer (or announce one) or carry a cover make a
 * tile: a "Doors" row has no face and does not belong on a lineup wall. A
 * tile without an image shows initials in the heading font; never a glyph.
 */

import type { PublicScheduleItem } from "@/app/(public)/_events/event-program-actions";

export function isLineupItem(item: PublicScheduleItem): boolean {
  const performer = item.performer;
  return Boolean((performer && (performer.name.trim().length > 0 || performer.tba)) || item.coverUrl);
}

export function lineupItems(items: ReadonlyArray<PublicScheduleItem>): PublicScheduleItem[] {
  return items.filter(isLineupItem);
}

/** The name on the tile: the performer, else the item's title. */
export function lineupName(item: PublicScheduleItem, performerTbaLabel: string): string {
  const performer = item.performer;
  if (performer?.name.trim()) return performer.name.trim();
  if (performer?.tba) return performerTbaLabel;
  return item.title;
}

/** "DJ Ana Sofía" → "DA"; "Marco" → "M"; "" → "". Letters and digits only, two at most. */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "";
  const picked = words.length === 1 ? [words[0]!] : [words[0]!, words[words.length - 1]!];
  return picked.map((w) => w[0]!.toUpperCase()).join("");
}
