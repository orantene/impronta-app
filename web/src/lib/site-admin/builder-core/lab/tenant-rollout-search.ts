"use server";

/**
 * tenant-rollout-search.ts — super_admin-gated workspace search + resolve
 * specifically for the RolloutPanel allow/denylist pickers.
 *
 * Two operations:
 *  1. searchTenantsForRollout: debounce-friendly typeahead over agencies by
 *     display_name or slug (thin wrapper over the service-role client, same
 *     gate as preview-subject-search.ts).
 *  2. resolveTenantIdsByIds: given a set of raw UUIDs (pasted into the legacy
 *     textarea before migration, or carried forward from an old row), look up
 *     which ones correspond to real tenants so the UI can surface the ones
 *     that DON'T resolve as invalid.
 *
 * GATE: every action calls requireSuperAdmin() server-side.
 * PURE reads — no DB writes.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";

// ── Result types ──────────────────────────────────────────────────────────────

/** The minimal shape needed by the TenantMultiPicker. */
export interface TenantHit {
  id: string;
  slug: string;
  displayName: string;
  planTier: string | null;
  kind: string;
}

export type TenantSearchResult =
  | { ok: true; hits: TenantHit[]; more: boolean }
  | { ok: false; error: string };

export type TenantResolveResult =
  | { ok: true; resolved: TenantHit[]; unknownIds: string[] }
  | { ok: false; error: string };

// ── Auth gate ─────────────────────────────────────────────────────────────────

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true };
}

function getAdminClient() {
  const client = createServiceRoleClient();
  if (!client) throw new Error("Service-role client unavailable.");
  return client;
}

interface AgencyRow {
  id: string;
  slug: string;
  display_name: string | null;
  kind: string | null;
  plan_tier: string | null;
}

function toHit(row: AgencyRow): TenantHit {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name?.trim() || row.slug,
    planTier: row.plan_tier ?? null,
    kind: row.kind ?? "agency",
  };
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;

/** Typeahead search over all active workspaces by display_name or slug. */
export async function searchTenantsForRollout(input: {
  query: string;
  limit?: number;
}): Promise<TenantSearchResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const rawQuery = (input.query ?? "").trim();
  const limit = Math.max(1, Math.min(MAX_LIMIT, input.limit ?? DEFAULT_LIMIT));

  try {
    const sb = getAdminClient();
    let query = sb
      .from("agencies")
      .select("id, slug, display_name, kind, plan_tier")
      .eq("status", "active")
      .order("display_name", { ascending: true })
      .limit(limit + 1);

    if (rawQuery) {
      const escaped = rawQuery.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(
        `display_name.ilike.%${escaped}%,slug.ilike.%${escaped}%`,
      ) as typeof query;
    }

    const { data: rows, error } = await query;
    if (error) {
      logServerError("lab/tenant-rollout-search", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }

    const matched = (rows ?? []) as AgencyRow[];
    const more = matched.length > limit;
    const truncated = more ? matched.slice(0, limit) : matched;

    return { ok: true, hits: truncated.map(toHit), more };
  } catch (err) {
    logServerError("lab/tenant-rollout-search/unhandled", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

/**
 * Resolve a list of raw UUIDs → matched TenantHits + a list of IDs that had
 * no matching tenant (the "invalid" ones to surface in the UI).
 *
 * Also returns the total active workspace count for the impact readout
 * ("N of M tenants see this").
 */
export async function resolveTenantIdsForRollout(input: {
  ids: string[];
}): Promise<TenantResolveResult & { totalCount?: number }> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const sb = getAdminClient();

    // Count all active tenants for the impact readout denominator.
    const { count: totalCount } = await sb
      .from("agencies")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    const uniqueIds = [...new Set(input.ids.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return { ok: true, resolved: [], unknownIds: [], totalCount: totalCount ?? 0 };
    }

    const { data: rows, error } = await sb
      .from("agencies")
      .select("id, slug, display_name, kind, plan_tier")
      .in("id", uniqueIds);

    if (error) {
      logServerError("lab/tenant-rollout-resolve", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }

    const matched = (rows ?? []) as AgencyRow[];
    const resolvedIds = new Set(matched.map((r) => r.id));
    const unknownIds = uniqueIds.filter((id) => !resolvedIds.has(id));

    return {
      ok: true,
      resolved: matched.map(toHit),
      unknownIds,
      totalCount: totalCount ?? 0,
    };
  } catch (err) {
    logServerError("lab/tenant-rollout-resolve/unhandled", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

/**
 * Fetch the total count of active tenants (for the impact readout denominator
 * when no IDs need resolving).
 */
export async function getTotalActiveTenantCount(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const sb = getAdminClient();
    const { count, error } = await sb
      .from("agencies")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    if (error) {
      logServerError("lab/tenant-count", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }

    return { ok: true, count: count ?? 0 };
  } catch (err) {
    logServerError("lab/tenant-count/unhandled", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}
