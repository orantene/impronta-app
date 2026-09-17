import "server-only";

/**
 * asset-assignments.server.ts — the STORED selection (03 §5): which image each
 * page × slot of a tenant holds and where it came from. Written by the
 * composer at compose, updated by the per-site image job and by the builder;
 * the renderer never recomputes it. Every write is service-role; tenant staff
 * read their own rows through RLS for the builder's pending state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import type { AssignmentSource } from "@/lib/site-admin/builder-core/site-templates/image-resolver";

export interface AssetAssignment {
  id: string;
  tenantId: string;
  pageRole: string;
  slot: string;
  assetId: string | null;
  src: string;
  source: AssignmentSource;
  direction: string | null;
  siteComposeId: string | null;
  pendingJobId: string | null;
  selectedAt: string;
  replacedByUserAt: string | null;
}

type Row = {
  id: string;
  tenant_id: string;
  page_role: string;
  slot: string;
  asset_id: string | null;
  src: string;
  source: AssignmentSource;
  direction: string | null;
  site_compose_id: string | null;
  pending_job_id: string | null;
  selected_at: string;
  replaced_by_user_at: string | null;
};

const SELECT = "id, tenant_id, page_role, slot, asset_id, src, source, direction, site_compose_id, pending_job_id, selected_at, replaced_by_user_at";

const map = (r: Row): AssetAssignment => ({
  id: r.id,
  tenantId: r.tenant_id,
  pageRole: r.page_role,
  slot: r.slot,
  assetId: r.asset_id,
  src: r.src,
  source: r.source,
  direction: r.direction,
  siteComposeId: r.site_compose_id,
  pendingJobId: r.pending_job_id,
  selectedAt: r.selected_at,
  replacedByUserAt: r.replaced_by_user_at,
});

export interface AssignmentWrite {
  pageRole: string;
  slot: string;
  assetId: string | null;
  src: string;
  source: AssignmentSource;
  direction: string | null;
}

/** Upsert the compose's picks; a slot the user replaced by hand is left alone. */
export async function writeAssignments(
  admin: SupabaseClient,
  input: { tenantId: string; siteComposeId: string; picks: ReadonlyArray<AssignmentWrite> },
): Promise<{ written: number; error: string | null }> {
  if (input.picks.length === 0) return { written: 0, error: null };
  const { data: existing, error: readError } = await admin
    .from("tenant_asset_assignments")
    .select("page_role, slot, replaced_by_user_at")
    .eq("tenant_id", input.tenantId);
  if (readError) return { written: 0, error: readError.message };
  const userOwned = new Set(
    ((existing ?? []) as Array<{ page_role: string; slot: string; replaced_by_user_at: string | null }>)
      .filter((r) => r.replaced_by_user_at)
      .map((r) => `${r.page_role}|${r.slot}`),
  );
  const rows = input.picks
    .filter((p) => !userOwned.has(`${p.pageRole}|${p.slot}`))
    .map((p) => ({
      tenant_id: input.tenantId,
      page_role: p.pageRole,
      slot: p.slot,
      asset_id: p.assetId,
      src: p.src,
      source: p.source,
      direction: p.direction,
      site_compose_id: input.siteComposeId,
      pending_job_id: null,
      selected_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return { written: 0, error: null };
  const { error } = await admin.from("tenant_asset_assignments").upsert(rows as never, { onConflict: "tenant_id,page_role,slot" });
  if (error) return { written: 0, error: error.message };
  void bumpTimesPlaced(admin, rows.map((r) => r.asset_id).filter((id): id is string => !!id));
  return { written: rows.length, error: null };
}

export async function listAssignments(admin: SupabaseClient, tenantId: string): Promise<AssetAssignment[]> {
  const { data, error } = await admin.from("tenant_asset_assignments").select(SELECT).eq("tenant_id", tenantId).order("page_role").order("slot");
  if (error) {
    logServerError("asset-assignments.list", error);
    return [];
  }
  return ((data ?? []) as Row[]).map(map);
}

/** Mark slots as awaiting a per-site generation (the builder's pending state). */
export async function markAssignmentsPending(
  admin: SupabaseClient,
  input: { tenantId: string; jobId: string; slots: ReadonlyArray<{ pageRole: string; slot: string }> },
): Promise<void> {
  for (const s of input.slots) {
    const { error } = await admin
      .from("tenant_asset_assignments")
      .update({ pending_job_id: input.jobId })
      .eq("tenant_id", input.tenantId)
      .eq("page_role", s.pageRole)
      .eq("slot", s.slot)
      .is("replaced_by_user_at", null);
    if (error) logServerError("asset-assignments.pending", error);
  }
}

/** The job's swap: the slot now holds the tenant's own image; a user replacement in the meantime wins. */
export async function swapAssignment(
  admin: SupabaseClient,
  input: { tenantId: string; pageRole: string; slot: string; assetId: string; src: string; direction: string | null; jobId: string },
): Promise<"swapped" | "user_won" | "missing" | "failed"> {
  const { data, error } = await admin
    .from("tenant_asset_assignments")
    .update({ asset_id: input.assetId, src: input.src, source: "tenant_generated", direction: input.direction, pending_job_id: null, selected_at: new Date().toISOString() })
    .eq("tenant_id", input.tenantId)
    .eq("page_role", input.pageRole)
    .eq("slot", input.slot)
    .is("replaced_by_user_at", null)
    .select("id");
  if (error) {
    logServerError("asset-assignments.swap", error);
    return "failed";
  }
  if ((data ?? []).length > 0) return "swapped";
  const { data: row, error: readError } = await admin.from("tenant_asset_assignments").select("id, replaced_by_user_at").eq("tenant_id", input.tenantId).eq("page_role", input.pageRole).eq("slot", input.slot).maybeSingle();
  if (readError || !row) return "missing";
  return "user_won";
}

/** A failed or blocked slot keeps its pool image; only the pending flag goes. */
export async function clearPending(admin: SupabaseClient, input: { tenantId: string; jobId: string }): Promise<void> {
  const { error } = await admin.from("tenant_asset_assignments").update({ pending_job_id: null }).eq("tenant_id", input.tenantId).eq("pending_job_id", input.jobId);
  if (error) logServerError("asset-assignments.clear-pending", error);
}

async function bumpTimesPlaced(admin: SupabaseClient, assetIds: string[]): Promise<void> {
  try {
    for (const id of new Set(assetIds)) {
      const { data, error } = await admin.from("platform_stock_images").select("times_placed").eq("id", id).maybeSingle();
      if (error || !data) continue;
      const { error: upError } = await admin.from("platform_stock_images").update({ times_placed: ((data as { times_placed: number }).times_placed ?? 0) + 1, last_placed_at: new Date().toISOString() }).eq("id", id);
      if (upError) logServerError("asset-assignments.bump", upError);
    }
  } catch (error) {
    logServerError("asset-assignments.bump", error);
  }
}
