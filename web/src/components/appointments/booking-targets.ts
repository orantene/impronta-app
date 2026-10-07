// TUL-77 (#37): pure helpers for the "Whose hours" list.
/** Dispatch on `window` after adding a person or resource. */
export const BOOKING_TARGETS_CHANGED = "tulala:booking-targets-changed";

/** Keep the current pick when it still exists; else the first target. */
export function pickSelectedAfterRefresh(
  cur: string | null,
  targets: ReadonlyArray<{ id: string }>,
): string | null {
  if (cur && targets.some((row) => row.id === cur)) return cur;
  if (cur && targets.length === 0) return cur;
  return targets[0]?.id ?? null;
}
