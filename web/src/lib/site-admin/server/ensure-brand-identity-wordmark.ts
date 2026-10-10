/**
 * TUL-524 — default brand identity to the business-name wordmark.
 *
 * New sites must publish without a logo upload. The Look already renders the
 * display name when no logo asset exists; this only records the choice so
 * publish preflight never treats a fresh seed as incomplete.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export async function ensureBrandIdentityWordmark(
  client: SupabaseClient,
  tenantId: string,
): Promise<void> {
  const { data, error } = await client
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle<{ settings: Record<string, unknown> | null }>();
  if (error) {
    logServerError("ensureBrandIdentityWordmark.read", error);
    return;
  }
  const settings =
    data?.settings && typeof data.settings === "object" ? { ...data.settings } : {};
  if (settings.brand_identity === "wordmark" || settings.brand_identity === "logo") {
    return;
  }
  const { error: writeErr } = await client
    .from("agencies")
    .update({
      settings: { ...settings, brand_identity: "wordmark" },
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);
  if (writeErr) {
    logServerError("ensureBrandIdentityWordmark.write", writeErr);
  }
}
