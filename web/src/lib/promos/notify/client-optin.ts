/**
 * Past-client messages (L10) are opt-in only. This is the gate and the cap, NOT a sender:
 * nothing in v1 sends. A client who did not opt in is never messaged; an opted-in client
 * gets at most MONTHLY_CAP messages per talent per calendar month.
 */
export const MONTHLY_CAP = 2;

export type ClientMessageCheck = {
  /** Explicit opt-in recorded for this talent (unchecked checkbox ticked, or "Avísame"). */
  optedIn: boolean;
  /** Not unsubscribed since the opt-in. */
  unsubscribed?: boolean;
  /** Messages already sent to this client by this talent this calendar month. */
  sentThisMonth: number;
};

export type ClientMessageVerdict = { ok: true; remaining: number } | { ok: false; reason: "not_opted_in" | "unsubscribed" | "monthly_cap" };

export function canMessageClient(c: ClientMessageCheck): ClientMessageVerdict {
  if (!c.optedIn) return { ok: false, reason: "not_opted_in" };
  if (c.unsubscribed) return { ok: false, reason: "unsubscribed" };
  if (c.sentThisMonth >= MONTHLY_CAP) return { ok: false, reason: "monthly_cap" };
  return { ok: true, remaining: MONTHLY_CAP - c.sentThisMonth };
}
