import { NextResponse } from "next/server";
import { getPublicSettings } from "@/lib/public-settings";
import { parseDirectoryLocale } from "@/lib/directory/search-params";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import {
  formatCityCountryLabel,
  resolveResidenceLocationEmbed,
  type CanonicalLocationEmbed,
} from "@/lib/canonical-location-display";
import { publicBioForLocale, canonicalBioEn } from "@/lib/translation/public-bio";
import { createTranslator } from "@/i18n/messages";

type TaxonomyRow = {
  is_primary?: boolean;
  taxonomy_terms:
    | {
        kind: string;
        name_en: string;
        name_es?: string | null;
      }
    | {
        kind: string;
        name_en: string;
        name_es?: string | null;
      }[]
    | null;
};

function flattenTerms(rows: TaxonomyRow[]) {
  return rows.flatMap((row) => {
    if (!row.taxonomy_terms) return [];
    return Array.isArray(row.taxonomy_terms)
      ? row.taxonomy_terms
      : [row.taxonomy_terms];
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ talentId: string }> },
) {
  const publicSettings = await getPublicSettings();
  if (!publicSettings.directoryPublic) {
    return NextResponse.json({ error: "Unavailable" }, { status: 403 });
  }

  const { talentId } = await params;
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const locale = parseDirectoryLocale({
    locale: url.searchParams.get("locale") ?? undefined,
  });
  const t = createTranslator(locale);
  const fallbackPrimaryTalentType = t("public.directory.fallbackPrimaryTalentType");

  const pickTermName = (term: { name_en: string; name_es?: string | null }) =>
    locale === "es" && term.name_es ? term.name_es : term.name_en;

  type FieldVisibilityRow = {
    key: string;
    active: boolean;
    archived_at: string | null;
    public_visible: boolean;
    internal_only: boolean;
    profile_visible: boolean;
    preview_visible?: boolean;
  };

  /** Hardcoded keys; preview_visible + visibility columns apply only to these definitions today. */
  const allowedKeys = new Set<string>(["fit_labels", "languages", "skills"]);
  const { data: fieldRows, error: fieldErr } = await supabase
    .from("field_definitions")
    .select("key, active, archived_at, public_visible, internal_only, profile_visible, preview_visible")
    .in("key", ["fit_labels", "languages", "skills"]);

  if (!fieldErr && fieldRows) {
    allowedKeys.clear();
    for (const row of fieldRows as FieldVisibilityRow[]) {
      if (row.archived_at) continue;
      if (!row.active) continue;
      if (row.internal_only) continue;
      if (!row.public_visible) continue;
      if (!row.profile_visible) continue;
      if (row.preview_visible === false) continue;
      allowedKeys.add(row.key);
    }
  }

  const { data: profile, error } = await supabase
    .from("talent_profiles")
    .select(
      `
      id,
      profile_code,
      display_name,
      first_name,
      last_name,
      short_bio,
      bio_en,
      bio_es,
      height_cm,
      residence_city:locations!residence_city_id ( display_name_en, display_name_es, country_code ),
      legacy_location:locations!location_id ( display_name_en, display_name_es, country_code ),
      origin_city:locations!origin_city_id ( display_name_en, display_name_es, country_code ),
      talent_profile_taxonomy (
        is_primary,
        taxonomy_terms ( kind, name_en, name_es )
      )
    `,
    )
    .eq("id", talentId)
    .is("deleted_at", null)
    .eq("workflow_status", "approved")
    .eq("visibility", "public")
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: mediaRows } = await supabase
    .from("media_assets")
    .select("storage_path, bucket_id, width, height, variant_kind, sort_order, created_at")
    .eq("owner_talent_profile_id", profile.id)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .in("variant_kind", ["public_watermarked", "gallery", "card"])
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(3);

  const residenceRow = resolveResidenceLocationEmbed({
    residence_city: profile.residence_city as
      | CanonicalLocationEmbed
      | CanonicalLocationEmbed[]
      | null,
    legacy_location: profile.legacy_location as
      | CanonicalLocationEmbed
      | CanonicalLocationEmbed[]
      | null,
  });
  const originRow = profile.origin_city as
    | CanonicalLocationEmbed
    | CanonicalLocationEmbed[]
    | null;
  const terms = flattenTerms((profile.talent_profile_taxonomy ?? []) as TaxonomyRow[]);
  const primaryTalentType =
    ((profile.talent_profile_taxonomy ?? []) as TaxonomyRow[])
      .flatMap((row) => {
        const items = row.taxonomy_terms
          ? Array.isArray(row.taxonomy_terms)
            ? row.taxonomy_terms
            : [row.taxonomy_terms]
          : [];
        return items
          .filter((item) => item.kind === "talent_type")
          .map((item) => ({
            name: pickTermName(item),
            isPrimary: Boolean(row.is_primary),
          }));
      })
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0]?.name ??
      fallbackPrimaryTalentType;

  const chosenMedia = (mediaRows ?? [])[0];
  const imageUrl =
    chosenMedia?.bucket_id && chosenMedia?.storage_path
      ? supabase.storage
          .from(chosenMedia.bucket_id)
          .getPublicUrl(chosenMedia.storage_path).data.publicUrl
      : null;

  return NextResponse.json({
    id: profile.id,
    profileCode: profile.profile_code,
    displayName:
      profile.display_name?.trim() ||
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
      profile.profile_code,
    shortBio: publicBioForLocale(
      locale,
      canonicalBioEn(
        profile.bio_en as string | null,
        profile.short_bio as string | null,
      ),
      profile.bio_es as string | null,
    ),
    heightCm: profile.height_cm,
    primaryTalentTypeLabel: primaryTalentType,
    locationLabel: formatCityCountryLabel(locale, residenceRow),
    livesInLabel: formatCityCountryLabel(locale, residenceRow),
    originallyFromLabel: formatCityCountryLabel(locale, originRow),
    fitLabels: allowedKeys.has("fit_labels")
      ? terms
          .filter((term) => term.kind === "fit_label")
          .map((term) => pickTermName(term))
      : [],
    skills: allowedKeys.has("skills")
      ? terms.filter((term) => term.kind === "skill").map((term) => pickTermName(term))
      : [],
    languages: allowedKeys.has("languages")
      ? terms
          .filter((term) => term.kind === "language")
          .map((term) => pickTermName(term))
      : [],
    image: imageUrl
      ? {
          url: imageUrl,
          width: chosenMedia?.width ?? null,
          height: chosenMedia?.height ?? null,
        }
      : null,
  });
}
