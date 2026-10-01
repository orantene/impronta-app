// PLACEHOLDER: replaced at integration (S3 owns the real drafts store).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThemeDraft, ThemeDraftResult, ThemeDraftSaveTokens } from "./types";

export async function loadThemeDraft(
  _admin: SupabaseClient,
  _design: string,
): Promise<ThemeDraftResult<ThemeDraft>> {
  return { ok: false, code: "error", error: "PLACEHOLDER: drafts store not integrated" };
}

export async function saveThemeDraftTokens(
  _admin: SupabaseClient,
  _input: ThemeDraftSaveTokens,
): Promise<ThemeDraftResult<{ rev: number }>> {
  return { ok: false, code: "error", error: "PLACEHOLDER: drafts store not integrated" };
}
