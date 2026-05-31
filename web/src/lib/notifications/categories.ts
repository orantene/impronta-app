import "server-only";

import type { NotificationCategory, NotificationChannel } from "./types";

/**
 * Category model — the unit of user preference (decision D1: per-category).
 *
 * Each catalog entry belongs to exactly one category. Users toggle channels
 * per category, not per event, so adding a new notification never grows the
 * preferences UI. Required categories (account_security, billing) bypass the
 * opt-out entirely.
 */

export type CategoryDefinition = {
  id: NotificationCategory;
  label: string;
  description: string;
  required: boolean;
  /** Channels enabled by default when the user hasn't customized. */
  defaultChannels: NotificationChannel[];
  /** Order in the preferences UI. */
  order: number;
};

export const NOTIFICATION_CATEGORIES: Record<NotificationCategory, CategoryDefinition> = {
  account_security: {
    id: "account_security",
    label: "Account & security",
    // These emails (sign-in links, email confirmation, password resets) are sent
    // by SUPABASE AUTH (SMTP → Resend), NOT this engine. The engine intentionally
    // carries ZERO account_security catalog entries and defers all credential mail
    // to Supabase; this category is kept (required) so the prefs model stays
    // complete and the "always on" promise is accurate.
    description: "Sign-in links, email confirmation, password resets. Always on.",
    required: true,
    defaultChannels: ["email"],
    order: 0,
  },
  billing: {
    id: "billing",
    label: "Billing & receipts",
    description: "Invoices, plan changes, payment confirmations. Always on.",
    required: true,
    defaultChannels: ["email"],
    order: 1,
  },
  messages: {
    id: "messages",
    label: "Messages",
    description: "New replies in your conversations.",
    required: false,
    defaultChannels: ["in_app"],
    order: 2,
  },
  inquiry_updates: {
    id: "inquiry_updates",
    label: "Inquiry updates",
    description: "Status changes on inquiries you're part of.",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 3,
  },
  offers: {
    id: "offers",
    label: "Offers",
    description: "When an offer is ready, accepted, or declined.",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 4,
  },
  bookings: {
    id: "bookings",
    label: "Bookings",
    description: "Confirmations, day-of reminders, and cancellations.",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 5,
  },
  payments: {
    id: "payments",
    label: "Payments",
    description: "Payments received, settled, or refunded.",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 6,
  },
  roster_activity: {
    id: "roster_activity",
    label: "Roster activity",
    description: "Talent invitations, responses, and roster changes.",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 7,
  },
  workspace_activity: {
    id: "workspace_activity",
    label: "Workspace activity",
    description: "Team invitations, coordinator assignments, approvals.",
    required: false,
    defaultChannels: ["in_app"],
    order: 8,
  },
  platform_alerts: {
    id: "platform_alerts",
    label: "Platform alerts",
    description: "Operational alerts for platform administrators.",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 9,
  },
  marketing: {
    id: "marketing",
    label: "Product & tips",
    description: "Occasional product updates and best-practice tips.",
    required: false,
    defaultChannels: [], // off by default — opt-in
    order: 10,
  },
};

export function categoryDefinition(category: NotificationCategory): CategoryDefinition {
  return NOTIFICATION_CATEGORIES[category];
}

/** Ordered list for rendering the preferences UI. */
export const ORDERED_CATEGORIES: CategoryDefinition[] = Object.values(
  NOTIFICATION_CATEGORIES,
).sort((a, b) => a.order - b.order);
