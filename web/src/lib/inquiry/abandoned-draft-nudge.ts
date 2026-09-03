/**
 * STATUS (2026-09-03): UNWIRED SCAFFOLD, deliberately. Neither
 * `findAbandonedDrafts` nor `runAbandonedDraftNudgeSweep` has a caller, and
 * there is no cron entry for them — it shipped as a scaffold (commit 9d1fe876a,
 * "abandoned-draft scaffold") and was never finished.
 *
 * Recorded here because a notification audit keeps rediscovering it as a
 * "built but never sent" entry and spending time re-deriving that it is
 * intentional. It is not a wiring bug.
 *
 * TO FINISH IT you need: a route under src/app/api/cron/, a `crons` entry in
 * vercel.json, and a catalog entry for whatever event the sweep dispatches.
 * Do NOT schedule it before `inquiry_drafts` actually carries rows (it has
 * none in production today) — an email path that has never executed against
 * real data should not go live on a cron nobody is watching.
 */
/**
 * abandoned-draft-nudge.ts — Phase 8 (returning-visitor nudges), part 3.
 *
 * SCAFFOLD + PLAN. This module holds the QUERY and the per-row nudge LOGIC for
 * the abandoned-draft re-engagement sweep: find inquiries that have sat in a
 * DRAFT state for N+ days, that carry a REAL promoted contact (never the
 * synthetic pending-...@guest.impronta seed), and that have not already been
 * nudged, then compose + send the nudge through the existing email system.
 *
 * It is intentionally NOT wired to a schedule. Running it needs a recurring
 * trigger the OWNER must set up (Vercel cron entry in web/vercel.json + a
 * /api/cron/abandoned-draft-nudge route guarded by CRON_SECRET, OR a Supabase
 * pg_cron job). See the OWNER PLAN block at the bottom of this file. Until that
 * trigger exists nothing calls runAbandonedDraftNudgeSweep, so no mail is sent.
 *
 * Safety invariants (do NOT relax):
 *   • REAL contact only. A draft whose contact is still the placeholder seed is
 *     NEVER emailed (placeholder => no real inbox; mailing it would bounce and
 *     could leak inquiry existence to a typo address). The gate is the same
 *     placeholder string-match the receipt layer uses (isPlaceholderContact).
 *   • Idempotent. Once a draft is nudged we stamp source_context
 *     .abandoned_nudge_sent_at so a re-run never double-mails the same draft.
 *     This avoids a new migration; the OWNER may promote it to a dedicated
 *     inquiries column when wiring the schedule (see plan).
 *   • NO migration. Pure reads + a JSON-merge write on the existing
 *     source_context column.
 *
 * Run (manual, once the route exists):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/abandoned-draft-nudge
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email";
import { abandonedDraftNudgeEmail } from "@/lib/email/templates";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

/** A draft is "abandoned" once it has been untouched for this long. */
export const ABANDONED_DRAFT_AGE_DAYS = 3;

/** source_context key used to mark a draft as already nudged (idempotency). */
export const ABANDONED_NUDGE_STAMP_KEY = "abandoned_nudge_sent_at";

