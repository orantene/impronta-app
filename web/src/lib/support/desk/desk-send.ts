/**
 * Client send guard for Desk replies (journeys 26–27).
 * Prevents double-submit while in flight; retries reuse the same send key.
 */

export type DeskSendAttempt = {
  key: string;
  ticketId: string;
  body: string;
  asInternalNote: boolean;
  status: "inflight" | "failed" | "ok";
};

export function newDeskSendKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `desk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Start or retry a send. Returns null when a matching inflight attempt exists
 * (caller must not fire a second network request).
 */
export function beginDeskSend(args: {
  previous: DeskSendAttempt | null;
  ticketId: string;
  body: string;
  asInternalNote: boolean;
  /** Force a new key (fresh compose). */
  fresh?: boolean;
}): DeskSendAttempt | null {
  const body = args.body.trim();
  if (!body) return null;
  if (
    args.previous &&
    !args.fresh &&
    args.previous.status === "inflight" &&
    args.previous.ticketId === args.ticketId &&
    args.previous.body === body &&
    args.previous.asInternalNote === args.asInternalNote
  ) {
    return null;
  }
  const reuse =
    args.previous &&
    !args.fresh &&
    args.previous.status === "failed" &&
    args.previous.ticketId === args.ticketId &&
    args.previous.body === body &&
    args.previous.asInternalNote === args.asInternalNote
      ? args.previous.key
      : newDeskSendKey();
  return {
    key: reuse,
    ticketId: args.ticketId,
    body,
    asInternalNote: args.asInternalNote,
    status: "inflight",
  };
}
