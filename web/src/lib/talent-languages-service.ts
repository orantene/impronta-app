/**
 * Domain logic for talent_languages.
 *
 * talent_languages is the canonical structured language record.
 * talent_profiles.languages TEXT[] is a derived denormalized cache, kept in
 * sync by a Postgres trigger. App code should NOT write to that array
 * directly after PR 1 lands.
 *
 * The DB enforces UNIQUE (talent_profile_id, language_code), so this service
 * exposes a full-replace `setTalentLanguages` API the onboarding form will
 * call in PR 2, plus single-row helpers for incremental edits.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export type SpeakingLevel = "basic" | "conversational" | "professional" | "fluent" | "native";

export type TalentLanguageInput = {
  /** ISO 639-1 lower-cased: en, es, pt, fr, it, de, ... */
  languageCode: string;
  /** Display name: English, Spanish, Portuguese */
  languageName: string;
  speakingLevel: SpeakingLevel;
  readingLevel?: SpeakingLevel | null;
  writingLevel?: SpeakingLevel | null;
  isNative?: boolean;
  canHost?: boolean;
  canSell?: boolean;
  canTranslate?: boolean;
  canTeach?: boolean;
  displayOrder?: number;
};

export type LanguageMutationResult = { ok: true } | { ok: false; error: string };

const SPEAKING_LEVELS: readonly SpeakingLevel[] = [
  "basic",
  "conversational",
  "professional",
  "fluent",
  "native",
];

export function languageLevelRank(level: SpeakingLevel | null | undefined): number {
  if (!level) return 0;
  const idx = SPEAKING_LEVELS.indexOf(level);
  return idx === -1 ? 0 : idx + 1;
}

/**
 * Replace the full set of language rows for a profile in a single
 * transaction. Inserts/updates via UPSERT, then deletes any rows whose
 * language_code is no longer in the input set.
 *
 * The cache trigger fires per row but is fast — we accept the extra writes
 * for a clean transactional contract. If this becomes a hot path, push the
 * full-replace into a SECURITY DEFINER RPC that disables the trigger
 * mid-transaction.
 */
export async function setTalentLanguages(
  supabase: SupabaseClient,
  params: { talentProfileId: string; tenantId: string | null; rows: TalentLanguageInput[] },
): Promise<LanguageMutationResult> {
  const codes = params.rows.map((r) => r.languageCode.toLowerCase().trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const code of codes) {
    if (seen.has(code)) {
      return { ok: false, error: `Duplicate language code: ${code}` };
    }
    seen.add(code);
  }

  if (params.rows.length > 0) {
    const upsertRows = params.rows.map((r, i) => ({
      tenant_id: params.tenantId,
      talent_profile_id: params.talentProfileId,
      language_code: r.languageCode.toLowerCase().trim(),
      language_name: r.languageName.trim(),
      speaking_level: r.speakingLevel,
      reading_level: r.readingLevel ?? null,
      writing_level: r.writingLevel ?? null,
      is_native: r.isNative ?? false,
      can_host: r.canHost ?? false,
      can_sell: r.canSell ?? false,
      can_translate: r.canTranslate ?? false,
      can_teach: r.canTeach ?? false,
      display_order: r.displayOrder ?? i,
    }));

    const { error: upErr } = await supabase
      .from("talent_languages")
      .upsert(upsertRows, { onConflict: "talent_profile_id,language_code" });

    if (upErr) {
      logServerError("talent-languages/set/upsert", upErr);
      return { ok: false, error: "Could not save languages." };
    }
  }

  // Delete rows whose language_code is no longer in the input set.
  let deleteQuery = supabase
    .from("talent_languages")
    .delete()
    .eq("talent_profile_id", params.talentProfileId);

  if (codes.length > 0) {
    deleteQuery = deleteQuery.not("language_code", "in", `(${codes.map((c) => `"${c}"`).join(",")})`);
  }

  const { error: delErr } = await deleteQuery;
  if (delErr) {
    logServerError("talent-languages/set/delete", delErr);
    return { ok: false, error: "Could not save languages." };
  }

  return { ok: true };
}

export async function removeTalentLanguage(
  supabase: SupabaseClient,
  params: { talentProfileId: string; languageCode: string },
): Promise<LanguageMutationResult> {
  const { error } = await supabase
    .from("talent_languages")
    .delete()
    .eq("talent_profile_id", params.talentProfileId)
    .eq("language_code", params.languageCode.toLowerCase().trim());

  if (error) {
    logServerError("talent-languages/remove", error);
    return { ok: false, error: "Could not remove language." };
  }
  return { ok: true };
}
