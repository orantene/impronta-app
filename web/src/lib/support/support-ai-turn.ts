/**
 * Whether the support AI may answer on a ticket (TUL-661).
 *
 * Choice: while a human owns the ticket AND has replied within the last
 * HUMAN_QUIET_MINUTES, the AI stays quiet and the thread shows "a person is
 * handling this". If the human has gone silent for longer (or never replied
 * since taking over), the AI may answer again, so the requester is not left
 * talking to nobody. The ticket stays human-owned; the AI only fills the gap.
 */
export const HUMAN_QUIET_MINUTES = 30;

export type AiTurnDecision = "answer" | "human_active";

export function decideAiTurn(input: {
  handledBy: "ai" | "human";
  /** ISO time of the most recent human (agent) reply, or null if none. */
  lastHumanReplyAt: string | null;
  /** ISO time the ticket was handed to a human, used when no reply exists yet. */
  escalatedAt?: string | null;
  now: Date;
  quietMinutes?: number;
}): AiTurnDecision {
  if (input.handledBy !== "human") return "answer";
  const anchor = input.lastHumanReplyAt ?? input.escalatedAt ?? null;
  if (!anchor) return "human_active";
  const t = Date.parse(anchor);
  if (Number.isNaN(t)) return "human_active";
  const limit = (input.quietMinutes ?? HUMAN_QUIET_MINUTES) * 60_000;
  return input.now.getTime() - t > limit ? "answer" : "human_active";
}
