import "server-only";

/**
 * media-release-bake-failures.ts — the DURABLE repair queue for watermark bakes
 * that failed while a release was being approved (media-ownership plan A4).
 *
 * WHAT THIS FIXES. #1139 rolls un-bakeable photos back out of an approval and
 * offers "Retry watermark" on the partial-success banner. The failed ids lived
 * only in that approval's response, so closing the tab lost the retry: the
 * rollback's `grant.release_bake_failed` activity row is an append-only audit
 * trail with no resolved state, not something a queue can be read from.
 *
 * WHY THE STATE IS RECORDED RATHER THAN DERIVED. The tempting derivation —
 * "approved asset with no live owner grant" — also matches every photo staff
 * REVOKED on purpose, and a repair list that offers to re-release those would
 * undo a deliberate takedown in one click. Failure and revocation differ by
 * INTENT, and intent is not recoverable from the grant rows. So exactly one
 * code path writes here (the bake-failure rollback), and the revoke path
 * RESOLVES rows rather than creating them: after staff end a release, its
 * pending repairs are marked `revoked` and vanish from the queue.
 *
 * Its own module, like `media-release-bake-repair.ts` next to it:
 * `media-release-requests.ts` sits close to the 800-line lint cap, and this is
 * a distinct step in the rail. Imports ONLY `media-grants-shared.ts` — never
 * `media-grants.ts` or `media-release-requests.ts`, which would be a cycle, and
 * a cycle here is a TDZ crash at chunk-eval time that no gate in this repo
 * catches. `media-grants.ts` re-exports everything below.
 *
 * Every caller passes the SERVICE-ROLE client (the rail runs behind
 * `requireWorkspaceStaffAction`); the table's RLS mirrors `media_grants` as
 * defence in depth for any direct client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import {
  loadTalentNames,
  loadTenantNames,
  type MediaGrantResult,
} from "./media-grants-shared";

const TABLE = "media_release_bake_failures";

/** How the queue stops being pending. Mirrors the SQL check constraint. */
export type ReleaseBakeFailureResolution = "repaired" | "revoked";

/**
 * One request's outstanding repairs, as the workspace queue shows them.
 * Grouped by request because that is the unit a retry acts on: the photos rode
 * in on one approval, to one target, for one talent.
 */
export type PendingReleaseBakeRepair = {
  requestId: string;
  talentProfileId: string;
  talentName: string;
  /** The hub the release pointed at; null = every hub. */
  targetTenantId: string | null;
  targetTenantName: string | null;
  assetIds: string[];
  /** Highest attempt count across the group — "we tried N times" in one number. */
  attempts: number;
  /** ISO, newest failure in the group. */
  lastFailedAt: string;
};

/**
 * Open (or re-stamp) the pending repair rows for assets that could not be
 * watermarked.
 *
 * One RPC rather than a PostgREST upsert: the uniqueness lives on a PARTIAL
 * index (`WHERE resolved_at IS NULL`), which ON CONFLICT can only infer from a
 * statement that repeats the predicate.
 *
 * NEVER THROWS. A release that already rolled back correctly must not fail
 * because its bookkeeping row could not be written — the caller has already
 * made the stored grant state honest. A lost row costs the queue entry, which
 * is logged and visible, not correctness.
 */
export async function recordFailedReleaseBakes(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    requestId: string;
    talentProfileId: string;
    targetTenantId: string | null;
    assetIds: readonly string[];
  },
): Promise<number> {
  const assetIds = [...new Set(input.assetIds)];
  if (assetIds.length === 0) return 0;

  const { data, error } = await admin.rpc("record_media_release_bake_failures", {
    p_request_id: input.requestId,
    p_asset_ids: assetIds,
    p_tenant_id: input.tenantId,
    p_talent_profile_id: input.talentProfileId,
    p_target_tenant_id: input.targetTenantId,
  });

  if (error) {
    logServerError("media-grants.recordBakeFailures", error);
    return 0;
  }
  return typeof data === "number" ? data : assetIds.length;
}

