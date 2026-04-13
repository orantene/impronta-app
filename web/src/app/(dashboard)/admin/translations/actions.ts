"use server";

import { requireStaff } from "@/lib/server/action-guards";

/**
 * Placeholder for bulk AI translation jobs (stale queue, fill-all-missing).
 * Returns a clear message until the job runner is implemented.
 */
export async function adminTranslationsBulkAiPlaceholder(): Promise<{ error: string } | { ok: true }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  return { error: "Bulk AI translation is not enabled yet. Use per-talent AI actions or manual edits." };
}
