"use server";

/* eslint-disable ratchet/no-untenanted-from -- talent_profiles and profile_field_definitions are global identity/catalog tables with no tenant_id; tenanted tables below go through tenantScopedQuery. */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logServerError } from "@/lib/server/safe-error";
import { auditFailure } from "@/lib/audit/emit";
import { revalidatePath } from "next/cache";
import type { ServerActionResult } from "./result";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { processRosterImportRow, type RosterImportRow } from "./roster-import-row";

/**
 * F.13 — Roster import jobs.
 *
 * Two surfaces:
 *
 *   1. enqueueRosterImportJob — admin uploads a CSV/XLSX (or pastes
 *      structured rows inline) → job queued, worker picks it up,
 *      progress visible. The action returns the job id so the UI can
 *      poll / listen.
 *
 *   2. listRosterImportJobs — recent imports + their status (for the
 *      "Migrations" panel in settings).
 *
 * Worker implementation (separate Edge Function or background job) is
 * out of scope for this commit — the contract here is the table + the
 * server-side intent. The per-row applier (processRosterImportRow) lives in
 * ./roster-import-row.ts, a plain server module, so a worker imports it on the
 * server and it is never an exported server action.
 */

export type { RosterImportRow } from "./roster-import-row";

export type EnqueueRosterImportInput = {
  /** Storage path under the `roster-imports` bucket (private). */
  storagePath?: string | null;
  /** Inline rows when admin pastes data instead of uploading a file. */
  inlineRows?: Array<RosterImportRow> | null;
  sourceFormat: "csv" | "xlsx" | "xls" | "json" | "manual";
  sourceFileName?: string | null;
  sourceFileSizeBytes?: number | null;
  note?: string | null;
};


export async function enqueueRosterImportJob(
  input: EnqueueRosterImportInput,
): Promise<ServerActionResult<{ jobId: string; totalRows: number }>> {
  await requireNotImpersonating();
  try {
    // TUL-1708: bulk-adding talent to the roster is exactly what
    // `manage_talent_roster` (manager tier) describes. The owner/admin-only
    // role check just below is a stricter, pre-existing gate layered on top —
    // naming this capability only closes the viewer/editor default, it does
    // not loosen anything that check already enforces.
    const auth = await requireWorkspaceStaffAction({ capability: "manage_talent_roster" });
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user } = auth;

    // Owner / admin only — bulk roster mutation is high-impact.
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    const { data: myMembership } = await tenantScopedQuery(admin, "agency_memberships", tenantId)
      .select("role")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const myRole = (myMembership as { role?: string } | null)?.role;
    if (myRole !== "owner" && myRole !== "admin") {
      return { ok: false, error: "Only owner/admin can queue an import.", reason: "forbidden" };
    }

    // Calculate total rows up front (drives the progress bar).
    const totalRows = input.inlineRows?.length ?? 0;
    if (!input.storagePath && totalRows === 0) {
      return { ok: false, error: "Provide a file or paste rows to import.", reason: "validation_failed" };
    }

    const { data: job, error: insertErr } = await tenantScopedQuery(admin, "roster_import_jobs", tenantId)
      .insert({
        initiated_by_user_id: user.id,
        source_file_name: input.sourceFileName ?? null,
        source_file_size_bytes: input.sourceFileSizeBytes ?? null,
        source_format: input.sourceFormat,
        storage_path: input.storagePath ?? null,
        total_rows: totalRows,
        note: input.note?.trim() || null,
      })
      .select("id")
      .single();

    if (insertErr || !job) {
      logServerError("roster-import.enqueue", insertErr);
      return { ok: false, error: "Couldn't queue import.", reason: "unexpected" };
    }

    const jobId = (job as { id: string }).id;

    // Inline-row path: process synchronously here. File-path imports
    // are handled by a background worker (Edge Function), which reads
    // the storage object + parses + calls processRosterImportRow per
    // row. The worker isn't deployed yet — file imports stay queued
    // until that lands; inline imports work today.
    if (input.inlineRows && input.inlineRows.length > 0) {
      await processInlineRows(admin, jobId, tenantId, input.inlineRows);
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { jobId, totalRows } };
  } catch (err) {
    logServerError("roster-import.enqueue", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

async function processInlineRows(
  admin: ReturnType<typeof createServiceRoleClient>,
  jobId: string,
  tenantId: string,
  rows: RosterImportRow[],
): Promise<void> {
  if (!admin) return;

  await tenantScopedQuery(admin, "roster_import_jobs", tenantId)
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const failures: Array<{ row: number; error: string; values: RosterImportRow }> = [];
  let succeeded = 0;
  let processed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    processed += 1;
    try {
      const result = await processRosterImportRow(admin, tenantId, row);
      if (result.ok) {
        succeeded += 1;
      } else {
        failures.push({ row: i + 1, error: result.error, values: row });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      failures.push({ row: i + 1, error: msg, values: row });
    }
  }

  await tenantScopedQuery(admin, "roster_import_jobs", tenantId)
    .update({
      status: failures.length === rows.length ? "failed" : "completed",
      processed_rows: processed,
      succeeded_rows: succeeded,
      failed_rows: failures.length,
      failure_details: failures,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // ONE audit row per import JOB, never per failed row: a 2,000-row CSV with a
  // bad header would otherwise write 2,000 events. Per-row detail already lives
  // in `roster_import_jobs.failure_details`; the log only needs the headline.
  if (failures.length > 0) {
    const distinctErrors: string[] = [];
    for (const failure of failures) {
      if (!distinctErrors.includes(failure.error)) distinctErrors.push(failure.error);
      if (distinctErrors.length >= 3) break;
    }
    auditFailure(
      tenantId,
      "roster",
      "roster.import.failed",
      `Roster import added ${succeeded} of ${rows.length} rows, ${failures.length} failed`,
      {
        targetType: "roster_import_job",
        targetId: jobId,
        metadata: { total: rows.length, succeeded, failed: failures.length },
        reason: distinctErrors.join("; ").slice(0, 200),
      },
    );
  }
}

/**
 * F.13 — Listing for the Migrations panel.
 */
export type RosterImportJobSummary = {
  id: string;
  status: string;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  sourceFileName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export async function listRosterImportJobs(): Promise<RosterImportJobSummary[]> {
  try {
    const auth = await requireWorkspaceStaffAction({ capability: "agency.workspace.view" });
    if (!auth.ok) return [];
    const { tenantId, supabase } = auth;

    const { data, error } = await tenantScopedQuery(supabase, "roster_import_jobs", tenantId)
      .select(
        "id, status, total_rows, processed_rows, succeeded_rows, failed_rows, source_file_name, started_at, completed_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      logServerError("roster-import.list", error);
      return [];
    }

    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        status: r.status as string,
        totalRows: (r.total_rows as number) ?? 0,
        processedRows: (r.processed_rows as number) ?? 0,
        succeededRows: (r.succeeded_rows as number) ?? 0,
        failedRows: (r.failed_rows as number) ?? 0,
        sourceFileName: (r.source_file_name as string | null) ?? null,
        startedAt: (r.started_at as string | null) ?? null,
        completedAt: (r.completed_at as string | null) ?? null,
        createdAt: r.created_at as string,
      };
    });
  } catch (err) {
    logServerError("roster-import.list", err);
    return [];
  }
}
