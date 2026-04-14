import type { SupabaseClient } from "@supabase/supabase-js";
import { rebuildAiSearchDocument } from "@/lib/ai/rebuild-ai-search-document";
import { logServerError } from "@/lib/server/safe-error";

/** Recomputes and persists `ai_search_document`; logs on failure without throwing. */
export async function scheduleRebuildAiSearchDocument(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<void> {
  const { error } = await rebuildAiSearchDocument(supabase, talentProfileId);
  if (error) logServerError("scheduleRebuildAiSearchDocument", new Error(error));
}
