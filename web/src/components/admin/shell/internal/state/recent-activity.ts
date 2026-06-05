// ─────────────────────────────────────────────────────────────────────
// recent-activity.ts — turn a real `inquiry_events` row (RecentActivityItem)
// into a human-readable activity-feed line.
//
// The bridge (`loadRecentActivity`) returns raw DB rows: a dotted
// `event_type` (e.g. "offer.sent"), an optional actor display name, an
// `actor_role`, the related inquiry's contact/company, and a created_at
// ISO timestamp. This module is the single place that decides how each of
// those becomes the "{actor} {action} {target} · {when}" line the
// ActivityFeedItem primitive renders — so the Overview feed and the
// Recent-activity drawer phrase identical events identically.
//
// Pure + client-safe (only depends on relativeTime). No mock data.
// ─────────────────────────────────────────────────────────────────────

import { relativeTime } from "./fixtures";
import type { RecentActivityItem } from "../data-bridge";

/** Icon names supported by the ActivityFeedItem primitive. */
export type ActivityIconName =
  | "mail"
  | "check"
  | "bolt"
  | "calendar"
  | "settings"
  | "user"
  | "team"
  | "archive"
  | "alert";

export type FormattedActivity = {
  id: string;
  /** Who triggered it — real display name, or a role label for system/auto events. */
  actor: string;
  /** Past-tense verb phrase, e.g. "sent an offer to". */
  action: string;
  /** The inquiry it relates to (company preferred, else contact name). */
  target: string;
  iconName: ActivityIconName;
  /** Relative label, e.g. "2m ago". */
  timestamp: string;
  /** Day bucket for grouping: "Today" | "Yesterday" | "Earlier". */
  dayBucket: "Today" | "Yesterday" | "Earlier";
};

// Canonical phrasing + icon per stored event_type. Phrases are written so
// the rendered line reads "{actor} {phrase} {target}" — e.g.
// "Oran Tene sent an offer to Vogue Italia".
const EVENT_META: Record<string, { phrase: string; icon: ActivityIconName }> = {
  // ── Inquiry lifecycle ──────────────────────────────────────────────
  "inquiry.submitted": { phrase: "opened a new inquiry from", icon: "bolt" },
  "inquiry.created_manual": { phrase: "created an inquiry for", icon: "bolt" },
  "inquiry.duplicated": { phrase: "duplicated the inquiry from", icon: "bolt" },
  "inquiry.moved_to_coordination": { phrase: "moved to coordination", icon: "bolt" },
  "inquiry.priority_set": { phrase: "set the priority on", icon: "alert" },
  "inquiry.status_changed": { phrase: "updated the status of", icon: "bolt" },
  "inquiry.frozen": { phrase: "froze the inquiry from", icon: "alert" },
  "inquiry.unfrozen": { phrase: "unfroze the inquiry from", icon: "bolt" },
  "inquiry.archived": { phrase: "archived the inquiry from", icon: "archive" },
  "inquiry.expired": { phrase: "auto-archived an expired inquiry from", icon: "archive" },
  "inquiry.cancelled": { phrase: "cancelled the inquiry from", icon: "archive" },
  "inquiry.converted_to_booking": { phrase: "converted to a booking for", icon: "calendar" },
  "inquiry.lineup_added_to_booking": { phrase: "added a lineup to the booking for", icon: "calendar" },
  "coordinator.assignment_timed_out": { phrase: "had a coordinator assignment time out for", icon: "alert" },

  // ── Messaging ──────────────────────────────────────────────────────
  "inquiry.message_sent": { phrase: "sent a message about", icon: "mail" },

  // ── Coordination ───────────────────────────────────────────────────
  "coordinator.assigned": { phrase: "assigned a coordinator to", icon: "user" },
  "coordinator.accepted": { phrase: "took over coordination of", icon: "check" },
  "coordinator.declined": { phrase: "declined coordination of", icon: "alert" },
  "secondary_coordinator_assigned": { phrase: "added a coordinator to", icon: "user" },
  "secondary_coordinator_unassigned": { phrase: "removed a coordinator from", icon: "user" },
  "primary_coordinator_changed": { phrase: "changed the lead coordinator on", icon: "user" },

  // ── Roster / lineup ────────────────────────────────────────────────
  "roster.talent_invited": { phrase: "invited talent to", icon: "team" },
  "roster.talent_removed": { phrase: "removed talent from", icon: "team" },
  "roster.reordered": { phrase: "reordered the lineup for", icon: "team" },
  "roster.talent_accepted": { phrase: "confirmed talent for", icon: "check" },
  "roster.talent_declined": { phrase: "had talent decline for", icon: "alert" },
  "offer.invalidated_by_roster_change": { phrase: "invalidated an offer on", icon: "alert" },

  // ── Offers ─────────────────────────────────────────────────────────
  "offer.created": { phrase: "drafted an offer for", icon: "mail" },
  "offer.draft_updated": { phrase: "updated the offer draft for", icon: "mail" },
  "offer.sent": { phrase: "sent an offer to", icon: "mail" },
  "offer.client_rejected": { phrase: "had an offer declined by", icon: "alert" },
  "offer.client_accepted": { phrase: "had an offer accepted by", icon: "check" },

  // ── Approvals ──────────────────────────────────────────────────────
  "approval.submitted": { phrase: "approved", icon: "check" },
  "approval.rejected": { phrase: "rejected an approval for", icon: "alert" },
  "approval.all_complete": { phrase: "completed all approvals for", icon: "check" },

  // ── Bookings ───────────────────────────────────────────────────────
  "booking.created": { phrase: "created a booking for", icon: "calendar" },
  "booking.created_manual": { phrase: "created a booking for", icon: "calendar" },
  "booking.created_from_inquiry_quick": { phrase: "created a booking for", icon: "calendar" },
  "booking.converted_from_inquiry": { phrase: "converted to a booking for", icon: "calendar" },
  "booking.status_changed": { phrase: "updated the booking for", icon: "calendar" },
  "booking.payment_state_changed": { phrase: "updated payment on the booking for", icon: "calendar" },

  // ── Payments ───────────────────────────────────────────────────────
  "payment.requested": { phrase: "requested payment for", icon: "mail" },
  "payment.pending": { phrase: "has a payment pending for", icon: "bolt" },
  "payment.received": { phrase: "received payment for", icon: "check" },
  "payment.refunded": { phrase: "refunded payment for", icon: "alert" },
  "payment.cancelled": { phrase: "cancelled a payment for", icon: "alert" },
  "payment.failed": { phrase: "had a payment fail for", icon: "alert" },
  "payment.disputed": { phrase: "flagged a payment dispute for", icon: "alert" },
  "payment.payout_settled": { phrase: "settled a payout for", icon: "check" },
  "payment.receiver_changed": { phrase: "updated the payout receiver for", icon: "user" },
  "payment.receiver_selected": { phrase: "set the payout receiver for", icon: "user" },
  "payment.transaction_created": { phrase: "started a payment for", icon: "bolt" },
  "booking.payment.transaction_created": { phrase: "started a payment for", icon: "bolt" },
};

