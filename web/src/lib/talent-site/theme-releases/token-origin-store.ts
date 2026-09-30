import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/**
 * THEME RELEASES: write `talent_sites.theme_token_origin` (key → hash of the
 * Design token default as applied). The column arrives with the Phase 1B
 * migration; until it exists this adapter no-ops (a missing column is not an
 * apply failure). Never throws.
 */
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

export function isMissingColumnError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_COLUMN_CODES.has(error.code)) return true;
  return /theme_token_origin/.test(error.message ?? "") && /column|schema cache/i.test(error.message ?? "");
}

export async function writeThemeTokenOrigin(
  admin: SupabaseClient,
  siteId: string,
  origin: Record<string, string>,
): Promise<{ ok: boolean; skipped?: "missing_column" }> {
  try {
    const { error } = await admin.from("talent_sites").update({ theme_token_origin: origin }).eq("id", siteId);
    if (!error) return { ok: true };
    if (isMissingColumnError(error)) return { ok: true, skipped: "missing_column" };
    logServerError("themeReleases.tokenOrigin.write", error);
    return { ok: false };
  } catch (err) {
    logServerError("themeReleases.tokenOrigin.write", err);
    return { ok: false };
  }
}
