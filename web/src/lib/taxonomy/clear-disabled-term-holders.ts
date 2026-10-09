import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import {
  collectSubtreeTermIds,
  holderProfileIdsForTerms,
  type TenantTaxonomyAssignment,
} from "@/lib/taxonomy/disable-term-holders";

export type ClearDisabledTermHoldersResult =
  | { ok: true; holderCount: number; clearedProfileIds: string[] }
  | { ok: false; error: string };

/**
 * Find roster holders of `taxonomyTermId` (and descendants) on this tenant.
 * Read-only.
 */
export async function countDisabledTermHolders(params: {
  supabase: SupabaseClient;
  tenantId: string;
  taxonomyTermId: string;
}): Promise<{ ok: true; holderCount: number; holderIds: string[] } | { ok: false; error: string }> {
  const loaded = await loadHolderContext(params);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    holderCount: loaded.holderIds.length,
    holderIds: loaded.holderIds,
  };
}

/**
 * Delete this tenant's assignments for the term subtree from roster talent.
 * Does not flip `agency_taxonomy_settings` — caller disables after.
 */
export async function clearDisabledTermHolders(params: {
  supabase: SupabaseClient;
  tenantId: string;
  taxonomyTermId: string;
}): Promise<ClearDisabledTermHoldersResult> {
  const loaded = await loadHolderContext(params);
  if (!loaded.ok) return loaded;
  if (loaded.holderIds.length === 0) {
    return { ok: true, holderCount: 0, clearedProfileIds: [] };
  }

  // Prefer tenant-scoped delete; also clear legacy null-tenant rows for the
  // same profile+term so smoke cannot keep warning about orphans.
  const { error: scopedErr } = await params.supabase
    .from("talent_profile_taxonomy")
    .delete()
    .eq("tenant_id", params.tenantId)
    .in("taxonomy_term_id", loaded.subtreeIds)
    .in("talent_profile_id", loaded.holderIds);

  if (scopedErr) {
    logServerError("clearDisabledTermHolders/scoped", scopedErr);
    return { ok: false, error: "Could not hide this service type for people who still hold it." };
  }

  const { error: legacyErr } = await params.supabase
    .from("talent_profile_taxonomy")
    .delete()
    .is("tenant_id", null)
    .in("taxonomy_term_id", loaded.subtreeIds)
    .in("talent_profile_id", loaded.holderIds);

  if (legacyErr) {
    logServerError("clearDisabledTermHolders/legacy", legacyErr);
    return { ok: false, error: "Could not hide this service type for people who still hold it." };
  }

  return {
    ok: true,
    holderCount: loaded.holderIds.length,
    clearedProfileIds: loaded.holderIds,
  };
}

async function loadHolderContext(params: {
  supabase: SupabaseClient;
  tenantId: string;
  taxonomyTermId: string;
}): Promise<
  | {
      ok: true;
      subtreeIds: string[];
      holderIds: string[];
    }
  | { ok: false; error: string }
> {
  const { supabase, tenantId, taxonomyTermId } = params;

  const { data: terms, error: termsErr } = await supabase
    .from("taxonomy_terms")
    .select("id, parent_id")
    .is("archived_at", null);

  if (termsErr) {
    logServerError("clearDisabledTermHolders/terms", termsErr);
    return { ok: false, error: "Could not load taxonomy terms." };
  }

  const childrenOf = new Map<string, string[]>();
  for (const row of terms ?? []) {
    if (!row.parent_id) continue;
    const list = childrenOf.get(row.parent_id) ?? [];
    list.push(row.id);
    childrenOf.set(row.parent_id, list);
  }
  const subtreeIds = collectSubtreeTermIds(taxonomyTermId, childrenOf);
  if (subtreeIds.length === 0) {
    return { ok: true, subtreeIds: [taxonomyTermId], holderIds: [] };
  }

  const { data: roster, error: rosterErr } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  if (rosterErr) {
    logServerError("clearDisabledTermHolders/roster", rosterErr);
    return { ok: false, error: "Could not load roster." };
  }

  const rosterProfileIds = new Set(
    (roster ?? []).map((r) => r.talent_profile_id).filter((id): id is string => !!id),
  );
  if (rosterProfileIds.size === 0) {
    return { ok: true, subtreeIds, holderIds: [] };
  }

  const rosterIds = [...rosterProfileIds];
  const assignments: TenantTaxonomyAssignment[] = [];
  const CHUNK = 200;
  for (let i = 0; i < rosterIds.length; i += CHUNK) {
    const chunk = rosterIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("talent_profile_taxonomy")
      .select("talent_profile_id, taxonomy_term_id, tenant_id")
      .in("talent_profile_id", chunk)
      .in("taxonomy_term_id", subtreeIds);
    if (error) {
      logServerError("clearDisabledTermHolders/assigns", error);
      return { ok: false, error: "Could not load service-type assignments." };
    }
    for (const row of data ?? []) {
      assignments.push({
        talent_profile_id: row.talent_profile_id,
        taxonomy_term_id: row.taxonomy_term_id,
        tenant_id: row.tenant_id,
      });
    }
  }

  const holderIds = holderProfileIdsForTerms({
    termIds: new Set(subtreeIds),
    assignments,
    rosterProfileIds,
    tenantId,
  });

  return { ok: true, subtreeIds, holderIds };
}
