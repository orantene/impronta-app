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
      "contact_name, contact_email, event_date, event_location, client_user_id, coordinator_id, current_offer_id, source_context",
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
    source_context: unknown;
  };

  // G2 — a storefront service request stamps the offering onto source_context;
  // surface its title so subjects read "New inquiry assigned to you: {title}".
  // offeringSuffix interpolates to "" on ordinary inquiries (subjectVars fills
  // missing keys with an empty string, so the baked copy stays valid).
  let offeringTitle: string | null = null;
  const srcCtx = inq.source_context;
  if (srcCtx && typeof srcCtx === "object") {
    const off = (srcCtx as { offering?: { title?: unknown } }).offering;
    if (off && typeof off === "object" && typeof off.title === "string" && off.title.trim()) {
      offeringTitle = off.title.trim().slice(0, 80);
    }
  }

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
    offeringTitle,
    offeringSuffix: offeringTitle ? `: ${offeringTitle}` : "",
  };
}

/**
 * Resolve the offer id an offer-scoped event refers to: the event payload's
 * `offerId` (the `offer.sent` engine event carries `{ offerId }` in its `data`),
 * else the inquiry's `current_offer_id`. Returns null when neither is available.
 */
async function resolveEventOfferId(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<string | null> {
  const fromPayload = str(event.payload.offerId);
  if (fromPayload) return fromPayload;
  if (!event.inquiryId) return null;
  const { data } = await ctx.admin
    .from("inquiries")
    .select("current_offer_id")
    .eq("id", event.inquiryId)
    .maybeSingle();
  return (data as { current_offer_id?: string | null } | null)?.current_offer_id ?? null;
}

/**
 * The talents priced on a specific offer, one row per talent: join the offer's
 * line items (`inquiry_offer_line_items.talent_profile_id`) to the talent's auth
 * user (`talent_profiles.user_id`) and sum their `talent_cost` (a talent can
 * hold several lines, e.g. a day rate ×2). A row with no linked user is kept
 * with `userId: null` so the audience resolver can skip it while the hydrate
 * still ignores it. Net is the talent's OWN cost — never the client total.
 */
async function fetchOfferPricedTalent(
  ctx: AudienceContext,
  offerId: string,
): Promise<Array<{ talentProfileId: string; userId: string | null; netTotal: number }>> {
  const { data: liRows } = await ctx.admin
    .from("inquiry_offer_line_items")
    .select("talent_profile_id, talent_cost")
    .eq("offer_id", offerId);
  const rows = (liRows ?? []) as Array<{
    talent_profile_id: string | null;
    talent_cost: number | string | null;
  }>;
  const netByProfile = new Map<string, number>();
  for (const r of rows) {
    if (!r.talent_profile_id) continue;
    const cost = Number(r.talent_cost ?? 0);
    const prev = netByProfile.get(r.talent_profile_id) ?? 0;
    netByProfile.set(r.talent_profile_id, prev + (Number.isFinite(cost) ? cost : 0));
  }
  const profileIds = Array.from(netByProfile.keys());
  if (profileIds.length === 0) return [];
  const { data: tpRows } = await ctx.admin
    .from("talent_profiles")
    .select("id, user_id")
    .in("id", profileIds);
  const userByProfile = new Map<string, string | null>();
  for (const tp of (tpRows ?? []) as Array<{ id: string; user_id: string | null }>) {
    userByProfile.set(tp.id, tp.user_id ?? null);
  }
  return profileIds.map((pid) => ({
    talentProfileId: pid,
    userId: userByProfile.get(pid) ?? null,
    netTotal: netByProfile.get(pid) ?? 0,
  }));
}

/** Format a decimal money amount + ISO-4217 code as "USD 1,200.00"; "" when
 *  non-finite or non-positive so a template row drops out cleanly. */
function formatOfferMoney(amount: number, currency: string | null): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const code = (currency ?? "").trim().toUpperCase();
  const value = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return code ? `${code} ${value}` : value;
}

