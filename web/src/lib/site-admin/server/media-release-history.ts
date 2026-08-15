import "server-only";

/**
 * media-release-history.ts — what this workspace already decided (B15).
 *
 * THE GAP THIS FILLS. `listMediaReleaseRequests` returns pending rows plus
 * approved rows whose owner grant is still live, and drops everything else. So
 * a decline vanished the moment it was made, a revoked release vanished the
 * moment it was ended, and — once B11 shipped — a withdrawn ask vanished the
 * moment the talent took it back. A workspace had no way to answer "did we
 * already say no to this?", and a card that disappears without a trace reads as
 * a bug rather than as a decision.
 *
 * READ-ONLY on purpose. There is no un-decline and no un-revoke: re-approving
 * means the talent asks again, which is the consent model working. This module
 * therefore has no writes at all, and the panel that renders it has no actions.
 *
 * Imports ONLY `media-grants-shared` — never `media-grants.ts` — so no cycle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import {
  isMediaReleaseRequest,
  loadTalentNames,
  loadTenantNames,
  parseReleaseScopes,
  type MediaGrantResult,
} from "./media-grants-shared";

/** How a past request ended. Never "pending" — that is the open queue's job. */
export type MediaReleaseOutcome = "declined" | "withdrawn" | "revoked";

export type MediaReleaseHistoryEntry = {
  requestId: string;
  talentProfileId: string;
  talentName: string;
  assetCount: number;
  /** Null when the ask was for "anywhere" (scope `all_hubs`). */
  targetTenantName: string | null;
  outcome: MediaReleaseOutcome;
  /** ISO. Falls back to `requested_at` when a row predates `responded_at`. */
  decidedAt: string;
};

/** Newest first, capped — this is a reference list, not an audit export. */
const HISTORY_LIMIT = 40;

/**
 * Everything this workspace decided and is no longer being asked about.
 *
 * Three sources, one list:
 *   • `denied`     → the workspace said no;
 *   • `cancelled`  → the talent withdrew the ask (B11);
 *   • `approved` whose owner grants are ALL revoked → the release was ended.
 *
 * The third case is why this cannot be a plain status filter: an approved row
 * is history or live depending on the grant table, which is the same test
 * `listMediaReleaseRequests` uses to decide whether to keep showing its card.
 * Both read it the same way so a request is never in both lists or neither.
 */
export async function listMediaReleaseHistory(
  admin: SupabaseClient,
  tenantId: string,
): Promise<MediaGrantResult<MediaReleaseHistoryEntry[]>> {
  const { data, error } = await admin
    .from("talent_agency_permission_requests")
    .select("id, talent_profile_id, requested_scopes, requested_at, responded_at, status")
    .eq("requesting_tenant_id", tenantId)
    .in("status", ["denied", "cancelled", "approved"])
    .order("requested_at", { ascending: false })
    .limit(120);

  if (error) {
    logServerError("media-grants.listHistory", error);
    return { ok: false, error: "Could not load past decisions. Try again." };
  }

  const rows = (
    (data ?? []) as Array<{
      id: string;
      talent_profile_id: string;
      requested_scopes: string[] | null;
      requested_at: string;
      responded_at: string | null;
      status: string;
    }>
  ).filter((r) => isMediaReleaseRequest(r.requested_scopes));

  if (rows.length === 0) return { ok: true, data: [] };

  const parsed = rows.map((row) => ({ row, scopes: parseReleaseScopes(row.requested_scopes) }));

  // Approved rows are history only once nothing they granted is still live.
  const approvedAssetIds = [
    ...new Set(parsed.filter((p) => p.row.status === "approved").flatMap((p) => p.scopes.assetIds)),
  ];
  const liveIds = new Set<string>();
  if (approvedAssetIds.length > 0) {
    const { data: liveGrants, error: grantErr } = await admin
      .from("media_grants")
      .select("asset_id")
      .in("asset_id", approvedAssetIds)
      .eq("grant_kind", "owner")
      .is("revoked_at", null);
    if (grantErr) {
      // Degrade toward showing LESS history rather than claiming a live release
      // has ended. A missing history row is a gap; a wrong "Release ended" is a
      // lie about the state of someone's photos.
      logServerError("media-grants.listHistory.grants", grantErr);
      for (const id of approvedAssetIds) liveIds.add(id);
    } else {
      for (const g of (liveGrants ?? []) as Array<{ asset_id: string }>) liveIds.add(g.asset_id);
    }
  }

  const past = parsed.filter(
    (p) => p.row.status !== "approved" || !p.scopes.assetIds.some((id) => liveIds.has(id)),
  );
  if (past.length === 0) return { ok: true, data: [] };

  const [talentNames, tenantNames] = await Promise.all([
    loadTalentNames(admin, [...new Set(past.map((p) => p.row.talent_profile_id))]),
    loadTenantNames(
      admin,
      [...new Set(past.map((p) => p.scopes.targetTenantId).filter((x): x is string => !!x))],
    ),
  ]);

  return {
    ok: true,
    data: past
      .map(({ row, scopes }) => ({
        requestId: row.id,
        talentProfileId: row.talent_profile_id,
        talentName: talentNames.get(row.talent_profile_id) ?? "A talent",
        assetCount: scopes.assetIds.length,
        targetTenantName: scopes.targetTenantId
          ? (tenantNames.get(scopes.targetTenantId) ?? null)
          : null,
        outcome:
          row.status === "denied"
            ? ("declined" as const)
            : row.status === "cancelled"
              ? ("withdrawn" as const)
              : ("revoked" as const),
        decidedAt: row.responded_at ?? row.requested_at,
      }))
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
      .slice(0, HISTORY_LIMIT),
  };
}
