/** Unconverted guest tickets (no account) are purged after this window. */
export const GUEST_TICKET_RETENTION_DAYS = 90;

export function guestTicketRetentionCutoff(nowMs: number = Date.now()): string {
  return new Date(nowMs - GUEST_TICKET_RETENTION_DAYS * 864e5).toISOString();
}

export function isUnconvertedGuestExpired(input: {
  surface: string;
  requesterUserId: string | null;
  createdAt: string;
  nowMs?: number;
}): boolean {
  if (input.surface !== "guest") return false;
  if (input.requesterUserId) return false;
  const cutoff = Date.parse(guestTicketRetentionCutoff(input.nowMs ?? Date.now()));
  return Date.parse(input.createdAt) <= cutoff;
}
