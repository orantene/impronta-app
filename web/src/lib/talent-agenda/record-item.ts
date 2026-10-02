/**
 * F60: the booking record reads its item from the agenda the talent layout
 * loaded. A booking saved a moment ago (New booking → "Booking saved" → soft
 * nav to /talent/bookings/<id>) is not in that snapshot yet, and the record
 * used to render a stub ("Booking", "No service set", When "-"). Pure helpers
 * for the fallback read.
 */
import type { TalentAgendaItem, TalentAgendaRange } from "./types";

const DAY_MS = 86_400_000;

/** The agenda item for this record, or null when the layout snapshot does not have it. */
export function agendaItemFromSnapshot(
  items: readonly TalentAgendaItem[] | null | undefined,
  bookingId: string | null | undefined,
): TalentAgendaItem | null {
  if (!bookingId) return null;
  return (items ?? []).find((item) => item.id === bookingId) ?? null;
}

/** A one-day window either side of the booking's start, for a single-item agenda read. */
export function agendaWindowAround(startsAtIso: string): TalentAgendaRange | null {
  const t = Date.parse(startsAtIso);
  if (!Number.isFinite(t)) return null;
  return { from: new Date(t - DAY_MS), to: new Date(t + DAY_MS) };
}
