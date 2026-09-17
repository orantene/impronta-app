"use server";

/**
 * Tenant-facing read of the stored image assignments (03 §4b): the builder
 * polls this while any slot is pending so it can show "your photos are being
 * made" on exactly those images and swap the src in place when the per-site
 * job lands. Tenant resolved from the workspace surface, never from input.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { listAssignments } from "./asset-assignments.server";

export interface AssignmentView {
  pageRole: string;
  slot: string;
  src: string;
  source: string;
  pending: boolean;
  selectedAt: string;
}

export async function actionListAssetAssignments(): Promise<{ ok: true; items: AssignmentView[] } | { ok: false; error: string }> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const rows = await listAssignments(admin, guard.tenantId);
  return { ok: true, items: rows.map((r) => ({ pageRole: r.pageRole, slot: r.slot, src: r.src, source: r.source, pending: !!r.pendingJobId, selectedAt: r.selectedAt })) };
}
