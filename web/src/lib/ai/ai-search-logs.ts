import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type AiSearchLogPayload = {
  tenantId: string | null;
  rawQuery: string;
  normalizedSummary: string;
  taxonomyTermIds: string[];
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  locale: "en" | "es";
  usedInterpreter: boolean;
};

export async function insertAiSearchLog(payload: AiSearchLogPayload): Promise<void> {
  if (!payload.tenantId) return;
  const admin = createServiceRoleClient();
  if (!admin) return;

  const { error } = await admin.from("ai_search_logs").insert({
    tenant_id: payload.tenantId,
    raw_query: payload.rawQuery,
    normalized_summary: payload.normalizedSummary,
    taxonomy_term_ids: payload.taxonomyTermIds,
    location_slug: payload.locationSlug?.trim() ? payload.locationSlug.trim() : null,
    height_min_cm: payload.heightMinCm,
    height_max_cm: payload.heightMaxCm,
    locale: payload.locale,
    used_interpreter: payload.usedInterpreter,
  });

  if (error) {
    logServerError("ai_search_logs insert", error);
  }
}
