import type { WebsitePageRow } from "./types";

/**
 * Derive the Website → Pages grid status for a `cms_pages` row.
 *
 * The DB enum `cms_page_status` only ever holds draft | published |
 * archived — there is no DB-level "scheduled" status. Scheduling is
 * expressed by the nullable `scheduled_publish_at` column while `status`
 * stays whatever it already was (typically `draft`) until the
 * `/api/cron/publish-scheduled` sweep fires and flips it to `published`.
 *
 * This derives the UI-only "scheduled" status the admin Website → Pages
 * grid tab/filter expects: a page reads as scheduled when it carries a
 * future `scheduled_publish_at` AND its underlying status isn't archived.
 * A past-dated `scheduled_publish_at` means the cron already fired (or is
 * about to, within its sweep interval) — that page falls back to its real
 * underlying status instead of staying "scheduled" forever if the sweep
 * is ever late or fails.
 */
export function deriveWebsitePageStatus(
  rawStatus: string,
  scheduledPublishAt: string | null | undefined,
  now: number = Date.now(),
): WebsitePageRow["status"] {
  if (rawStatus === "archived") return "archived";
  if (scheduledPublishAt) {
    const fireAt = Date.parse(scheduledPublishAt);
    if (Number.isFinite(fireAt) && fireAt > now) return "scheduled";
  }
  return rawStatus === "published" ? "published" : "draft";
}
