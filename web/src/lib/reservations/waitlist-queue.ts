/**
 * Reservation waitlist queue behind today's boolean.
 */

export type ReservationWaitlistEntry = {
  id: string;
  spaceId: string;
  partySize: number;
  preferenceOnly: boolean;
  createdAt: string;
};

export function nextWaitlistParty(
  queue: readonly ReservationWaitlistEntry[],
  freeSeats: number,
): ReservationWaitlistEntry | null {
  const fit = [...queue]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .find((e) => e.partySize <= freeSeats);
  return fit ?? null;
}
