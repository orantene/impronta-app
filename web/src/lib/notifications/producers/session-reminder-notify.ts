import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import type { DispatchResult } from "@/lib/notifications/types";

/**
 * Emit `session.reminder` — "your class is tomorrow", to one admission holder.
 *
 * ONE EVENT PER ADMISSION, not per session. A class of twelve is twelve
 * reminders to twelve people, each with their own dedupe identity, so one bad
 * address cannot suppress the other eleven.
 *
 * THE COPY ARRIVES ON THE PAYLOAD, already built by `buildSessionReminder` in
 * the venue's clock. The catalog entry renders it and formats nothing itself:
 * a template that built its own time would be a second place the venue's zone
 * could be got wrong, in the direction nobody sees until somebody misses a
 * class.
 *
 * THE STABLE `eventId` IS WHAT MAKES AN HOURLY SWEEP SAFE.
 * `session-reminder:<admissionId>:<localDate>` plus the dispatch_log unique
 * index collapses a duplicate `(event, recipient, channel)` to a no-op. The
 * sweep runs hourly because venues span UTC-12 to UTC+14 and a daily run fires
 * at a different local hour in every one of them; the id is what stops twenty
 * four runs sending twenty four emails.
 *
 * The LOCAL DATE is in the id on purpose. Without it a weekly class would be
 * reminded once, ever — the first Tuesday would suppress every Tuesday after
 * it, because the admission id alone is the same string every week.
 */
export function notifySessionReminder(params: {
  tenantId: string;
  admissionId: string;
  sessionId: string;
  /** The session's local date in the VENUE's zone, "YYYY-MM-DD". */
  localDate: string;
  holderEmail: string;
  holderName?: string | null;
  subject: string;
  heading: string;
  lines: string[];
}): Promise<DispatchResult> {
  return dispatchEventNotifications({
    type: "session.reminder",
    tenantId: params.tenantId,
    eventId: `session-reminder:${params.admissionId}:${params.localDate}`,
    payload: {
      admissionId: params.admissionId,
      sessionId: params.sessionId,
      holderEmail: params.holderEmail,
      holderName: params.holderName ?? null,
      subject: params.subject,
      heading: params.heading,
      lines: params.lines,
    },
  });
}
