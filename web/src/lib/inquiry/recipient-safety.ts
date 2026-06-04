/**
 * recipient-safety.ts — Lane C (recipient safety: block + report).
 *
 * Spec:     web/docs/conversational-inquiry-deep-dives-2026-06-03.md Part C, layer L5.
 * Contract: web/src/lib/inquiry/guest-chat-contract.ts §8
 *           (InquiryReportReason / BlockSubjectType / BlockScope) + the S4
 *           migrationColumns block, and GuestTrustChipProps.onBlock / onReport.
 * Migration: supabase/migrations/20261018000000_recipient_safety_blocks_reports.sql
 *           (user_blocks + inquiry_reports). Timestamp reassigned at integration.
 *
 * Three exports:
 *   • isBlocked()       — REUSABLE server-side guard. Returns true when a
 *                         message from this sender (guest session OR client
 *                         user) must be refused because a recipient in the
 *                         tenant has blocked them. Designed to be called from
 *                         the guest message-send + inquiry-create paths. Those
 *                         paths are Lane A's (sendGuestMessageAction /
 *                         startGuestChatInquiry) — wiring is an INTEGRATION
 *                         POINT (see the call-site notes below).
 *   • blockSubject()    — staff action backing GuestTrustChipProps.onBlock.
 *   • reportInquiry()   — staff action backing GuestTrustChipProps.onReport.
 *
 * Security posture (matches the guest-chat contract notes §1/§2):
 *   • isBlocked() runs a SERVICE-ROLE read (the guest caller is anon — no JWT —
 *     so it cannot use RLS). It is a pure ownership-free lookup keyed on the
 *     tenant + the subject id resolved by the caller; it NEVER accepts a
 *     blocker identity from the client.
 *   • blockSubject() / reportInquiry() resolve the acting staff user from the
 *     auth session (getCachedActorSession) and verify the actor is staff of the
 *     inquiry's tenant via is_staff_of_tenant (enforced both by the RLS policy
 *     on the tables and by an explicit app-layer check here) BEFORE any write.
 *     The blocker_user_id / reporter_user_id is the SERVER-resolved actor — it
 *     is never a client argument.
 *
 * This module is server-only (it imports the Supabase service-role client). The
 * trust chip imports ONLY the contract types and receives the two staff actions
 * as injected callbacks (GuestTrustChipProps.onBlock / onReport).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary — the single source of truth is the shared contract
// (web/src/lib/inquiry/guest-chat-contract.ts §8), which itself mirrors the S4
// DB CHECK constraints. We re-export the three enums from here so existing
// importers of recipient-safety keep working, but the definitions now live in
// ONE place (the contract). The DB CHECK constraints remain the runtime
// authority.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  InquiryReportReason,
  BlockSubjectType,
  BlockScope,
} from "@/lib/inquiry/guest-chat-contract";

export type { InquiryReportReason, BlockSubjectType, BlockScope };

const REPORT_REASONS: ReadonlySet<InquiryReportReason> = new Set([
  "spam",
  "harassment",
  "scam_or_fraud",
  "off_platform",
  "inappropriate",
  "other",
]);

// ─────────────────────────────────────────────────────────────────────────────
// UUID guard. The subject ids and recipient ids flow into PostgREST filters; a
// non-UUID value (comma, PostgREST operator) could alter an `.or()` / `.in()`
// filter (filter injection). Callers pass server-resolved UUIDs today, but the
// guard is documented as reusable, so we validate at the boundary regardless.
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// isBlocked() — the reusable enforcement guard.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The subject a guard call is about. Exactly one identity is meaningful per
 * sender: a guest-in-thread sender has `guestSessionId` (no client user yet);
 * a registered client sender has `clientUserId`. Callers may pass both when a
 * guest has been claimed into a client account — the guard treats a hit on
 * EITHER as blocked.
 */
export type BlockCheckSubject = {
  /** Tenant the inquiry/message belongs to (inquiries.tenant_id). Required. */
  tenantId: string;
  /** The guest session id resolved from x-impronta-guest (inquiries.guest_session_id). */
  guestSessionId?: string | null;
  /** The registered client user id (inquiries.client_user_id). */
  clientUserId?: string | null;
  /**
   * The user ids that are RECIPIENTS of this conversation — the talent's owning
   * user(s) + the tenant's coordinator/staff. When provided (non-empty), ONLY
   * blocks authored by one of these users count: a forged/stray user_blocks row
   * authored by an unrelated user in the same tenant cannot deny this
   * conversation. Resolve server-side from the inquiry's participants (existing
   * inquiry) or the targeted talent + tenant staff (inquiry-create, pre-insert).
   *
   * Omit/null preserves the legacy tenant-wide match (any block row in the
   * tenant against the subject) — kept only as a defensive default; the
   * guest-chat call sites SHOULD pass the scoped recipient set.
   */
  recipientUserIds?: string[] | null;
};

