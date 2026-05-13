"use server";

/**
 * Notification dispatch — phase D+ stub (items 29-30).
 *
 * Currently a no-op. Future sessions implement:
 *   - Item 29: per-event routing matrix reading user_prefs.
 *     notificationPrefs + the 14 event_kind values from the log.
 *   - Item 30: WhatsApp/SMS providers (Twilio / Meta Messaging).
 *
 * The schema is in place (notification_dispatch_log) so when the
 * dispatcher ships it has a place to write.
 */

export type NotificationEventKind =
  | "client_message" | "talent_response" | "talent_rate_submitted"
  | "offer_sent" | "offer_approved" | "offer_countered" | "offer_declined"
  | "payment_completed" | "payment_failed"
  | "coord_request_submitted" | "coord_request_approved"
  | "call_sheet_updated" | "booking_today"
  | "talent_unresponsive" | "client_unresponsive";

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp" | "push";

/**
 * Dispatch one notification event. Future implementation:
 *   1. Resolve recipient list from event payload + inquiry participants
 *   2. Read each recipient's user_prefs.notificationPrefs[event] to
 *      decide which channels they want
 *   3. Insert one notification_dispatch_log row per (recipient, channel)
 *   4. Hand off to the channel-specific sender (email via Resend, SMS
 *      via Twilio, etc.) — sender flips the log row's status async
 *
 * Stub returns { ok: true, dispatched: 0 } so caller code can be
 * wired now and the dispatcher slotted in later without breaking.
 */
export async function dispatchNotification(_args: {
  eventKind: NotificationEventKind;
  inquiryId?: string | null;
  tenantId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<{ ok: true; dispatched: number } | { ok: false; error: string }> {
  // No-op until items 29-30 ship.
  return { ok: true, dispatched: 0 };
}
