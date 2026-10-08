/**
 * Pure phase-1 routing for the booking assistant after instant-answer misses.
 * No book / pay tools — facts via LLM or handoff.
 */

import {
  bookingAssistantTurnCeilingReached,
  countBookingAssistantTurns,
} from "./turns";
import { wantsHumanBookingHelp, type BookingHandoffReason } from "./handoff";

export type BookingAssistantDecideInput = {
  /** Talent chat_config.aiBookingAssistantEnabled */
  enabled: boolean;
  guestMessage: string;
  /** Prior system_event rows already counted as assistant turns. */
  priorMessages: ReadonlyArray<{ systemEventType?: string | null }>;
  /** Instant-answer already handled this turn (skip AI). */
  instantAnswered: boolean;
};

export type BookingAssistantDecision =
  | { action: "skip"; reason: "off" | "instant_answered" | "empty" }
  | { action: "handoff"; reason: BookingHandoffReason }
  | { action: "llm_facts" };

export function decideBookingAssistantTurn(input: BookingAssistantDecideInput): BookingAssistantDecision {
  const body = input.guestMessage.trim();
  if (!body) return { action: "skip", reason: "empty" };
  if (!input.enabled) return { action: "skip", reason: "off" };
  if (input.instantAnswered) return { action: "skip", reason: "instant_answered" };

  const turns = countBookingAssistantTurns(input.priorMessages);
  if (bookingAssistantTurnCeilingReached(turns)) {
    return { action: "handoff", reason: "turn_ceiling" };
  }
  if (wantsHumanBookingHelp(body)) {
    return { action: "handoff", reason: "human_requested" };
  }
  return { action: "llm_facts" };
}
