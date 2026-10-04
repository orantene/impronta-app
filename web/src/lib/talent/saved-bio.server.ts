import "server-only";

/**
 * F25: the public profile reads `bio_i18n`, but the talent drawer saved the
 * bio only to the `bios` catalog value until the self save mirrored it. Fill
 * the locales `bio_i18n` lacks from the saved `bios`, so every existing
 * talent's bio shows without a re-save. Service-role read (anon cannot see
 * catalog values); returns the profile untouched on any failure.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import { effectiveBioI18n } from "@/lib/translation/bios-to-bio-i18n";

export async function withSavedBios<T extends { id: string; bio_i18n: unknown }>(profile: T): Promise<T> {
  const admin = createServiceRoleClient();
  if (!admin) return profile;
  const { bios } = await readBlobFieldValuesFromCatalog(admin, profile.id);
  if (!Array.isArray(bios) || bios.length === 0) return profile;
  return { ...profile, bio_i18n: effectiveBioI18n(profile.bio_i18n, bios) } as T;
}