export type BlockCheckResult = {
  /** True when at least one block row matches the subject within the tenant. */
  blocked: boolean;
  /**
   * The matched block's scope, when blocked. 'all' is a stronger block than
   * 'messaging'; for the guest-chat MVP both refuse a send, so callers can treat
   * `blocked === true` as "refuse". Null when not blocked.
   */
  scope: BlockScope | null;
};

const NOT_BLOCKED: BlockCheckResult = { blocked: false, scope: null };

/**
 * Returns whether a sender (guest session and/or client user) is blocked by ANY
 * recipient within the given tenant. Intended for the guest message-send +
 * inquiry-create paths.
 *
 * Fail-OPEN on infrastructure error (missing service-role client / query
 * error): a transient lookup failure must NOT silently swallow a legitimate
 * buyer's first message. Abuse is mitigated by the rate-limit + report layers;
 * a hard-fail here would convert worse than an honest form. The failure is
 * logged for observability.
 *
 * Accepts an optional pre-built client (e.g. the caller's service-role client)
 * to avoid re-instantiating it inside a hot path; defaults to a fresh
 * service-role client.
 *
 * INTEGRATION POINT (Lane A): call this with the subject resolved server-side
 *   — never from a client argument — in:
 *     • sendGuestMessageAction  (after resolving inquiries.{tenant_id,
 *       guest_session_id, client_user_id}; refuse with GuestChatFailure code
 *       'blocked' when blocked).
 *     • startGuestChatInquiry   (after resolving the guest session id + the
 *       provisioned client_user_id; refuse before createInquiryFromIntent).
 */
