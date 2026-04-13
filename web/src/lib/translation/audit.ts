import type { SupabaseClient } from "@supabase/supabase-js";

export type TranslationAuditInput = {
  entityType: string;
  entityId: string;
  fieldName: string;
  actorId: string | null;
  actorKind: "user" | "system" | "ai";
  eventType: string;
  prevStatus: string | null;
  nextStatus: string | null;
  meta?: Record<string, unknown>;
};

export async function appendTranslationAudit(
  supabase: SupabaseClient,
  row: TranslationAuditInput,
): Promise<void> {
  const { error } = await supabase.from("translation_audit_events").insert({
    entity_type: row.entityType,
    entity_id: row.entityId,
    field_name: row.fieldName,
    actor_id: row.actorId,
    actor_kind: row.actorKind,
    event_type: row.eventType,
    prev_status: row.prevStatus,
    next_status: row.nextStatus,
    meta: row.meta ?? {},
  });
  if (error) {
    console.error("translation_audit_events insert", error);
  }
}
