import "server-only";

/**
 * guest-reply-latency.ts — P1: "Typically replies in ~X" helper.
 *
 * Computes the median first-response latency for a given talent profile (or
 * tenant) from inquiry_messages timestamps. "First response" = the first
 * non-guest, non-system message in the GROUP thread after the guest's opening
 * message, scoped to a given talent_profile_id and/or tenant_id.
 *
 * The result is a bare FRAGMENT (e.g. "in ~2 hours", "within a day") surfaced
 * by the MiniChatPanel header as `Typically replies {fragment}` and woven into
 * the auto-ack sentence — the "Typically replies"/"we typically reply" prefix is
 * owned by the render site, not this module (returning a full sentence here
 * double-prefixed the header). The query is intentionally READ-ONLY and uses the
 * service-role client so it can run from any server action without depending on
 * the session user's RLS grants.
 *
 * CACHING:
 *   - Results are cached in-process for CACHE_TTL_MS (5 minutes) per
 *     (tenantId, talentProfileId) key. The caller can always pass null for
 *     talentProfileId to fall back to the tenant-wide median.
 *   - A null return means "not enough data to compute" — the caller should
 *     omit the label rather than show a hardcoded fallback like "4 hours".
 *
 * QUERY STRATEGY (avoids a slow multi-table join on every guest send):
 *   The query reads inquiry_messages twice using a self-join approach:
 *     1. "opener" — the first guest-authored message per inquiry
 *        (sender_user_id IS NULL + guest_session_id IS NOT NULL,
 *         thread_type = 'group', sorted by created_at ASC, LIMIT 1 per inquiry)
 *     2. "responder" — the first non-null sender_user_id message in the same
 *        inquiry on the group thread, created AFTER the opener
 *   Latency = responder.created_at - opener.created_at.
 *   Median is computed over the last SAMPLE_SIZE inquiries (default 50).
 *
 * FALLBACK: if the talent has fewer than MIN_SAMPLE inquiries, we fall through
 * to the tenant-wide median; if that is also below MIN_SAMPLE, we return null.
 *
 * NOTE: The guest_session_id column on inquiry_messages is introduced by
 * migration M1 (Lane A). Until that migration is applied the "guest opener"
 * filter falls back to sender_user_id IS NULL only (broader, slightly less
 * precise, still functional).
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const SAMPLE_SIZE = 50;          // number of recent inquiries to sample
const MIN_SAMPLE = 3;            // minimum sample before we report a result

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

type CacheEntry = { label: string | null; at: number };
const _cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, talentProfileId: string | null): string {
  return `${tenantId}::${talentProfileId ?? "__tenant__"}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a bare reply-latency FRAGMENT for the given talent/tenant, e.g.
 * "in ~2 hours" or "within a day" — the caller prepends "Typically replies ".
 *
 * Returns null when:
 *   - The service-role client is unavailable (env not configured).
 *   - There are fewer than MIN_SAMPLE data points even after the tenant
 *     fallback.
 *   - A DB error occurs (always logged, never thrown).
 *
 * The fragment is safe to surface to the guest once the caller prepends the
 * "Typically replies " prefix (panel header) or weaves it into a sentence.
 */
export async function getTypicalReplyLabel(args: {
  tenantId: string;
  /** Narrow to a specific talent when known; falls back to tenant-wide. */
  talentProfileId?: string | null;
}): Promise<string | null> {
  const key = cacheKey(args.tenantId, args.talentProfileId ?? null);

  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.label;

  const label = await _computeLabel(args.tenantId, args.talentProfileId ?? null);

  _cache.set(key, { label, at: Date.now() });
  return label;
}

/**
 * Flush the in-process cache for a tenant (e.g. after a coordinator replies).
 * No-op when the entry does not exist.
 */
