/**
 * Whether the guest dock should hide the Send-to-agency bar because an
 * outcome card (or a paid card) already owns the main CTA.
 */

import { deriveGuestOutcomeFromMessages } from "@/lib/messages-v5/guest-outcome";

export function guestThreadBlocksSendBar(
  rows: readonly { kind: string; cardPayload?: unknown; body?: string | null }[],
): boolean {
  if (rows.some((m) => m.kind === "payment_paid")) return true;
  return (
    deriveGuestOutcomeFromMessages(
      rows.map((m) => ({
        kind: m.kind,
        payload: m.cardPayload && typeof m.cardPayload === "object" ? (m.cardPayload as Record<string, unknown>) : null,
        body: m.body,
      })),
    ) != null
  );
}
