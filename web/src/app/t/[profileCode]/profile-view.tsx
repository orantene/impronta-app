import { improntaLog } from "@/lib/server/structured-log";
import { pickLocale } from "@/lib/i18n/pick-locale";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SkipToContent } from "@/components/accessibility/skip-to-content";

import { LightProfileLayout } from "./_light/LightProfileLayout";
import { NoirProfileLayout } from "./_noir/NoirProfileLayout";
import { LumenProfileLayout } from "./_lumen/LumenProfileLayout";
import { AtelierProfileLayout } from "./_atelier/AtelierProfileLayout";
import { ProfileShareRow } from "./_light/ProfileShareRow";
import { ProfileHubsIndicator } from "./_light/ProfileHubsIndicator";
import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";

import { SitePageViewAnalytics } from "@/components/analytics/site-page-view-analytics";
import {
  DiscoveryStateBridge,
  PublicDiscoveryStateProvider,
} from "@/components/directory/public-discovery-state";
import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";
import { DirectoryInquirySheet } from "@/components/directory/directory-inquiry-sheet";
import { FavoritesModal } from "@/components/directory/favorites-modal";
import { FavoritesDrawerProvider } from "@/components/directory/favorites-drawer-context";
import { ProfileDiscoveryCta } from "@/components/directory/profile-discovery-cta";
import { PublicHeader } from "@/components/public-header";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import type { MarketingAccount } from "@/components/marketing/marketing-account-menu";
import { resolveAccountHref, getAppUrl } from "@/lib/auth-flow";
import { loadAccountMenuModel } from "@/lib/identity/account-menu-model";
import { signOut } from "@/app/auth/actions";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import {
  localizeLanguageName,
  localizeSpeakingLevel,
  localizeLanguageFlag,
} from "@/lib/i18n/language-names";
import { headers } from "next/headers";
import { getFavoriteTalentIds, getSavedTalentIds } from "@/lib/public-discovery";
import { readPublicSidebarVisibility } from "@/lib/field-engine/read-source-public-sidebar";
import { createTranslator } from "@/i18n/messages";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import { getRequestLocale } from "@/i18n/request-locale";
import {
  publicBioForLocale,
  canonicalBioEn,
  bioEnFromI18n,
} from "@/lib/translation/public-bio";
import { type LocalizedMap } from "@/lib/i18n/resolve-localized";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCachedActorSession,
  getCachedServerSupabase,
} from "@/lib/server/request-cache";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  GUEST_CHAT_DEFAULTS,
  loadGuestChatSettings,
} from "@/lib/inquiry/guest-chat-settings";
import { listPublicTalentIntegrationItems } from "@/lib/talent-integrations/repository";
import {
  PublicFeaturedMedia,
  type PublicFeaturedMediaItem,
} from "@/components/talent/connections/PublicFeaturedMedia";
import { effectiveFieldVisibility } from "@/lib/field-engine/effective-visibility";
import {
  resolveTalentFields,
  type ResolvedField,
} from "@/lib/field-engine/resolve-talent-fields";
import { isResolvedFieldVisibleOnPublicProfile } from "@/lib/field-engine/resolved-field-surfaces";
import {
  formatCityCountryLabel,
  resolveResidenceLocationEmbed,
  type CanonicalLocationEmbed,
} from "@/lib/canonical-location-display";
import { getPublicHostContext, getPublicPathPrefix } from "@/lib/saas/scope";
import { resolvePublicProfileOverrideTenantId } from "@/lib/saas/talent-roster";
import {
  ALLOW_ALL_TAXONOMY_VISIBILITY,
  loadTenantTaxonomyVisibility,
  type TenantTaxonomyVisibility,
} from "@/lib/directory/taxonomy-tenant-safety";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { isTalentIdWithinTenantPublicDisplayCap } from "@/lib/saas/public-profile-cap";
import {
  loadPublicIdentity,
  loadPublicBranding,
} from "@/lib/site-admin/server/reads";
import { loadTenantWhitelabel } from "@/lib/brand/tenant-whitelabel";
import { designTokensToCssVars } from "@/lib/site-admin/tokens/resolve";
import { canonicalTalentUrl } from "@/lib/saas/canonical-hosts";
import { buildTalentProfileJsonLd, jsonLdToString } from "@/lib/seo/talent-json-ld";
import {
  resolveTalentVisibility,
  type TalentSurface,
} from "@/lib/talent/visibility";
import {
  composeTalentPresentation,
  loadAgencyTalentOverlay,
  loadOverlayCoverMedia,
  type AgencyTalentOverlayRow,
} from "@/lib/talent/agency-overlay";
import { TalentProfileInquireButton } from "./talent-profile-inquire-button";
import { TalentProfileInstantBookButton } from "./talent-profile-instant-book-button";
import { loadInstantBookEligibility } from "@/lib/inquiry/instant-book-engine";
import { loadPlatformOperatingCurrency } from "@/lib/platform/operating-currency";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import { normalizeServicesMenu } from "@/lib/talent/services-menu-types";
import { TalentProfileChatLauncherMount } from "./_chat/TalentProfileChatLauncherMount";
import { OfferingInstantMount } from "./_shared/OfferingInstantMount";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { isTalentExclusiveToTenant } from "@/lib/agency/talent-exclusivity";
import { PlatformTalentMaxSiteView } from "@/components/talent/site/PlatformTalentMaxSiteView";
import { isTalentProfilePlatformHost } from "@/lib/talent-site/platform-host";
import { resolvePlatformTalentSiteForProfile } from "@/lib/talent-site/resolve-platform-talent-site";
import { loadTalentMaxSiteLink } from "@/lib/talent-site/server/load-max-site-link";
import { TALENT_SITE_TEMPLATES } from "@/lib/talent-site/templates/registry";
import type { TalentSiteTemplateKey } from "@/lib/talent-site/templates/types";
import {
  loadTalentReviews,
  loadTalentRatingSummary,
  loadPublishedTestimonials,
} from "@/lib/reviews/load-reviews";
import { tenantReviewsEnabled } from "@/lib/reviews/reviews-entitlement";
import { meetsCredibilityFloor } from "@/lib/reviews/craft-standing";
import type {
  TalentRatingSummary,
  TalentReview,
  Testimonial,
} from "@/lib/reviews/review-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaxonomyTerm = {
  id?: string;
  kind: string;
  slug?: string;
  /** Per-locale term name map { "en": …, "es": … } (replaced name_en/name_es). */
  name_i18n: Record<string, string | null> | null;
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
  /** Per-locale published bio map { "en": …, "es": … } (replaces bio_en/bio_es). */
  bio_i18n: LocalizedMap | null;
  is_publicly_hidden: boolean | null;
  is_featured: boolean | null;
  height_cm: number | null;
  talent_plan_key?: string | null;
  residence_city: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
  legacy_location: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
  origin_city: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
  talent_profile_taxonomy: TaxonomyRow[];

  // ── M8 editorial columns ─────────────────────────────────────────────
  // All nullable on the DB; the editorial profile variant is the only
  // render path that reads them today. Classic family ignores them.
  intro_italic?: string | null;
  event_styles?: string[] | null;
  destinations?: string[] | null;
  languages?: string[] | null;
  travels_globally?: boolean | null;
  team_size?: string | null;
  lead_time_weeks?: string | null;
  starting_from?: string | null;
  booking_note?: string | null;
  service_category_slug?: string | null;
  package_teasers?: unknown | null;
  /** S12 — talent-configured services menu (ServiceMenuItem[]); dual-written
   *  to catalog commerce.servicesMenu. Column read here for the public render. */
  services_menu?: unknown | null;
  social_links?: unknown | null;
  embedded_media?: unknown | null;
};