export async function isBlocked(
  subject: BlockCheckSubject,
  client?: SupabaseClient,
): Promise<BlockCheckResult> {
  // UUID-validate the subject ids before they reach a PostgREST filter. A
  // non-UUID value is treated as "no such subject" (it can't have a block row)
  // and is dropped rather than concatenated into the filter string.
  const guestSessionId = isUuid(subject.guestSessionId) ? subject.guestSessionId : null;
  const clientUserId = isUuid(subject.clientUserId) ? subject.clientUserId : null;

  // No resolvable subject ⇒ nothing to block on.
  if (!isUuid(subject.tenantId) || (!guestSessionId && !clientUserId)) {
    return NOT_BLOCKED;
  }

  // Scope to recipient-authored blocks when the caller resolved them. Non-UUID
  // entries are dropped. An EMPTY scoped list (caller passed [] — e.g. the
  // inquiry has no resolvable recipient yet) means there is nobody whose block
  // could legitimately apply, so we report not-blocked.
  const scopedRecipients =
    subject.recipientUserIds == null
      ? null
      : subject.recipientUserIds.filter(isUuid);
  if (scopedRecipients != null && scopedRecipients.length === 0) {
    return NOT_BLOCKED;
  }

  const db = client ?? createServiceRoleClient();
  if (!db) {
    // Fail-open (see above) — but log: a missing service-role client in a
    // safety path is a real misconfiguration.
    logServerError(
      "recipient-safety.isBlocked",
      new Error("service-role client unavailable; failing open"),
    );
    return NOT_BLOCKED;
  }

  try {
    let query = db
      .from("user_blocks")
      .select("scope")
      .eq("tenant_id", subject.tenantId)
      .limit(1);

    // Only honor blocks authored by an actual recipient of this conversation,
    // when the caller scoped them. Without this, a forged/unrelated user_blocks
    // row in the tenant could deny a conversation it has nothing to do with.
    if (scopedRecipients != null) {
      query = query.in("blocker_user_id", scopedRecipients);
    }

    // Match a block on EITHER subject identity. PostgREST `.or()` with the two
    // partial-indexed columns; null ids are excluded by being absent from the
    // OR clause. Both ids are UUID-validated above, so the filter is safe.
    const orParts: string[] = [];
    if (guestSessionId) orParts.push(`blocked_guest_session_id.eq.${guestSessionId}`);
    if (clientUserId) orParts.push(`blocked_client_user_id.eq.${clientUserId}`);
    query = query.or(orParts.join(","));

    const { data, error } = await query.maybeSingle();
    if (error) {
      logServerError("recipient-safety.isBlocked", error);
      return NOT_BLOCKED;
    }
    if (!data) return NOT_BLOCKED;

    const scope = (data.scope as BlockScope | null) ?? "messaging";
    return { blocked: true, scope };
  } catch (err) {
    logServerError("recipient-safety.isBlocked", err);
    return NOT_BLOCKED;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: resolve the acting staff user + the inquiry's tenant, and verify the
// actor is staff of that tenant. Used by both staff actions below.
// ─────────────────────────────────────────────────────────────────────────────

type StaffActorContext = {
  /** Service-role write client (RLS bypass behind the app-layer staff gate). */
  admin: SupabaseClient;
  /** The acting staff user's profile id (= blocker_user_id / reporter_user_id). */
  actorUserId: string;
  /** The tenant the inquiry belongs to. */
  tenantId: string;
};

type ResolveStaffActorResult =
  | { ok: true; ctx: StaffActorContext }
  | { ok: false; reason: "unauthenticated" | "db_unavailable" | "not_found" | "forbidden" };

/**
 * Resolve + authorise the staff actor for an inquiry-scoped safety write.
 *
 * Steps:
 *   1. require an auth session (the recipient performing block/report is a
 *      logged-in staff/talent user — never a guest).
 *   2. load inquiries.tenant_id for the inquiry.
 *   3. assert the actor is staff of that tenant via is_staff_of_tenant (the
 *      authenticated server client runs the RPC under the caller's identity).
 */
async function resolveStaffActor(inquiryId: string): Promise<ResolveStaffActorResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, reason: "unauthenticated" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, reason: "db_unavailable" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "db_unavailable" };

  // Resolve the inquiry's tenant via the service-role client (the recipient may
  // not have a direct RLS-readable row depending on participant wiring; the
  // staff check below is the real gate).
  const { data: inquiryRow, error: inquiryErr } = await admin
    .from("inquiries")
    .select("tenant_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inquiryErr) {
    logServerError("recipient-safety.resolveStaffActor", inquiryErr);
    return { ok: false, reason: "db_unavailable" };
  }
  const tenantId = (inquiryRow?.tenant_id as string | undefined) ?? null;
  if (!tenantId) return { ok: false, reason: "not_found" };

  // App-layer staff gate (defence-in-depth alongside the table RLS). Runs the
  // helper under the CALLER's identity via the authenticated server client.
  const { data: isStaff, error: staffErr } = await supabase.rpc("is_staff_of_tenant", {
    target_tenant_id: tenantId,
  });
  if (staffErr) {
    logServerError("recipient-safety.resolveStaffActor", staffErr);
    return { ok: false, reason: "db_unavailable" };
  }
  if (isStaff !== true) return { ok: false, reason: "forbidden" };

  return { ok: true, ctx: { admin, actorUserId: session.user.id, tenantId } };
}

// ─────────────────────────────────────────────────────────────────────────────
// blockSubject() — staff blocks a guest session or a client user.
//   Backs GuestTrustChipProps.onBlock (() => Promise<{ ok: boolean }>).
// ─────────────────────────────────────────────────────────────────────────────

export type BlockSubjectInput = {
  /**
   * The inquiry whose sender is being blocked. The tenant + staff authorisation
   * are derived from this inquiry; the subject id below is the sender on it.
   */
  inquiryId: string;
  /** Which kind of subject is being blocked. */
  subjectType: BlockSubjectType;
  /**
   * The subject id — a guest_sessions.id (subjectType 'guest_session') OR a
   * profiles.id (subjectType 'client_user'). Resolved by the trust-chip's
   * server wrapper from the inquiry's sender, never typed by the end user.
   */
  subjectId: string;
  /** Block scope. Defaults to 'messaging'. */
  scope?: BlockScope;
  /** Optional free-text note. */
  reason?: string | null;
};

export type BlockSubjectResult = { ok: boolean };

/**
 * Idempotent: a repeat block of the same subject by the same staff user in the
 * same tenant resolves to ok (the partial-unique index makes the second insert
 * a conflict, which is treated as success).
 */
