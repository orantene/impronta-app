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
  /** English fallback for non-UI consumers (digest subjects, logs, tests). */
  label: string;
  /** English fallback for non-UI consumers. */
  description: string;
  /** Localized display path. UI MUST render t(labelKey) with `label` as fallback. */
  labelKey: string;
  /** Localized display path. UI MUST render t(descriptionKey) with `description` as fallback. */
  descriptionKey: string;
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
    labelKey: "client.notificationCategories.accountSecurity.label",
    descriptionKey: "client.notificationCategories.accountSecurity.description",
    required: true,
    defaultChannels: ["email"],
    order: 0,
  },
  billing: {
    id: "billing",
    label: "Billing & receipts",
    description: "Invoices, plan changes, payment confirmations. Always on.",
    labelKey: "client.notificationCategories.billing.label",
    descriptionKey: "client.notificationCategories.billing.description",
    required: true,
    defaultChannels: ["email"],
    order: 1,
  },
  messages: {
    id: "messages",
    label: "Messages",
    description: "New replies in your conversations.",
    labelKey: "client.notificationCategories.messages.label",
    descriptionKey: "client.notificationCategories.messages.description",
    required: false,
    defaultChannels: ["in_app"],
    order: 2,
  },
  inquiry_updates: {
    id: "inquiry_updates",
    label: "Inquiry updates",
    description: "Status changes on inquiries you're part of.",
    labelKey: "client.notificationCategories.inquiryUpdates.label",
    descriptionKey: "client.notificationCategories.inquiryUpdates.description",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 3,
  },
  offers: {
    id: "offers",
    label: "Offers",
    description: "When an offer is ready, accepted, or declined.",
    labelKey: "client.notificationCategories.offers.label",
    descriptionKey: "client.notificationCategories.offers.description",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 4,
  },
  bookings: {
    id: "bookings",
    label: "Bookings",
    description: "Confirmations, day-of reminders, and cancellations.",
    labelKey: "client.notificationCategories.bookings.label",
    descriptionKey: "client.notificationCategories.bookings.description",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 5,
  },
  payments: {
    id: "payments",
    label: "Payments",
    description: "Payments received, settled, or refunded.",
    labelKey: "client.notificationCategories.payments.label",
    descriptionKey: "client.notificationCategories.payments.description",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 6,
  },
  roster_activity: {
    id: "roster_activity",
    label: "Roster activity",
    description: "Talent invitations, responses, and roster changes.",
    labelKey: "client.notificationCategories.rosterActivity.label",
    descriptionKey: "client.notificationCategories.rosterActivity.description",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 7,
  },
  workspace_activity: {
    id: "workspace_activity",
    label: "Workspace activity",
    description: "Team invitations, coordinator assignments, approvals.",
    labelKey: "client.notificationCategories.workspaceActivity.label",
    descriptionKey: "client.notificationCategories.workspaceActivity.description",
    required: false,
    defaultChannels: ["in_app"],
    order: 8,
  },
  reviews: {
    id: "reviews",
    label: "Reviews",
    description: "Review invitations, reminders, and reviews you receive.",
    labelKey: "client.notificationCategories.reviews.label",
    descriptionKey: "client.notificationCategories.reviews.description",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 9,
  },
  platform_alerts: {
    id: "platform_alerts",
    label: "Platform alerts",
    description: "Operational alerts for platform administrators.",
    labelKey: "client.notificationCategories.platformAlerts.label",
    descriptionKey: "client.notificationCategories.platformAlerts.description",
    required: false,
    defaultChannels: ["email", "in_app"],
    order: 10,
  },
  marketing: {
    id: "marketing",
    label: "Product & tips",
    description: "Occasional product updates and best-practice tips.",
    labelKey: "client.notificationCategories.marketing.label",
    descriptionKey: "client.notificationCategories.marketing.description",
    required: false,
    defaultChannels: [], // off by default — opt-in
    order: 11,
  },
};

export function categoryDefinition(category: NotificationCategory): CategoryDefinition {
  return NOTIFICATION_CATEGORIES[category];
}

/** Ordered list for rendering the preferences UI. */
export const ORDERED_CATEGORIES: CategoryDefinition[] = Object.values(
  NOTIFICATION_CATEGORIES,
).sort((a, b) => a.order - b.order);
