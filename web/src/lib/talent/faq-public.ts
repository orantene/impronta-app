/**
 * Public read of published `talent_faq_items` for Maison FAQ bind (W16).
 */
import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { TalentFaqItemRow } from "@/lib/talent-site/theme-catalog/maison/faq-bind";

export async function loadPublishedFaqForProfile(
  talentProfileId: string,
): Promise<TalentFaqItemRow[]> {
  const id = talentProfileId?.trim();
  if (!id) return [];
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("talent_faq_items")
    .select("id, question, answer, sort_order")
    .eq("talent_profile_id", id)
    .eq("status", "published")
    .order("sort_order", { ascending: true });
  if (error) {
    logServerError("faq.loadPublished", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    question: String((row as { question: string }).question ?? ""),
    answer: String((row as { answer: string }).answer ?? ""),
    sort_order: Number((row as { sort_order?: number }).sort_order ?? 0),
  }));
}