export function invalidateReplyLatencyCache(
  tenantId: string,
  talentProfileId?: string | null,
): void {
  _cache.delete(cacheKey(tenantId, talentProfileId ?? null));
  // Also flush the tenant-wide bucket so both narrow + wide re-compute.
  if (talentProfileId) {
    _cache.delete(cacheKey(tenantId, null));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core computation
// ─────────────────────────────────────────────────────────────────────────────

async function _computeLabel(
  tenantId: string,
  talentProfileId: string | null,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  try {
    // Step 1: collect recent inquiries for this scope.
    // We look at inquiries where the talent is a participant.
    let inquiryQuery = admin
      .from("inquiries")
      .select("id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(SAMPLE_SIZE);

    if (talentProfileId) {
      // Filter to inquiries that include this talent in inquiry_participants.
      // We do this by joining through a sub-query using in-filter on the IDs
      // returned by a separate lookup.
      const { data: participantRows } = await admin
        .from("inquiry_participants")
        .select("inquiry_id")
        .eq("talent_profile_id", talentProfileId)
        .limit(SAMPLE_SIZE);

      const participantInquiryIds = (participantRows ?? []).map(
        (r: { inquiry_id: string }) => r.inquiry_id,
      );

      if (participantInquiryIds.length < MIN_SAMPLE) {
        // Not enough talent-scoped data — fall back to tenant-wide.
        if (talentProfileId) {
          return _computeLabel(tenantId, null);
        }
        return null;
      }

      inquiryQuery = inquiryQuery.in("id", participantInquiryIds);
    }

    const { data: inquiries, error: inquiryErr } = await inquiryQuery;
    if (inquiryErr || !inquiries || inquiries.length < MIN_SAMPLE) {
      if (inquiryErr) {
        logServerError("guest-reply-latency/fetchInquiries", inquiryErr);
      }
      // If narrowed to a talent and no data, retry tenant-wide once.
      if (talentProfileId) {
        return _computeLabel(tenantId, null);
      }
      return null;
    }

    const inquiryIds = inquiries.map((i: { id: string }) => i.id);

    // Step 2: For each inquiry, find the first guest message (opener).
    // A guest message = sender_user_id IS NULL AND thread_type = 'group'.
    // (guest_session_id IS NOT NULL would be more precise but the column may
    //  not exist until M1 migration is applied — IS NULL alone is safe.)
    const { data: openerRows, error: openerErr } = await admin
      .from("inquiry_messages")
      .select("inquiry_id, created_at")
      .in("inquiry_id", inquiryIds)
      .eq("thread_type", "group")
      .is("sender_user_id", null)
      .order("created_at", { ascending: true });

    if (openerErr || !openerRows) {
      if (openerErr) logServerError("guest-reply-latency/fetchOpeners", openerErr);
      return null;
    }

    // Keep only the first opener per inquiry
    const openerByInquiry = new Map<string, string>(); // inquiryId -> created_at ISO
    for (const row of openerRows as { inquiry_id: string; created_at: string }[]) {
      if (!openerByInquiry.has(row.inquiry_id)) {
        openerByInquiry.set(row.inquiry_id, row.created_at);
      }
    }

    if (openerByInquiry.size < MIN_SAMPLE) return null;

    // Step 3: For each inquiry that has an opener, find the first
    // authenticated (non-null sender) response on the group thread.
    const { data: responderRows, error: responderErr } = await admin
      .from("inquiry_messages")
      .select("inquiry_id, created_at")
      .in("inquiry_id", Array.from(openerByInquiry.keys()))
      .eq("thread_type", "group")
      .not("sender_user_id", "is", null)
      .order("created_at", { ascending: true });

    if (responderErr || !responderRows) {
      if (responderErr) logServerError("guest-reply-latency/fetchResponders", responderErr);
      return null;
    }

    // Compute latency (ms) for each inquiry where response came after opener
    const latencies: number[] = [];

    for (const row of responderRows as { inquiry_id: string; created_at: string }[]) {
      const openerIso = openerByInquiry.get(row.inquiry_id);
      if (!openerIso) continue;

      const openerMs = new Date(openerIso).getTime();
      const responderMs = new Date(row.created_at).getTime();
      const delta = responderMs - openerMs;

      // Only include if response is after opener and within 7 days
      // (responses after 7 days are likely abandoned / re-opened, not SLA)
      if (delta > 0 && delta < 7 * 24 * 3_600_000) {
        latencies.push(delta);
        openerByInquiry.delete(row.inquiry_id); // keep only first response per inquiry
      }
    }

    if (latencies.length < MIN_SAMPLE) return null;

    const medianMs = _median(latencies);
    return _formatLatency(medianMs);
  } catch (err) {
    logServerError("guest-reply-latency/compute", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function _median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Formats a latency in milliseconds to a bare reply-time FRAGMENT (no
 * "Typically replies in" prefix). The single consumer that needs a sentence —
 * the MiniChatPanel header — renders `Typically replies {fragment}`, and the
 * auto-ack weaves the same fragment into its own sentence. Returning a full
 * sentence here double-prefixed the header ("Typically replies in Typically
 * replies in ~2 hours"), so the prefix is owned by the render site, not here.
 *
 * Each fragment is written to read correctly after "Typically replies " AND
 * after "we typically reply " (the auto-ack template).
 *
 * Buckets (intentionally imprecise — rounded for trustworthiness):
 *   < 30 min  → "in minutes"
 *   < 2 h     → "in ~1 hour"
 *   < 5 h     → "in ~X hours"
 *   < 12 h    → "within a few hours"
 *   < 24 h    → "the same day"
 *   < 48 h    → "within a day"
 *   >= 48 h   → "within 2–3 days"
 */
export function _formatLatency(ms: number): string {
  const minutes = ms / 60_000;
  const hours = ms / 3_600_000;

  if (minutes < 30) return "in minutes";
  if (hours < 2) return "in ~1 hour";
  if (hours < 5) return `in ~${Math.round(hours)} hours`;
  if (hours < 12) return "within a few hours";
  if (hours < 24) return "the same day";
  if (hours < 48) return "within a day";
  return "within 2–3 days";
}