/**
 * Hydrate inquiry context PLUS the per-talent net rate for an offer-scoped
 * event (`offer.sent.talent`). Extends `loadInquiryView` with:
 *  - `offerId`      — the resolved offer id (echoed so the resolver + render agree).
 *  - `offerCurrency`— the offer's `currency_code`.
 *  - `talentNetByUserId` — { [talentUserId]: "USD 1,200.00" }, each talent's OWN
 *    summed `talent_cost` in the offer currency. The render looks up the
 *    recipient's own user id so one talent NEVER sees another's rate or the
 *    client total. Degrades to the bare inquiry view if the offer can't resolve.
 */
export async function loadOfferTalentView(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const base = await loadInquiryView(event, ctx);
  const offerId = await resolveEventOfferId(event, ctx);
  if (!offerId) return base;
  const { data: offerRow } = await ctx.admin
    .from("inquiry_offers")
    .select("currency_code")
    .eq("id", offerId)
    .maybeSingle();
  const currency = (offerRow as { currency_code?: string | null } | null)?.currency_code ?? null;
  const rows = await fetchOfferPricedTalent(ctx, offerId);
  const talentNetByUserId: Record<string, string> = {};
  for (const r of rows) {
    if (!r.userId) continue;
    talentNetByUserId[r.userId] = formatOfferMoney(r.netTotal, currency);
  }
  return { ...base, offerId, offerCurrency: currency, talentNetByUserId };
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

/**
 * The talents priced on THIS offer (`offer.sent.talent`) — only those with a
 * line item on the event's offer, not the whole roster. Resolves the offer id
 * from the payload (`offerId`) or the inquiry's `current_offer_id`, then returns
 * one talent member per linked auth user (deduped). A priced talent with no
 * account is skipped (they can't receive an in-app / email notification).
 */
export const offerPricedTalent = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const offerId = await resolveEventOfferId(event, ctx);
  if (!offerId) return [];
  const rows = await fetchOfferPricedTalent(ctx, offerId);
  const seen = new Set<string>();
  const members: AudienceMember[] = [];
  for (const r of rows) {
    if (!r.userId || seen.has(r.userId)) continue;
    seen.add(r.userId);
    members.push({ kind: "user", userId: r.userId, role: "talent" });
  }
  return members;
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
 * Workspace Manager-and-above for the event's tenant — who can act on roster
 * join requests (Tenant Registration Engine). The DB value for the Manager tier
 * is still `coordinator` during the staged coordinator→manager rename, so the
 * set is owner/admin/coordinator. Empty without a tenant scope.
 */
export const workspaceManagersPlus = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  if (!event.tenantId) return [];
  const { data, error } = await ctx.admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", event.tenantId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "coordinator"]);
  if (error || !data) return [];
  return (data as Array<{ profile_id: string | null }>)
    .map((r) => r.profile_id)
    .filter((id): id is string => Boolean(id))
    .map((userId) => ({ kind: "user" as const, userId, role: "workspace_member" as const }));
};

/**
 * Workspace owner(s) for the event's tenant — the billing-responsible party for
 * plan-change + cancellation notices (spec §6.6). Mirrors `workspaceAdmins` but
 * narrows to `role = 'owner'`; keys on `agency_memberships.profile_id` (the
 * canonical user id, not the non-existent `user_id` column). Empty without a
 * tenant scope.
 */
export const workspaceOwner = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  if (!event.tenantId) return [];
  const { data, error } = await ctx.admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", event.tenantId)
    .eq("status", "active")
    .eq("role", "owner");
  if (error || !data) return [];
  return (data as Array<{ profile_id: string | null }>)
    .map((r) => r.profile_id)
    .filter((id): id is string => Boolean(id))
    .map((userId) => ({ kind: "user" as const, userId, role: "workspace_member" as const }));
};

