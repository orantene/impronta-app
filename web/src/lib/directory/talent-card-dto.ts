/**
 * Maps directory card row shape (SSR query + optional `api_directory_cards` RPC) to `DirectoryCardDTO`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DirectoryCardDTO } from "@/lib/directory/types";
import type { Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/messages";

export const MAX_CARD_FIT_LABELS = 3;

/** BCP-47 code; card copy still maps non-`es` to English DB columns until taxonomy migrates. */
export type DirectoryLocale = string;

export type ApiDirectoryCardRpcRow = {
  id: string;
  profile_code: string;
  public_slug_part: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  is_featured: boolean;
  featured_level: number;
  featured_position: number;
  profile_completeness_score: number | string | null;
  manual_rank_override: number | null;
  thumb_width: number | null;
  thumb_height: number | null;
  thumb_bucket_id: string | null;
  thumb_storage_path: string | null;
  primary_talent_type_name_en: string | null;
  primary_talent_type_name_es: string | null;
  location_display_en: string | null;
  location_display_es: string | null;
  location_country_code: string | null;
  fit_labels_jsonb: unknown;
  height_cm: number | null;
  /** Serialized `CardAttributeRpc[]` from server */
  card_attributes_jsonb: unknown;
  /** Deterministic overlap between active directory filters and profile (classic listing). */
  filter_match_labels_jsonb?: unknown;
};

function pickLocalizedName(
  locale: DirectoryLocale,
  en: string | null,
  es: string | null,
): string {
  if (locale === "es" && es && es.trim()) return es.trim();
  if (en && en.trim()) return en.trim();
  if (es && es.trim()) return es.trim();
  return "";
}

type FitLabelJson = {
  slug: string;
  name_en: string;
  name_es: string | null;
};

type CardAttrJson = {
  key: string;
  label_en: string;
  label_es: string | null;
  value: string;
};

function parseCardAttributes(raw: unknown, locale: DirectoryLocale) {
  if (!Array.isArray(raw)) return [] as { key: string; label: string; value: string }[];
  const out: { key: string; label: string; value: string }[] = [];
  for (const x of raw) {
    if (
      typeof x !== "object" ||
      x === null ||
      typeof (x as CardAttrJson).key !== "string" ||
      typeof (x as CardAttrJson).value !== "string"
    ) {
      continue;
    }
    const row = x as CardAttrJson;
    const label = pickLocalizedName(locale, row.label_en, row.label_es);
    if (!label) continue;
    out.push({ key: row.key, label, value: row.value });
  }
  return out;
}

function parseFitLabels(raw: unknown): FitLabelJson[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is FitLabelJson =>
        typeof x === "object" &&
        x !== null &&
        "slug" in x &&
        typeof (x as FitLabelJson).slug === "string",
    )
    .slice(0, MAX_CARD_FIT_LABELS);
}

function pickDisplayName(row: ApiDirectoryCardRpcRow): string {
  const d = row.display_name?.trim();
  if (d) return d;
  const parts = [row.first_name, row.last_name].filter(Boolean).join(" ");
  if (parts.trim()) return parts.trim();
  return row.profile_code;
}

export function mapApiDirectoryRpcRowToDirectoryCardDTO(
  supabase: SupabaseClient,
  row: ApiDirectoryCardRpcRow,
  locale: DirectoryLocale,
): DirectoryCardDTO {
  const t = createTranslator(locale as Locale);
  const fallbackPrimaryTalentType = t("public.directory.fallbackPrimaryTalentType");
  let thumbUrl: string | null = null;
  if (row.thumb_bucket_id && row.thumb_storage_path) {
    const { data } = supabase.storage
      .from(row.thumb_bucket_id)
      .getPublicUrl(row.thumb_storage_path);
    thumbUrl = data.publicUrl;
  }

  const typeLabel = pickLocalizedName(
    locale,
    row.primary_talent_type_name_en,
    row.primary_talent_type_name_es,
  );
  const locName = pickLocalizedName(
    locale,
    row.location_display_en,
    row.location_display_es,
  );
  const country = row.location_country_code?.trim();
  const locationLabel =
    locName && country
      ? `${locName}, ${country}`
      : locName || country || "";

  const fitRaw = parseFitLabels(row.fit_labels_jsonb);
  const fitLabels = fitRaw.map((f) => ({
    slug: f.slug,
    label: pickLocalizedName(locale, f.name_en, f.name_es),
  }));

  const cardAttributes = parseCardAttributes(row.card_attributes_jsonb, locale);

  const rawMatch = row.filter_match_labels_jsonb;
  const filterMatchLabels = Array.isArray(rawMatch)
    ? rawMatch.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];

  return {
    id: row.id,
    profileCode: row.profile_code,
    slugPart: row.public_slug_part,
    displayName: pickDisplayName(row),
    primaryTalentTypeLabel: typeLabel || fallbackPrimaryTalentType,
    locationLabel,
    fitLabels,
    cardAttributes,
    firstName: row.first_name,
    lastName: row.last_name,
    createdAt: row.created_at,
    isFeatured: row.is_featured,
    featuredLevel: row.featured_level,
    featuredPosition: Number(row.featured_position ?? 0),
    profileCompletenessScore: Number(row.profile_completeness_score ?? 0),
    manualRankOverride:
      row.manual_rank_override == null ? null : Number(row.manual_rank_override),
    heightCm: row.height_cm,
    thumbnail: {
      url: thumbUrl,
      width: row.thumb_width,
      height: row.thumb_height,
    },
    ...(filterMatchLabels.length > 0 ? { filterMatchLabels } : {}),
  };
}
