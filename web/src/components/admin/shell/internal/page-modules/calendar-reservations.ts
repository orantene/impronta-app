/**
 * TUL-1841: the table reservations the Resources (day) view draws. The loader reads them from
 * `admissions` (kind "reservation") and stamps the venue-local day in `event_date`; the board used to
 * look only at holds and so never showed a booked table. Pure.
 */
export const RESERVATION_MINUTES = 90;

type EventLike = { id: string; kind?: string; starts_at?: string | null; event_date: string; contact_name: string; timezone?: string | null };

export function reservationsOnDay<T extends EventLike>(events: readonly T[], day: string): Array<T & { starts_at: string }> {
  return events.filter((e): e is T & { starts_at: string } => e.kind === "reservation" && !!e.starts_at && e.event_date.slice(0, 10) === day);
}
