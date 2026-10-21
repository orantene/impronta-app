/**
 * TUL-1737 · the roster half of a workspace plan downgrade, moved to PERIOD END.
 *
 * The customer paid for the current plan until the period ends, so a paid downgrade must not archive anyone at confirm
 * time. commitPlanDowngrade stores the owner's keep-list (`workspace_subscriptions.pending_downgrade`) BEFORE it tells
 * Stripe; the subscription webhook (the single writer of agencies.plan_tier) calls applyPendingDowngradeAtTierDrop once
 * the tier has actually reached the target, which archives everything outside the keep-list under the SAME
 * archive_event id (restorable) and then clears the pending row.
 *
 * Replay safety: the pending row is the lock. The archive only touches rows still active/pending, so a replay that
 * races ahead of the clear archives zero rows; a replay after the clear finds no pending row at all. A failed archive
 * leaves the pending row in place so the webhook retry finishes the job.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PendingDowngrade = {
  target_tier: string;
  keep_ids: string[];
  archive_event_id: string;
  requested_by: string;
  requested_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Defensive parse of the stored JSON: anything malformed is treated as "no pending downgrade", never partially trusted. */
export function parsePendingDowngrade(raw: unknown): PendingDowngrade | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.target_tier !== "string" || !r.target_tier) return null;
  if (typeof r.archive_event_id !== "string" || !UUID.test(r.archive_event_id)) return null;
  if (typeof r.requested_by !== "string" || !UUID.test(r.requested_by)) return null;
  if (!Array.isArray(r.keep_ids) || !r.keep_ids.every((id) => typeof id === "string" && UUID.test(id))) return null;
  return {
    target_tier: r.target_tier,
    keep_ids: r.keep_ids as string[],
    archive_event_id: r.archive_event_id,
    requested_by: r.requested_by,
    requested_at: typeof r.requested_at === "string" ? r.requested_at : "",
  };
}

/** PostgREST `not.in` value for the keep-list. An empty keep-list archives everyone (matches the previous behaviour). */
export function keepListFilter(keepIds: string[]): string {
  return `(${keepIds.length === 0 ? "''" : keepIds.map((id) => `"${id}"`).join(",")})`;
}

export type ArchiveResult = { ok: true; count: number } | { ok: false; error: unknown };

/** Archive every active/pending roster row NOT in the keep-list under one event id. Shared by the no-subscription path and the webhook. */
export async function archiveRosterOverflow(
  client: SupabaseClient,
  args: { tenantId: string; keepIds: string[]; eventId: string; actorId: string; nowIso: string },
): Promise<ArchiveResult> {
  const { error, count } = await client
    .from("agency_talent_roster")
    .update(
      {
        status: "archived_for_downgrade",
        archived_for_downgrade_at: args.nowIso,
        archived_for_downgrade_by: args.actorId,
        archived_for_downgrade_event: args.eventId,
      },
      { count: "exact" },
    )
    .eq("tenant_id", args.tenantId)
    .in("status", ["active", "pending"])
    .not("talent_profile_id", "in", keepListFilter(args.keepIds));
  if (error) return { ok: false, error };
  return { ok: true, count: count ?? 0 };
}

/** Persist the keep-list with the pending change. Fails (never silently) when the row or column is missing. */
export async function recordPendingDowngrade(
  client: SupabaseClient,
  tenantId: string,
  intent: PendingDowngrade,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const { error, count } = await client
    .from("workspace_subscriptions")
    .update({ pending_downgrade: intent }, { count: "exact" })
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error };
  if (!count) return { ok: false, error: new Error("no workspace_subscriptions row to hold the pending downgrade") };
  return { ok: true };
}

/** Compensating delete (definite Stripe failure only). Idempotent. */
export async function clearPendingDowngrade(client: SupabaseClient, tenantId: string): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const { error } = await client.from("workspace_subscriptions").update({ pending_downgrade: null }).eq("tenant_id", tenantId);
  return error ? { ok: false, error } : { ok: true };
}

export type PendingDowngradeOutcome =
  | { ok: true; kind: "none" | "not_yet" | "archived"; archived?: number; eventId?: string }
  | { ok: false; error: unknown };

/**
 * Called by the webhook right after it wrote the (possibly new) tier. Archives ONLY when the tier has reached the
 * downgrade's target. A read error (including the column not being migrated yet) is "none": it must never wedge the
 * subscription webhook into endless retries.
 */
export async function applyPendingDowngradeAtTierDrop(
  client: SupabaseClient,
  args: { tenantId: string; newTier: string; nowIso: string },
): Promise<PendingDowngradeOutcome> {
  const read = await client.from("workspace_subscriptions").select("pending_downgrade").eq("tenant_id", args.tenantId).maybeSingle();
  if (read.error) return { ok: true, kind: "none" };
  const intent = parsePendingDowngrade((read.data as { pending_downgrade?: unknown } | null)?.pending_downgrade);
  if (!intent) return { ok: true, kind: "none" };
  // The tier has not dropped to the target yet (mid-period resync, schedule events, payment retries): do nothing.
  if (args.newTier !== intent.target_tier) return { ok: true, kind: "not_yet" };

  const archive = await archiveRosterOverflow(client, {
    tenantId: args.tenantId,
    keepIds: intent.keep_ids,
    eventId: intent.archive_event_id,
    actorId: intent.requested_by,
    nowIso: args.nowIso,
  });
  if (!archive.ok) return { ok: false, error: archive.error };

  const cleared = await client.from("workspace_subscriptions").update({ pending_downgrade: null }).eq("tenant_id", args.tenantId);
  // Archive already happened and is idempotent; a failed clear only means the next webhook re-runs it as a no-op.
  if (cleared.error) return { ok: false, error: cleared.error };
  return { ok: true, kind: "archived", archived: archive.count, eventId: intent.archive_event_id };
}