type PublicFieldDefinitionEmbed = {
  key: string;
  label_en: string;
  label_es: string | null;
  value_type: string;
  /** Per-option ES label map { "<english option>": "<es label>" }. Used to
   *  localize select/multiselect/chips values on the public profile. */
  options_es?: Record<string, string> | null;
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
  const i18n = term.name_i18n ?? {};
  return pickLocale(locale, { en: i18n.en ?? "", es: i18n.es?.trim() || undefined });
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

/**
 * THE tenant whose overrides govern this talent's public profile on this host.
 *
 * One resolution for every override-keyed read on this page — field values,
 * category visibility, and sidebar SECTION visibility — so the three cannot
 * disagree. On an agency host it is the surface tenant (unchanged behaviour);
 * everywhere else (hub / talent site / unknown) it is the talent's governing
 * roster tenant.
 *
 * NOTE `hostCtx.tenantId` is NOT null on the hub: `kind: "hub"` carries the hub
 * agency's OWN tenant id, which has no authority over a roster talent's fields.
 * Passing it through was the bug — the hub applied the hub agency's field
 * settings to sections whose VALUES had been resolved against the roster tenant.
 */
async function resolveProfileOverrideTenantId(
  hostCtx: Awaited<ReturnType<typeof getPublicHostContext>>,
  talentProfileId: string,
): Promise<string | null> {
  const svc = createServiceRoleClient();
  if (!svc) return null;
  return resolvePublicProfileOverrideTenantId(
    svc,
    hostCtx.kind === "agency" ? hostCtx.tenantId : null,
    talentProfileId,
  );
}

/**
 * Tenant category overrides for THIS talent's public profile, keyed on the
 * tenant `resolveProfileOverrideTenantId` picked. A null tenant (unaffiliated
 * talent, or no service client) means "no tenant overrides" — canonical
 * defaults, which is allow-all for categories.
 */
async function loadProfileTaxonomyVisibility(
  tenantId: string | null,
): Promise<TenantTaxonomyVisibility> {
  if (!tenantId) return ALLOW_ALL_TAXONOMY_VISIBILITY;
  const svc = createServiceRoleClient();
  if (!svc) return ALLOW_ALL_TAXONOMY_VISIBILITY;
  return loadTenantTaxonomyVisibility(svc, tenantId);
}

/**
 * The talent's primary talent_type LABEL, honouring the tenant's category
 * overrides. Returns null when the talent has no talent_type the tenant still
 * shows — callers must degrade (title falls back to "Talent"; JSON-LD omits
 * `jobTitle`) rather than emit an empty string.
 */
function primaryTalentType(
  locale: string,
  rows: TaxonomyRow[],
  visibility: TenantTaxonomyVisibility = ALLOW_ALL_TAXONOMY_VISIBILITY,
): string | null {
  let fallback: string | null = null;

  for (const row of rows) {
    const terms = row.taxonomy_terms
      ? Array.isArray(row.taxonomy_terms)
        ? row.taxonomy_terms
        : [row.taxonomy_terms]
      : [];

    for (const term of terms) {
      if (term.kind !== "talent_type") continue;
      if (!visibility.isTermVisible(term.id)) continue;
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
            bio_i18n,
            is_publicly_hidden,
            is_featured,
            height_cm,
            talent_plan_key,
            residence_city:locations!residence_city_id ( display_name_i18n, country_code ),
            legacy_location:locations!location_id ( display_name_i18n, country_code ),
            origin_city:locations!origin_city_id ( display_name_i18n, country_code ),
            talent_profile_taxonomy (
              is_primary,
              taxonomy_terms ( id, kind, slug, name_i18n )
            ),
            intro_italic,
            event_styles,
            destinations,
            languages,
            travels_globally,
            team_size,
            lead_time_weeks,
            starting_from,
            booking_note,
            service_category_slug,
            package_teasers,
            services_menu,
            social_links,
            embedded_media
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
      bio_i18n,
      is_publicly_hidden,
      is_featured,
      height_cm,
      talent_plan_key,
      residence_city:locations!residence_city_id ( display_name_i18n, country_code ),
      legacy_location:locations!location_id ( display_name_i18n, country_code ),
      origin_city:locations!origin_city_id ( display_name_i18n, country_code ),
      talent_profile_taxonomy (
        is_primary,
        taxonomy_terms ( id, kind, slug, name_i18n )
      ),
      intro_italic,
      event_styles,
      destinations,
      languages,
      travels_globally,
      team_size,
      lead_time_weeks,
      starting_from,
      booking_note,
      service_category_slug,
      package_teasers,
      services_menu,
      social_links,
      embedded_media
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
  // NEW catalog system. talent_profile_field_values + profile_field_definitions
  // replaced the legacy field_values + field_definitions in 20260923010000.
  // Project the new schema to the existing PublicFieldValueRow shape so the
  // rendering code below stays unchanged. Filters:
  //   - workflow_state = 'live' (drop pending/rejected) — P0 #3
  //   - deprecated definitions excluded
  //   - effective visibility (visibility_override || default_visibility) must
  //     include 'public' OR the definition's show_in_public = true — P0 #2
  type NewDefEmbed = {
    id: string;
    field_key: string;
    /** Per-locale label map { "en": …, "es": … }. */
    label_i18n: unknown;
    kind: string;
    /** universal | global | type-specific (Gap 2b — orphan check). */
    tier: string | null;
    options: string[] | null;
    /** Per-option per-locale label map { "<value>": { "en": …, "es": … } }. */
    option_labels_i18n: unknown;
    display_order: number | null;
    field_group_id: string | null;
    admin_only: boolean | null;
    is_sensitive: boolean | null;
    show_in_public: boolean | null;
    default_visibility: string[] | null;
    deprecated_at: string | null;
    profile_field_groups:
      | { sort_order: number | null; slug: string | null }
      | { sort_order: number | null; slug: string | null }[]
      | null;
  };
  type NewValueRow = {
    id: string;
    field_definition_id: string;
    value: unknown;
    visibility_override: string[] | null;
    workflow_state: "live" | "pending" | "rejected";
    profile_field_definitions: NewDefEmbed | NewDefEmbed[] | null;
  };

  const { data, error } = await supabase
    .from("talent_profile_field_values")
    .select(
      `
      id,
      field_definition_id,
      value,
      visibility_override,
      workflow_state,
      profile_field_definitions (
        id, field_key, label_i18n, kind, tier, options, option_labels_i18n, display_order, field_group_id,
        admin_only, is_sensitive, show_in_public, default_visibility, deprecated_at,
        profile_field_groups ( sort_order, slug )
      )
    `,
    )
    .eq("talent_profile_id", talentProfileId)
    .eq("workflow_state", "live");
  if (error || !data) return [];

  // ── Gap 2 — public resolver-gate (2a tenant overrides + 2b-soft) ──────
  // Governance reads use a SERVICE-ROLE client: the public path's client
  // is anon and cannot read RLS-scoped workspace_profile_field_settings /
  // agency_talent_roster, so without this the gate would silently fail
  // OPEN. Reading governance data with service role to compute a MORE
  // restrictive public view never exposes that data. If the service
  // client (or any governance read) is unavailable we fail SAFE by
  // degrading to the prior Phase 1.5 behaviour — never over-hiding,
  // never a new leak. No data is mutated; this is a read-side filter.
  const svc = createServiceRoleClient();
  const fieldIds = Array.from(
    new Set(
      (data as NewValueRow[]).map((r) => r.field_definition_id).filter(Boolean),
    ),
  );

  const tenantOverride = new Map<
    string,
    {
      enabled_override: boolean | null;
      show_in_public_override: boolean | null;
      admin_only_override: boolean | null;
      default_visibility_override: string[] | null;
    }
  >();
  const recTermsByField = new Map<string, Set<string>>();
  const applicableTerms = new Set<string>();
  let governanceLoaded = false;
  let resolverLoaded = false;
  const resolvedFieldById = new Map<string, ResolvedField>();
  const resolvedGroupOrderBySlug = new Map<string, number>();

  if (svc && fieldIds.length > 0) {
    try {
      const { data: rosterRow } = await svc
        .from("agency_talent_roster")
        .select("tenant_id")
        .eq("talent_profile_id", talentProfileId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      const tenantId =
        (rosterRow as { tenant_id?: string } | null)?.tenant_id ?? null;

      if (tenantId) {
        const resolved = await resolveTalentFields({
          supabase: svc,
          talentProfileId,
          tenantId,
          viewerRole: "public",
        });
        if (resolved.ok) {
          resolverLoaded = true;
          for (const field of resolved.fields) {
            resolvedFieldById.set(field.field_definition_id, field);
          }
          for (const group of resolved.groups) {
            resolvedGroupOrderBySlug.set(group.group_slug, group.display_order);
          }
        }

        const { data: wpfs } = await svc
          .from("workspace_profile_field_settings")
          .select(
            "field_definition_id, enabled_override, show_in_public_override, admin_only_override, default_visibility_override",
          )
          .eq("tenant_id", tenantId)
          .in("field_definition_id", fieldIds);
        for (const o of (wpfs ?? []) as Array<{
          field_definition_id: string;
          enabled_override: boolean | null;
          show_in_public_override: boolean | null;
          admin_only_override: boolean | null;
          default_visibility_override: string[] | null;
        }>) {
          tenantOverride.set(o.field_definition_id, o);
        }
      }

      if (!resolverLoaded) {
        // Fallback only. The shared resolver is the truth source; this
        // retained path keeps public profiles from regressing if the service
        // resolver cannot load during local/dev misconfiguration.
        const { data: tpt } = await svc
          .from("talent_profile_taxonomy")
          .select("taxonomy_term_id")
          .eq("talent_profile_id", talentProfileId);
        let level = Array.from(
          new Set(
            ((tpt ?? []) as Array<{ taxonomy_term_id: string | null }>)
              .map((r) => r.taxonomy_term_id)
              .filter((x): x is string => !!x),
          ),
        );
        for (const id of level) applicableTerms.add(id);
        for (let depth = 0; depth < 2 && level.length > 0; depth++) {
          const { data: parents } = await svc
            .from("taxonomy_terms")
            .select("id, parent_id")
            .in("id", level);
          const next = Array.from(
            new Set(
              ((parents ?? []) as Array<{ id: string; parent_id: string | null }>)
                .map((p) => p.parent_id)
                .filter((x): x is string => !!x),
            ),
          );
          for (const id of next) applicableTerms.add(id);
          level = next;
        }

        const { data: recs } = await svc
          .from("profile_field_recommendations")
          .select("field_definition_id, taxonomy_term_id")
          .in("field_definition_id", fieldIds);
        for (const r of (recs ?? []) as Array<{
          field_definition_id: string;
          taxonomy_term_id: string | null;
        }>) {
          if (!r.taxonomy_term_id) continue;
          const s =
            recTermsByField.get(r.field_definition_id) ?? new Set<string>();
          s.add(r.taxonomy_term_id);
          recTermsByField.set(r.field_definition_id, s);
        }
      }
      governanceLoaded = true;
    } catch {
      // Any governance read failure → fail SAFE (degrade to Phase 1.5).
      governanceLoaded = false;
    }
  }

  const diag = {
    prevPublic: 0,
    hiddenByTenant: 0,
    hiddenOrphan: 0,
    keptUniversalGlobal: 0,
    keptTypeSpecific: 0,
  };

  const projected: PublicFieldValueRow[] = [];
  for (const row of data as NewValueRow[]) {
    const def = Array.isArray(row.profile_field_definitions)
      ? (row.profile_field_definitions[0] ?? null)
      : row.profile_field_definitions;
    if (!def) continue;
    if (def.deprecated_at) continue;

    const resolvedField = resolverLoaded
      ? (resolvedFieldById.get(row.field_definition_id) ?? null)
      : null;
    if (resolverLoaded && !resolvedField) {
      if ((def.tier ?? "").toLowerCase() === "type-specific") {
        diag.hiddenOrphan++;
      }
      continue;
    }

    // Gap 2 — full public resolver-gate via the SINGLE shared primitive.
    // `wasPublic` = the prior Phase 1.5 decision (tenant=null), retained
    // only to drive the verification diff below.
    const defVisInput = {
      default_visibility: def.default_visibility,
      admin_only: def.admin_only,
      is_sensitive: def.is_sensitive,
      show_in_public: def.show_in_public,
    };
    const wasPublic =
      effectiveFieldVisibility(defVisInput, null, row.visibility_override) ===
      "public";
    if (wasPublic) diag.prevPublic++;

    if (resolvedField && !isResolvedFieldVisibleOnPublicProfile(resolvedField)) {
      if (wasPublic) diag.hiddenByTenant++;
      continue;
    }

    const ov = tenantOverride.get(row.field_definition_id) ?? null;

    // Rule 4 — field explicitly disabled by the workspace.
    if (ov?.enabled_override === false) {
      if (wasPublic) diag.hiddenByTenant++;
      continue;
    }

    // Rules 1-3,5 — tenant visibility override + platform floor + per-value
    // override, all via the shared primitive (deprecated already skipped).
    const vis = effectiveFieldVisibility(
      defVisInput,
      ov
        ? {
            show_in_public_override: ov.show_in_public_override,
            admin_only_override: ov.admin_only_override,
            default_visibility_override: ov.default_visibility_override,
          }
        : null,
      row.visibility_override,
    );
    if (vis !== "public") {
      if (wasPublic) diag.hiddenByTenant++;
      continue;
    }

    // Rules 6/7 — 2b-soft: keep universal/global; hide orphaned
    // type-specific (the category/type that caused it is no longer on the
    // talent). When the shared resolver loaded, its field set is the
    // authority. The manual recommendation walk below is fallback-only.
    const tier = (resolvedField?.tier ?? def.tier ?? "").toLowerCase();
    if (tier === "type-specific") {
      if (resolverLoaded) {
        diag.keptTypeSpecific++;
      } else if (governanceLoaded) {
        const recTerms = recTermsByField.get(row.field_definition_id);
        const stillApplicable =
          !!recTerms &&
          Array.from(recTerms).some((t) => applicableTerms.has(t));
        if (!stillApplicable) {
          if (wasPublic) diag.hiddenOrphan++;
          continue;
        }
        diag.keptTypeSpecific++;
      }
    } else {
      diag.keptUniversalGlobal++;
    }

    // Split jsonb value into the typed columns the renderer expects.
    const v = row.value;
    let value_text: string | null = null;
    let value_number: number | null = null;
    let value_boolean: boolean | null = null;
    let value_date: string | null = null;
    switch (def.kind) {
      case "number":
        if (typeof v === "number") value_number = v;
        else if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) value_number = Number(v);
        break;
      case "boolean":
      case "toggle":
        if (typeof v === "boolean") value_boolean = v;
        break;
      case "date":
        if (typeof v === "string") value_date = v;
        break;
      case "multiselect":
      case "chips":
        if (Array.isArray(v)) value_text = (v as unknown[]).join(", ");
        break;
      default:
        if (typeof v === "string") value_text = v;
        else if (typeof v === "number" || typeof v === "boolean") value_text = String(v);
        break;
    }

    const fg = Array.isArray(def.profile_field_groups)
      ? (def.profile_field_groups[0] ?? null)
      : def.profile_field_groups;
    const resolvedGroupSlug = resolvedField?.field_group_slug ?? fg?.slug ?? null;
    const resolvedGroupSort = resolvedGroupSlug
      ? (resolvedGroupOrderBySlug.get(resolvedGroupSlug) ?? fg?.sort_order ?? 0)
      : (fg?.sort_order ?? 0);

    // i18n maps: prefer the shared resolver's maps (custom_label folded in),
    // else the raw def columns. Project the en/es slots the legacy flat embed
    // shape carries (label_en/label_es/options_es) — the renderer below keeps
    // its existing locale pick over those slots.
    const labelMap: LocalizedMap =
      resolvedField?.label_i18n ?? asLocalizedMap(def.label_i18n);
    const optionEsMap =
      optionEsMapFromI18n(
        resolvedField?.option_labels_i18n ?? def.option_labels_i18n,
      );

    projected.push({
      id: row.id,
      value_text,
      value_number,
      value_boolean,
      value_date,
      field_definitions: {
        key: resolvedField?.field_key ?? def.field_key,
        label_en: localeSlot(labelMap, "en") ?? resolvedField?.label ?? "",
        label_es: localeSlot(labelMap, "es"),
        value_type: resolvedField?.kind ?? def.kind,
        options_es: optionEsMap,
        config: null,
        sort_order: resolvedField?.display_order ?? def.display_order ?? 0,
        field_group_id: def.field_group_id,
        internal_only: resolvedField?.is_admin_only ?? false,
        public_visible: true,
        profile_visible: true,
        field_groups: resolvedGroupSlug
          ? { sort_order: resolvedGroupSort, slug: resolvedGroupSlug }
          : null,
      },
    });
  }

  // Verification diff (Gap 2) — server-side, no UI change. Of the fields
  // that WERE public under Phase 1.5: how many are now hidden by tenant
  // privacy vs. orphaned type-specific, and what remains visible.
  void improntaLog("t.info", {
    message: `[public-resolver-gate] talent=${talentProfileId} ` +
      `resolver=${resolverLoaded} governance=${governanceLoaded} prevPublic=${diag.prevPublic} ` +
      `hiddenByTenant=${diag.hiddenByTenant} hiddenOrphan=${diag.hiddenOrphan} ` +
      `keptUniversalGlobal=${diag.keptUniversalGlobal} ` +
      `keptTypeSpecific=${diag.keptTypeSpecific}`,
  });

  return projected;
}

// ── PR-A — structured languages + service areas ──────────────────────
// Read-only on the public profile page. Replaces the legacy
// talent_profiles.languages / .destinations cache fields when populated.

export type TalentLanguageRow = {
  id: string;
  language_code: string;
  language_name: string;
  speaking_level: "basic" | "conversational" | "professional" | "fluent" | "native";
  is_native: boolean;
  can_host: boolean;
  can_sell: boolean;
  can_translate: boolean;
  can_teach: boolean;
  display_order: number;
};

export type TalentServiceAreaRow = {
  id: string;
  service_kind: "home_base" | "travel_to" | "remote_only";
  travel_radius_km: number | null;
  travel_fee_required: boolean;
  display_order: number;
  locations: {
    display_name_i18n: Record<string, string | null> | null;
    country_code: string | null;
  } | null;
};

async function fetchTalentLanguages(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<TalentLanguageRow[]> {
  const { data, error } = await supabase
    .from("talent_languages")
    .select(
      `
      id, language_code, language_name, speaking_level,
      is_native, can_host, can_sell, can_translate, can_teach, display_order
    `,
    )
    .eq("talent_profile_id", talentProfileId)
    .order("display_order", { ascending: true })
    .order("language_name", { ascending: true });
  if (error || !data) return [];
  return data as TalentLanguageRow[];
}

async function fetchTalentServiceAreas(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<TalentServiceAreaRow[]> {
  const { data, error } = await supabase
    .from("talent_service_areas")
    .select(
      `
      id, service_kind, travel_radius_km, travel_fee_required, display_order,
      locations ( display_name_i18n, country_code )
    `,
    )
    .eq("talent_profile_id", talentProfileId)
    .order("display_order", { ascending: true });
  if (error || !data) return [];
  return data as unknown as TalentServiceAreaRow[];
}

// ── Public talent skills (for experience line + skills block) ────────────────
// Reads from talent_skills_resolved view via the anon client. Only primary +
// secondary skills with proficiency_level or years_experience are useful here;
// generic fallback rows add noise. Returns [] on any error.

async function fetchPublicTalentSkills(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<ResolvedSkill[]> {
  const { data, error } = await supabase
    .from("talent_skills_resolved")
    .select(
      `skill_term_id, skill_slug, skill_name_en, skill_name_es,
       is_generic_fallback, parent_category_id, parent_category_slug,
       parent_category_name_en, relationship_type, proficiency_level,
       years_experience, display_order, is_verified, verified_at,
       verified_by_tenant_id, verification_note, created_at,
       booking_count, last_booked_at`,
    )
    .eq("talent_profile_id", talentProfileId)
    .eq("is_generic_fallback", false)
    .order("relationship_type", { ascending: true })
    .order("display_order", { ascending: true });

  if (error || !data) return [];
  return data as ResolvedSkill[];
}

// ── Availability from talent_discover_index ─────────────────────────────────
// Read-only. The matview is public (anon-readable) — RLS is on the base
// tables only. Returns nulls on any error so the page degrades gracefully.

type PublicAvailabilityData = {
  nextAvailableDate: string | null;
  availableDaysInNext30: number | null;
  availabilityDots14d: string | null;
};

async function fetchPublicAvailability(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<PublicAvailabilityData> {
  const { data, error } = await supabase
    .from("talent_discover_index")
    .select("next_available_date, available_days_in_next_30, availability_dots_14d")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (error || !data) {
    return { nextAvailableDate: null, availableDaysInNext30: null, availabilityDots14d: null };
  }

  const row = data as {
    next_available_date: string | null;
    available_days_in_next_30: number | null;
    availability_dots_14d: string | null;
  };

  return {
    nextAvailableDate: row.next_available_date,
    availableDaysInNext30: row.available_days_in_next_30,
    availabilityDots14d: row.availability_dots_14d,
  };
}

/**
 * "English (fluent · host, sell)" — compact label suitable for the
 * existing languages list rendering. Only shows the role flags that
 * actually unlock client filters (host/sell/translate). Native flag
 * subsumes the level.
 */
function formatLanguageRow(row: TalentLanguageRow, locale: string): string {
  const name = localizeLanguageName(row.language_code, row.language_name, locale);
  const level = localizeSpeakingLevel(
    row.is_native ? "native" : row.speaking_level,
    locale,
  );
  const flags: string[] = [];
  if (row.can_host) flags.push(localizeLanguageFlag("host", locale));
  if (row.can_sell) flags.push(localizeLanguageFlag("sell", locale));
  if (row.can_translate) flags.push(localizeLanguageFlag("translate", locale));
  const flagsTail = flags.length > 0 ? ` · ${flags.join(", ")}` : "";
  return `${name} (${level}${flagsTail})`;
}

function pickFieldLabel(locale: string, en: string, es?: string | null): string {
  return pickLocale(locale, { en: en.trim(), es: es?.trim() || undefined });
}

// ── i18n → legacy en/es projection helpers ──────────────────────────────────
// The public-profile renderer below carries a flat en/es embed shape
// (PublicFieldDefinitionEmbed). The catalog now stores labels/option-labels as
// per-locale JSONB maps. These coerce a raw jsonb value into a LocalizedMap and
// pull a single locale's slot so the projection can keep populating label_en /
// label_es / options_es without changing the downstream render code.
function asLocalizedMap(raw: unknown): LocalizedMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: LocalizedMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** A single locale's non-empty value from a per-locale map, or null. */
function localeSlot(map: LocalizedMap, locale: string): string | null {
  const v = map[locale];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Build the legacy `options_es` map ({ "<en option>": "<es label>" }) from the
 *  new per-option per-locale map ({ "<value>": { en, es } }). */
function optionEsMapFromI18n(
  raw: unknown,
): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [value, sub] of Object.entries(raw as Record<string, unknown>)) {
    const es = localeSlot(asLocalizedMap(sub), "es");
    if (es) out[value] = es;
  }
  return Object.keys(out).length > 0 ? out : null;
}


function formatFieldValue(row: PublicFieldValueRow, locale: string): string | null {
  const fd = row.field_definitions
    ? Array.isArray(row.field_definitions)
      ? (row.field_definitions[0] ?? null)
      : row.field_definitions
    : null;

  // Locale-aware per-option label: look up the stored English option string in
  // options_es when locale=es; fall back to the English string. (Replaces the
  // old, never-reachable fd.config branch — config was always projected null
  // and canonical options are plain string[], not {value,label_en} objects.)
  const optEs = fd?.options_es ?? null;
  const mapOpt = (val: string): string => {
    const t = val.trim();
    if (locale === "es" && optEs) {
      const es = optEs[t];
      if (typeof es === "string" && es.trim()) return es.trim();
    }
    return t;
  };

  if (row.value_text && row.value_text.trim()) {
    const kind = fd?.value_type;
    // multiselect / chips are projected as a ", "-joined string of English
    // option values — split, localize each, rejoin.
    if (kind === "multiselect" || kind === "chips") {
      return row.value_text
        .split(",")
        .map((s) => mapOpt(s))
        .filter((s) => s.length > 0)
        .join(", ");
    }
    // select / text — map a single option value (text fields have no
    // options_es, so mapOpt is a no-op for them).
    return mapOpt(row.value_text);
  }
  if (typeof row.value_number === "number") return String(row.value_number);
  if (typeof row.value_boolean === "boolean") {
    return row.value_boolean
      ? pickLocale(locale, { en: "Yes", es: "Sí" })
      : "No";
  }
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
// Similar-talent mini cards (D3 — Lane D site-wide card adoption)
// ---------------------------------------------------------------------------

type SimilarTalentMini = {
  id: string;
  profileCode: string;
  displayName: string;
  primaryType: string | null;
  thumbnailUrl: string | null;
};

/**
 * Fetches up to `limit` published talent from the same agency roster,
 * excluding the currently-viewed profile. Used to render the "More from
 * this roster" strip at the bottom of every agency talent profile page.
 *
 * Safe: uses the public anon client; RLS ensures only active, published
 * rows are visible. Returns [] on any error so the page degrades silently.
 */
async function fetchSimilarTalent(
  supabase: SupabaseClient,
  tenantId: string,
  excludeId: string,
  limit = 4,
): Promise<SimilarTalentMini[]> {
  // Step 1 — get active roster talent IDs for this tenant (overfetch ×4 to
  // allow for non-published profiles that will be filtered in step 2).
  const { data: rosterRows } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .neq("talent_profile_id", excludeId)
    .limit(limit * 4);

  const profileIds = ((rosterRows ?? []) as { talent_profile_id: string }[])
    .map((r) => r.talent_profile_id)
    .filter(Boolean);
  if (!profileIds.length) return [];

  // Step 2 — fetch profile data + thumbnail assets for those IDs.
  const { data: profiles } = await supabase
    .from("talent_profiles")
    .select(
      `id, profile_code, display_name, first_name, last_name, workflow_status,
       talent_profile_taxonomy ( is_primary, taxonomy_terms ( kind, name_i18n ) ),
       media_assets ( bucket_id, storage_path, variant_kind, sort_order )`,
    )
    .in("id", profileIds)
    .in("workflow_status", ["published", "approved"])
    .is("deleted_at", null)
    .limit(limit);

  if (!profiles?.length) return [];

  type RawProfile = {
    id: string;
    profile_code: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    talent_profile_taxonomy: TaxonomyRow[];
    media_assets: {
      bucket_id: string | null;
      storage_path: string | null;
      variant_kind: string | null;
      sort_order: number | null;
    }[];
  };

  return (profiles as RawProfile[]).slice(0, limit).map((p) => {
    const dn =
      p.display_name?.trim() ||
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
      p.profile_code;

    const pType = primaryTalentType("en", p.talent_profile_taxonomy ?? []);

    const assets = (p.media_assets ?? []).sort(
      (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999),
    );
    const thumb =
      assets.find((a) => a.variant_kind === "thumbnail") ??
      assets.find((a) => a.storage_path) ??
      null;

    const thumbUrl =
      thumb?.bucket_id && thumb.storage_path
        ? supabase.storage
            .from(thumb.bucket_id)
            .getPublicUrl(thumb.storage_path).data.publicUrl
        : null;

    return {
      id: p.id,
      profileCode: p.profile_code,
      displayName: dn,
      primaryType: pType,
      thumbnailUrl: thumbUrl,
    };
  });
}

// ---------------------------------------------------------------------------
// Multi-workspace / hubs indicator — "Also represented on …"
// ---------------------------------------------------------------------------

type OtherHub = { tenantId: string; name: string; href: string };

/**
 * Resolve the OTHER active + publicly-visible Tulala workspaces/hubs this
 * talent is represented on, excluding `currentTenantId` (null on the platform
 * host = show all). Each hub links to this talent's profile on that hub's
 * primary public host (`/t/<code>`). RLS on agency_talent_roster already
 * limits anon reads to status='active' AND agency_visibility IN
 * ('site_visible','featured'), so this is a safe public read. Returns [] on
 * any error or when there are no other hubs.
 */
async function fetchOtherHubsForTalent(
  supabase: SupabaseClient | null,
  talentProfileId: string,
  profileCode: string,
  currentTenantId: string | null,
): Promise<OtherHub[]> {
  if (!supabase) return [];

  const { data: rosterRows, error } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id, agencies ( id, display_name, slug )")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "active")
    .in("agency_visibility", ["site_visible", "featured"]);
  if (error || !rosterRows) return [];

  type RosterHubRow = {
    tenant_id: string;
    agencies:
      | { id: string; display_name: string | null; slug: string | null }
      | { id: string; display_name: string | null; slug: string | null }[]
      | null;
  };

  // De-dup by tenant; drop the current tenant.
  const tenantIds = Array.from(
    new Set(
      (rosterRows as RosterHubRow[])
        .map((r) => r.tenant_id)
        .filter((id): id is string => Boolean(id) && id !== currentTenantId),
    ),
  );
  if (tenantIds.length === 0) return [];

  const agencyById = new Map<string, { display_name: string | null; slug: string | null }>();
  for (const r of rosterRows as RosterHubRow[]) {
    const ag = Array.isArray(r.agencies) ? r.agencies[0] ?? null : r.agencies;
    if (ag && !agencyById.has(r.tenant_id)) {
      agencyById.set(r.tenant_id, { display_name: ag.display_name, slug: ag.slug });
    }
  }

  // Primary public host per tenant (subdomain/custom). Anon-readable.
  const { data: domainRows } = await supabase
    .from("agency_domains")
    .select("tenant_id, hostname, kind, status, is_primary")
    .in("tenant_id", tenantIds)
    .in("kind", ["custom", "subdomain"]);

  type DomainRow = {
    tenant_id: string;
    hostname: string | null;
    kind: string;
    status: string;
    is_primary: boolean | null;
  };
  const READY = new Set(["active", "ssl_provisioned", "verified"]);
  const hostByTenant = new Map<string, string>();
  for (const tid of tenantIds) {
    const rows = ((domainRows ?? []) as DomainRow[]).filter(
      (d) => d.tenant_id === tid && d.hostname && READY.has(d.status),
    );
    const pick =
      rows.find((d) => d.is_primary && d.kind === "custom") ??
      rows.find((d) => d.is_primary) ??
      rows.find((d) => d.kind === "custom") ??
      rows[0] ??
      null;
    if (pick?.hostname) hostByTenant.set(tid, pick.hostname);
  }

  const hubs: OtherHub[] = [];
  for (const tid of tenantIds) {
    const agency = agencyById.get(tid);
    const name = agency?.display_name?.trim();
    if (!name) continue;
    const host = hostByTenant.get(tid);
    const href = host
      ? `https://${host}/t/${encodeURIComponent(profileCode)}`
      : `/t/${encodeURIComponent(profileCode)}`;
    hubs.push({ tenantId: tid, name, href });
  }
  return hubs.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Metadata — consumed by the route wrapper (page.tsx) via generateMetadata.
// Kept beside the view so the metadata and the render read the same helpers.
// ---------------------------------------------------------------------------

export async function buildTalentProfileMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ profileCode: string }>;
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};

  const { profileCode } = await params;
  const { preview } = await searchParams;
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const hostCtx = await getPublicHostContext();
  if (isTalentProfilePlatformHost(hostCtx.kind) && preview !== "1") {
    const siteResolved = await resolvePlatformTalentSiteForProfile(profileCode);
    if (siteResolved.kind === "render") {
      const title = siteResolved.snapshot.fields.title;
      const description =
        siteResolved.snapshot.fields.metaDescription ?? undefined;
      const templateThumbnail =
        siteResolved.snapshot.compositionMode === "template" && !siteResolved.draftPreview
          ? TALENT_SITE_TEMPLATES[
              siteResolved.snapshot.templateKey as TalentSiteTemplateKey
            ]?.thumbnailUrl
          : undefined;
      return {
        title,
        description,
        metadataBase: new URL(site),
        openGraph: {
          title,
          description,
          ...(templateThumbnail ? { images: [templateThumbnail] } : {}),
        },
        ...(siteResolved.draftPreview
          ? { robots: { index: false, follow: false } }
          : {}),
      };
    }
    if (siteResolved.kind === "not_found") {
      return { title: "Not found" };
    }
  }

  const result = await fetchTalentProfile(profileCode, preview === "1");
  if (!result) return {};

  const { profile } = result;
  const locale = await getRequestLocale();

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

  // OG image / metadataBase host preference:
  // - On an agency host (improntamodels.com etc.) prefer the agency
  //   host so social-share previews (WhatsApp / LinkedIn / Twitter /
  //   Slack link unfurls) use the agency's domain instead of the
  //   platform's. Image content is identical; only the URL differs.
  // - Falls back to the platform site URL on app / hub / unknown hosts.
  const metadataBaseUrl = (() => {
    if (hostCtx.kind === "agency" && hostCtx.hostname) {
      try {
        return new URL(`https://${hostCtx.hostname}`);
      } catch {
        /* fall through */
      }
    }
    return new URL(site);
  })();

  const name = profile.display_name?.trim() ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    profileCode;

  // A category the tenant disabled must not reach <title> / og:title (it reaches
  // search engines from there). With every category hidden the title degrades to
  // the same generic "Talent" an untagged profile already uses.
  const metadataTaxonomyVisibility = await loadProfileTaxonomyVisibility(
    await resolveProfileOverrideTenantId(hostCtx, profile.id),
  );
  const talentType =
    primaryTalentType(
      "en",
      profile.talent_profile_taxonomy ?? [],
      metadataTaxonomyVisibility,
    ) ?? "Talent";
  const loc = residenceLabel("en", profile as TalentProfile);

  const title = loc ? `${name} — ${talentType} · ${loc}` : `${name} — ${talentType}`;
  const about = publicBioForLocale(locale, [locale, "en"], {
    ...(profile.bio_i18n ?? {}),
    en: canonicalBioEn(bioEnFromI18n(profile.bio_i18n), profile.short_bio),
  });
  const description =
    about.trim() ||
    `View ${name}'s talent profile on Impronta — ${talentType}${loc ? ` — lives in ${loc}` : ""}.`;

  return {
    title,
    description,
    metadataBase: metadataBaseUrl,
    alternates: {
      canonical: pickLocale(locale, { en: canonicalEn, es: canonicalEs }),
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
      locale: pickLocale(locale, { en: "en_US", es: "es_ES" }),
      alternateLocale: pickLocale(locale, { en: "es_ES", es: "en_US" }),
    },
  };
}

// ---------------------------------------------------------------------------
// View — the full profile render, shared by two shells:
//   • variant="page"  — the canonical /t/[profileCode] route (page.tsx)
//   • variant="modal" — the directory quick-open overlay
//     (@modal/(.)t/[profileCode]) which intercepts in-app navigations and
//     renders the SAME profile inside a dialog. The modal shell provides its
//     own chrome, so page-only furniture (site header, marketing wrap,
//     skip-link, JSON-LD scripts, floating chat launcher) is skipped there —
//     content and analytics are identical by construction.
// ---------------------------------------------------------------------------

export type TalentProfileSearchParams = {
  preview?: string;
  locale?: string;
  lang?: string;
  template?: string;
};

export async function TalentProfileView({
  profileCode,
  sp,
  variant = "page",
}: {
  profileCode: string;
  sp: TalentProfileSearchParams;
  variant?: "page" | "modal";
}) {
  const isModal = variant === "modal";
  const { preview } = sp;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const previewMode = preview === "1";
  const [initialSavedIds, initialFavoriteIds] = await Promise.all([
    getSavedTalentIds(),
    getFavoriteTalentIds(),
  ]);

  const [hostCtx, publicPathPrefix] = await Promise.all([
    getPublicHostContext(),
    getPublicPathPrefix(),
  ]);

  const platformHost = isTalentProfilePlatformHost(hostCtx.kind);
  // The freeform platform site carries its own full chrome (PublicHeader +
  // footer), which must never render inside the directory quick-open overlay —
  // the modal falls through to the template dispatcher, whose modal variant
  // strips page chrome.
  if (platformHost && preview !== "1" && !isModal) {
    const siteResolved = await resolvePlatformTalentSiteForProfile(profileCode);
    if (siteResolved.kind === "not_found") {
      notFound();
    }
    if (siteResolved.kind === "render") {
      return (
        <PublicDiscoveryStateProvider
          initialSavedIds={initialSavedIds}
          initialFavoriteIds={initialFavoriteIds}
        >
          <PlatformTalentMaxSiteView
            snapshot={siteResolved.snapshot}
            locale={locale}
            draftPreview={siteResolved.draftPreview}
            freeformContext={
              siteResolved.freeformContext
                ? { ...siteResolved.freeformContext, publicPathPrefix }
                : undefined
            }
          />
        </PublicDiscoveryStateProvider>
      );
    }
  }
  // Branding scope: agency hosts read their own tenant; platform hosts
  // (marketing apex, app, hub) read the platform hub tenant — the workspace
  // whose admin (Website → Profile Pages / Card Design) is documented to
  // control the public tulala.digital surfaces. Without this, the template
  // pick + theme tokens saved there never applied anywhere ("settings lie").
  const brandingTenantId =
    hostCtx.kind === "agency"
      ? hostCtx.tenantId
      : ((await getPlatformHubTenant())?.tenantId ?? null);
  const [tenantBrandIdentity, tenantBranding] = await Promise.all([
    hostCtx.kind === "agency"
      ? loadPublicIdentity(hostCtx.tenantId)
      : Promise.resolve(null),
    brandingTenantId
      ? loadPublicBranding(brandingTenantId)
      : Promise.resolve(null),
  ]);
  const tenantBrand = tenantBrandIdentity?.public_name ?? null;
  const ui = buildDirectoryUiCopy(t, tenantBrand);
  const surface: TalentSurface =
    hostCtx.kind === "agency" ? "agency" : "freelancer";

  if (!isSupabaseConfigured()) {
    return (
      <PublicDiscoveryStateProvider
        initialSavedIds={initialSavedIds}
        initialFavoriteIds={initialFavoriteIds}
      >
        <DirectoryInquiryModalProvider>
          <FavoritesDrawerProvider>
            {/* Parity — even the degenerate config-error branch carries the
                skip-link + #main-content landmark so every render branch of
                this surface is uniform (locked by render-branch-parity test). */}
            <SkipToContent />
            <PublicHeader />
            <main
              id="main-content"
              className="mx-auto max-w-lg flex-1 px-4 py-20 text-center text-m text-muted-foreground"
            >
              {t("public.forms.inquiry.supabaseNotConfigured")}
            </main>
            <DirectoryInquirySheet ui={ui} locale={locale} />
            <FavoritesModal
              signupHref="/login"
              locale={locale}
              initialFavoriteIdsCount={initialFavoriteIds.length}
            />
          </FavoritesDrawerProvider>
        </DirectoryInquiryModalProvider>
      </PublicDiscoveryStateProvider>
    );
  }

  const result = await fetchTalentProfile(profileCode, previewMode);
  if (!result) {
    notFound();
  }
  const { pub, fieldValuesClient, profile, preview: resolvedPreview } = result;

  // Phase 5/6 M2 — explicit surface-aware visibility. On non-preview flows,
  // the freelancer/app surface requires is_publicly_hidden = false AND
  // deleted_at IS NULL. RLS enforces the same rule for anon reads; the
  // resolver makes the contract code-visible and protects authenticated-
  // but-unauthorised readers from globally hidden rows leaking through.
  // (Agency surface continues to rely on roster RLS for M2; a roster-join
  // resolver call wires in when overlays land.)
  if (!resolvedPreview && surface === "freelancer") {
    // RLS already filters soft-deleted rows for anon reads, so the row we
    // have here has deleted_at=null by construction; pass it explicitly so
    // the resolver's contract is satisfied and intent is code-visible.
    const decision = resolveTalentVisibility(
      {
        profile: {
          is_publicly_hidden: profile.is_publicly_hidden ?? false,
          deleted_at: null,
        },
      },
      "freelancer",
    );
    if (!decision.visible) notFound();
  }

  // Free-plan contract hardening: on agency surfaces, direct profile URLs
  // must still honor the plan-capped public directory slice.
  if (!resolvedPreview && surface === "agency" && hostCtx.kind === "agency" && pub) {
    const withinCap = await isTalentIdWithinTenantPublicDisplayCap(
      pub,
      hostCtx.tenantId,
      profile.id,
    );
    if (!withinCap) notFound();
  }
  // Tenant category overrides (Settings → Roster & profile fields → Categories).
  // Everything category-derived below — discipline chips, the primary role line,
  // service discipline labels, JSON-LD jobTitle — funnels through this so a
  // disabled category disappears from the public profile, not just the directory.
  // THE governing tenant for every override-keyed read below (categories,
  // field values, sidebar sections). Resolved once so they cannot disagree.
  const overrideTenantId = await resolveProfileOverrideTenantId(hostCtx, profile.id);
  const taxonomyVisibility = await loadProfileTaxonomyVisibility(overrideTenantId);

  const fieldValues = await fetchPublicFieldValues(fieldValuesClient, profile.id);
  type DetailEntry = {
    key: string;
    label: string;
    value: string;
    /** Human group label for premium card grouping (e.g. "Logistics"). */
    group: string;
    groupSort: number;
    sort: number;
  };

  function groupSlugFromDef(def: PublicFieldDefinitionEmbed): string | null {
    const fg = def.field_groups;
    const slug = Array.isArray(fg) ? fg[0]?.slug : fg?.slug;
    return typeof slug === "string" && slug.trim() ? slug.trim() : null;
  }

  // Humanize a field-group slug into a card heading. The new catalog stores
  // group identity as a slug only (no per-locale label on the public embed),
  // so we title-case the slug and apply a few curated labels. Ungrouped rows
  // fall back to a generic "Details" bucket.
  const groupLabelFromSlug = (slug: string | null): string => {
    if (!slug) return pickLocale(locale, { en: "Details", es: "Detalles" });
    const curated: Record<string, { en: string; es: string }> = {
      measurements: { en: "Measurements", es: "Medidas" },
      physical: { en: "Physical", es: "Físico" },
      logistics: { en: "Logistics", es: "Logística" },
      availability: { en: "Availability", es: "Disponibilidad" },
      experience: { en: "Experience", es: "Experiencia" },
      rates: { en: "Rates", es: "Tarifas" },
      preferences: { en: "Preferences", es: "Preferencias" },
    };
    const hit = curated[slug];
    if (hit) return pickLocale(locale, hit);
    return slug
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  };

  // FREE-TIER CONTACT GATE: on the free default profile, the ONLY contact path
  // is the in-Tulala inquiry — so any field VALUE that is a social handle,
  // external link, or direct contact channel is suppressed (clients must not be
  // able to bypass Tulala). Pro/Max surface these. Matched by key token so new
  // social/link fields are caught by default.
  const isFreePlanProfile =
    !profile.talent_plan_key || profile.talent_plan_key === "talent_basic";
  const EXTERNAL_CONTACT_FIELD_TOKENS = [
    "instagram", "tiktok", "youtube", "twitter", "facebook", "linkedin",
    "snapchat", "pinterest", "threads", "vimeo", "spotify", "soundcloud",
    "behance", "imdb", "social", "website", "portfolio", "showreel", "reel",
    "url", "link", "whatsapp", "phone", "mobile", "email", "telegram", "wechat",
  ];
  const isExternalContactFieldKey = (key: string): boolean => {
    const k = key.toLowerCase();
    return EXTERNAL_CONTACT_FIELD_TOKENS.some((t) => k.includes(t));
  };

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
      if (isFreePlanProfile && isExternalContactFieldKey(def.key)) return acc;
      if (def.internal_only) return acc;
      if (def.profile_visible === false) return acc;
      if (def.public_visible === false) return acc;
      const value = formatFieldValue(row, locale);
      if (!value) return acc;
      const fg = def.field_groups;
      const groupSort = Array.isArray(fg) ? fg[0]?.sort_order ?? 0 : fg?.sort_order ?? 0;
      const slug = groupSlugFromDef(def);
      const entry: DetailEntry = {
        key: def.key,
        label: pickFieldLabel(locale, def.label_en, def.label_es),
        value,
        group: groupLabelFromSlug(slug),
        groupSort,
        sort: def.sort_order ?? 0,
      };
      if (slug === "basic_info") acc.basicInfoDetailRows.push(entry);
      else acc.otherDetailRows.push(entry);
      return acc;
    },
    { basicInfoDetailRows: [], otherDetailRows: [] },
  );

  const sortDetail = (a: DetailEntry, b: DetailEntry) =>
    a.groupSort - b.groupSort || a.sort - b.sort || a.key.localeCompare(b.key);
  basicInfoDetailRows.sort(sortDetail);
  otherDetailRows.sort(sortDetail);

  // D3 — similar talent strip (agency surface only; free-tier / no roster = []).
  const similarTalentRaw: SimilarTalentMini[] =
    surface === "agency" && hostCtx.kind === "agency" && pub && !resolvedPreview
      ? await fetchSimilarTalent(pub, hostCtx.tenantId, profile.id, 4)
      : [];

  const portalInquiryNext = prefixPublicHref(
    `/client/inquiries/new?talent=${encodeURIComponent(profile.id)}`,
    publicPathPrefix,
  );
  const portalInquiryHref =
    hostCtx.kind === "agency"
      ? prefixPublicHref(
          // P2: `/client/register` still resolves (permanent 308 into
          // `/register?as=client`), but point the live CTA at the canonical page
          // so the visitor does not pay for the extra hop.
          `/register?as=client&intent=inquiry&next=${encodeURIComponent(portalInquiryNext)}`,
          publicPathPrefix,
        )
      : null;
  const profileSourcePage = prefixPublicHref(
    `/t/${encodeURIComponent(profile.profile_code)}`,
    publicPathPrefix,
  );

  // 6.4 instant-book: a "Book now" CTA shown alongside Inquire when the talent
  // opted in (booking_terms) AND the tenant enabled it. Agency surface only —
  // it needs a real tenant (the open hub routes through Inquire). Cheap: the
  // currency loader is request-cached and eligibility is two indexed reads.
  const instantBook =
    hostCtx.kind === "agency" && !resolvedPreview
      ? await loadInstantBookEligibility(
          profile.id,
          hostCtx.tenantId,
          (await loadPlatformOperatingCurrency()).operatingCurrency,
        )
      : { eligible: false, fixedRateCents: null, fixedRateDollars: null, currencyCode: "USD" };

  // S12 — talent-configured services menu. Read from the column (always
  // dual-written alongside catalog commerce.servicesMenu) so the public render
  // needs no extra RLS path. Public surface shows active, non-agency_only items.
  const serviceMenuItems = normalizeServicesMenu(
    profile.services_menu,
    instantBook.currencyCode || "USD",
  ).filter((it) => it.isActive && it.visibility !== "agency_only");

  // Storefront — the offerings catalog (talent_offerings). When present it
  // REPLACES the legacy services menu on the layouts; when empty the legacy
  // ServiceMenuBlock keeps rendering (zero-regression fallback).
  const storefrontOfferings = await loadPublicOfferingsForProfile(
    profile.id,
    locale,
    // Agency host → that agency's catalog only. The talent's own premium site
    // and platform hosts pass null and see everything they offer.
    hostCtx.kind === "agency" ? hostCtx.tenantId : null,
  );

  // W3-7 — schema.org Offer JSON-LD for the storefront (SEO). Only published,
  // exactly-priced offerings are emitted; quote/on-request carry no price.
  const offerJsonLd =
    storefrontOfferings.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: storefrontOfferings
            .filter((o) => o.amountCents != null && o.priceDisplay === "exact")
            .slice(0, 20)
            .map((o, i) => ({
              "@type": "Offer",
              position: i + 1,
              name: o.title,
              ...(o.description ? { description: o.description } : {}),
              price: (o.amountCents! / 100).toFixed(2),
              priceCurrency: o.currency,
              availability: "https://schema.org/InStock",
            })),
        }
      : null;

  // S6 — id → label for any discipline a service is scoped to (talent_type terms).
  const disciplineLabels: Record<string, string> = {};
  for (const term of flattenTaxonomy(profile.talent_profile_taxonomy ?? [])) {
    if (term.kind === "talent_type" && term.id && taxonomyVisibility.isTermVisible(term.id)) {
      disciplineLabels[term.id] = pickTaxonomyLabel(locale, term);
    }
  }

  // Enrich similar talent with pre-built hrefs for LightProfileLayout
  const similarTalent = similarTalentRaw.map((st) => ({
    ...st,
    href: prefixPublicHref(
      `/t/${encodeURIComponent(st.profileCode)}`,
      publicPathPrefix,
    ),
  }));

  // Fetch media. In preview mode, the profile owner should see pending assets too.
  const media: MediaAsset[] = pub
    ? (
        resolvedPreview
          ? (
              await (await getCachedServerSupabase())
                ?.from("media_assets")
                .select("id, bucket_id, storage_path, width, height, variant_kind, sort_order")
                .eq("owner_talent_profile_id", profile.id)
                .in("variant_kind", ["hero", "gallery", "public_watermarked", "card"])
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
                .in("variant_kind", ["hero", "gallery", "public_watermarked", "card"])
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
    media.find((m) => m.variant_kind === "hero") ?? null;
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

  // Extract watermark preset + logo from agency_branding.theme_json (publicly readable).
  // Stored there by updateAgencyBranding / the agency-logo signed-upload finalize actions.
  const brandingTheme = (typeof tenantBranding?.theme_json === "object" && tenantBranding.theme_json !== null
    ? tenantBranding.theme_json as Record<string, unknown>
    : {});
  const watermarkPreset = (brandingTheme.watermark_preset && typeof brandingTheme.watermark_preset === "object"
    ? brandingTheme.watermark_preset as {
        enabled: boolean;
        position: string;
        size_pct: number;
        opacity: number;
        padding_pct: number;
        variant: string;
      }
    : null);
  const watermarkLogoUrl = typeof brandingTheme.logo_url === "string" ? brandingTheme.logo_url : null;
  // Guest-chat launcher accent — the tenant's own brand color (primary, then
  // accent fallback); null lets the launcher use its neutral ink token. No
  // gold/rust is hard-coded (house rule).
  const chatAccentColor =
    tenantBranding?.primary_color ?? tenantBranding?.accent_color ?? null;
  // Jon 360 Phase 7 — the tenant's resolved page background mode (editorial-noir
  // etc.). Threaded to the chat launcher so a noir tenant's chat adopts a dark
  // surface instead of popping a white card on the dark page. theme_json holds the
  // published token directly under "background.mode"; non-string → undefined → light.
  const chatBackgroundMode =
    typeof brandingTheme["background.mode"] === "string"
      ? (brandingTheme["background.mode"] as string)
      : null;
  // Resolve the tenant that owns this profile's guest chat:
  //  - agency host → the agency
  //  - platform (marketing/app) host → the in-house Tulala hub (the talent is
  //    in its roster), so "message {talent}" inquiries land in the hub Messages.
  // Without this, the platform surface passed an empty tenantSlug and the
  // launcher rendered nothing (no chat on tulala.digital/t/<code>).
  const chatHub =
    hostCtx.kind === "marketing" || hostCtx.kind === "app"
      ? await getPlatformHubTenant()
      : null;
  const chatTenantId =
    hostCtx.kind === "agency" ? hostCtx.tenantId : chatHub?.tenantId ?? null;
  const chatTenantSlug =
    hostCtx.kind === "agency" ? hostCtx.tenantSlug : chatHub?.slug ?? "";
  const chatBrandName =
    hostCtx.kind === "agency"
      ? tenantBrand ?? "the agency"
      : chatHub?.displayName ?? "Tulala";
  // Per-tenant guest-chat config (enable + placement + greeting). Defaults-on
  // for unconfigured tenants so the launcher keeps working.
  const guestChatSettings = chatTenantId
    ? await loadGuestChatSettings(chatTenantId)
    : GUEST_CHAT_DEFAULTS;
  const canonicalBannerUrl = mediaUrl(pub, bannerMedia);
  const profileImageUrl = mediaUrl(pub, profileImageMedia);

  // Phase 5/6 M3 — agency overlay. Load the per-tenant overlay row only on
  // the agency surface; the RLS policy on agency_talent_overlays restricts
  // anon reads to rows whose roster is site_visible/featured, and this
  // query scopes the tenant explicitly so there is no cross-tenant read.
  // Freelancer/hub surfaces never load an overlay (Gate 3 — L7, L39).
  let agencyOverlay: AgencyTalentOverlayRow | null = null;
  let overlayBannerUrl: string | null = null;
  if (
    pub &&
    surface === "agency" &&
    hostCtx.kind === "agency" &&
    hostCtx.tenantId &&
    !resolvedPreview
  ) {
    agencyOverlay = await loadAgencyTalentOverlay(pub, hostCtx.tenantId, profile.id);
    if (agencyOverlay?.cover_media_asset_id) {
      const overlayCover = await loadOverlayCoverMedia(
        pub,
        agencyOverlay.cover_media_asset_id,
      );
      overlayBannerUrl = mediaUrl(pub, overlayCover);
    }
  }

  // Taxonomy
  const allTerms = flattenTaxonomy(profile.talent_profile_taxonomy ?? []);
  const grouped = groupByKind(locale, allTerms);

  const fitLabels = grouped["fit_label"] ?? [];
  const skills = grouped["skill"] ?? [];
  const industries = grouped["industry"] ?? [];
  const eventTypes = grouped["event_type"] ?? [];
  const tags = grouped["tag"] ?? [];

  // PR-A — read structured language + service-area rows. Falls back to the
  // legacy talent_profiles.languages / .destinations caches when the new
  // tables are empty (eg pre-backfill profiles).
  const [structuredLanguages, structuredServiceAreas] = pub
    ? await Promise.all([
        fetchTalentLanguages(pub, profile.id),
        fetchTalentServiceAreas(pub, profile.id),
      ])
    : [[] as TalentLanguageRow[], [] as TalentServiceAreaRow[]];

  // W7 — client→talent reviews. Published-only via public RLS; renders
  // nothing when the talent has no reviews. Safe on every surface.
  //
  // Testimonials are loaded alongside but kept SEPARATE — they are invited
  // quotes, never blended into ratingSummary or any STANDING signal.
  // Reviews are a PREMIUM capability, gated on the SURFACE tenant's entitlement
  // (a hub controls its own surfaces independently). On the platform host there
  // is no tenant to gate, so reviews show on Tulala's own marketplace surface.
  const reviewsEnabled =
    hostCtx.kind === "agency"
      ? await tenantReviewsEnabled(hostCtx.tenantId)
      : true;
  const [ratingSummary, talentReviews, testimonials] = reviewsEnabled
    ? await Promise.all([
        loadTalentRatingSummary(profile.id),
        loadTalentReviews(profile.id, 12),
        loadPublishedTestimonials(profile.id, 12),
      ])
    : [{ average: 0, count: 0 } as TalentRatingSummary, [] as TalentReview[], [] as Testimonial[]];

  // Languages come solely from the canonical talent_languages table now —
  // the legacy taxonomy `grouped["language"]` fallback was retired when the
  // taxonomy language terms were consolidated into talent_languages.
  const languages: string[] = structuredLanguages.map((r) => formatLanguageRow(r, locale));
  const homeBaseLabel: string | null = structuredServiceAreas.find(s => s.service_kind === "home_base")
    ?.locations?.display_name_i18n?.[pickLocale(locale, { en: "en", es: "es" })]
    ?? null;
  const travelToCities: string[] = structuredServiceAreas
    .filter(s => s.service_kind === "travel_to")
    .map(s => s.locations?.display_name_i18n?.[pickLocale(locale, { en: "en", es: "es" })])
    .filter((x): x is string => !!x);

  // Talent-selected manual featured media (showcase only, NOT verified). Only
  // items the talent flagged public_profile_enabled are returned.
  const featuredMediaItems: PublicFeaturedMediaItem[] = (
    await listPublicTalentIntegrationItems(profile.id)
  ).map((row) => ({
    id: row.id,
    provider: row.provider_key,
    externalItemId: row.external_item_id,
    title: row.title,
  }));

  // Sidebar section visibility (six taxonomy sections). Read behind the T2.2
  // field-engine seam: the `public_sidebar` flag selects the legacy
  // `field_definitions` base-guard row shape (`a`) or the canonical
  // `profile_field_definitions` row shape (`b`); BOTH route through the same
  // `isResolvedFieldVisibleInPublicProfileSidebar` resolver (whose visibility
  // decision was already canonical pre-T2.2), so the output is identical and
  // the flip is behaviour-neutral. A null public client → render all sections
  // (legacy fallback, preserved inside the reader). The `skills` section stays
  // hidden under both stores (canonical `skills` row is deprecated). A B-read
  // throw safe-falls-back to A. See read-source-public-sidebar.ts.
  //
  // Keyed on `overrideTenantId` — the SAME tenant whose overrides produced the
  // field VALUES rendered inside these sections — not on `hostCtx.tenantId`.
  // On the hub host `hostCtx.tenantId` is the HUB agency's own tenant, so the
  // section gates were being decided by a tenant that has no authority over
  // this talent while the values inside them came from the roster tenant: hub
  // and tenant host could show different sections for the same profile.
  const fieldVisibility = await readPublicSidebarVisibility(
    pub,
    overrideTenantId,
  );
  // ── New data: talent skills + availability ─────────────────────────────────
  const [resolvedSkills, publicAvailability, maxSiteLink] = pub
    ? await Promise.all([
        fetchPublicTalentSkills(pub, profile.id),
        fetchPublicAvailability(pub, profile.id),
        loadTalentMaxSiteLink(profile.id),
      ])
    : [[] as ResolvedSkill[], { nextAvailableDate: null, availableDaysInNext30: null, availabilityDots14d: null }, null];
  const maxSiteUrl = maxSiteLink?.url ?? null;

  // All talent type labels (primary first for DisciplineChips)
  const allTalentTypes: string[] = [];
  for (const row of (profile.talent_profile_taxonomy ?? [])) {
    const terms = row.taxonomy_terms
      ? Array.isArray(row.taxonomy_terms) ? row.taxonomy_terms : [row.taxonomy_terms]
      : [];
    for (const term of terms) {
      if (term.kind !== "talent_type") continue;
      if (!taxonomyVisibility.isTermVisible(term.id)) continue;
      const label = pickTaxonomyLabel(locale, term);
      if (row.is_primary) {
        // Insert primary at the front
        if (!allTalentTypes.includes(label)) allTalentTypes.unshift(label);
      } else {
        if (!allTalentTypes.includes(label)) allTalentTypes.push(label);
      }
    }
  }

  const canonicalName = displayName(profile as TalentProfile);
  const canonicalAboutText = publicBioForLocale(locale, [locale, "en"], {
    ...(profile.bio_i18n ?? {}),
    en: canonicalBioEn(bioEnFromI18n(profile.bio_i18n), profile.short_bio),
  });
  // PR-A — home_base from talent_service_areas takes precedence over the
  // legacy residence_city/location_id pair when populated. Falls through
  // to the existing residenceLabel() helper otherwise.
  const livesIn = homeBaseLabel ?? residenceLabel(locale, profile as TalentProfile);
  const originallyFrom = originLabel(locale, profile as TalentProfile);

  // Phase 5/6 M3 — compose final presentation. On the freelancer/hub/admin
  // surface the overlay is ignored regardless of what agencyOverlay holds
  // (Gate 3 enforced inside composeTalentPresentation). On the agency
  // surface, overlay fields substitute canonical ones when non-blank.
  const presentation = composeTalentPresentation({
    surface,
    canonical: {
      name: canonicalName,
      bio: canonicalAboutText,
      bannerUrl: canonicalBannerUrl,
    },
    overlay: agencyOverlay
      ? {
          display_headline: agencyOverlay.display_headline,
          local_bio: agencyOverlay.local_bio,
          local_tags: agencyOverlay.local_tags,
        }
      : null,
    overlayBannerUrl,
  });
  const name = presentation.name;
  const aboutText = presentation.bio;
  const bannerUrl = presentation.bannerUrl;
  // Phase 5/6 M5 — share URL must be the app-host canonical, so recipients
  // land on the global view even when sharing happens from an agency overlay.
  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const canonicalShareUrl =
    (await canonicalTalentUrl(profile.profile_code)) ??
    `${siteBase}/t/${encodeURIComponent(profile.profile_code)}`;
  const shareLabels = {
    heading: t("public.profile.share.heading"),
    copyLink: t("public.profile.share.copyLink"),
    copyLinkDone: t("public.profile.share.copyLinkDone"),
    whatsappTemplate: t("public.profile.share.whatsappTemplate"),
  };

  const detailsLabels = {
    measurements: pickLocale(locale, { en: "Basic info", es: "Información básica" }),
    logistics: pickLocale(locale, { en: "Logistics", es: "Logística" }),
    experience: pickLocale(locale, { en: "Experience", es: "Experiencia" }),
    details: t("public.profile.details"),
  };

  // ── Multi-workspace / hubs indicator ──────────────────────────────────
  // Other active + publicly-visible workspaces this talent appears on. On the
  // platform host "current" tenant is null → show all of them.
  const currentTenantId = hostCtx.kind === "agency" ? hostCtx.tenantId : null;
  const otherHubs = await fetchOtherHubsForTalent(
    pub,
    profile.id,
    profile.profile_code,
    currentTenantId,
  );
  const alsoOnLabel = pickLocale(locale, { en: "Also on", es: "También en" });

  const firstName = name.split(" ")[0] ?? name;

  // ── Platform-host marketing chrome props ──────────────────────────────
  // On the platform host (app / marketing) the profile is wrapped in the real
  // tulala.digital chrome (MarketingHeader + MarketingFooter). Agency hosts
  // keep their own white-label chrome (no chrome forced here).
  const platformChrome = isTalentProfilePlatformHost(hostCtx.kind);
  let marketingAccount: MarketingAccount | undefined;
  let marketingPathnameWithoutLocale = "/";
  if (platformChrome) {
    const h = await headers();
    const originalPath = h.get("x-impronta-original-pathname") ?? "/";
    marketingPathnameWithoutLocale = stripLocaleFromPathname(
      originalPath,
      FALLBACK_LANGUAGE_SETTINGS,
    ).pathnameWithoutLocale;
    const actor = await getCachedActorSession();
    if (actor.user) {
      const link = resolveAccountHref(true, actor.profile);
      const appUrl = getAppUrl();
      const displayName =
        actor.profile?.display_name?.trim() ||
        actor.user.email?.split("@")[0] ||
        "Account";
      const email = actor.user.email ?? "";
      const fallbackDashboardHref = link.href.startsWith("http")
        ? link.href
        : `${appUrl}${link.href}`;
      marketingAccount = actor.supabase
        ? await loadAccountMenuModel(actor.supabase, actor.user.id, {
            appUrl,
            displayName,
            email,
            appRole: actor.profile?.app_role,
            fallbackDashboardHref,
          })
        : {
            displayName,
            email,
            dashboardHref: fallbackDashboardHref,
            accountHref: fallbackDashboardHref,
            workspaces: [],
            talentPages: [],
            isTalent: false,
            globalHidden: false,
            talentLinks: null,
            talentUpgradeHref: null,
            isClient: false,
            clientTenants: [],
            clientLinks: null,
          };
    }
  }

  // Inquire button styling — forest primary on the marketing system.
  const inquireBtnClass =
    "inline-flex items-center justify-center rounded-full bg-[var(--plt-forest)] px-5 py-2.5 text-sm font-medium text-[var(--plt-forest-on)] shadow-[var(--plt-shadow-forest)] transition-[background,transform] hover:bg-[var(--plt-forest-deep)] hover:-translate-y-[1px]";
  const inquireBtnClassFull = `${inquireBtnClass} w-full`;

  // Phase G PR 1 — schema.org ProfilePage + Person JSON-LD. Emitted as a
  // <script type="application/ld+json"> inside the page tree so Google
  // can build rich-result cards + knowledge-panel hints for talent
  // profiles. Public data only — no contact info, no agency-private
  // financials. See lib/seo/talent-json-ld.ts.
  const jsonLd = buildTalentProfileJsonLd({
    canonicalUrl: canonicalShareUrl,
    name,
    givenName: profile.first_name ?? null,
    familyName: profile.last_name ?? null,
    // null when every category is hidden for this tenant — buildTalentProfileJsonLd
    // OMITS the jobTitle key rather than emitting an empty string.
    jobTitle:
      primaryTalentType(
        pickLocale(locale, { en: "en", es: "es" }),
        profile.talent_profile_taxonomy ?? [],
        taxonomyVisibility,
      ) ?? null,
    description: aboutText.trim() || null,
    imageUrl: bannerUrl ?? null,
    addressLocality: residenceLabel(pickLocale(locale, { en: "en", es: "es" }), profile as TalentProfile) ?? null,
    inLanguage: pickLocale(locale, { en: "en", es: "es" }),
    createdAt: (profile as { created_at?: string | null }).created_at ?? null,
    updatedAt: (profile as { updated_at?: string | null }).updated_at ?? null,
    affiliationName: hostCtx.kind === "agency" ? tenantBrand : null,
  });

  // ── Profile template dispatch ─────────────────────────────────────────
  // Per-tenant choice of profile-page template — the exact mirror of the Card
  // Design chooser. Card Design stores its pick in the
  // `template.directory-card-family` design token; the profile template uses
  // the sibling `template.profile-layout-family` token (both live in
  // agency_branding.theme_json, already loaded above as brandingTheme). A
  // `?template=noir|classic` query param overrides it for QA/preview. Any
  // value other than "noir" keeps the classic LightProfileLayout. Both
  // templates accept identical props.
  const profileTemplateOverride =
    sp.template === "noir" ||
    sp.template === "classic" ||
    sp.template === "lumen" ||
    sp.template === "atelier"
      ? sp.template
      : null;
  const profileLayoutFamily =
    typeof brandingTheme["template.profile-layout-family"] === "string"
      ? (brandingTheme["template.profile-layout-family"] as string)
      : "classic";
  const profileTemplateKey = profileTemplateOverride ?? profileLayoutFamily;
  const ProfileTemplate =
    profileTemplateKey === "noir"
      ? NoirProfileLayout
      : profileTemplateKey === "lumen"
        ? LumenProfileLayout
        : profileTemplateKey === "atelier"
          ? AtelierProfileLayout
          : LightProfileLayout;

  // Tenant theme → theme-adaptive templates (Lumen / Atelier). Project the
  // tenant's color design tokens to --token-color-* vars and derive a
  // light/dark register from background.mode. Classic + Noir ignore these.
  const profileThemeVars = designTokensToCssVars(
    Object.fromEntries(
      Object.entries(brandingTheme).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>,
  );
  const profileBackgroundMode =
    typeof brandingTheme["background.mode"] === "string"
      ? (brandingTheme["background.mode"] as string)
      : "";
  const profileThemeMode: "light" | "dark" = /noir|dark/i.test(
    profileBackgroundMode,
  )
    ? "dark"
    : "light";

  // Whitelabel (Agency/Network tier) hides the "Powered by Tulala" footer mark
  // so the profile page reads as fully the hosting agency's own. Only meaningful
  // on an agency-hosted profile; the platform directory keeps the mark.
  const profileWhitelabel = currentTenantId
    ? await loadTenantWhitelabel(currentTenantId)
    : false;

  // Exclusive representation. Deliberately NOT derived from `profileWhitelabel`
  // — that is a different tier set (agency|network|legacy) and a Studio tenant
  // is exclusive without being whitelabel. Mirrors the money path's predicate;
  // see lib/agency/talent-exclusivity.ts.
  const profileIsExclusive = await isTalentExclusiveToTenant(
    profile.id,
    currentTenantId,
  );

  const profileBody = (
    <>
      <DiscoveryStateBridge savedIds={initialSavedIds} favoriteIds={initialFavoriteIds} />

      {/* ── Profile body — template chosen per-tenant (classic | noir) ── */}
      <ProfileTemplate
        name={name}
        firstName={firstName}
        profileCode={profile.profile_code}
        profileImageUrl={profileImageUrl}
        bannerUrl={bannerUrl}
        isFeatured={Boolean(profile.is_featured)}
        aboutText={aboutText}
        allTalentTypes={allTalentTypes}
        primaryType={primaryTalentType(
          locale,
          profile.talent_profile_taxonomy ?? [],
          taxonomyVisibility,
        )}
        livesIn={livesIn}
        originallyFrom={originallyFrom}
        languages={languages}
        locale={locale}
        talentPlanKey={profile.talent_plan_key ?? "talent_basic"}
        whitelabel={profileWhitelabel}
        maxSiteUrl={maxSiteUrl}
        galleryItems={galleryItems}
        watermarkPreset={watermarkPreset}
        watermarkLogoUrl={watermarkLogoUrl}
        featuredMediaItems={featuredMediaItems}
        resolvedSkills={resolvedSkills}
        availableDaysInNext30={publicAvailability.availableDaysInNext30}
        availabilityDots14d={publicAvailability.availabilityDots14d}
        nextAvailableDate={publicAvailability.nextAvailableDate}
        packageTeasers={(() => {
          const raw = profile.package_teasers;
          if (!Array.isArray(raw)) return [];
          return (raw as unknown[]).flatMap((p) => {
            if (typeof p !== "object" || p === null) return [];
            const label = (p as { label?: unknown }).label;
            if (typeof label !== "string" || !label.trim()) return [];
            const detail = (p as { detail?: unknown }).detail;
            return [{ label: label.trim(), detail: typeof detail === "string" ? detail : null }];
          });
        })()}
        serviceAreas={structuredServiceAreas}
        startingFrom={profile.starting_from ?? null}
        bookingNote={profile.booking_note ?? null}
        serviceMenuItems={serviceMenuItems}
        storefrontOfferings={storefrontOfferings}
        disciplineLabels={disciplineLabels}
        fitLabels={fitLabels}
        skills={skills}
        industries={industries}
        eventTypes={eventTypes}
        tags={tags}
        fieldVisibility={fieldVisibility}
        basicInfoDetailRows={basicInfoDetailRows}
        otherDetailRows={otherDetailRows}
        ratingSummary={ratingSummary}
        talentReviews={talentReviews}
        testimonials={testimonials}
        heroRating={
          reviewsEnabled && meetsCredibilityFloor(ratingSummary.count)
            ? { ratingAvg: ratingSummary.average, ratingCount: ratingSummary.count }
            : undefined
        }
        agencyName={tenantBrand}
        agencyDisplayName={tenantBrand}
        isExclusive={profileIsExclusive}
        similarTalent={similarTalent}
        ui={ui}
        t={t}
        detailsLabels={detailsLabels}
        canonicalShareUrl={canonicalShareUrl}
        profileSourcePage={profileSourcePage}
        portalInquiryHref={portalInquiryHref}
        resolvedPreview={resolvedPreview}
        showFooter={!platformChrome}
        themeMode={profileThemeMode}
        themeVars={profileThemeVars}
        hostCtxKind={hostCtx.kind as "agency" | "app" | "hub" | "platform"}
        tenantId={hostCtx.kind === "agency" ? hostCtx.tenantId : ""}
        tenantSlug={hostCtx.kind === "agency" ? hostCtx.tenantSlug : ""}
        hubsIndicator={
          otherHubs.length > 0 ? (
            <ProfileHubsIndicator hubs={otherHubs} label={alsoOnLabel} />
          ) : null
        }
        inquireButtonHeader={
          <>
            {instantBook.eligible && instantBook.fixedRateDollars != null ? (
              <TalentProfileInstantBookButton
                talentId={profile.id}
                displayName={name}
                tenantId={hostCtx.kind === "agency" ? hostCtx.tenantId : ""}
                sourcePage={profileSourcePage}
                fixedRateDollars={instantBook.fixedRateDollars}
                currencyCode={instantBook.currencyCode}
                locale={locale}
                className={inquireBtnClass}
              />
            ) : null}
            <TalentProfileInquireButton
              talentId={profile.id}
              talentProfileCode={profile.profile_code}
              displayName={name}
              tenantId={hostCtx.kind === "agency" ? hostCtx.tenantId : ""}
              tenantSlug={hostCtx.kind === "agency" ? hostCtx.tenantSlug : ""}
              agencyName={tenantBrand ?? "the agency"}
              sourcePage={profileSourcePage}
              locale={locale}
              className={inquireBtnClass}
            />
          </>
        }
        inquireButtonSidebar={
          <>
            {instantBook.eligible && instantBook.fixedRateDollars != null ? (
              <TalentProfileInstantBookButton
                talentId={profile.id}
                displayName={name}
                tenantId={hostCtx.kind === "agency" ? hostCtx.tenantId : ""}
                sourcePage={profileSourcePage}
                fixedRateDollars={instantBook.fixedRateDollars}
                currencyCode={instantBook.currencyCode}
                locale={locale}
                className={inquireBtnClassFull}
              />
            ) : null}
            <TalentProfileInquireButton
              talentId={profile.id}
              talentProfileCode={profile.profile_code}
              displayName={name}
              tenantId={hostCtx.kind === "agency" ? hostCtx.tenantId : ""}
              tenantSlug={hostCtx.kind === "agency" ? hostCtx.tenantSlug : ""}
              agencyName={tenantBrand ?? "the agency"}
              sourcePage={profileSourcePage}
              locale={locale}
              className={inquireBtnClassFull}
            />
          </>
        }
        inquireButtonFooter={
          <>
            {instantBook.eligible && instantBook.fixedRateDollars != null ? (
              <TalentProfileInstantBookButton
                talentId={profile.id}
                displayName={name}
                tenantId={hostCtx.kind === "agency" ? hostCtx.tenantId : ""}
                sourcePage={profileSourcePage}
                fixedRateDollars={instantBook.fixedRateDollars}
                currencyCode={instantBook.currencyCode}
                locale={locale}
                className={inquireBtnClass}
              />
            ) : null}
            <TalentProfileInquireButton
              talentId={profile.id}
              talentProfileCode={profile.profile_code}
              displayName={name}
              tenantId={hostCtx.kind === "agency" ? hostCtx.tenantId : ""}
              tenantSlug={hostCtx.kind === "agency" ? hostCtx.tenantSlug : ""}
              agencyName={tenantBrand ?? "the agency"}
              sourcePage={profileSourcePage}
              locale={locale}
              className={inquireBtnClass}
            />
          </>
        }
        shareMenuHeader={
          <ProfileShareRow
            talentId={profile.id}
            profileCode={profile.profile_code}
            displayName={name}
            canonicalUrl={canonicalShareUrl}
            sourcePage={profileSourcePage}
            labels={shareLabels}
            variant="row"
          />
        }
        shareMenuSidebar={
          <ProfileShareRow
            talentId={profile.id}
            profileCode={profile.profile_code}
            displayName={name}
            canonicalUrl={canonicalShareUrl}
            sourcePage={profileSourcePage}
            labels={shareLabels}
            variant="compact"
          />
        }
        discoveryCta={null}
        discoveryCta2={
          <ProfileDiscoveryCta
            talentId={profile.id}
            profileCode={profile.profile_code}
            displayName={name}
            sourcePage={profileSourcePage}
            initialSaved={initialSavedIds.includes(profile.id)}
            portalInquiryHref={portalInquiryHref}
            mode="sidebar"
            profileCta={ui.profileCta}
            inquiry={ui.inquiry}
          />
        }
        discoveryCta3={
          <ProfileDiscoveryCta
            talentId={profile.id}
            profileCode={profile.profile_code}
            displayName={name}
            sourcePage={profileSourcePage}
            initialSaved={initialSavedIds.includes(profile.id)}
            portalInquiryHref={portalInquiryHref}
            mode="footer"
            profileCta={ui.profileCta}
            inquiry={ui.inquiry}
          />
        }
      />

      {/* Conversational-inquiry launcher — floating brand-skinned
          "Message {Name}" chat. Sibling of the LightProfileLayout's inquire
          CTA; renders only on the agency surface AND when the tenant has guest
          chat enabled + shown on talent profiles (tenant_guest_chat_settings).
          Self-positions fixed bottom-right, so DOM placement here is logical. */}
      {offerJsonLd && offerJsonLd.itemListElement.length > 0 ? (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(offerJsonLd) }}
        />
      ) : null}
      {/* Storefront direct booking — consumes "tulala:offering-instant" from a
          card's Book now / Buy click; agency surface only (needs a tenant). */}
      {hostCtx.kind === "agency" && (
        <OfferingInstantMount
          tenantId={hostCtx.tenantId}
          sourcePage={`/t/${profile.profile_code}`}
          locale={locale}
        />
      )}
      {!isModal && guestChatSettings.enabled && guestChatSettings.showOnTalent && (
        <TalentProfileChatLauncherMount
          talentProfileId={profile.id}
          talentProfileCode={profile.profile_code}
          talentDisplayName={name}
          tenantSlug={chatTenantSlug}
          tenantId={chatTenantId}
          agencyName={chatBrandName}
          accentColor={chatAccentColor}
          logoUrl={watermarkLogoUrl}
          sourcePage={profileSourcePage}
          greeting={guestChatSettings.greeting}
          locale={locale}
          backgroundMode={chatBackgroundMode}
        />
      )}
    </>
  );

  if (isModal) {
    // Modal shell — no page chrome, no JSON-LD (the canonical page owns SEO),
    // but the SAME analytics mount: view_site_page + view_talent_profile fire
    // with the identical payload a full page visit produces. The inquiry
    // sheet + favorites modal are mounted locally because the @modal slot
    // renders outside the directory page's provider tree.
    return (
      <PublicDiscoveryStateProvider
        initialSavedIds={initialSavedIds}
        initialFavoriteIds={initialFavoriteIds}
      >
        <DirectoryInquiryModalProvider>
          <FavoritesDrawerProvider>
            <SitePageViewAnalytics
              surface="talent-profile"
              tenantId={chatTenantId}
              talentId={profile.id}
              pageSlug={profileSourcePage}
              locale={locale}
              viewContext="modal"
            />
            {profileBody}
            <DirectoryInquirySheet ui={ui} locale={locale} />
            <FavoritesModal
              signupHref="/login"
              locale={locale}
              initialFavoriteIdsCount={initialFavoriteIds.length}
            />
          </FavoritesDrawerProvider>
        </DirectoryInquiryModalProvider>
      </PublicDiscoveryStateProvider>
    );
  }

  return (
    <PublicDiscoveryStateProvider
      initialSavedIds={initialSavedIds}
      initialFavoriteIds={initialFavoriteIds}
    >
      <DirectoryInquiryModalProvider>
        <FavoritesDrawerProvider>
          {jsonLd ? (
            <script
              type="application/ld+json"
              // Pre-stringified — React must NOT escape JSON-LD content.
              dangerouslySetInnerHTML={{ __html: jsonLdToString(jsonLd) }}
            />
          ) : null}
          <PublicFlashHost dismissAria={ui.flash.dismissAria} />
          {/* A11Y-2 — skip link is first focusable element, before all navigation. */}
          <SkipToContent />
          {/* ANALYTICS-2 — unified first-party page-view; talent-profile also
              emits the legacy view_talent_profile event (distinct name) so the
              inquiry-funnel loaders keep counting. tenantId = the resolved
              managing tenant (agency host → that tenant; platform → hub). */}
          <SitePageViewAnalytics
            surface="talent-profile"
            tenantId={chatTenantId}
            talentId={profile.id}
            pageSlug={profileSourcePage}
            locale={locale}
            viewContext="page"
          />

          {platformChrome ? (
            // PLATFORM HOST — wrap in the real tulala.digital marketing chrome
            // so the page reads as a native part of the marketing site.
            <div
              data-platform-surface="marketing"
              className="flex min-h-screen flex-col"
              style={{ background: "var(--plt-bg)", color: "var(--plt-ink)" }}
            >
              <MarketingHeader
                locale={locale}
                pathnameWithoutLocale={marketingPathnameWithoutLocale}
                account={marketingAccount}
                signOutAction={signOut}
              />
              {/* id="main-content" lives inside LightProfileLayout (<main>) */}
              <div className="flex-1 pt-[var(--plt-header-h,64px)] sm:pt-[72px]">
                {profileBody}
              </div>
              <MarketingFooter />
            </div>
          ) : (
            // AGENCY HOST — keep the white-label agency chrome: the platform
            // PublicHeader (tenant-branded) on top + the in-layout CMS footer.
            // Do NOT force tulala marketing chrome onto a white-label domain.
            <>
              <PublicHeader />
              {profileBody}
            </>
          )}

          <DirectoryInquirySheet ui={ui} locale={locale} />
          <FavoritesModal
            signupHref="/login"
            locale={locale}
            initialFavoriteIdsCount={initialFavoriteIds.length}
          />
        </FavoritesDrawerProvider>
      </DirectoryInquiryModalProvider>
    </PublicDiscoveryStateProvider>
  );
}

