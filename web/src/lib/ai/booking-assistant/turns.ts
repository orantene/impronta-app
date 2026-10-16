/**
 * system_event_type values the turn ceiling and the handoff check read.
 * The prior-events query filters to these so unrelated system events
 * (payments, status changes) can never push an assistant row out of the
 * 40-row window and silently reset the ceiling or the handoff check.
 */
export const BOOKING_ASSISTANT_EVENT_TYPES = [
  "booking_assistant_reply",
  "booking_assistant_handoff",
] as const;

/** Hard ceiling on AI replies per booking inquiry (design D4 / PM: 8). */
export const BOOKING_ASSISTANT_TURN_CEILING = 8;

export function countBookingAssistantTurns(
  messages: ReadonlyArray<{ systemEventType?: string | null; authorKind?: string | null }>,
): number {
  return messages.filter(
    (m) =>
      m.systemEventType === "booking_assistant_reply" ||
      m.systemEventType === "booking_assistant_handoff" ||
      m.authorKind === "booking_assistant",
  ).length;
}

export function bookingAssistantTurnCeilingReached(aiTurnCount: number): boolean {
  return aiTurnCount >= BOOKING_ASSISTANT_TURN_CEILING;
}
