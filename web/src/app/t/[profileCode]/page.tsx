import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  Images,
  MapPin,
  User,
} from "lucide-react";

import { ProfileViewAnalytics } from "@/components/analytics/profile-view-analytics";
import {
  DiscoveryStateBridge,
  PublicDiscoveryStateProvider,
} from "@/components/directory/public-discovery-state";
import { ProfileAiStrip } from "@/components/directory/profile-ai-strip";
import { ProfileDiscoveryCta } from "@/components/directory/profile-discovery-cta";
import { PortfolioGalleryLightbox } from "@/components/directory/portfolio-gallery-lightbox";
import { PublicHeader } from "@/components/public-header";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSavedTalentIds } from "@/lib/public-discovery";
import { getPublicProfileFieldVisibility } from "@/lib/public-profile-field-visibility";
import { getOrderedPublicProfileSections } from "@/lib/public-profile-field-order";
import { createTranslator } from "@/i18n/messages";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import { getRequestLocale } from "@/i18n/request-locale";
import { publicBioForLocale, canonicalBioEn } from "@/lib/translation/public-bio";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCachedActorSession,
  getCachedServerSupabase,
} from "@/lib/server/request-cache";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import {
  formatCityCountryLabel,
  resolveResidenceLocationEmbed,
  type CanonicalLocationEmbed,
} from "@/lib/canonical-location-display";
import { getPublicHostContext } from "@/lib/saas/scope";
import { canonicalTalentUrl } from "@/lib/saas/canonical-hosts";
import {
  resolveTalentVisibility,
  type TalentSurface,
} from "@/lib/talent/visibility";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaxonomyTerm = {
  kind: string;
  slug?: string;
  name_en: string;
  name_es?: string | null;
};

type TaxonomyRow = {
  is_primary?: boolean;
  taxonomy_terms: TaxonomyTerm | TaxonomyTerm[] | null;
};

type MediaAsset = {
  id: string;
  bucket_id: string | null;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  variant_kind: string | null;
  sort_order: number | null;
};

type TalentProfile = {
  id: string;
  profile_code: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  bio_en: string | null;
  bio_es: string | null;
  workflow_status: string | null;
  visibility: string | null;
  is_featured: boolean | null;
  height_cm: number | null;
  residence_city: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
  legacy_location: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
  origin_city: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
  talent_profile_taxonomy: TaxonomyRow[];
};

type PublicFieldDefinitionEmbed = {
  key: string;
  label_en: string;
  label_es: string | null;
  value_type: string;
  config?: Record<string, unknown> | null;
  sort_order?: number;
  field_group_id?: string | null;
  internal_only?: boolean;
  public_visible?: boolean;
  profile_visible?: boolean;
  field_groups?: { sort_order: number; slug?: string } | { sort_order: number; slug?: string }[] | null;
};

