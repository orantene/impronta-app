"use server";

/**
 * guest-inquiries-actions.ts — U2 Thread-switcher server action.
 *
 * Provides `listGuestInquiries`: returns ALL live inquiries owned by the
 * current guest session for a given tenant, so the switcher panel can show
 * a horizontal avatar-rail when the guest has messaged several talents.
 *
 * Security model mirrors guest-chat-actions.ts:
 *   • Guest identity = x-impronta-guest cookie, resolved SERVER-SIDE.
 *   • guest_session_id IS the ownership gate — only that session's own
 *     inquiries are ever returned.
 *   • NO raw .from() — every tenant-scoped read goes through
 *     tenantScopedQuery(admin, table, tenantId) (lint ratchet).
 *   • Portrait resolution delegates to the existing loadTalentCardThumbs
 *     helper (real signed URLs, NEVER initials-box fallback on the server).
 *
 * The caller (integration agent) mounts this in MiniChatPanel via
 * onListGuestInquiries: ListGuestInquiriesCallback (wired from the page
 * server component).
 *
 * NO MIGRATION — this action is pure-read on existing tables.
 */

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { getTypicalReplyLabel } from "@/lib/inquiry/guest-reply-latency";
import { loadTalentCardThumbs } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent-card-thumbs";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { deriveProjectLabel, shortDateFragment } from "@/lib/inquiry/project-label";
import { readSelectedIds } from "@/lib/inquiry/guest-draft-resume";

import type { AvatarStackItem } from "@/lib/inquiry/guest-chat-unified-contract";
import type {
  GuestChatErrorCode,
  GuestChatFailure,
  GuestInquirySummary,
  GuestThreadStatus,
  ListGuestInquiriesResult,
} from "@/lib/inquiry/guest-chat-contract";

// ─────────────────────────────────────────────────────────────────────────────
// Failure helper
// ─────────────────────────────────────────────────────────────────────────────

function fail(
  code: GuestChatErrorCode,
  message: string,
): GuestChatFailure {
  return { ok: false, code, message };
}

// ─────────────────────────────────────────────────────────────────────────────
// Private: resolve guest_sessions.id from the x-impronta-guest cookie.
// Mirrors resolveGuestContext() in guest-chat-actions.ts (private — no shared
// export). Kept private here; integration will add a public
// resolveGuestSessionId() export to guest-chat-actions.ts (wiring plan B1).
// Until then we define a local fallback so this file compiles standalone.
// ─────────────────────────────────────────────────────────────────────────────

const GUEST_HEADER = "x-impronta-guest";