// ─── Payment + payout resolvers (Slice 15.4, spec §6.5) ────────────────────────
// Read the transaction fields the `markPaid` / `markPayoutSent` producers copy
// onto the event payload; the dispatcher hydrates + dedupes the result.

/**
 * The party who paid for a booking transaction (`payment.received.client`). The
 * authenticated payer when known (`payerUserId`), else the guest contact
 * (`payerEmail`). Mirrors `clientOrGuest` but keys on the transaction's payer
 * fields rather than the inquiry's client.
 */
export const transactionPayer = async (event: NotificationEvent): Promise<AudienceMember[]> => {
  const userId = str(event.payload.payerUserId);
  if (userId) return [{ kind: "user", userId, role: "client" }];
  const email = str(event.payload.payerEmail);
  if (email) {
    return [{ kind: "guest", email, displayName: str(event.payload.contactName), role: "client" }];
  }
  return [];
};

/**
 * The talent behind a settled payout (`payment.payout_settled.talent`). The
 * `markPayoutSent` producer carries the transaction's `payoutAccountId`
 * (= `payout_accounts.id`); resolve it through `payout_accounts.owner_id` (the
 * talent_profile id for a talent-owned account) to `talent_profiles.user_id`.
 * Returns nothing for a non-talent payout account or an unclaimed profile.
 */
export const payoutReceiverTalent = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const payoutAccountId = str(event.payload.payoutAccountId);
  if (!payoutAccountId) return [];
  const { data: acct } = await ctx.admin
    .from("payout_accounts")
    .select("owner_type, owner_id")
    .eq("id", payoutAccountId)
    .maybeSingle();
  const a = acct as { owner_type: string | null; owner_id: string | null } | null;
  if (!a || a.owner_type !== "talent" || !a.owner_id) return [];
  const { data: tp } = await ctx.admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", a.owner_id)
    .maybeSingle();
  const userId = (tp as { user_id: string | null } | null)?.user_id ?? null;
  if (!userId) return [];
  return [{ kind: "user", userId, role: "talent" }];
};

/**
 * The talent behind a reversed payout leg (`payment.payout_reversed.talent`).
 * The reversal producer carries the `inquiry_participants.id` (the booking
 * participant whose transfer was clawed back); resolve it to the talent's user
 * account. Returns nothing for a participant with no linked user.
 */
export const payoutReversedTalent = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const participantId = str(event.payload.participantId);
  if (!participantId) return [];
  const { data } = await ctx.admin
    .from("inquiry_participants")
    .select("user_id")
    .eq("id", participantId)
    .maybeSingle();
  const userId = (data as { user_id: string | null } | null)?.user_id ?? null;
  if (!userId) return [];
  return [{ kind: "user", userId, role: "talent" }];
};

/**
 * The client on a refunded / dispute-reversed / partially-refunded booking
 * (`payment.refunded.client`, `payment.partial_refund.client`). The
 * authenticated client when known (`clientUserId`), else the guest contact
 * (`clientEmail`). Mirrors `transactionPayer` but keys on the reversal
 * producer's client fields.
 */
export const refundedClient = async (event: NotificationEvent): Promise<AudienceMember[]> => {
  const userId = str(event.payload.clientUserId);
  if (userId) return [{ kind: "user", userId, role: "client" }];
  const email = str(event.payload.clientEmail);
  if (email) {
    return [{ kind: "guest", email, displayName: str(event.payload.contactName), role: "client" }];
  }
  return [];
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
 * Email-only guest on the event payload (contactEmail). Used by guest
 * support so a ticket with requester_user_id = null still reaches inbox.
 * Never add an in_app block on entries that use this resolver.
 */
export const eventGuestContact =
  (role: AudienceMember["role"] = "guest") =>
  async (event: NotificationEvent): Promise<AudienceMember[]> => {
    const email = str(event.payload.contactEmail);
    if (!email) return [];
    return [
      {
        kind: "guest",
        email,
        displayName: str(event.payload.contactName),
        role,
      },
    ];
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