/** Safety cap per sweep so a backlog never floods the provider in one run. */
export const ABANDONED_NUDGE_BATCH_LIMIT = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder contact gate (mirrors inquiry-receipt-data.ts / guest-chat-actions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when the email is the synthetic guest seed (pending-...@guest.impronta).
 * Such a contact was NEVER promoted to a real inbox, so it must never be mailed.
 * Kept identical to the receipt-layer check so the two never drift.
 */
export function isPlaceholderContact(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e.startsWith("pending-") && e.endsWith("@guest.impronta");
}

/** A contact is "real / promoted" when it is present and not the seed. */
export function hasRealPromotedContact(email: string | null | undefined): boolean {
  const e = (email ?? "").trim();
  return e.length > 0 && !isPlaceholderContact(e);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AbandonedDraftRow = {
  id: string;
  tenantId: string;
  contactEmail: string;
  contactName: string | null;
  sourceContext: Record<string, unknown> | null;
  createdAt: string;
};

export type AbandonedNudgeSweepResult = {
  /** Drafts the query returned before per-row gating. */
  scanned: number;
  /** Drafts skipped because the contact was a placeholder / missing. */
  skippedNoContact: number;
  /** Drafts skipped because they were already nudged. */
  skippedAlreadyNudged: number;
  /** Nudges actually dispatched (or skipped by the email layer in dev). */
  sent: number;
  /** Per-row send/stamp failures (logged; the sweep continues). */
  failed: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Query — abandoned drafts eligible for a nudge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find DRAFT inquiries older than `ageDays` that carry a real promoted contact
 * and have not yet been nudged. The placeholder + already-nudged gates run in
 * application code (the seed is a string-match and the nudge stamp lives inside
 * the JSON source_context), so the SQL stays a plain status + age window read.
 *
 * `now` is injectable for deterministic tests.
 */
export async function findAbandonedDrafts(
  admin: SupabaseClient,
  opts: { ageDays?: number; limit?: number; now?: number } = {},
): Promise<AbandonedDraftRow[]> {
  const ageDays = opts.ageDays ?? ABANDONED_DRAFT_AGE_DAYS;
  const limit = opts.limit ?? ABANDONED_NUDGE_BATCH_LIMIT;
  const now = opts.now ?? Date.now();
  const cutoffIso = new Date(now - ageDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, contact_email, contact_name, source_context, created_at, updated_at")
    .eq("status", "draft")
    .lte("updated_at", cutoffIso)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    logServerError("abandoned-draft-nudge.findAbandonedDrafts", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    contactEmail: ((r.contact_email as string | null) ?? "").trim(),
    contactName: ((r.contact_name as string | null) ?? "").trim() || null,
    sourceContext: (r.source_context as Record<string, unknown> | null) ?? null,
    createdAt: (r.created_at as string) ?? cutoffIso,
  }));
}

/** True when this draft's source_context already carries the nudge stamp. */
export function wasAlreadyNudged(row: AbandonedDraftRow): boolean {
  const stamp = row.sourceContext?.[ABANDONED_NUDGE_STAMP_KEY];
  return typeof stamp === "string" && stamp.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-tenant lookups (agency name for the email voice + lineup count)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveAgencyName(admin: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await admin
    .from("agencies")
    .select("display_name")
    .eq("id", tenantId)
    .maybeSingle();
  return ((data?.display_name as string | null) ?? "").trim() || "the team";
}

async function resolveLineupCount(admin: SupabaseClient, inquiryId: string): Promise<number> {
  const { count } = await admin
    .from("inquiry_participants")
    .select("id", { count: "exact", head: true })
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent");
  return typeof count === "number" ? count : 0;
}

/**
 * Stamp the draft as nudged by merging the timestamp into the existing
 * source_context JSON (idempotency without a migration).
 */
async function stampNudged(
  admin: SupabaseClient,
  row: AbandonedDraftRow,
  sentAtIso: string,
): Promise<boolean> {
  const nextContext = {
    ...(row.sourceContext ?? {}),
    [ABANDONED_NUDGE_STAMP_KEY]: sentAtIso,
  };
  const { error } = await admin
    .from("inquiries")
    .update({ source_context: nextContext })
    .eq("id", row.id);
  if (error) {
    logServerError("abandoned-draft-nudge.stampNudged", error);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sweep — compose + send the nudge for each eligible draft
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one abandoned-draft nudge sweep. Pure orchestration over the helpers
 * above; safe to call repeatedly (the stamp gate makes it idempotent). NEVER
 * throws — a per-row failure is logged and counted, and the sweep continues.
 *
 * NOTE: this is the function a future /api/cron/abandoned-draft-nudge route (or
 * pg_cron job) would call. No such trigger is wired yet (see OWNER PLAN).
 */
export async function runAbandonedDraftNudgeSweep(
  admin: SupabaseClient,
  opts: { ageDays?: number; limit?: number; now?: number } = {},
): Promise<AbandonedNudgeSweepResult> {
  const drafts = await findAbandonedDrafts(admin, opts);
  const result: AbandonedNudgeSweepResult = {
    scanned: drafts.length,
    skippedNoContact: 0,
    skippedAlreadyNudged: 0,
    sent: 0,
    failed: 0,
  };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  for (const row of drafts) {
    // Gate 1 — REAL promoted contact only. A placeholder seed is never mailed.
    if (!hasRealPromotedContact(row.contactEmail)) {
      result.skippedNoContact += 1;
      continue;
    }
    // Gate 2 — never double-nudge.
    if (wasAlreadyNudged(row)) {
      result.skippedAlreadyNudged += 1;
      continue;
    }

    try {
      const [agencyName, lineupCount] = await Promise.all([
        resolveAgencyName(admin, row.tenantId),
        resolveLineupCount(admin, row.id),
      ]);

      // The resume deep-link sends the visitor back so the launcher resolves to
      // the "Finish your inquiry (N)" resume_draft state. A bare site root is a
      // safe default; the OWNER can swap in a per-tenant canonical host when
      // wiring the schedule (see plan).
      const resumeHref = siteUrl || "https://tulala.digital";

      const { subject, html } = abandonedDraftNudgeEmail({
        contactName: row.contactName,
        agencyName,
        resumeHref,
        lineupCount,
      });

      const sentAtIso = new Date().toISOString();
      await sendEmail({
        to: row.contactEmail,
        subject,
        html,
        tenantId: row.tenantId,
        tenantName: agencyName,
      });

      // Stamp regardless of the dev no-op send result: once we have attempted a
      // dispatch we must not re-enqueue this draft on the next sweep.
      const stamped = await stampNudged(admin, row, sentAtIso);
      if (stamped) result.sent += 1;
      else result.failed += 1;
    } catch (err) {
      logServerError("abandoned-draft-nudge.runAbandonedDraftNudgeSweep/row", err);
      result.failed += 1;
    }
  }

  void improntaLog("inquiry.abandoned_nudge.sweep", { ...result });
  return result;
}

/*
 * ───────────────────────────── OWNER PLAN (DEFERRED) ─────────────────────────
 *
 * The schedule is intentionally NOT wired. To turn this sweep on, the owner does
 * two things, both of which need owner-level access this build does not assume:
 *
 *   1. Add a guarded cron route that calls runAbandonedDraftNudgeSweep:
 *        web/src/app/api/cron/abandoned-draft-nudge/route.ts
 *      Mirror /api/cron/retry-failed-emails exactly: GET handler, CRON_SECRET
 *      bearer check, createServiceRoleClient(), call the sweep, return JSON.
 *
 *   2. Register the schedule in web/vercel.json (Vercel cron), e.g. once daily:
 *        { "path": "/api/cron/abandoned-draft-nudge", "schedule": "0 15 * * *" }
 *      (or an equivalent Supabase pg_cron job hitting the same route). Vercel
 *      cron is a paid/plan feature and pg_cron needs the extension enabled, so
 *      this step is owner setup, not a code change here.
 *
 * Optional hardening the owner may add at wiring time:
 *   - Promote the idempotency stamp from source_context.abandoned_nudge_sent_at
 *     to a dedicated inquiries.abandoned_nudge_sent_at column (one migration) so
 *     it is indexable and the query can pre-filter nudged rows in SQL.
 *   - Add a per-tenant opt-out / quiet-hours check before dispatch.
 *   - Resolve a per-tenant canonical resume host instead of NEXT_PUBLIC_SITE_URL.
 *   - A List-Unsubscribe header (the email layer already accepts custom headers).
 * ─────────────────────────────────────────────────────────────────────────────
 */
