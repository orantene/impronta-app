"use server";

// engine-audit.ts
//
// Phase 7a — fire-and-forget audit hook for catalog/privacy changes
// to the talent engine. Sister to talent_profile_field_value_history
// (which audits *values*); this one audits *control plane* edits:
// field privacy, field catalog enable/relabel/require, group settings,
// taxonomy, resets.
//
// Contract:
//   - Writes through the service-role client (bypasses RLS — the table
//     has no INSERT policy by design; service role is the only writer).
//   - Errors are logged and SWALLOWED. The actual user-facing write
//     (the upsert/delete in the caller) must never be blocked by an
//     audit failure — losing one audit row is preferable to failing
//     the user's save.
//   - Returns void so callers can `void logEngineAudit(...)` without
//     awaiting if they want to (most call sites await for ordering
//     determinism inside server actions; the cost is one cheap insert).

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

export type EngineAuditSurface =
  | "field-privacy"
  | "field-catalog"
  | "field-group"
  | "taxonomy"
  | "reset";

export type EngineAuditSubjectKind = "field" | "group" | "category";

export type EngineAuditOperation = "set" | "reset" | "enable" | "disable";

export type EngineAuditActorRole =
  | "agency_admin"
  | "platform_admin"
  | "system";

export type LogEngineAuditInput = {
  tenantId: string;
  actorUserId: string | null;
  actorRole: EngineAuditActorRole;
  surface: EngineAuditSurface;
  subjectKind: EngineAuditSubjectKind;
  subjectId: string;
  /** Human-readable handle (field_key / group slug / category slug)
   *  denormalized so the History rail renders even if the subject row
   *  is later deleted. Optional — pass null when unavailable. */
  subjectKey: string | null;
  operation: EngineAuditOperation;
  /** Snapshot of the override row before the write, or null when no
   *  override existed (i.e. platform default). */
  beforeValue: unknown;
  /** Snapshot after the write, or null on reset. */
  afterValue: unknown;
};

export async function logEngineAudit(input: LogEngineAuditInput): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    if (!svc) {
      // Local/dev without SUPABASE_SERVICE_ROLE_KEY — silently skip;
      // audit is not security-critical for correctness of the write.
      void improntaLog("engine_audit.warn", {
        message: "service-role client unavailable; skipping log",
      });
      return;
    }
    const { error } = await svc.from("engine_audit_log").insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId,
      actor_role: input.actorRole,
      surface: input.surface,
      subject_kind: input.subjectKind,
      subject_id: input.subjectId,
      subject_key: input.subjectKey,
      operation: input.operation,
      before_value: input.beforeValue ?? null,
      after_value: input.afterValue ?? null,
    });
    if (error) {
      void improntaLog("engine_audit.insert_failed", {
        error_message: error.message,
        surface: input.surface,
        subjectKind: input.subjectKind,
        operation: input.operation,
      });
    }
  } catch (err) {
    // Defensive — never re-throw. The user's save has already
    // succeeded by the time we get here.
    logServerError("engine_audit.unexpected", err);
  }
}
