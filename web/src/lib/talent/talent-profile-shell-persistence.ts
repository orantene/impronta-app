/**
 * Pure helpers + Zod for the admin talent profile shell (drawer) persistence.
 * Lives outside `use server` files so we can export sync builders without
 * violating the server-actions export rule.
 */

import { z } from "zod";

// ─── Identity (mirrors admin-talent-identity.ts) ─────────────────────────────

const fieldVisibilityValueSchema = z
  .array(z.enum(["public", "agency", "private"]))
  .min(1, "At least one channel required");

const fieldVisibilityObjectSchema = z
  .object({
    legalName: fieldVisibilityValueSchema.optional(),
    pronouns: fieldVisibilityValueSchema.optional(),
    gender: fieldVisibilityValueSchema.optional(),
    dob: fieldVisibilityValueSchema.optional(),
  })
  .strict();

export const updateTalentIdentitySchema = z.object({
  talent_profile_id: z.string().uuid("Invalid talent profile id."),
  stage_name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  legal_name: z.string().optional(),
  pronouns: z
    .enum(["she_her", "he_him", "they_them", "ze_zir", "custom"])
    .nullable()
    .optional(),
  pronouns_custom: z.string().optional(),
  gender: z.string().optional(),
  date_of_birth: z.string().optional(),
  age_display_mode: z.enum(["exact", "range", "hidden"]).optional(),
  nationality: z.string().optional(),
  /** Country of residence label — `talent_profiles.home_country_text`. */
  home_country: z.string().optional(),
  response_time: z.enum(["1h", "4h", "24h", "48h"]).nullable().optional(),
  field_visibility: fieldVisibilityObjectSchema.optional(),
  /** Agency-visible contact; stored as `talent_profiles.invitation_email` (roster invite + direct contact). */
  contact_email: z.string().optional(),
  /** National number; combined with `contact_phone_prefix` → `talent_profiles.phone`. */
  contact_phone: z.string().optional(),
  contact_phone_prefix: z.string().optional(),
});

export type UpdateTalentIdentityInput = z.infer<typeof updateTalentIdentitySchema>;

function nullifyEmpty(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

export function buildTalentIdentityProfilePatch(
  input: unknown,
):
  | { ok: true; talent_profile_id: string; patch: Record<string, unknown> }
  | { ok: false; error: string } {
  const parsed = updateTalentIdentitySchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Invalid identity payload." };
  }
  const v = parsed.data;

  const patch: Record<string, unknown> = {};
  if (v.stage_name !== undefined) patch.display_name = v.stage_name.trim();
  const firstName = nullifyEmpty(v.first_name);
  if (firstName !== undefined) patch.first_name = firstName;
  const lastName = nullifyEmpty(v.last_name);
  if (lastName !== undefined) patch.last_name = lastName;
  const legalName = nullifyEmpty(v.legal_name);
  if (legalName !== undefined) patch.legal_name = legalName;
  if (v.pronouns !== undefined) patch.pronouns = v.pronouns;
  const pronounsCustom = nullifyEmpty(v.pronouns_custom);
  if (pronounsCustom !== undefined) patch.pronouns_custom = pronounsCustom;
  const gender = nullifyEmpty(v.gender);
  if (gender !== undefined) patch.gender = gender;
  if (v.date_of_birth !== undefined) {
    const t = v.date_of_birth.trim();
    patch.date_of_birth = t === "" ? null : t;
  }
  if (v.age_display_mode !== undefined) patch.age_display_mode = v.age_display_mode;
  const nationality = nullifyEmpty(v.nationality);
  if (nationality !== undefined) patch.nationality = nationality;
  const homeCountry = nullifyEmpty(v.home_country);
  if (homeCountry !== undefined) patch.home_country_text = homeCountry;
  if (v.response_time !== undefined) patch.response_time = v.response_time;
  if (v.field_visibility !== undefined) patch.field_visibility = v.field_visibility;

  if (v.contact_email !== undefined) {
    const t = v.contact_email.trim();
    patch.invitation_email = t === "" ? null : t;
  }
  if (v.contact_phone !== undefined || v.contact_phone_prefix !== undefined) {
    const pref = (v.contact_phone_prefix ?? "").trim();
    const nat = (v.contact_phone ?? "").trim();
    const combined = [pref, nat].filter(Boolean).join(" ").trim();
    patch.phone = combined === "" ? null : combined;
  }

  return { ok: true, talent_profile_id: v.talent_profile_id, patch };
}

// ─── Languages → RPC rows (mirrors admin-talent-languages.ts) ────────────────

export type DrawerLanguageRowInput = {
  language: string;
  level?: string;
  canHost?: boolean;
  canSell?: boolean;
  canTranslate?: boolean;
  canTeach?: boolean;
};

type SpeakingLevel = "basic" | "conversational" | "professional" | "fluent" | "native";

function mapLevel(level: string | undefined): SpeakingLevel {
  const map: Record<string, SpeakingLevel> = {
    basic: "basic",
    conversational: "conversational",
    professional: "professional",
    fluent: "fluent",
    native: "native",
    intermediate: "conversational",
    advanced: "professional",
  };
  return map[level ?? ""] ?? "conversational";
}

const LANG_CODE: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", italian: "it", german: "de",
  portuguese: "pt", dutch: "nl", russian: "ru", japanese: "ja", chinese: "zh",
  arabic: "ar", hindi: "hi", korean: "ko", turkish: "tr", polish: "pl",
  swedish: "sv", norwegian: "no", danish: "da", finnish: "fi", greek: "el",
  catalan: "ca", basque: "eu", galician: "gl", romanian: "ro", ukrainian: "uk",
  czech: "cs", hungarian: "hu", thai: "th", vietnamese: "vi", indonesian: "id",
  malay: "ms", hebrew: "he", persian: "fa",
};

function toCode(name: string): string {
  return LANG_CODE[name.toLowerCase().trim()] ?? name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8);
}

export function buildTalentLanguageRpcRows(languages: DrawerLanguageRowInput[]) {
  return languages.map((l, i) => {
    const level = mapLevel(l.level);
    return {
      language_code: toCode(l.language),
      language_name: l.language,
      speaking_level: level,
      is_native: level === "native",
      can_host: l.canHost ?? false,
      can_sell: l.canSell ?? false,
      can_translate: l.canTranslate ?? false,
      can_teach: l.canTeach ?? false,
      display_order: i,
    };
  });
}
