/**
 * Re-export guest-surface sanitize for booking facts. Phase 1: no invent;
 * ungrounded money → escalate to handoff.
 */

export {
  sanitizeGuestAiOutput as sanitizeBookingAssistantOutput,
  SUPPORT_AI_MAX_CHARS as BOOKING_ASSISTANT_MAX_CHARS,
  type SupportAiGuardrailResult as BookingAssistantGuardrailResult,
} from "@/lib/support/support-ai-guardrails";
