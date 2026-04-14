"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

const CORE_AI_KEYS = [
  "ai_search_enabled",
  "ai_rerank_enabled",
  "ai_explanations_enabled",
  "ai_refine_enabled",
  "ai_draft_enabled",
] as const;

export type EnableCoreAiState = { error?: string; success?: boolean } | undefined;

/**
 * Turns on the five core AI feature flags in `settings` (does not touch v2 flags).
 */
export async function enableCoreAiFeatures(
  _prev: EnableCoreAiState,
  _formData: FormData,
): Promise<EnableCoreAiState> {
  void _prev;
  void _formData;
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  for (const key of CORE_AI_KEYS) {
    const { error } = await auth.supabase
      .from("settings")
      .upsert({ key, value: true, updated_at: new Date().toISOString() });
    if (error) {
      logServerError("admin/enableCoreAiFeatures", error);
      return { error: CLIENT_ERROR.update };
    }
  }

  revalidatePath("/admin/ai-workspace");
  revalidatePath("/admin/ai-workspace/settings");
  revalidatePath("/admin/settings");
  return { success: true };
}
