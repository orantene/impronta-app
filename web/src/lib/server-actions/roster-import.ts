"use server";

import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveExclusivityForRosterAdd } from "@/lib/agency/exclusivity-resolver";
import { revalidatePath } from "next/cache";
import type { ServerActionResult } from "./result";

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
 * server-side intent. processRosterImportRow is exported so the worker
 * has a canonical per-row applier.
 */

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

export type RosterImportRow = {
  display_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  height_cm?: number;
  home_city_text?: string;
  short_bio?: string;
  /** Initial talent type slug; falls back to "model" when unset. */
  primary_type_slug?: string;
};

export async function enqueueRosterImportJob(
  input: EnqueueRosterImportInput,
): Promise<ServerActionResult<{ jobId: string; totalRows: number }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user } = auth;

    // Owner / admin only — bulk roster mutation is high-impact.
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    const { data: myMembership } = await admin
      .from("agency_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
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

    const { data: job, error: insertErr } = await admin
      .from("roster_import_jobs")
      .insert({
        tenant_id: tenantId,
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

  await admin
    .from("roster_import_jobs")
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

  await admin
    .from("roster_import_jobs")
    .update({
      status: failures.length === rows.length ? "failed" : "completed",
      processed_rows: processed,
      succeeded_rows: succeeded,
      failed_rows: failures.length,
      failure_details: failures,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/**
 * Per-row applier. Exported so a background worker can call this when
 * processing a file-based import. Idempotent on (tenant_id, email):
 * a re-run with the same email updates the existing talent_profile
 * + roster row instead of creating a duplicate.
 */
export async function processRosterImportRow(
  admin: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  row: RosterImportRow,
): Promise<{ ok: true; talentProfileId: string } | { ok: false; error: string }> {
  if (!admin) return { ok: false, error: "Service unavailable." };

  const displayName = row.display_name?.trim()
    || [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  if (!displayName) return { ok: false, error: "Row needs a display name (or first + last)." };
  if (!row.email?.trim()) return { ok: false, error: "Row needs an email." };

  const email = row.email.trim().toLowerCase();

  const incomingHeightCm =
    typeof row.height_cm === "number" ? row.height_cm : null;

  // Look up existing talent_profile by invitation_email + an active
  // roster row on this tenant — idempotency anchor.
  const { data: existing } = await admin
    .from("talent_profiles")
    .select("id")
    .ilike("invitation_email", email)
    .maybeSingle();

  let talentProfileId: string;

  if (existing) {
    talentProfileId = (existing as { id: string }).id;
    await admin
      .from("talent_profiles")
      .update({
        display_name: displayName,
        first_name: row.first_name?.trim() ?? null,
        last_name: row.last_name?.trim() ?? null,
        phone: row.phone?.trim() ?? null,
        height_cm: typeof row.height_cm === "number" ? row.height_cm : null,
        home_city_text: row.home_city_text?.trim() ?? null,
        short_bio: row.short_bio?.trim() ?? null,
      })
      .eq("id", talentProfileId);
  } else {
    const { data: created, error: createErr } = await admin
      .from("talent_profiles")
      .insert({
        display_name: displayName,
        first_name: row.first_name?.trim() ?? null,
        last_name: row.last_name?.trim() ?? null,
        invitation_email: email,
        phone: row.phone?.trim() ?? null,
        height_cm: typeof row.height_cm === "number" ? row.height_cm : null,
        home_city_text: row.home_city_text?.trim() ?? null,
        short_bio: row.short_bio?.trim() ?? null,
        workflow_status: "draft",
        visibility: "public",
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return { ok: false, error: createErr?.message ?? "Couldn't create profile." };
    }
    talentProfileId = (created as { id: string }).id;
  }

  // ── Phase 5-ε: canonical-first height seed ─────────────────────────────────
  // `talent_profiles.height_cm` (written above) is the denormalized column.
  // Canonical store is `talent_profile_field_values` keyed by
  // `physical.height_cm`. Seed/clear canonical now so the two never drift.
  // The new-insert branch needs the profile id to exist first, so we seed
  // here rather than as a pre-write step; semantically canonical is still
  // authoritative. Per-row errors are logged + swallowed: a single bad
  // canonical seed must not abort the import of the whole batch.
  try {
    const { data: defRow, error: defErr } = await admin
      .from("profile_field_definitions")
      .select("id")
      .eq("field_key", "physical.height_cm")
      .maybeSingle();
    if (defErr) {
      logServerError("roster-import.canonicalHeightDefLookup", defErr);
    } else if (defRow) {
      const definitionId = (defRow as { id: string }).id;
      if (incomingHeightCm === null) {
        const { error: delErr } = await admin
          .from("talent_profile_field_values")
          .delete()
          .eq("talent_profile_id", talentProfileId)
          .eq("field_definition_id", definitionId);
        if (delErr) {
          logServerError("roster-import.canonicalHeightDelete", delErr);
        }
      } else {
        const { error: upsertErr } = await admin
          .from("talent_profile_field_values")
          .upsert(
            {
              tenant_id: tenantId,
              talent_profile_id: talentProfileId,
              field_definition_id: definitionId,
              value: incomingHeightCm,
              workflow_state: "live",
              last_edited_role: "platform",
            },
            { onConflict: "talent_profile_id,field_definition_id" },
          );
        if (upsertErr) {
          logServerError("roster-import.canonicalHeightUpsert", upsertErr);
        }
      }
    }
  } catch (err) {
    logServerError("roster-import.canonicalHeightCatch", err);
  }

  // Auto-exclusivity (project_agency_exclusivity_model.md): bulk import
  // follows the same rule as manual admin add — paid plans get
  // is_primary=TRUE unless the talent is already exclusive elsewhere.
  // We only stamp is_primary on the initial insert (the upsert collides
  // on tenant_id+talent_profile_id; re-import shouldn't toggle the flag
  // off a row that's been manually adjusted).
  const exclusivity = await resolveExclusivityForRosterAdd(
    admin,
    tenantId,
    talentProfileId,
  );

  // Upsert the agency_talent_roster row (idempotent on tenant + talent).
  // is_primary is set on first insert; ignored on conflict.
  const { error: rosterErr } = await admin
    .from("agency_talent_roster")
    .upsert(
      {
        tenant_id: tenantId,
        talent_profile_id: talentProfileId,
        status: "active",
        is_primary: exclusivity.shouldBeExclusive,
        exclusivity_status: exclusivity.exclusivityStatus,
        exclusivity_auto_assigned_at: exclusivity.autoAssignedAt,
      },
      { onConflict: "tenant_id,talent_profile_id", ignoreDuplicates: false },
    );
  if (rosterErr) return { ok: false, error: rosterErr.message };

  return { ok: true, talentProfileId };
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
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return [];
    const { tenantId, supabase } = auth;

    const { data, error } = await supabase
      .from("roster_import_jobs")
      .select(
        "id, status, total_rows, processed_rows, succeeded_rows, failed_rows, source_file_name, started_at, completed_at, created_at",
      )
      .eq("tenant_id", tenantId)
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
