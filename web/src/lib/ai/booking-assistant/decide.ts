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
  priorMessages: ReadonlyArray<{ systemEventType?: string | null; humanTookOver?: boolean }>;
  /** Instant-answer already handled this turn (skip AI). */
  instantAnswered: boolean;
};

export type BookingAssistantDecision =
  | { action: "skip"; reason: "off" | "instant_answered" | "empty" | "already_handed_off" | "human_took_over" }
  | { action: "handoff"; reason: BookingHandoffReason }
  | { action: "llm_facts" };

/**
 * Phase 1 has no book/pay tools — booking *verbs* hand off to the talent.
 * Keep this narrow: Spanish "quiero saber el precio" / availability questions
 * must still reach llm_facts (or instant-answer), not an early handoff.
 */
const BOOKING_INTENT_RE =
  /\b(book|booking|reserve|reservation|appointment|reservar|reserva|cita|agendar|reserver|rendez[- ]?vous)\b/i;

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
  // TUL-1155: a prior handoff no longer silences the assistant. Factual
  // follow-ups still get answered; anything that would hand off again is
  // skipped so the guest never gets the canned handoff copy twice.
  // Once a person on the team has replied after the handoff, they own it.
  if (input.priorMessages.some((m) => m.humanTookOver)) {
    return { action: "skip", reason: "human_took_over" };
  }
  const handedOff = hasPriorHandoff(input.priorMessages);
  const handoff = (reason: BookingHandoffReason): BookingAssistantDecision =>
    handedOff ? { action: "skip", reason: "already_handed_off" } : { action: "handoff", reason };

  const turns = countBookingAssistantTurns(input.priorMessages);
  if (bookingAssistantTurnCeilingReached(turns)) return handoff("turn_ceiling");
  if (wantsHumanBookingHelp(body)) return handoff("human_requested");
  // Phase 1 = instant-answer + handoff only (no book/pay tools yet).
  if (BOOKING_INTENT_RE.test(body)) return handoff("unsure");
  return { action: "llm_facts" };
}