type PublicFieldValueRow = {
  id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  field_definitions: PublicFieldDefinitionEmbed | PublicFieldDefinitionEmbed[] | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenTaxonomy(rows: TaxonomyRow[]): TaxonomyTerm[] {
  return rows.flatMap((r) => {
    const t = r.taxonomy_terms;
    if (!t) return [];
    return Array.isArray(t) ? t : [t];
  });
}

function pickTaxonomyLabel(locale: string, term: TaxonomyTerm): string {
  if (locale === "es" && term.name_es && term.name_es.trim()) return term.name_es.trim();
  return term.name_en;
}

function groupByKind(locale: string, terms: TaxonomyTerm[]): Record<string, string[]> {
  return terms.reduce<Record<string, string[]>>((acc, t) => {
    if (!acc[t.kind]) acc[t.kind] = [];
    acc[t.kind].push(pickTaxonomyLabel(locale, t));
    return acc;
  }, {});
}

function displayName(p: TalentProfile): string {
  if (p.display_name?.trim()) return p.display_name.trim();
  const parts = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return parts || p.profile_code;
}

function residenceLabel(locale: string, p: TalentProfile): string {
  const row = resolveResidenceLocationEmbed({
    residence_city: p.residence_city,
    legacy_location: p.legacy_location,
  });
  return formatCityCountryLabel(locale, row);
}

function originLabel(locale: string, p: TalentProfile): string {
  return formatCityCountryLabel(locale, p.origin_city ?? null);
}

function primaryTalentType(locale: string, rows: TaxonomyRow[]): string | null {
  let fallback: string | null = null;

  for (const row of rows) {
    const terms = row.taxonomy_terms
      ? Array.isArray(row.taxonomy_terms)
        ? row.taxonomy_terms
        : [row.taxonomy_terms]
      : [];

    for (const term of terms) {
      if (term.kind !== "talent_type") continue;
      const label = pickTaxonomyLabel(locale, term);
      if (row.is_primary) return label;
      if (!fallback) fallback = label;
    }
  }

  return fallback;
}

async function fetchTalentProfile(profileCode: string, preview: boolean) {
  if (preview) {
    const session = await getCachedActorSession();
    const supabase =
      session.user && session.supabase ? session.supabase : null;
    if (supabase) {
      const user = session.user;
      if (user) {
        const { data, error } = await supabase
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
            workflow_status,
            visibility,
            is_featured,
            height_cm,
            residence_city:locations!residence_city_id ( display_name_en, display_name_es, country_code ),
            legacy_location:locations!location_id ( display_name_en, display_name_es, country_code ),
            origin_city:locations!origin_city_id ( display_name_en, display_name_es, country_code ),
            talent_profile_taxonomy (
              is_primary,
              taxonomy_terms ( kind, slug, name_en, name_es )
            )
          `,
          )
          .eq("profile_code", profileCode)
          // Preview is owner-only. This also prevents authenticated users from
          // previewing someone else's profile by guessing a code.
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .maybeSingle();

        if (!error && data) {
          return {
            pub: createPublicSupabaseClient(),
            /** Authenticated client for field_values + embeds; anon RLS hides draft profile values. */
            fieldValuesClient: supabase,
            profile: data as TalentProfile,
            preview: true,
          };
        }
      }
    }
  }

  const pub = createPublicSupabaseClient();
  if (!pub) return null;

  const { data, error } = await pub
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
      workflow_status,
      visibility,
      is_featured,
      height_cm,
      residence_city:locations!residence_city_id ( display_name_en, display_name_es, country_code ),
      legacy_location:locations!location_id ( display_name_en, display_name_es, country_code ),
      origin_city:locations!origin_city_id ( display_name_en, display_name_es, country_code ),
      talent_profile_taxonomy (
        is_primary,
        taxonomy_terms ( kind, slug, name_en, name_es )
      )
    `,
    )
    .eq("profile_code", profileCode)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;

  return {
    pub,
    fieldValuesClient: pub,
    profile: data as TalentProfile,
    preview: false,
  };
}

async function fetchPublicFieldValues(
  supabase: SupabaseClient | null,
  talentProfileId: string,
): Promise<PublicFieldValueRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("field_values")
    .select(
      `
      id,
      value_text,
      value_number,
      value_boolean,
      value_date,
      field_definitions ( key, label_en, label_es, value_type, config, sort_order, field_group_id, internal_only, public_visible, profile_visible, field_groups(sort_order, slug) )
    `,
    )
    .eq("talent_profile_id", talentProfileId)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data as PublicFieldValueRow[];
}

function pickFieldLabel(locale: string, en: string, es?: string | null): string {
  if (locale === "es" && es && es.trim()) return es.trim();
  return en.trim();
}

/** Height: governed value in field_values wins; column is a directory mirror kept in sync on save. */
function resolveHeaderHeightCm(
  profile: Pick<TalentProfile, "height_cm">,
  fieldValues: PublicFieldValueRow[],
): number | null {
  for (const row of fieldValues) {
    const fd = row.field_definitions
      ? Array.isArray(row.field_definitions)
        ? (row.field_definitions[0] ?? null)
        : row.field_definitions
      : null;
    if (fd?.key !== "height_cm") continue;
    if (row.value_number !== null && row.value_number !== undefined) {
      const n = Number(row.value_number);
      if (Number.isFinite(n)) return n;
    }
  }
  const c = profile.height_cm;
  return typeof c === "number" && Number.isFinite(c) ? c : null;
}

function formatFieldValue(row: PublicFieldValueRow): string | null {
  const fd = row.field_definitions
    ? Array.isArray(row.field_definitions)
      ? (row.field_definitions[0] ?? null)
      : row.field_definitions
    : null;

  if (row.value_text && row.value_text.trim() && fd?.config && typeof fd.config === "object" && !Array.isArray(fd.config)) {
    const input = (fd.config as Record<string, unknown>).input;
    const options = (fd.config as Record<string, unknown>).options;
    if (input === "select" && Array.isArray(options)) {
      const raw = row.value_text.trim();
      const match = options.find((o) => {
        if (!o || typeof o !== "object" || Array.isArray(o)) return false;
        return String((o as Record<string, unknown>).value ?? "").trim() === raw;
      });
      if (match && typeof match === "object" && !Array.isArray(match)) {
        const labelEn = (match as Record<string, unknown>).label_en;
        if (typeof labelEn === "string" && labelEn.trim()) return labelEn.trim();
      }
    }
  }
  if (row.value_text && row.value_text.trim()) return row.value_text.trim();
  if (typeof row.value_number === "number") return String(row.value_number);
  if (typeof row.value_boolean === "boolean") return row.value_boolean ? "Yes" : "No";
  if (row.value_date) return row.value_date;
  return null;
}

function mediaUrl(
  supabase: SupabaseClient | null,
  media: Pick<MediaAsset, "bucket_id" | "storage_path"> | null | undefined,
): string | null {
  if (!supabase || !media?.bucket_id || !media.storage_path) return null;
  return supabase.storage.from(media.bucket_id).getPublicUrl(media.storage_path).data
    .publicUrl;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ profileCode: string }>;
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};

  const { profileCode } = await params;
  const { preview } = await searchParams;
  const result = await fetchTalentProfile(profileCode, preview === "1");
  if (!result) return {};

  const { profile } = result;
  const locale = await getRequestLocale();
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

  // Phase 5/6 M2 — the canonical URL for a talent is ALWAYS the app host
  // (`app.pdcvacations.com/t/[code]`). When the agency storefront renders
  // the overlay view, it emits a canonical pointing back to the app host
  // so search engines consolidate signals on the global view. If the
  // app-host origin can't be resolved (env + DB both empty in a dev-less
  // build), fall back to a relative path — better than a broken URL.
  const canonicalAbsolute = await canonicalTalentUrl(profileCode);
  const pathEn = `/t/${encodeURIComponent(profileCode)}`;
  const pathEs = `/es/t/${encodeURIComponent(profileCode)}`;
  const canonicalEn = canonicalAbsolute ?? pathEn;
  const canonicalEs = canonicalAbsolute
    ? `${canonicalAbsolute.replace(/\/t\/[^/]+$/, "")}${pathEs}`
    : pathEs;

  const name = profile.display_name?.trim() ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    profileCode;

  const talentType = primaryTalentType("en", profile.talent_profile_taxonomy ?? []) ?? "Talent";
  const loc = residenceLabel("en", profile as TalentProfile);

  const title = loc ? `${name} — ${talentType} · ${loc}` : `${name} — ${talentType}`;
  const about = publicBioForLocale(
    locale,
    canonicalBioEn(profile.bio_en, profile.short_bio),
    profile.bio_es,
  );
  const description =
    about.trim() ||
    `View ${name}'s talent profile on Impronta — ${talentType}${loc ? ` — lives in ${loc}` : ""}.`;

  return {
    title,
    description,
    metadataBase: new URL(site),
    alternates: {
      canonical: locale === "es" ? canonicalEs : canonicalEn,
      languages: {
        en: canonicalEn,
        es: canonicalEs,
        "x-default": canonicalEn,
      },
    },
    openGraph: {
      title,
      description,
      type: "profile",
      locale: locale === "es" ? "es_ES" : "en_US",
      alternateLocale: locale === "es" ? "en_US" : "es_ES",
    },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PublicTalentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ profileCode: string }>;
  searchParams: Promise<{ preview?: string; locale?: string; lang?: string }>;
}) {
  const { profileCode } = await params;
  const sp = await searchParams;
  const { preview } = sp;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const ui = buildDirectoryUiCopy(t);
  const previewMode = preview === "1";

  // Phase 5/6 M2 — surface gate. Hub hosts never serve /t/* (the hub has its
  // own approved-hub-directory surface). The surface-allow-list already 404s
  // this at the middleware edge; this is defense-in-depth for direct route
  // access in tests, prerender, or middleware bypass.
  const hostCtx = await getPublicHostContext();
  if (hostCtx.kind === "hub") {
    notFound();
  }
  const surface: TalentSurface =
    hostCtx.kind === "agency" ? "agency" : "freelancer";

  if (!isSupabaseConfigured()) {
    return (
      <PublicDiscoveryStateProvider>
        <PublicHeader />
        <div className="mx-auto max-w-lg flex-1 px-4 py-20 text-center text-m text-muted-foreground">
          {t("public.forms.inquiry.supabaseNotConfigured")}
        </div>
      </PublicDiscoveryStateProvider>
    );
  }

  const result = await fetchTalentProfile(profileCode, previewMode);
  if (!result) {
    notFound();
  }
  const { pub, fieldValuesClient, profile, preview: resolvedPreview } = result;

  // Phase 5/6 M2 — explicit surface-aware visibility. On non-preview flows,
  // the freelancer/app surface requires workflow_status='approved' AND
  // visibility='public' AND deleted_at IS NULL. RLS enforces the same rule
  // for anon reads; the resolver makes the contract code-visible and
  // protects authenticated-but-unauthorised readers from unapproved rows
  // leaking through. (Agency surface continues to rely on roster RLS for
  // M2; a roster-join resolver call wires in when overlays land.)
  if (!resolvedPreview && surface === "freelancer") {
    // RLS already filters soft-deleted rows for anon reads, so the row we
    // have here has deleted_at=null by construction; pass it explicitly so
    // the resolver's contract is satisfied and intent is code-visible.
    const decision = resolveTalentVisibility(
      {
        profile: {
          workflow_status: profile.workflow_status,
          visibility: profile.visibility,
          deleted_at: null,
        },
      },
      "freelancer",
    );
    if (!decision.visible) notFound();
  }
  const fieldValues = await fetchPublicFieldValues(fieldValuesClient, profile.id);
  type DetailEntry = { key: string; label: string; value: string; groupSort: number; sort: number };

  function groupSlugFromDef(def: PublicFieldDefinitionEmbed): string | null {
    const fg = def.field_groups;
    const slug = Array.isArray(fg) ? fg[0]?.slug : fg?.slug;
    return typeof slug === "string" && slug.trim() ? slug.trim() : null;
  }

  const { basicInfoDetailRows, otherDetailRows } = fieldValues.reduce<{
    basicInfoDetailRows: DetailEntry[];
    otherDetailRows: DetailEntry[];
  }>(
    (acc, row) => {
      const def = Array.isArray(row.field_definitions)
        ? (row.field_definitions[0] ?? null)
        : row.field_definitions;
      if (!def) return acc;
      if (
        def.value_type === "taxonomy_single" ||
        def.value_type === "taxonomy_multi" ||
        def.value_type === "location"
      ) {
        return acc;
      }
      if (def.key === "height_cm") {
        return acc;
      }
      if (def.internal_only) return acc;
      if (def.profile_visible === false) return acc;
      if (def.public_visible === false) return acc;
      const value = formatFieldValue(row);
      if (!value) return acc;
      const fg = def.field_groups;
      const groupSort = Array.isArray(fg) ? fg[0]?.sort_order ?? 0 : fg?.sort_order ?? 0;
      const entry: DetailEntry = {
        key: def.key,
        label: pickFieldLabel(locale, def.label_en, def.label_es),
        value,
        groupSort,
        sort: def.sort_order ?? 0,
      };
      if (groupSlugFromDef(def) === "basic_info") acc.basicInfoDetailRows.push(entry);
      else acc.otherDetailRows.push(entry);
      return acc;
    },
    { basicInfoDetailRows: [], otherDetailRows: [] },
  );

  const sortDetail = (a: DetailEntry, b: DetailEntry) =>
    a.groupSort - b.groupSort || a.sort - b.sort || a.key.localeCompare(b.key);
  basicInfoDetailRows.sort(sortDetail);
  otherDetailRows.sort(sortDetail);
  const initialSavedIds = await getSavedTalentIds();

  // Fetch media. In preview mode, the profile owner should see pending assets too.
  const media: MediaAsset[] = pub
    ? (
        resolvedPreview
          ? (
              await (await getCachedServerSupabase())
                ?.from("media_assets")
                .select("id, bucket_id, storage_path, width, height, variant_kind, sort_order")
                .eq("owner_talent_profile_id", profile.id)
                .in("variant_kind", ["banner", "gallery", "public_watermarked", "card"])
                .is("deleted_at", null)
                .order("sort_order", { ascending: true })
                .order("id", { ascending: true })
                .limit(18)
            )?.data ?? []
          : (
              await pub
                .from("media_assets")
                .select("id, bucket_id, storage_path, width, height, variant_kind, sort_order")
                .eq("owner_talent_profile_id", profile.id)
                .in("variant_kind", ["banner", "gallery", "public_watermarked", "card"])
                .eq("approval_state", "approved")
                .is("deleted_at", null)
                .order("sort_order", { ascending: true })
                .order("id", { ascending: true })
                .limit(18)
            ).data ?? []
      )
    : [];

  // Build public URLs for media
  const bannerMedia =
    media.find((m) => m.variant_kind === "banner") ?? null;
  const profileImageMedia =
    media.find((m) => m.variant_kind === "card") ??
    media.find((m) => m.variant_kind === "public_watermarked") ??
    media.find((m) => m.variant_kind === "gallery") ??
    null;

  const galleryItems = media
    // Portfolio grid should only show gallery assets (not avatar/card/watermarked).
    .filter((m) => m.variant_kind === "gallery")
    .map((m) => ({
      id: m.id,
      url: mediaUrl(pub, m),
      width: m.width,
      height: m.height,
    }))
    .filter((m): m is { id: string; url: string; width: number | null; height: number | null } =>
      Boolean(m.url),
    );
  const bannerUrl = mediaUrl(pub, bannerMedia);
  const profileImageUrl = mediaUrl(pub, profileImageMedia);
  const hasCover = Boolean(bannerUrl);

  // Taxonomy
  const allTerms = flattenTaxonomy(profile.talent_profile_taxonomy ?? []);
  const grouped = groupByKind(locale, allTerms);

  const fitLabels = grouped["fit_label"] ?? [];
  const skills = grouped["skill"] ?? [];
  const languages = grouped["language"] ?? [];
  const industries = grouped["industry"] ?? [];
  const eventTypes = grouped["event_type"] ?? [];
  const tags = grouped["tag"] ?? [];

  const fieldVisibility = await getPublicProfileFieldVisibility();
  const orderedSections = await getOrderedPublicProfileSections(locale);

  const name = displayName(profile as TalentProfile);
  const livesIn = residenceLabel(locale, profile as TalentProfile);
  const originallyFrom = originLabel(locale, profile as TalentProfile);
  const headerHeightCm = resolveHeaderHeightCm(profile as TalentProfile, fieldValues);
  const talentType =
    primaryTalentType(locale, profile.talent_profile_taxonomy ?? []) ?? ui.card.footerTalent;

  // Language summary line from taxonomy
  const langLine = languages.length > 0 ? languages.join(" · ") : null;
  const firstName = name.split(" ")[0] ?? name;

  return (
    <PublicDiscoveryStateProvider>
      <PublicFlashHost dismissAria={ui.flash.dismissAria} />
      <ProfileViewAnalytics talentId={profile.id} locale={locale} />

      <PublicHeader />
      <DiscoveryStateBridge savedIds={initialSavedIds} />

      <main className="flex-1 bg-[var(--impronta-black)]">
        {resolvedPreview ? (
          <div className="border-b border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] px-4 py-3 text-center text-sm uppercase tracking-[0.2em] text-[var(--impronta-gold)] sm:px-6 lg:px-8">
            {t("public.profile.previewModeBanner")}
          </div>
        ) : null}
        {/* ----------------------------------------------------------------
            Cover banner (hidden when not uploaded)
        ---------------------------------------------------------------- */}
        {hasCover ? (
          <div className="relative h-[38vh] min-h-[260px] w-full overflow-hidden sm:h-[46vh]">
            <Image
              src={bannerUrl!}
              alt={`${name} banner`}
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
            {/* Subtle grain texture overlay */}
            <div
              className="absolute inset-0 opacity-[0.035]"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
              }}
            />
            {/* Bottom fade into page (keeps text readable) */}
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[var(--impronta-black)] via-[rgba(0,0,0,0.35)] to-transparent" />
            {/* Profile code — top-left watermark */}
            <div className="absolute left-5 top-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--impronta-gold-dim)] opacity-60">
                {profile.profile_code}
              </span>
            </div>
            {/* Featured badge */}
            {profile.is_featured ? (
              <div className="absolute right-5 top-5">
                <span className="rounded-full border border-[var(--impronta-gold-border)] bg-black/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--impronta-gold)] backdrop-blur-sm">
                  {ui.card.featuredLabel}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ----------------------------------------------------------------
            Profile header — overlaps cover
        ---------------------------------------------------------------- */}
        <div
          className={[
            "relative z-10 px-4 sm:px-6 lg:px-8",
            hasCover ? "-mt-16" : "mt-10",
          ].join(" ")}
        >
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
              {profileImageUrl ? (
                <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] sm:h-40 sm:w-28">
                  <Image
                    src={profileImageUrl}
                    alt={t("public.profile.profileImageAlt").replace("{name}", name)}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 6rem, 7rem"
                  />
                </div>
              ) : null}
              {/* Text block */}
              <div className="flex-1 space-y-3">
                {/* Talent type pill */}
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--impronta-gold)]">
                  {talentType}
                </p>
                {/* Name */}
                <h1 className="font-[family-name:var(--font-cinzel)] text-4xl font-medium leading-tight tracking-wide text-[var(--impronta-foreground)] sm:text-5xl lg:text-6xl">
                  {name}
                </h1>
                {/* Lives in / Originally from + languages */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-m text-[var(--impronta-muted)]">
                  {livesIn ? (
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <MapPin className="size-3.5 shrink-0 translate-y-0.5 text-[var(--impronta-gold-dim)]" />
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--impronta-gold-dim)]">
                        {t("public.profile.livesInLabel")}
                      </span>
                      <span className="min-w-0">{livesIn}</span>
                    </span>
                  ) : null}
                  {originallyFrom ? (
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--impronta-gold-dim)]">
                        {ui.preview.originallyFrom}
                      </span>
                      <span className="min-w-0">{originallyFrom}</span>
                    </span>
                  ) : null}
                  {langLine ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[var(--impronta-gold-dim)]">·</span>
                      {langLine}
                    </span>
                  ) : null}
                  {headerHeightCm !== null ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[var(--impronta-gold-dim)]">·</span>
                      <User className="size-3.5 shrink-0 text-[var(--impronta-gold-dim)]" />
                      {t("public.profile.heightCm").replace("{height}", String(headerHeightCm))}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* CTA buttons */}
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:pb-1">
                <ProfileDiscoveryCta
                  talentId={profile.id}
                  profileCode={profile.profile_code}
                  displayName={name}
                  sourcePage={`/t/${encodeURIComponent(profile.profile_code)}`}
                  initialSaved={initialSavedIds.includes(profile.id)}
                  mode="header"
                  profileCta={ui.profileCta}
                  inquiry={ui.inquiry}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="mt-10 border-t border-[var(--impronta-gold-border)]" />
            <ProfileAiStrip
              title={t("public.profile.aiPanelTitle")}
              body={t("public.profile.aiPanelBody")}
            />
          </div>
        </div>

        {/* ----------------------------------------------------------------
            Main body
        ---------------------------------------------------------------- */}
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1fr_320px] lg:gap-16">

            {/* ── Left column ─────────────────────────────────────── */}
            <div className="space-y-14">

              {/* Portfolio gallery */}
              <section aria-labelledby="portfolio-heading">
                <SectionLabel id="portfolio-heading">{t("public.profile.portfolio")}</SectionLabel>
                {galleryItems.length > 0 ? (
                  <PortfolioGalleryLightbox
                    name={name}
                    items={galleryItems}
                    lightbox={ui.lightbox}
                    closeLabel={ui.preview.close}
                  />
                ) : (
                  <EmptyState
                    icon={Images}
                    title={t("public.profile.portfolioEmptyTitle")}
                    description={t("public.profile.portfolioEmptyDescription")}
                    className="mt-6 border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/30"
                  />
                )}
              </section>

              {/* About */}
              {(() => {
                const aboutText = publicBioForLocale(
                  locale,
                  canonicalBioEn(profile.bio_en, profile.short_bio),
                  profile.bio_es,
                );
                return aboutText.trim() ? (
                <section aria-labelledby="about-heading">
                  <SectionLabel id="about-heading">{t("public.profile.about")}</SectionLabel>
                  <p className="mt-4 max-w-2xl text-base leading-[1.8] text-[var(--impronta-muted)]">
                    {aboutText}
                  </p>
                </section>
                ) : null;
              })()}

              {/* Basic Information — extra dynamic fields in basic_info group (canonical bio is About above) */}
              {basicInfoDetailRows.length > 0 ? (
                <section aria-labelledby="basic-info-heading">
                  <SectionLabel id="basic-info-heading">
                    {t("public.profile.basicInfo")}
                  </SectionLabel>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {basicInfoDetailRows.map((r) => (
                      <Card
                        key={r.key}
                        className="border-border/60 bg-[var(--impronta-surface)] shadow-none"
                      >
                        <CardContent className="px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--impronta-muted)]">
                            {r.label}
                          </p>
                          <p className="mt-1 text-sm text-foreground">{r.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Details — other dynamic scalar fields */}
              {otherDetailRows.length > 0 ? (
                <section aria-labelledby="details-heading">
                  <SectionLabel id="details-heading">{t("public.profile.details")}</SectionLabel>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {otherDetailRows.map((r) => (
                      <Card
                        key={r.key}
                        className="border-border/60 bg-[var(--impronta-surface)] shadow-none"
                      >
                        <CardContent className="px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--impronta-muted)]">
                            {r.label}
                          </p>
                          <p className="mt-1 text-sm text-foreground">{r.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ) : null}

            </div>

            {/* ── Right column (sidebar) ───────────────────────────── */}
            <aside className="space-y-10">

              {orderedSections.map((section) => {
                if (section.key === "fit_labels") {
                  if (!fieldVisibility.showFitLabels || fitLabels.length === 0) return null;
                  return (
                    <section key={section.key} aria-labelledby="best-for-heading">
                      <SectionLabel id="best-for-heading">{section.label}</SectionLabel>
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {fitLabels.map((label) => (
                          <li key={label}>
                            <span className="inline-flex items-center rounded-full border border-[var(--impronta-gold-border)] bg-[rgba(201,162,39,0.06)] px-3 py-1 text-sm font-medium uppercase tracking-wider text-[var(--impronta-gold)]">
                              {label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                }
                if (section.key === "skills") {
                  if (!fieldVisibility.showSkills || skills.length === 0) return null;
                  return (
                    <section key={section.key} aria-labelledby="skills-heading">
                      <SectionLabel id="skills-heading">{section.label}</SectionLabel>
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {skills.map((s) => (
                          <li key={s}>
                            <Badge variant="muted" className="text-sm">
                              {s}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                }
                if (section.key === "languages") {
                  if (!fieldVisibility.showLanguages || languages.length === 0) return null;
                  return (
                    <section key={section.key} aria-labelledby="languages-heading">
                      <SectionLabel id="languages-heading">{section.label}</SectionLabel>
                      <ul className="mt-4 space-y-2">
                        {languages.map((lang) => (
                          <li
                            key={lang}
                            className="flex items-center gap-2 text-m text-[var(--impronta-muted)]"
                          >
                            <span className="size-1.5 shrink-0 rounded-full bg-[var(--impronta-gold-dim)]" />
                            {lang}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                }
                if (section.key === "industries") {
                  if (!fieldVisibility.showIndustries || industries.length === 0) return null;
                  return (
                    <section key={section.key} aria-labelledby="industries-heading">
                      <SectionLabel id="industries-heading">{section.label}</SectionLabel>
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {industries.map((s) => (
                          <li key={s}>
                            <Badge variant="muted" className="text-sm">
                              {s}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                }
                if (section.key === "event_types") {
                  if (!fieldVisibility.showEventTypes || eventTypes.length === 0) return null;
                  return (
                    <section key={section.key} aria-labelledby="event-types-heading">
                      <SectionLabel id="event-types-heading">{section.label}</SectionLabel>
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {eventTypes.map((s) => (
                          <li key={s}>
                            <Badge variant="muted" className="text-sm">
                              {s}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                }
                if (section.key === "tags") {
                  if (!fieldVisibility.showTags || tags.length === 0) return null;
                  return (
                    <section key={section.key} aria-labelledby="tags-heading">
                      <SectionLabel id="tags-heading">{section.label}</SectionLabel>
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {tags.map((s) => (
                          <li key={s}>
                            <Badge variant="muted" className="text-sm">
                              {s}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                }
                return null;
              })}

              {/* Inquiry card */}
              <div className="rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] p-6">
                <p className="font-[family-name:var(--font-cinzel)] text-m font-medium tracking-wide text-[var(--impronta-foreground)]">
                  {t("public.profile.sidebarAgencyTitle")}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--impronta-muted)]">
                  {t("public.profile.sidebarAgencyBody")}
                </p>
                <div className="mt-5 flex flex-col gap-2.5">
                  <ProfileDiscoveryCta
                    talentId={profile.id}
                    profileCode={profile.profile_code}
                    displayName={name}
                    sourcePage={`/t/${encodeURIComponent(profile.profile_code)}`}
                    initialSaved={initialSavedIds.includes(profile.id)}
                    mode="sidebar"
                    profileCta={ui.profileCta}
                    inquiry={ui.inquiry}
                  />
                </div>
              </div>

              {/* Profile code */}
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--impronta-gold-dim)] opacity-50">
                {t("public.profile.refCodePrefix")} {profile.profile_code}
              </p>
            </aside>
          </div>
        </div>

        {/* ----------------------------------------------------------------
            CTA section
        ---------------------------------------------------------------- */}
        <section
          aria-label={t("public.profile.ctaSectionAria")}
          className="border-t border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]"
        >
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 lg:px-8">
            <p className="font-[family-name:var(--font-cinzel)] text-sm uppercase tracking-[0.28em] text-[var(--impronta-gold)]">
              {t("public.common.brand")}
            </p>
            <h2 className="font-[family-name:var(--font-cinzel)] text-2xl font-medium tracking-wide text-[var(--impronta-foreground)] sm:text-3xl">
              {t("public.profile.footerCtaTitle").replace("{firstName}", firstName)}
            </h2>
            <p className="max-w-md text-m leading-relaxed text-[var(--impronta-muted)]">
              {t("public.profile.footerCtaBody")}
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <ProfileDiscoveryCta
                talentId={profile.id}
                profileCode={profile.profile_code}
                displayName={name}
                sourcePage={`/t/${encodeURIComponent(profile.profile_code)}`}
                initialSaved={initialSavedIds.includes(profile.id)}
                mode="footer"
                profileCta={ui.profileCta}
                inquiry={ui.inquiry}
              />
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[var(--impronta-gold-border)]/40 bg-[var(--impronta-black)] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center text-sm text-[var(--impronta-muted)]">
          <PublicCmsFooterNav locale={locale} />
        </div>
      </footer>
    </PublicDiscoveryStateProvider>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--impronta-gold)]"
    >
      {children}
    </h2>
  );
}

