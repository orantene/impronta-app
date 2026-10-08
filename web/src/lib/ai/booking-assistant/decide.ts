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
  | { action: "skip"; reason: "off" | "instant_answered" | "empty" | "already_handed_off" }
  | { action: "handoff"; reason: BookingHandoffReason }
  | { action: "llm_facts" };

/** Phase 1 has no book/pay tools — booking asks hand off to the talent. */
const BOOKING_INTENT_RE =
  /\b(book|booking|reserve|reservation|appointment|available|availability|reservar|reserva|cita|agendar|disponible|disponibilidad|quiero|me gustaria|reserver|rendez)\b/i;

function hasPriorHandoff(
  prior: ReadonlyArray<{ systemEventType?: string | null }>,
): boolean {
  return prior.some((m) => m.systemEventType === "booking_assistant_handoff");
}

export function decideBookingAssistantTurn(input: BookingAssistantDecideInput): BookingAssistantDecision {
  const body = input.guestMessage.trim();
  if (!body) return { action: "skip", reason: "empty" };
  if (!input.enabled) return { action: "skip", reason: "off" };
  if (input.instantAnswered) return { action: "skip", reason: "instant_answered" };
  // Terminal: once we yielded to the team, never resume LLM or spam handoffs.
  if (hasPriorHandoff(input.priorMessages)) {
    return { action: "skip", reason: "already_handed_off" };
  }

  const turns = countBookingAssistantTurns(input.priorMessages);
  if (bookingAssistantTurnCeilingReached(turns)) {
    return { action: "handoff", reason: "turn_ceiling" };
  }
  if (wantsHumanBookingHelp(body)) {
    return { action: "handoff", reason: "human_requested" };
  }
  // Phase 1 = instant-answer + handoff only (no book/pay tools yet).
  if (BOOKING_INTENT_RE.test(body)) {
    return { action: "handoff", reason: "unsure" };
  }
  return { action: "llm_facts" };
}
