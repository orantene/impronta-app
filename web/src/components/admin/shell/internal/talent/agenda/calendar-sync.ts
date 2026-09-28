import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import type { IcsEventInput } from "@/lib/ui/ics";

/**
 * Calendar sync helpers (pure). The Download section of the Calendar sync panel
 * builds its .ics file client-side from the agenda items already loaded, so it
 * needs no backend. Requests, cancelled and expired holds are left out: a
 * download is "what is on my calendar", not "everything anyone asked for".
 */

const EXCLUDED_BOOKING = new Set(["requested", "cancelled", "hold_expired"]);

export function exportableItems(
  items: readonly TalentAgendaItem[],
  from: Date,
  to: Date,
): TalentAgendaItem[] {
  const lo = from.getTime();
  const hi = to.getTime();
  return items
    .filter((item) => {
      if (item.kind === "request" || item.kind === "deadline") return false;
      if (EXCLUDED_BOOKING.has(item.booking)) return false;
      const start = new Date(item.startsAt).getTime();
      const end = new Date(item.endsAt).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
      return start < hi && end > lo;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function agendaItemToIcs(item: TalentAgendaItem, blockedLabel = "Blocked"): IcsEventInput {
  const summary = item.kind === "block" ? item.title || blockedLabel : item.title;
  return {
    uid: `${item.ref?.table ?? "agenda"}-${item.ref?.id ?? item.id}`,
    summary,
    location: item.where?.label || undefined,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
  };
}

/** Range for the "this week" / "this month" download. */
export function downloadRange(
  anchor: Date,
  span: "week" | "month",
  weekStart: Date,
): { from: Date; to: Date } {
  if (span === "week") {
    const from = new Date(weekStart);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }
  return {
    from: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
    to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1),
  };
}