export async function blockSubject(input: BlockSubjectInput): Promise<BlockSubjectResult> {
  if (!input.inquiryId || !input.subjectId) return { ok: false };
  // The subject id is written into a UUID column and (via isBlocked) read back
  // into a PostgREST filter — reject anything that isn't a UUID at the boundary.
  if (!isUuid(input.subjectId)) return { ok: false };
  if (input.subjectType !== "guest_session" && input.subjectType !== "client_user") {
    return { ok: false };
  }

  const resolved = await resolveStaffActor(input.inquiryId);
  if (!resolved.ok) return { ok: false };
  const { admin, actorUserId, tenantId } = resolved.ctx;

  const scope: BlockScope = input.scope === "all" ? "all" : "messaging";
  const isGuest = input.subjectType === "guest_session";

  const row = {
    tenant_id: tenantId,
    blocker_user_id: actorUserId,
    blocked_subject_type: input.subjectType,
    blocked_guest_session_id: isGuest ? input.subjectId : null,
    blocked_client_user_id: isGuest ? null : input.subjectId,
    scope,
    reason: input.reason?.trim() || null,
  };

  // onConflict targets the relevant partial-unique index; ignoreDuplicates so a
  // re-block is a no-op success rather than an error.
  const conflictTarget = isGuest
    ? "tenant_id,blocker_user_id,blocked_guest_session_id"
    : "tenant_id,blocker_user_id,blocked_client_user_id";

  const { error } = await admin
    .from("user_blocks")
    .upsert(row, { onConflict: conflictTarget, ignoreDuplicates: true });
  if (error) {
    logServerError("recipient-safety.blockSubject", error);
    return { ok: false };
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// reportInquiry() — staff reports a sender on an inquiry.
//   Backs GuestTrustChipProps.onReport ((reason) => Promise<{ ok: boolean }>).
// ─────────────────────────────────────────────────────────────────────────────

export type ReportInquiryInput = {
  /** The inquiry being reported. Tenant + staff authorisation derive from it. */
  inquiryId: string;
  /** The report reason (mirrors the DB CHECK + the contract enum). */
  reason: InquiryReportReason;
  /** Optional detail text. */
  detail?: string | null;
};

export type ReportInquiryResult = { ok: boolean };

/**
 * Files an inquiry_reports row. The reported subject (guest session / client
 * user) is denormalised from the inquiry server-side, so the review queue and
 * the subject-rollup don't have to re-join through the inquiry.
 *
 * TRUST-DOWN HOOK (designed, NOT implemented here — by design, see task):
 *   This report is the signal that feeds the buyer's trust ladder DOWN. The
 *   write target is client_trust_state via writeClientTrustLevel()
 *   (web/src/lib/client-trust/evaluator.ts) — a future reconciler counts
 *   open/total inquiry_reports for inquiries.client_user_id and lowers
 *   trust_level (e.g. caps below 'verified' or sets a negative manual_override)
 *   once a threshold of distinct reporters is crossed. Repeated reports against
 *   one reported subject are ALSO the hook for account_status='suspended'
 *   (Lane C / L6 review queue). The denormalised reported_*_id columns +
 *   inquiry_reports_{guest,client}_subject_idx exist precisely to make that
 *   rollup cheap. This action intentionally does NOT mutate trust here —
 *   lowering trust on a single unreviewed report would be abusable; the
 *   threshold/reconcile lives behind the review queue.
 */
export async function reportInquiry(input: ReportInquiryInput): Promise<ReportInquiryResult> {
  if (!input.inquiryId) return { ok: false };
  if (!REPORT_REASONS.has(input.reason)) return { ok: false };

  const resolved = await resolveStaffActor(input.inquiryId);
  if (!resolved.ok) return { ok: false };
  const { admin, actorUserId, tenantId } = resolved.ctx;

  // Denormalise the reported subject from the inquiry (one of these may be null
  // on a pure-guest thread that has no client user yet).
  const { data: inquiryRow, error: inquiryErr } = await admin
    .from("inquiries")
    .select("guest_session_id, client_user_id")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (inquiryErr) {
    logServerError("recipient-safety.reportInquiry", inquiryErr);
    return { ok: false };
  }

  const reportedGuestSessionId = (inquiryRow?.guest_session_id as string | null | undefined) ?? null;
  const reportedClientUserId = (inquiryRow?.client_user_id as string | null | undefined) ?? null;

  const { error } = await admin.from("inquiry_reports").insert({
    tenant_id: tenantId,
    inquiry_id: input.inquiryId,
    reporter_user_id: actorUserId,
    reported_guest_session_id: reportedGuestSessionId,
    reported_client_user_id: reportedClientUserId,
    reason: input.reason,
    detail: input.detail?.trim() || null,
    status: "open",
  });
  if (error) {
    logServerError("recipient-safety.reportInquiry", error);
    return { ok: false };
  }

  return { ok: true };
}
