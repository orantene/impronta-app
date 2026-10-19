/**
 * F1 (TUL-1273 deferred): loads a talent's guest-sellable offerings (D-10:
 * published + approved + public, talent-owned) for the AI search document.
 * A read error logs and yields [] so the rest of the document still rebuilds.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiSearchDocumentOffering } from "@/lib/ai/ai-search-document-offerings";
import { AI_DOC_OFFERINGS_MAX } from "@/lib/ai/ai-search-document-offerings";
import { scopeToGuestSellableOfferings } from "@/lib/offerings/guest-sellable";
import { logServerError } from "@/lib/server/safe-error";

type OfferingRow = {
  id: string;
  title: string | null;
  category: string | null;
  description: string | null;
  sort_order: number | null;
  status: string | null;
  moderation_state: string | null;
  visibility: string | null;
};

export async function loadAiSearchDocumentOfferings(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<AiSearchDocumentOffering[]> {
  const query = supabase
    .from("talent_offerings")
    .select("id, title, category, description, sort_order, status, moderation_state, visibility")
    .eq("talent_profile_id", talentProfileId)
    .eq("owner_kind", "talent");
  const { data, error } = await scopeToGuestSellableOfferings(query)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    // Over-fetch a little: the builder re-checks the gate and drops empty titles.
    .limit(AI_DOC_OFFERINGS_MAX * 2);
  if (error) {
    logServerError("rebuildAiSearchDocument/offerings", error);
    return [];
  }
  return ((data ?? []) as OfferingRow[]).map((r) => ({
    id: r.id,
    title: r.title ?? "",
    category: r.category,
    description: r.description,
    sortOrder: r.sort_order,
    status: r.status,
    moderation_state: r.moderation_state,
    visibility: r.visibility,
  }));
}
