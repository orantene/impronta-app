import "server-only";

/**
 * IO half of `bios-to-bio-i18n.ts`: after a profile save, mirror the editor's
 * `bios` into `talent_profiles.bio_i18n` so the public site shows them.
 * Best effort: a failure is logged and never fails the profile save.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { nextBioI18n } from "./bios-to-bio-i18n";

export async function syncBiosToBioI18n(
  supabase: SupabaseClient,
  talentProfileId: string,
  bios: ReadonlyArray<{ locale: string; text: string | null | undefined }> | null | undefined,
): Promise<void> {
  if (!bios || bios.length === 0) return;
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("bio_i18n")
    .eq("id", talentProfileId)
    .maybeSingle<{ bio_i18n: unknown }>();
  if (error) {
    logServerError("bios-sync.read", error);
    return;
  }
  const next = nextBioI18n(data?.bio_i18n, bios);
  if (!next) return;
  const { error: writeErr } = await supabase
    .from("talent_profiles")
    .update({ bio_i18n: next })
    .eq("id", talentProfileId);
  if (writeErr) logServerError("bios-sync.write", writeErr);
}
