import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

import { itemsOnDay } from "./present";

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Where the week should open (minutes from midnight): the earlier of the first
 * working hour and the first timed booking on the visible days, so nothing she
 * has is off screen. Null when there is neither.
 */
export function focusMinutes(
  days: Date[],
  items: readonly TalentAgendaItem[],
  windowsFor: (day: Date) => readonly { startMin: number }[],
): number | null {
  let focus: number | null = null;
  const take = (min: number) => {
    focus = focus == null ? min : Math.min(focus, min);
  };
  for (const day of days) {
    for (const win of windowsFor(day)) take(win.startMin);
    for (const item of itemsOnDay([...items], day)) {
      if (item.kind === "block") continue;
      const at = new Date(item.startsAt);
      if (!Number.isNaN(at.getTime()) && sameLocalDay(at, day)) take(at.getHours() * 60 + at.getMinutes());
    }
  }
  return focus;
}
