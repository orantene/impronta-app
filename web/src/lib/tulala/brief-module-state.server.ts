import "server-only";

/**
 * Onboarding module progress on the brief (`tulala_briefs.module_state`).
 * Kept beside the brief store rather than inside it: the store file sits at
 * the 800-line cap and this column carries no facts, only progress.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { isPlainObject } from "./brief-store.server";

/**
 * Merge a patch into the brief's onboarding `module_state` (shallow, top-level
 * keys; a key set to `null` is removed). Service role: the module's own server
 * actions are the only writers, and the column carries no facts, only progress.
 */
export async function updateBriefModuleState(
  briefId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; state: Record<string, unknown> }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, state: {} };
  const { data, error: readErr } = await sb
    .from("tulala_briefs")
    .select("module_state")
    .eq("id", briefId)
    .maybeSingle();
  if (readErr) {
    logServerError("tulala.updateBriefModuleState.read", readErr);
    return { ok: false, state: {} };
  }
  const current = isPlainObject(data?.module_state) ? data.module_state : {};
  const next = mergeModuleState(current, patch);
  const { error } = await sb.from("tulala_briefs").update({ module_state: next }).eq("id", briefId);
  if (error) {
    logServerError("tulala.updateBriefModuleState", error);
    return { ok: false, state: current };
  }
  return { ok: true, state: next };
}

export function mergeModuleState(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

