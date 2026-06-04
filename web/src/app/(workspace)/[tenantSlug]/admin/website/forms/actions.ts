"use server";

import { revalidatePath } from "next/cache";
import { getCachedActorSession, getCachedServerSupabase } from "@/lib/server/request-cache";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { findTenantMembership } from "@/lib/saas/tenant";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? object : T))
  | { ok: false; error: string };

/**
 * Guard: user must be an owner or admin of the tenant to manage form
 * submissions. Returns the tenant id + an authenticated client on success.
 * This mirrors the pattern in `website/actions.ts`.
 */
async function requireFormsAdmin(tenantSlug: string) {
  const [session, supabase] = await Promise.all([
    getCachedActorSession(),
    getCachedServerSupabase(),
  ]);
  if (!session.user || !supabase) {
    return { ok: false as const, error: "Not authenticated." };
  }
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) {
    return { ok: false as const, error: "Workspace not found." };
  }
  const membership = await findTenantMembership(scope.tenantId);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { ok: false as const, error: "Admin access required." };
  }
  return { ok: true as const, supabase, tenantId: scope.tenantId };
}

/**
 * Mark a submission as read. Sets status=read and read_at=now when status
 * was previously "new". No-op for already-read / archived rows.
 */
export async function markSubmissionRead(
  tenantSlug: string,
  submissionId: string,
): Promise<ActionResult> {
  const guard = await requireFormsAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { error } = await supabase
    .from("cms_form_submissions")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("tenant_id", tenantId)
    .eq("status", "new"); // only flip new→read; already-read is a no-op

  if (error) {
    logServerError("forms/markRead", error);
    return { ok: false, error: "Failed to mark as read." };
  }
  revalidatePath(`/${tenantSlug}/admin/website/forms`);
  return { ok: true };
}

/**
 * Archive a submission. Sets status=archived and archived_at=now.
 * Operators can use this to triage without deleting records.
 */
export async function archiveSubmission(
  tenantSlug: string,
  submissionId: string,
): Promise<ActionResult> {
  const guard = await requireFormsAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { error } = await supabase
    .from("cms_form_submissions")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("tenant_id", tenantId)
    .in("status", ["new", "read"]); // prevent archiving spam rows inadvertently

  if (error) {
    logServerError("forms/archive", error);
    return { ok: false, error: "Failed to archive submission." };
  }
  revalidatePath(`/${tenantSlug}/admin/website/forms`);
  return { ok: true };
}

/**
 * Mark-all-read for a given section (or the whole tenant when sectionId is
 * omitted). Useful when an operator opens the inbox after being away.
 */
export async function markAllRead(
  tenantSlug: string,
  sectionId?: string,
): Promise<ActionResult<{ count: number }>> {
  const guard = await requireFormsAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  let query = supabase
    .from("cms_form_submissions")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("status", "new");

  if (sectionId) {
    query = query.eq("section_id", sectionId);
  }

  const { count, error } = await query;

  if (error) {
    logServerError("forms/markAllRead", error);
    return { ok: false, error: "Failed to mark as read." };
  }
  revalidatePath(`/${tenantSlug}/admin/website/forms`);
  return { ok: true, count: count ?? 0 };
}

/**
 * Export submissions as CSV.
 *
 * Returns a CSV string as the `csv` field — the page component turns it into
 * a file download via a client-side Blob. Scoped to tenant; optionally
 * filtered by sectionId. Uses the service-role client so the RLS-enabled
 * supabase client's page-size cap doesn't truncate large exports.
 *
 * Columns: id, form_name, contact_name, contact_email, submitted_at,
 *   source_url, status, + all payload keys discovered across the batch.
 */
export async function exportSubmissionsCsv(
  tenantSlug: string,
  sectionId?: string,
): Promise<ActionResult<{ csv: string }>> {
  const guard = await requireFormsAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { tenantId } = guard;

  // Use the service-role client to lift the 1000-row RLS select cap.
  const svcClient = createServiceRoleClient();
  if (!svcClient) {
    return { ok: false, error: "Service credentials unavailable." };
  }

  type SectionRow = { id: string; name: string };
  type SubmissionRow = {
    id: string;
    section_id: string;
    contact_name: string | null;
    contact_email: string | null;
    created_at: string;
    source_url: string | null;
    status: string;
    payload_jsonb: Record<string, unknown>;
  };

  // Fetch section names for the tenant in one query.
  const { data: sections } = await svcClient
    .from("cms_sections")
    .select("id, name")
    .eq("tenant_id", tenantId);

  const sectionMap = new Map<string, string>(
    ((sections ?? []) as SectionRow[]).map((s) => [s.id, s.name]),
  );

  let q = svcClient
    .from("cms_form_submissions")
    .select("id, section_id, contact_name, contact_email, created_at, source_url, status, payload_jsonb")
    .eq("tenant_id", tenantId)
    .neq("status", "spam")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (sectionId) {
    q = q.eq("section_id", sectionId);
  }

  const { data: rows, error } = await q;
  if (error) {
    logServerError("forms/exportCsv", error);
    return { ok: false, error: "Failed to load submissions." };
  }

  const submissions = (rows ?? []) as SubmissionRow[];

  // Discover all payload keys across the result set (stable insertion order).
  const payloadKeys = new Set<string>();
  for (const row of submissions) {
    const pj = row.payload_jsonb ?? {};
    for (const k of Object.keys(pj)) {
      payloadKeys.add(k);
    }
  }

  const staticCols = ["id", "form_name", "contact_name", "contact_email", "submitted_at", "source_url", "status"];
  const dynamicCols = Array.from(payloadKeys);
  const allCols = [...staticCols, ...dynamicCols];

  function csvCell(v: unknown): string {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return `"${s}"`;
    }
    return s;
  }

  const lines: string[] = [allCols.join(",")];
  for (const row of submissions) {
    const pj = row.payload_jsonb ?? {};
    const cells = [
      csvCell(row.id),
      csvCell(sectionMap.get(row.section_id) ?? row.section_id),
      csvCell(row.contact_name),
      csvCell(row.contact_email),
      csvCell(row.created_at),
      csvCell(row.source_url),
      csvCell(row.status),
      ...dynamicCols.map((k) => csvCell(pj[k])),
    ];
    lines.push(cells.join(","));
  }

  return { ok: true, csv: lines.join("\n") };
}
