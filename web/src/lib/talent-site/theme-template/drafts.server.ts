// PLACEHOLDER: replaced by S3 at integration
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ThemeDraft,
  ThemeDraftPreview,
  ThemeDraftResult,
  ThemeDraftSaveTokens,
  ThemeDraftSaveTree,
} from "./types";

const NOT_IMPLEMENTED = { ok: false, code: "error", error: "not implemented" } as const;

export async function openThemeDraft(
  _admin: SupabaseClient,
  _design: string,
  _actorId: string | null,
): Promise<ThemeDraftResult<ThemeDraft>> {
  return NOT_IMPLEMENTED;
}

export async function loadThemeDraft(
  _admin: SupabaseClient,
  _design: string,
): Promise<ThemeDraftResult<ThemeDraft>> {
  return NOT_IMPLEMENTED;
}

export async function saveThemeDraftTree(
  _admin: SupabaseClient,
  _input: ThemeDraftSaveTree,
): Promise<ThemeDraftResult<{ rev: number }>> {
  return NOT_IMPLEMENTED;
}

export async function saveThemeDraftTokens(
  _admin: SupabaseClient,
  _input: ThemeDraftSaveTokens,
): Promise<ThemeDraftResult<{ rev: number }>> {
  return NOT_IMPLEMENTED;
}

export async function savePreviewSettings(
  _admin: SupabaseClient,
  _input: { design: string; preview: ThemeDraftPreview },
): Promise<ThemeDraftResult<null>> {
  return NOT_IMPLEMENTED;
}

export async function discardThemeDraft(
  _admin: SupabaseClient,
  _design: string,
  _actorId: string | null,
): Promise<ThemeDraftResult<null>> {
  return NOT_IMPLEMENTED;
}