/**
 * Close pending repairs for named assets of one request.
 *
 * `repaired` after a retry baked them and the owner key went back on;
 * `revoked` when staff ended the release, so the repair is moot.
 */
export async function resolveReleaseBakeFailures(
  admin: SupabaseClient,
  input: {
    requestId: string;
    assetIds: readonly string[];
    resolution: ReleaseBakeFailureResolution;
  },
): Promise<number> {
  const assetIds = [...new Set(input.assetIds)];
  if (assetIds.length === 0) return 0;

  const { data, error } = await admin
    .from(TABLE)
    .update({ resolved_at: new Date().toISOString(), resolution: input.resolution })
    .eq("request_id", input.requestId)
    .in("asset_id", assetIds)
    .is("resolved_at", null)
    .select("id");

  if (error) {
    logServerError("media-grants.resolveBakeFailures", error);
    return 0;
  }
  return ((data ?? []) as Array<{ id: string }>).length;
}

/**
 * THE GUARD THAT KEEPS A DELIBERATE REVOKE OUT OF THE REPAIR QUEUE.
 *
 * A partial approval can leave photo A released and photo B pending repair. If
 * staff then end that release, B's pending row would still offer a one-click
 * "retry", which on success would re-release a photo the workspace had just
 * decided to pull. So a revoke closes the matching pending rows as `revoked`.
 *
 * The target matching mirrors `selectGrantsToRevoke` exactly, so the queue and
 * the grants can never disagree about what a revoke reached:
 *   • `targetTenantId === null` is the everywhere-revoke and closes every
 *     pending row for those assets in this workspace, including hub-scoped ones;
 *   • a named target closes only the rows pointed at THAT hub, leaving an
 *     all-hubs repair alone — narrowing "anywhere" to "anywhere except B" is
 *     not a state the rail can hold, in either table.
 */
export async function resolveReleaseBakeFailuresForRevoke(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    assetIds: readonly string[];
    targetTenantId: string | null;
  },
): Promise<number> {
  const assetIds = [...new Set(input.assetIds)];
  if (assetIds.length === 0) return 0;

  let query = admin
    .from(TABLE)
    .update({ resolved_at: new Date().toISOString(), resolution: "revoked" })
    .eq("tenant_id", input.tenantId)
    .in("asset_id", assetIds)
    .is("resolved_at", null);
  if (input.targetTenantId !== null) {
    query = query.eq("target_tenant_id", input.targetTenantId);
  }

  const { data, error } = await query.select("id");
  if (error) {
    logServerError("media-grants.resolveBakeFailuresForRevoke", error);
    return 0;
  }
  return ((data ?? []) as Array<{ id: string }>).length;
}

type FailureRow = {
  request_id: string;
  asset_id: string;
  talent_profile_id: string;
  target_tenant_id: string | null;
  attempts: number;
  last_failed_at: string;
};

/**
 * The workspace's outstanding watermark repairs, newest failure first.
 *
 * Rows are dropped, not shown, when the retry could not act on them anyway —
 * the request is no longer an APPROVED release addressed to this workspace, or
 * the photo is no longer an agency asset this workspace owns (sold on,
 * reassigned, soft-deleted). Both predicates are the ones
 * `loadReleaseBakeRepairPlan` re-derives at click time, and a queue entry whose
 * button always fails is worse than no entry. The rows stay in the table as
 * audit; they are simply not repairs anyone here can make.
 */
