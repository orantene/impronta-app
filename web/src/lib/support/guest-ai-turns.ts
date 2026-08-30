/** Hard ceiling on AI replies per guest ticket. Counted from persisted
 *  authorKind === "ai" rows BEFORE the adapter is invoked. */
export const GUEST_AI_TURN_CEILING = 6;

export function countGuestAiTurns(
  messages: ReadonlyArray<{ authorKind: string }>,
): number {
  return messages.filter((m) => m.authorKind === "ai").length;
}

export function guestAiTurnCeilingReached(aiTurnCount: number): boolean {
  return aiTurnCount >= GUEST_AI_TURN_CEILING;
}
