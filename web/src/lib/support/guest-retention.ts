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

/**
 * Client diagnostics (URL, route history, user agent, viewport, console errors,
 * network failures) are attached to every ticket at creation. They cascade when
 * a ticket is deleted — but authenticated tickets are never deleted, so on those
 * the telemetry lived forever.
 *
 * The thread is the support record and is kept. The telemetry is debugging
 * exhaust with a short useful life and the highest privacy weight in the whole
 * support schema, so it ages out on its own clock.
 */
export const DIAGNOSTICS_RETENTION_DAYS = 180;

export function diagnosticsRetentionCutoff(nowMs: number = Date.now()): string {
  return new Date(nowMs - DIAGNOSTICS_RETENTION_DAYS * 864e5).toISOString();
}
