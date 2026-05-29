import "server-only";

import { resolveInquiryRecipients } from "./recipients";
import type {
  AudienceContext,
  AudienceMember,
  NotificationEvent,
} from "./types";

/**
 * Audience resolvers + the inquiry hydrator for the notification catalog.
 *
 * Split out of `catalog.ts` to keep that file under the 800-line cap (same
 * sibling-extraction convention used elsewhere in the codebase). The catalog
 * entries import these by name; each resolver returns lightweight
 * `AudienceMember`s and the dispatcher hydrates them to addresses + dedupes.
 */

/** Narrow an unknown payload value to a non-empty trimmed string, else null. */
export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Hydrate inquiry context for an inquiry-scoped event. The engine event only
 * carries its `data` block (e.g. `{ offerId }` or `{ bookingId }`); templates
 * + resolvers need the inquiry's contact, schedule, client + coordinator and —
 * when present — the current offer total. The dispatcher merges this into
 * `event.payload` before resolveAudience + render run.
 */
export async function loadInquiryView(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const inquiryId = event.inquiryId;
  if (!inquiryId) return {};

  const { data } = await ctx.admin
    .from("inquiries")
    .select(
      "contact_name, contact_email, event_date, event_location, client_user_id, coordinator_id, current_offer_id",
    )
    .eq("id", inquiryId)
    .maybeSingle();
  if (!data) return {};
  const inq = data as {
    contact_name: string | null;
    contact_email: string | null;
    event_date: string | null;
    event_location: string | null;
    client_user_id: string | null;
    coordinator_id: string | null;
    current_offer_id: string | null;
  };

  let offerTotal: string | null = null;
  if (inq.current_offer_id) {
    const { data: offerRow } = await ctx.admin
      .from("inquiry_offers")
      .select("total_client_price, currency_code")
      .eq("id", inq.current_offer_id)
      .maybeSingle();
    const offer = offerRow as
      | { total_client_price: number | null; currency_code: string | null }
      | null;
    if (offer && offer.total_client_price != null) {
      offerTotal = `${offer.currency_code ?? ""} ${Number(offer.total_client_price).toFixed(2)}`.trim();
    }
  }

  return {
    contactName: inq.contact_name,
    contactEmail: inq.contact_email,
    eventDate: inq.event_date,
    eventLocation: inq.event_location,
    clientUserId: inq.client_user_id,
    coordinatorId: inq.coordinator_id,
    offerTotal,
  };
}

// ─── Audience resolvers ──────────────────────────────────────────────────────
// Read from the hydrated payload (loadInquiryView) + the shared recipient
// resolver. Each returns lightweight AudienceMembers; the dispatcher hydrates
// them to addresses and dedupes.

/** The inquiry client — the authenticated user if known, else the guest contact. */
export const clientOrGuest = async (event: NotificationEvent): Promise<AudienceMember[]> => {
  const clientUserId = str(event.payload.clientUserId);
  if (clientUserId) return [{ kind: "user", userId: clientUserId, role: "client" }];
  const email = str(event.payload.contactEmail);
  if (email) {
    return [
      { kind: "guest", email, displayName: str(event.payload.contactName), role: "client" },
    ];
  }
  return [];
};

/** Every active talent on the inquiry roster, by their user account. */
export const allRosterTalent = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  if (!event.inquiryId || !event.tenantId) return [];
  const r = await resolveInquiryRecipients(ctx.admin, event.inquiryId, event.tenantId);
  return r.talentUserIds.map((userId) => ({ kind: "user", userId, role: "talent" as const }));
};

/** The assigned coordinator, when the inquiry has one. */
export const assignedCoordinator = async (event: NotificationEvent): Promise<AudienceMember[]> => {
  const coordinatorId = str(event.payload.coordinatorId);
  if (!coordinatorId) return [];
  return [{ kind: "user", userId: coordinatorId, role: "workspace_member" }];
};

/**
 * Workspace owners + admins for the event's tenant — the people who triage
 * ops-level alerts (assignment time-outs, offer outcomes). Keys on
 * `agency_memberships.profile_id` (→ `profiles.id`, the canonical user id);
 * the engine resolves `event.tenantId` from the inquiry before dispatch.
 *
 * NB: this deliberately selects `profile_id`, not `user_id` — that column
 * does not exist on `agency_memberships` (the `user_id` select in
 * `recipients.ts` is a latent bug that silently returns zero rows).
 */
export const workspaceAdmins = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  if (!event.tenantId) return [];
  const { data, error } = await ctx.admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", event.tenantId)
    .eq("status", "active")
    .in("role", ["owner", "admin"]);
  if (error || !data) return [];
  return (data as Array<{ profile_id: string | null }>)
    .map((r) => r.profile_id)
    .filter((id): id is string => Boolean(id))
    .map((userId) => ({ kind: "user" as const, userId, role: "workspace_member" as const }));
};

/**
 * Offer-outcome audience: the assigned coordinator plus every workspace
 * owner/admin. The dispatcher dedupes by recipient, so a coordinator who is
 * also an admin is only notified once.
 */
