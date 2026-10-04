import "server-only";

/**
 * Service-role reads/writes of `talent_translation_cache`. The table is keyed
 * by a content hash, not by tenant: identical (field, from, to, text) inputs
 * translate the same for everyone, and the row holds no identity. RLS is on
 * with no policies, so only this service-role path can touch it.
 */

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function readTalentTranslationCache(hash: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_translation_cache")
    .select("target_text")
    .eq("hash", hash)
    .maybeSingle<{ target_text: string }>();
  if (error) {
    logServerError("talentTranslate.cacheRead", error);
    return null;
  }
  return data?.target_text || null;
}

export async function writeTalentTranslationCache(row: {
  hash: string;
  field: string;
  from_locale: string;
  to_locale: string;
  source_text: string;
  target_text: string;
  model: string | null;
}): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  const { error } = await admin.from("talent_translation_cache").upsert(row, { onConflict: "hash", ignoreDuplicates: true });
  if (error) logServerError("talentTranslate.cacheWrite", error);
}