/** Human label for the actor_role when no display name is available. */
function roleLabel(role: string | null): string {
  switch (role) {
    case "system":
      return "System";
    case "client":
      return "Client";
    case "talent":
      return "Talent";
    case "admin":
      return "Admin";
    case "coordinator":
      return "Coordinator";
    default:
      return "Someone";
  }
}

/** Prettify an unmapped event_type into a readable phrase. */
function fallbackPhrase(eventType: string): string {
  return eventType.replace(/^(inquiry|booking|offer|roster|coordinator|approval|payment)\./, "").replace(/[._]/g, " ").trim();
}

function bucketFor(createdAt: string, now: Date): FormattedActivity["dayBucket"] {
  const then = new Date(createdAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = then.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 86_400_000) return "Yesterday";
  return "Earlier";
}

/**
 * Format one real activity row for display. `now` is injectable so callers
 * can pin it at mount (avoids Date.now() churn inside a render/useMemo body).
 */
export function formatRecentActivity(
  item: RecentActivityItem,
  now: Date = new Date(),
): FormattedActivity {
  const meta = EVENT_META[item.event_type];
  const actor = item.actor_name?.trim() || roleLabel(item.actor_role);
  const target = item.inquiry_company?.trim() || item.inquiry_contact?.trim() || "an inquiry";
  return {
    id: item.id,
    actor,
    action: meta?.phrase ?? fallbackPhrase(item.event_type),
    target,
    iconName: meta?.icon ?? "bolt",
    timestamp: relativeTime(item.created_at, now),
    dayBucket: bucketFor(item.created_at, now),
  };
}

/** Group formatted activity into Today / Yesterday / Earlier sections (order preserved within each). */
export function groupRecentActivityByDay(
  items: FormattedActivity[],
): { bucket: FormattedActivity["dayBucket"]; items: FormattedActivity[] }[] {
  const order: FormattedActivity["dayBucket"][] = ["Today", "Yesterday", "Earlier"];
  return order
    .map((bucket) => ({ bucket, items: items.filter((it) => it.dayBucket === bucket) }))
    .filter((group) => group.items.length > 0);
}
