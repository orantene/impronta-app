/**
 * TUL-662 / TUL-1155: pure helpers for the booking assistant's fallback paths.
 * Every path that ends in canned copy (or silence) names a dev-safe reason in
 * the logs, and a thread that already handed off gets an acknowledgement
 * instead of the canned handoff text a second time.
 */

export type BookingFallbackReason =
  | "no_anthropic_key"
  | "monthly_cap"
  | "llm_timeout"
  | "llm_error"
  | "guardrail_escalate"
  | "empty_reply"
  | "wrong_language"
  | "insert_failed";

export type BookingFallbackPlan = { kind: "handoff" } | { kind: "ack" };

/** First-time fallback posts the handoff; a thread that already handed off gets the ack. */
export function planBookingFallback(handedOffBefore: boolean): BookingFallbackPlan {
  return handedOffBefore ? { kind: "ack" } : { kind: "handoff" };
}

export function llmFailureReason(code: string | null | undefined): BookingFallbackReason {
  return code === "timeout" ? "llm_timeout" : "llm_error";
}

/**
 * Provider messages can echo request details. Keep a short, key-free summary:
 * strip anything shaped like a secret and cap the length.
 */
export function safeProviderDetail(message: string | null | undefined): string {
  const text = (message ?? "").replace(/\b(sk|key|sess)[-_][A-Za-z0-9_-]{8,}/gi, "[redacted]");
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}
