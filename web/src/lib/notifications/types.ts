import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReactElement } from "react";
import type { EmailBrand } from "@/lib/brand/resolve-tenant-brand";

/**
 * Core types for the notification engine.
 *
 * Kept in a dependency-free module so catalog / dispatcher / channels can
 * all import without cycles. See
 * `web/docs/email-notification-system-spec-2026-05-28.md` for the full
 * architecture.
 */

// ─── Categories ──────────────────────────────────────────────────────────────

export type NotificationCategory =
  | "account_security" // signup confirm, magic link, password reset, email change. REQUIRED.
  | "billing" // invoices, plan changes, payment failed. REQUIRED.
  | "messages" // new chat message
  | "inquiry_updates" // submitted, frozen, archived, expired, cancelled
  | "offers" // sent, accepted, declined, countered
  | "bookings" // created, day-of reminder, cancelled
  | "payments" // received, settled, refunded
  | "roster_activity" // talent invited, accepted, declined, removed
  | "workspace_activity" // team invited, coordinator assigned, approvals
  | "platform_alerts" // platform admin: new workspace, over-quota
  | "marketing"; // future, off by default

// ─── Channels ────────────────────────────────────────────────────────────────

export type NotificationChannel = "email" | "in_app" | "push" | "sms" | "whatsapp";

/** Channels with live handlers today. push/sms/whatsapp are reserved. */
export const LIVE_CHANNELS: readonly NotificationChannel[] = ["email", "in_app"] as const;

// ─── Events ──────────────────────────────────────────────────────────────────

/**
 * A domain event the dispatcher can act on. For inquiry-engine events,
 * `type` matches `ENGINE_EVENT_TYPES` and `eventId` is the
 * `inquiry_events.id`. For non-inquiry events use a namespaced type
 * (`workspace.*`, `auth.*`, `billing.*`, `platform.*`) and synthesize a
 * stable `eventId` from the trigger context.
 */
export type NotificationEvent = {
  type: string;
  /** Tenant scope. NULL for platform-only events. */
  tenantId: string | null;
  inquiryId?: string | null;
  workspaceId?: string | null;
  bookingId?: string | null;
  /** A user directly associated with the event (e.g. the actor or subject). */
  userId?: string | null;
  /** Idempotency anchor. Stable across retries of the same logical event. */
  eventId: string;
  /** Free-form payload handed to templates + audience resolvers. */
  payload: Record<string, unknown>;
};

// ─── Recipients ──────────────────────────────────────────────────────────────

export type RecipientRole =
  | "client"
  | "talent"
  | "workspace_member"
  | "platform_admin"
  | "guest";

/**
 * What an audience resolver returns. Either a known user (by id) or a
 * guest (by raw email — e.g. an inquiry contact with no account).
 */
export type AudienceMember =
  | { kind: "user"; userId: string; role?: RecipientRole }
  | { kind: "guest"; email: string; displayName?: string | null; role?: RecipientRole };

/** A fully-hydrated recipient ready for channel dispatch. */
export type ResolvedRecipient = {
  /** Null for guests. */
  userId: string | null;
  email: string | null;
  displayName: string | null;
  locale: string; // BCP-47, default "en"
  isPlatformAdmin: boolean;
  role: RecipientRole;
  /** Identity used in the dedupe key: userId, or `guest:<email>`. */
  dedupeId: string;
};

// ─── Audience context ────────────────────────────────────────────────────────

/** Shared resources handed to audience resolvers + channel handlers. */
export type AudienceContext = {
  admin: SupabaseClient;
};

// ─── Catalog entry ───────────────────────────────────────────────────────────

export type EmailTemplateArgs = {
  event: NotificationEvent;
  recipient: ResolvedRecipient;
  brand: EmailBrand;
  /** Present only for non-required categories. */
  unsubscribeUrl?: string;
};

export type InAppConfig = {
  kind: "message" | "offer" | "booking" | "payment" | "approval" | "system" | "profile";
  surface: "workspace" | "talent" | "client";
  title: (event: NotificationEvent, recipient: ResolvedRecipient) => string;
  body?: (event: NotificationEvent, recipient: ResolvedRecipient) => string | null;
  targetDrawer?: string;
  targetPayload?: (event: NotificationEvent) => Record<string, unknown>;
};

export type EmailConfig = {
  /** Stable id for analytics + the dispatch_log.template_id column. */
  templateId: string;
  subject: (event: NotificationEvent, recipient: ResolvedRecipient) => string;
  render: (args: EmailTemplateArgs) => ReactElement;
  /**
   * High-frequency entries (messages) opt into the digest path (spec §7).
   * When true, the dispatcher writes the dispatch_log row as `queued` with
   * `payload.digest = true` and SKIPS the immediate send — the digest cron
   * (`/api/cron/send-digest-emails`) batches queued rows per
   * `(recipient, category)` window into one summary email. `subject` + `render`
   * are then vestigial for the normal path (only the retry cron would invoke
   * them, if a digest flush fails) but stay required by the contract.
   */
  digest?: boolean;
};

export type CatalogEntry = {
  /** Globally unique, e.g. "offer.sent.client". */
  id: string;
  category: NotificationCategory;
  /** Channels attempted when the user hasn't opted out. */
  defaultChannels: NotificationChannel[];
  /** Required = user cannot opt out (account_security, billing). */
  required: boolean;
  /** Domain event types this entry subscribes to. */
  triggers: string[];
  /**
   * Optional per-entry hydration. Returns extra fields that the dispatcher
   * merges into `event.payload` before `resolveAudience` + the channel
   * handlers run, so resolvers and templates can read inquiry context the
   * raw engine event doesn't carry (contact, schedule, offer total, …).
   * Runs once per entry per dispatch; a throw degrades to the bare event.
   */
  hydrate?: (event: NotificationEvent, ctx: AudienceContext) => Promise<Record<string, unknown>>;
  resolveAudience: (event: NotificationEvent, ctx: AudienceContext) => Promise<AudienceMember[]>;
  email?: EmailConfig;
  in_app?: InAppConfig;
};

// ─── Dispatch result ─────────────────────────────────────────────────────────

export type DispatchResult = {
  dispatched: number;
  suppressed: number;
  failed: number;
  /** Rows written `queued` for the digest sweep instead of sent now (§7). */
  queued: number;
};