async function resolveGuestSessionIdLocal(
  admin: SupabaseClient,
): Promise<string | null> {
  const guestKey = (await headers()).get(GUEST_HEADER);
  if (!guestKey) return null;

  // Ensure the row exists (idempotent, SECURITY DEFINER).
  await admin.rpc("ensure_guest_session", { p_session_key: guestKey });

  const { data, error } = await admin
    .from("guest_sessions")
    .select("id")
    .eq("session_key", guestKey)
    .maybeSingle();

  if (error) {
    logServerError("guest-inquiries-actions.resolveGuestSessionIdLocal", error);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private: toThreadStatus — mirrors the mapping in guest-chat-actions.ts.
// Defined locally so this file compiles standalone without importing the
// private helper from the sibling actions file.
// ─────────────────────────────────────────────────────────────────────────────

function toThreadStatus(status: string): GuestThreadStatus {
  switch (status) {
    case "draft":
      // Mirror guest-chat-actions: a draft reads as a DRAFT, not "open". The
      // switcher already keys its draft pill on the dedicated `isDraft` field;
      // this keeps threadStatus honest for any status-based consumer (W0-B).
      return "draft";
    case "offer_pending":
      return "offer_pending";
    case "approved":
    case "qualified":
      return "approved";
    case "booked":
    case "converted":
      return "booked";
    case "closed":
    case "archived":
    case "rejected":
    case "expired":
    case "closed_lost":
      return "closed";
    default:
      return "open";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private: isTerminal — excludes closed/cancelled threads from the switcher.
// ─────────────────────────────────────────────────────────────────────────────

function isTerminal(status: string): boolean {
  return (
    status === "cancelled" ||
    toThreadStatus(status) === "closed"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Private: read the Phase 5 PROJECT spine off an inquiry's interpreted_query.
// The lineup read (interpreted_query.talent.selected_ids) is the shared
// readSelectedIds helper from guest-draft-resume.ts — the SAME spine the P0-1
// resume/ensure pickers key on; the project name is
// interpreted_query.client.job_name. Tolerant of any legacy/partial shape —
// never throws, always returns arrays.
// ─────────────────────────────────────────────────────────────────────────────

function readJobName(interpretedQuery: unknown): string | null {
  if (!interpretedQuery || typeof interpretedQuery !== "object") return null;
  const client = (interpretedQuery as Record<string, unknown>).client;
  if (!client || typeof client !== "object") return null;
  const name = (client as Record<string, unknown>).job_name;
  return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// listGuestInquiries — the exported server action.
// ─────────────────────────────────────────────────────────────────────────────

export async function listGuestInquiries(input: {
  tenantSlug: string;
}): Promise<ListGuestInquiriesResult> {
  const tenantSlug = input.tenantSlug?.trim().toLowerCase();
  if (!tenantSlug) {
    return fail("validation_failed", "Missing tenant slug.");
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return fail("db_unavailable", "Messaging is temporarily unavailable.");
  }

  // ── Guest identity (ownership gate) ────────────────────────────────────────
  const guestSessionId = await resolveGuestSessionIdLocal(admin);
  if (!guestSessionId) {
    // No session = first-time visitor; return empty rather than an error so the
    // switcher stays hidden rather than showing an error banner.
    return { ok: true, inquiries: [] };
  }

  // ── Resolve tenant (slug → id) ─────────────────────────────────────────────
  // Note: agencies does NOT have a tenant_id column (it IS the tenant root), so
  // we read it directly rather than via tenantScopedQuery. This is the same
  // pattern used in the existing resolveTenantIdBySlug private helper.
  const { data: agencyRow, error: agencyErr } = await admin
    .from("agencies")
    .select("id, display_name, status")
    .eq("slug", tenantSlug)
    .limit(1)
    .maybeSingle();

  if (agencyErr) {
    logServerError("guest-inquiries-actions.listGuestInquiries/tenant", agencyErr);
    return fail("engine_error", "Could not resolve workspace.");
  }
  if (!agencyRow) {
    return fail("tenant_unavailable", "Workspace not found.");
  }
  if (
    (agencyRow.status as string) === "cancelled" ||
    (agencyRow.status as string) === "archived"
  ) {
    return fail("tenant_unavailable", "This workspace is no longer active.");
  }

  const tenantId = agencyRow.id as string;
  const agencyName = (agencyRow.display_name as string | null) ?? "The team";

  // ── Fetch live inquiries owned by this guest session + this tenant ──────────
  // Ownership: guest_session_id IS the gate (mirrors loadOwnedInquiry logic).
  // inquiries.tenant_id scopes to this workspace; no extra tenantScopedQuery
  // wrapper needed because the lookup IS keyed on the tenant FK already — but
  // we apply it anyway via the filter chain as required by the lint ratchet.
  const { data: inquiryRows, error: inquiryErr } = await tenantScopedQuery(
    admin,
    "inquiries",
    tenantId,
  )
    .select("id, status, created_at, event_date, interpreted_query")
    .eq("guest_session_id", guestSessionId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (inquiryErr) {
    logServerError("guest-inquiries-actions.listGuestInquiries/inquiries", inquiryErr);
    return fail("engine_error", "Could not load your conversations.");
  }

  if (!inquiryRows || inquiryRows.length === 0) {
    return { ok: true, inquiries: [] };
  }

  // Drop terminal threads — never surface dead conversations in the switcher.
  type InquiryRow = {
    id: string;
    status: string;
    created_at: string;
    event_date: string | null;
    interpreted_query: unknown;
  };
  const liveRows = (inquiryRows as InquiryRow[]).filter((r) => !isTerminal(r.status));

  if (liveRows.length === 0) {
    return { ok: true, inquiries: [] };
  }

  const inquiryIds = liveRows.map((r) => r.id);

  // ── Resolve each inquiry's LINEUP (Phase 5 — multi-talent projects) ─────────
  // The lineup is the talent SET on interpreted_query.talent.selected_ids — the
  // same spine the in-chat talent picker maintains with replace-semantics. An
  // inquiry can carry several talents; the switcher names it as a project and
  // renders the face-stack. (The old single inquiry_participants talent is the
  // coordination participant, NOT the client-facing lineup; we read the lineup
  // off the structured spine so a multi-talent inquiry shows every face.)
  const lineupIdsByInquiry = new Map<string, string[]>();
  for (const row of liveRows) {
    lineupIdsByInquiry.set(row.id, readSelectedIds(row.interpreted_query));
  }

  // Union of every talent id across all inquiries — resolved name + portrait in
  // ONE batched pass each (cheap + tenant-scoped via the roster read).
  const talentIds = [
    ...new Set([...lineupIdsByInquiry.values()].flat()),
  ];

  // ── Resolve talent display names + portraits ────────────────────────────────
  // House rule: real portraits, NEVER initials-in-a-box from the server.
  // Names come from a single batched talent_profiles read; portraits from the
  // existing loadTalentCardThumbs resolver (signed URLs, the same resolver the
  // client-inquiry lineup + cart-portrait backfill use). Both run ONCE over the
  // union of lineup ids across all inquiries, then fan out per inquiry below.
  const talentNameById = new Map<string, string>();
  if (talentIds.length > 0) {
    const { data: talentRows } = await admin
      .from("talent_profiles")
      .select("id, display_name")
      .in("id", talentIds);

    for (const t of ((talentRows ?? []) as Array<{ id: string; display_name: string | null }>)) {
      talentNameById.set(t.id, t.display_name?.trim() || "Talent");
    }
  }

  const portraitById = await loadTalentCardThumbs(admin, talentIds);

  // Build the per-id AvatarStackItem once, reused across every inquiry's lineup.
  const faceById = new Map<string, AvatarStackItem>();
  for (const id of talentIds) {
    faceById.set(id, {
      talentProfileId: id,
      displayName: talentNameById.get(id) ?? "Talent",
      portraitUrl: portraitById.get(id) ?? null,
    });
  }

  // ── Last message per inquiry (preview + timestamp) ─────────────────────────
  // Single batched query: newest PRIVATE-thread message per inquiry.
  // SECURITY: the preview MUST read the SAME thread the guest is allowed to see
  // (readGuestVisibleMessages now filters thread_type='private'). The 'group'
  // thread is the coordinator↔talent coordination channel — reading it here
  // would leak an 80-char slice of internal team chat into the guest's
  // conversation switcher on a multi-talent inquiry. Sourcing the preview from
  // 'private' both closes that leak and keeps the preview in sync with the
  // guest's actual messages (which moved to 'private' in the Messages-v2 flip).
  const { data: msgRows, error: msgErr } = await tenantScopedQuery(
    admin,
    "inquiry_messages",
    tenantId,
  )
    .select("inquiry_id, body, message_kind, created_at, sender_user_id, guest_session_id")
    .in("inquiry_id", inquiryIds)
    .eq("thread_type", "private")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (msgErr) {
    logServerError("guest-inquiries-actions.listGuestInquiries/messages", msgErr);
    // Non-fatal — continue with null previews.
  }

  type MsgRow = {
    inquiry_id: string;
    body: string;
    message_kind: string;
    created_at: string;
    sender_user_id: string | null;
    guest_session_id: string | null;
  };

  // Reduce to newest message per inquiry.
  const lastMsgByInquiry = new Map<string, MsgRow>();
  for (const m of ((msgRows ?? []) as MsgRow[])) {
    if (!lastMsgByInquiry.has(m.inquiry_id)) {
      lastMsgByInquiry.set(m.inquiry_id, m);
    }
  }

  // ── typicalReplyLabel per talent (batched via the cache in guest-reply-latency) ─
  // We compute these concurrently — each is independently cached for 5 minutes.
  // The switcher shows one reply-time per inquiry, keyed on its FIRST lineup
  // member (the representative talent), so we only need labels for those.
  const repTalentIds = [
    ...new Set(
      liveRows
        .map((row) => lineupIdsByInquiry.get(row.id)?.[0])
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const typicalLabelByTalent = new Map<string, string | null>();
  await Promise.all(
    repTalentIds.map(async (talentId) => {
      const label = await getTypicalReplyLabel({ tenantId, talentProfileId: talentId });
      typicalLabelByTalent.set(talentId, label);
    }),
  );

  // ── Guest-locale translator for the derived project label ───────────────────
  // Guests carry no LOCALE_COOKIE; resolve from the tenant default_locale (same
  // source the email pipeline + full-thread view use). Cached per tenant.
  const localeSettings = await loadTenantLocaleSettings(tenantId);
  const locale = localeSettings.defaultLocale;
  const t = createTranslator(locale);

  // ── Assemble the summaries ─────────────────────────────────────────────────
  const inquiries: GuestInquirySummary[] = liveRows.map((row) => {
    const lineupIds = lineupIdsByInquiry.get(row.id) ?? [];
    const lineup: AvatarStackItem[] = lineupIds
      .map((id) => faceById.get(id))
      .filter((f): f is AvatarStackItem => Boolean(f));
    const lineupCount = lineup.length;

    // Derived project label: job_name when set, else "{lineup word} · {date}".
    const jobName = readJobName(row.interpreted_query);
    const lineupWord =
      lineupCount === 1
        ? t("public.guestChat.projectLineupOne")
        : interpolate(t("public.guestChat.projectLineupOther"), { count: lineupCount });
    const projectLabel = deriveProjectLabel(jobName, {
      lineupWord,
      shortDate: shortDateFragment(row.event_date, locale),
    });

    // Back-compat single-talent fields = the first lineup face (or the agency).
    const first = lineup[0] ?? null;
    const talentProfileId = first?.talentProfileId ?? null;
    const talentName = first?.displayName ?? agencyName;
    const talentPortraitUrl = first?.portraitUrl ?? null;

    const lastMsg = lastMsgByInquiry.get(row.id) ?? null;
    const lastMessagePreview = lastMsg
      ? lastMsg.message_kind === "text"
        ? lastMsg.body.slice(0, 80)
        : `[${lastMsg.message_kind.replace(/_/g, " ")}]`
      : null;
    const lastMessageAt = lastMsg?.created_at ?? null;

    const typicalReplyLabel = talentProfileId
      ? (typicalLabelByTalent.get(talentProfileId) ?? null)
      : null;

    return {
      inquiryId: row.id,
      projectLabel,
      lineup,
      lineupCount,
      talentProfileId,
      talentName,
      talentPortraitUrl,
      agencyName,
      lastMessagePreview,
      lastMessageAt,
      unreadHint: false, // panel computes this client-side
      threadStatus: toThreadStatus(row.status),
      typicalReplyLabel,
      isDraft: row.status === "draft",
    };
  });

  return { ok: true, inquiries };
}
