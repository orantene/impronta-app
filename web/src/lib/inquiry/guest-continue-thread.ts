import "server-only";

/**
 * guest-continue-thread.ts — F-11. The trust gate caps how many conversations an
 * unverified guest may START. A guest at the cap who writes again is almost
 * always continuing the conversation they already have, so the message joins
 * that thread instead of being refused with "verify your email to start more".
 * The cap still blocks genuinely NEW conversations (no open thread to continue).
 *
 * Abuse protections are untouched: the caller runs this only after the same
 * honeypot / disposable-email / rate-limit / captcha floor as a create, and the
 * send goes through the engine's own per-thread rate limiter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessage } from "@/lib/inquiry/inquiry-engine-messages";
import { logServerError } from "@/lib/server/safe-error";

export type ContinuableRow = {
  id: string;
  status: string | null;
  createdAt: string | null;
  /** Talents on the thread (inquiry_participants role=talent). */
  talentProfileIds: readonly string[];
};

/** Statuses that are over, or still a private draft (a draft has its own promote-then-send path). */
const NOT_CONTINUABLE: ReadonlySet<string> = new Set([
  "draft",
  "cancelled",
  "closed",
  "archived",
  "rejected",
  "expired",
  "closed_lost",
]);

/**
 * Which existing thread a new first message should join. Prefers a thread that
 * already names this talent, then the most recent. Null = nothing to continue.
 */
export function pickContinuableInquiry(
  rows: readonly ContinuableRow[],
  talentProfileId: string | null | undefined,
): string | null {
  const live = rows.filter((r) => !NOT_CONTINUABLE.has(r.status ?? ""));
  if (live.length === 0) return null;
  const newestFirst = [...live].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  if (talentProfileId) {
    const same = newestFirst.find((r) => r.talentProfileIds.includes(talentProfileId));
    if (same) return same.id;
  }
  return newestFirst[0]?.id ?? null;
}

async function loadContinuableRows(
  admin: SupabaseClient,
  tenantId: string,
  guestSessionId: string,
): Promise<ContinuableRow[]> {
  const { data, error } = await admin
    .from("inquiries")
    .select("id, status, created_at")
    .eq("guest_session_id", guestSessionId)
    .eq("tenant_id", tenantId)
    .limit(50);
  if (error || !data) {
    if (error) logServerError("guest-continue-thread/rows", error);
    return [];
  }
  const ids = data.map((r) => r.id as string);
  const talentById = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: parts, error: partsErr } = await admin
      .from("inquiry_participants")
      .select("inquiry_id, talent_profile_id")
      .in("inquiry_id", ids)
      .eq("role", "talent");
    if (partsErr) logServerError("guest-continue-thread/participants", partsErr);
    for (const p of parts ?? []) {
      const tp = p.talent_profile_id as string | null;
      if (!tp) continue;
      const k = p.inquiry_id as string;
      talentById.set(k, [...(talentById.get(k) ?? []), tp]);
    }
  }
  return data.map((r) => ({
    id: r.id as string,
    status: (r.status as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
    talentProfileIds: talentById.get(r.id as string) ?? [],
  }));
}

export type ContinueResult =
  | { kind: "none" }
  | { kind: "sent"; inquiryId: string; messageId: string }
  | { kind: "rate_limited"; retryAfterMs?: number }
  | { kind: "failed" };

/** Append `body` to the guest's own open thread. Never throws; "none" when there is nothing to join. */
export async function continueOpenGuestThread(
  admin: SupabaseClient,
  args: {
    tenantId: string;
    guestSessionId: string;
    talentProfileId: string | null | undefined;
    body: string;
  },
): Promise<ContinueResult> {
  try {
    const rows = await loadContinuableRows(admin, args.tenantId, args.guestSessionId);
    const inquiryId = pickContinuableInquiry(rows, args.talentProfileId);
    if (!inquiryId) return { kind: "none" };
    const sent = await sendMessage(admin, {
      inquiryId,
      tenantId: args.tenantId,
      actorUserId: null,
      guestSessionId: args.guestSessionId,
      threadType: "private",
      body: args.body,
    });
    if (sent.success) return { kind: "sent", inquiryId, messageId: sent.data?.messageId ?? "" };
    if (sent.rateLimited) return { kind: "rate_limited", retryAfterMs: sent.retryAfterMs };
    return { kind: "failed" };
  } catch (err) {
    logServerError("guest-continue-thread/continue", err);
    return { kind: "failed" };
  }
}
