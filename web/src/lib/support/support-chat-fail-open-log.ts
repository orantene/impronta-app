import { improntaLog } from "@/lib/server/structured-log";

/** Why the signed-in support AI gave up and fell back to the human offer. */
export type SupportChatFailOpenReason = "unavailable" | "gated" | "model" | "parse" | "persist";

/**
 * Log fields for one fail-open. Only the reason and a short machine code are
 * kept: never the ticket text, the model output or the error message, which can
 * carry what the requester typed.
 */
export function supportChatFailOpenFields(
  reason: SupportChatFailOpenReason,
  code?: string | null,
): Record<string, string> {
  const fields: Record<string, string> = { reason };
  const clean = (code ?? "").replace(/[^a-z0-9_]/gi, "").slice(0, 40);
  if (clean) fields.code = clean;
  return fields;
}

export function logSupportChatFailOpen(
  ticketId: string,
  reason: SupportChatFailOpenReason,
  code?: string | null,
): void {
  void improntaLog("support_ai_fail_open", { ticketId, ...supportChatFailOpenFields(reason, code) });
}