export const coordinatorAndAdmins = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const [coordinator, admins] = await Promise.all([
    assignedCoordinator(event),
    workspaceAdmins(event, ctx),
  ]);
  return [...coordinator, ...admins];
};

/** Inquiry-cancellation audience: the client (or guest) plus all roster talent. */
export const clientAndRosterTalent = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const [client, talent] = await Promise.all([
    clientOrGuest(event),
    allRosterTalent(event, ctx),
  ]);
  return [...client, ...talent];
};

/** The single talent named in a `roster.talent_invited` event. */
export const invitedTalent = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const talentProfileId = str(event.payload.talentProfileId);
  if (!talentProfileId) return [];
  const { data } = await ctx.admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  const userId = (data as { user_id: string | null } | null)?.user_id ?? null;
  if (!userId) return [];
  return [{ kind: "user", userId, role: "talent" }];
};

/**
 * All platform administrators (Phase 10). Identified by
 * `profiles.app_role = 'super_admin'` — the live schema has NO `platform_role`
 * column (see migration 20260520224524_platform_media_settings.sql:99-101,
 * where the same `OR platform_role` clause had to be trimmed because it failed
 * column-resolution). When Track B.2 adds `platform_role`, widen this query to
 * dual-read, matching `getPlatformRole` in `@/lib/access/platform-role`.
 *
 * Platform alerts must be emitted with `tenantId = null` so the dispatcher
 * resolves the platform brand — the `/platform/admin/*` links then point at the
 * platform host rather than an agency's custom domain.
 */
export const platformAdmins = async (
  _event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const { data, error } = await ctx.admin
    .from("profiles")
    .select("id")
    .eq("app_role", "super_admin");
  if (error || !data) return [];
  return (data as Array<{ id: string }>).map((r) => ({
    kind: "user" as const,
    userId: r.id,
    role: "platform_admin" as const,
  }));
};

/**
 * An email-only invitee carried directly on the event payload. Used by the
 * roster claim-invite + team-invite producers, whose recipients usually have
 * no account yet. Returning a `guest` member makes the dispatcher deliver
 * email-only and skip per-category preference checks — correct for an
 * action-required invite (the invitee opted in by being invited; an
 * unsubscribe toggle shouldn't black-hole the link they need to act on).
 */
export const emailInvitee =
  (role: AudienceMember["role"]) =>
  async (event: NotificationEvent): Promise<AudienceMember[]> => {
    const email = str(event.payload.inviteeEmail);
    if (!email) return [];
    return [
      { kind: "guest", email, displayName: str(event.payload.inviteeName), role },
    ];
  };

/**
 * The single user the event is *about* — its actor/subject, carried on
 * `event.userId`. Used by account-lifecycle welcomes: the new workspace owner
 * (workspace.signup_welcome) and the freshly-onboarded talent
 * (account.talent_welcome). These fire once at signup before any preferences
 * exist, so the dispatcher's default-on channels apply.
 */
export const eventUser =
  (role: AudienceMember["role"]) =>
  async (event: NotificationEvent): Promise<AudienceMember[]> => {
    const userId = str(event.userId);
    if (!userId) return [];
    return [{ kind: "user", userId, role }];
  };

/**
 * Hydrate a one-line preview of the message behind a `message.new` event so the
 * digest summary reads as the actual message, not a generic "you have a new
 * message". The engine event only carries `{ threadType, messageId }`; we look
 * up the body and truncate it. A miss degrades to no preview (the digest falls
 * back to its category default line).
 */
export async function loadMessagePreview(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const messageId = str(event.payload.messageId);
  if (!messageId) return {};
  const { data } = await ctx.admin
    .from("inquiry_messages")
    .select("body")
    .eq("id", messageId)
    .maybeSingle();
  const body = (data as { body: string | null } | null)?.body ?? null;
  if (!body) return {};
  const trimmed = body.trim();
  if (!trimmed) return {};
  return { preview: trimmed.length > 140 ? `${trimmed.slice(0, 139)}…` : trimmed };
}

/**
 * `message.new` audience (spec §6.2) — every thread participant except the
 * sender. Workspace staff are always notified (the private staff thread is
 * theirs); talent + the client are added only on the `group` thread (the
 * private thread is staff-internal). The sender (`event.userId`) is filtered
 * out so a message never notifies its author. Email-only / digest-batched — the
 * in-app bell for messages is fanned out separately by `sendMessage`, so this
 * entry deliberately carries no `in_app` config (no double-notify).
 */
export const messageThreadAudience = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  if (!event.inquiryId || !event.tenantId) return [];
  const threadType = str(event.payload.threadType);
  const sender = str(event.userId);
  const r = await resolveInquiryRecipients(ctx.admin, event.inquiryId, event.tenantId);

  const members: AudienceMember[] = r.workspaceUserIds.map((userId) => ({
    kind: "user",
    userId,
    role: "workspace_member",
  }));
  if (threadType === "group") {
    for (const userId of r.talentUserIds) {
      members.push({ kind: "user", userId, role: "talent" });
    }
    if (r.clientUserId) {
      members.push({ kind: "user", userId: r.clientUserId, role: "client" });
    }
  }
  if (!sender) return members;
  return members.filter((m) => m.kind !== "user" || m.userId !== sender);
};
