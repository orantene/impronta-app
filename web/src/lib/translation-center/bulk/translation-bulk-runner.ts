import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { appendTranslationAudit, type TranslationAuditInput } from "@/lib/translation/audit";

export type BulkAuditMeta = Record<string, unknown>;

/**
 * Records bulk translation / review / conflict-fix jobs in translation_audit_events.
 * Uses synthetic entity_id = UUID job id so staff can trace batches.
 */
export async function appendBulkTranslationAudit(
  supabase: SupabaseClient,
  args: {
    jobId?: string;
    actorId: string | null;
    eventType: "bulk_ai_translate" | "bulk_mark_reviewed" | "bulk_mark_approved" | "bulk_conflict_fix";
    meta: BulkAuditMeta;
  },
): Promise<void> {
  const jobId = args.jobId ?? randomUUID();
  const row: TranslationAuditInput = {
    entityType: "translation_job",
    entityId: jobId,
    fieldName: "bulk",
    actorId: args.actorId,
    actorKind: "user",
    eventType: args.eventType,
    prevStatus: null,
    nextStatus: null,
    meta: args.meta,
  };
  await appendTranslationAudit(supabase, row);
}