export async function listPendingReleaseBakeRepairs(
  admin: SupabaseClient,
  tenantId: string,
): Promise<MediaGrantResult<PendingReleaseBakeRepair[]>> {
  const { data, error } = await admin
    .from(TABLE)
    .select("request_id, asset_id, talent_profile_id, target_tenant_id, attempts, last_failed_at")
    .eq("tenant_id", tenantId)
    .is("resolved_at", null)
    .order("last_failed_at", { ascending: false })
    .limit(300);

  if (error) {
    logServerError("media-grants.listBakeRepairs", error);
    return { ok: false, error: "Could not load watermark repairs. Try again." };
  }

  const rows = (data ?? []) as FailureRow[];
  if (rows.length === 0) return { ok: true, data: [] };

  const [liveRequestIds, ownedAssetIds] = await Promise.all([
    loadApprovedRequestIds(admin, tenantId, [...new Set(rows.map((r) => r.request_id))]),
    loadStillOwnedAssetIds(admin, tenantId, [...new Set(rows.map((r) => r.asset_id))]),
  ]);
  const open = rows.filter(
    (r) => liveRequestIds.has(r.request_id) && ownedAssetIds.has(r.asset_id),
  );
  if (open.length === 0) return { ok: true, data: [] };

  const grouped = groupPendingBakeRepairs(open);
  const [talentNames, tenantNames] = await Promise.all([
    loadTalentNames(admin, [...new Set(grouped.map((g) => g.talentProfileId))]),
    loadTenantNames(
      admin,
      [...new Set(grouped.map((g) => g.targetTenantId).filter((x): x is string => !!x))],
    ),
  ]);

  return {
    ok: true,
    data: grouped.map((group) => ({
      ...group,
      talentName: talentNames.get(group.talentProfileId) ?? "A talent",
      targetTenantName: group.targetTenantId
        ? (tenantNames.get(group.targetTenantId) ?? null)
        : null,
    })),
  };
}

/**
 * PURE — fold failure rows into one entry per request.
 *
 * Split out of the query so the grouping rule is testable without a database.
 * Input order is newest-first, and that order is preserved: the first row of a
 * group carries its `lastFailedAt`, while `attempts` takes the MAX across the
 * group so "tried 3 times" is not understated by a photo that only failed once.
 */
export function groupPendingBakeRepairs(
  rows: readonly FailureRow[],
): Array<Omit<PendingReleaseBakeRepair, "talentName" | "targetTenantName">> {
  const out: Array<Omit<PendingReleaseBakeRepair, "talentName" | "targetTenantName">> = [];
  const byRequest = new Map<string, number>();
  for (const row of rows) {
    const at = byRequest.get(row.request_id);
    if (at === undefined) {
      byRequest.set(row.request_id, out.length);
      out.push({
        requestId: row.request_id,
        talentProfileId: row.talent_profile_id,
        targetTenantId: row.target_tenant_id,
        assetIds: [row.asset_id],
        attempts: row.attempts,
        lastFailedAt: row.last_failed_at,
      });
      continue;
    }
    const group = out[at];
    if (!group.assetIds.includes(row.asset_id)) group.assetIds.push(row.asset_id);
    group.attempts = Math.max(group.attempts, row.attempts);
  }
  return out;
}

/** Which of these requests are still APPROVED releases owned by this workspace. */
async function loadApprovedRequestIds(
  admin: SupabaseClient,
  tenantId: string,
  requestIds: readonly string[],
): Promise<Set<string>> {
  if (requestIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("talent_agency_permission_requests")
    .select("id")
    .in("id", requestIds as string[])
    .eq("requesting_tenant_id", tenantId)
    .eq("status", "approved");
  if (error) {
    logServerError("media-grants.bakeRepairRequests", error);
    return new Set();
  }
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}

/**
 * Which of these assets are STILL agency-owned photos of this workspace.
 *
 * The same ownership predicate the retry re-derives. A photo that moved owner
 * or was deleted is nobody here's to re-release, so it stops being a repair.
 */
async function loadStillOwnedAssetIds(
  admin: SupabaseClient,
  tenantId: string,
  assetIds: readonly string[],
): Promise<Set<string>> {
  if (assetIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("media_assets")
    .select("id")
    .in("id", assetIds as string[])
    .eq("ownership_kind", "agency")
    .eq("owner_tenant_id", tenantId)
    .is("deleted_at", null);
  if (error) {
    logServerError("media-grants.bakeRepairAssets", error);
    return new Set();
  }
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}
