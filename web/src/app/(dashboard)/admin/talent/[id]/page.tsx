import { notFound } from "next/navigation";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/fields/types";
import { filterOutReservedFieldDefinitions } from "@/lib/field-canonical";
import type { CitySuggestion, CountrySuggestion } from "@/lib/location-autocomplete";
import {
  buildScalarValuesByDefinitionId,
  countTalentFacingScalarCompletion,
} from "@/lib/profile-completion";
import { extractPrimaryRoleTerm, type ProfileTaxonomyRow } from "@/lib/taxonomy/engine";
import { AdminTalentCockpitClient } from "./admin-talent-cockpit-client";
import { AdminTalentAiSearchDebug } from "./admin-talent-ai-search-debug";
import { AdminTalentOverlaySection } from "./admin-talent-overlay-section";
import { AdminTalentEditorialForm } from "./admin-talent-editorial-form";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { getTenantScope } from "@/lib/saas/scope";

export default async function AdminTalentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getCachedServerSupabase();

  if (!supabase) {
    return (
      <p className="text-sm text-muted-foreground">Supabase not configured.</p>
    );
  }

  const { data: profile, error } = await supabase
    .from("talent_profiles")
    .select(
      `
      id,
      user_id,
      profile_code,
      display_name,
      first_name,
      last_name,
      short_bio,
      bio_en,
      bio_es,
      bio_es_draft,
      bio_es_status,
      bio_en_draft,
      bio_en_status,
      bio_en_updated_at,
      bio_es_updated_at,
      phone,
      gender,
      date_of_birth,
      origin_country_id,
      origin_city_id,
      location_id,
      residence_country_id,
      residence_city_id,
      workflow_status,
      visibility,
      is_featured,
      featured_level,
      featured_position,
      membership_tier,
      profile_completeness_score,
      created_at,
      updated_at,
      deleted_at,
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
      social_links,
      embedded_media,
      profiles(display_name, account_status, app_role)
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logServerError("admin/talent/[id]/profile", error);
    return (
      <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>
    );
  }
  if (!profile) notFound();

  const currentLocationIds = [
    (profile as { residence_city_id?: string | null }).residence_city_id ??
      (profile as { location_id?: string | null }).location_id ??
      null,
    (profile as { origin_city_id?: string | null }).origin_city_id ?? null,
  ].filter(Boolean) as string[];

  const { data: currentLocations } =
    currentLocationIds.length > 0
      ? await supabase
          .from("locations")
          .select("id, city_slug, display_name_en, display_name_es, latitude, longitude, countries!locations_country_id_fkey(id, iso2, name_en, name_es)")
          .in("id", currentLocationIds)
      : { data: [] as Array<{
          id: string;
          city_slug: string;
          display_name_en: string;
          display_name_es: string | null;
          latitude: number | null;
          longitude: number | null;
          countries: { id: string; iso2: string; name_en: string; name_es: string | null } | { id: string; iso2: string; name_en: string; name_es: string | null }[] | null;
        }> };

  const locationSelections = new Map(
    ((currentLocations ?? []) as Array<{
      id: string;
      city_slug: string;
      display_name_en: string;
      display_name_es: string | null;
      latitude: number | null;
      longitude: number | null;
      countries: { id: string; iso2: string; name_en: string; name_es: string | null } | { id: string; iso2: string; name_en: string; name_es: string | null }[] | null;
    }>).map((row) => {
      const country = Array.isArray(row.countries) ? row.countries[0] ?? null : row.countries;
      return [
        row.id,
        {
          country: country
            ? ({
                id: country.id,
                iso2: country.iso2,
                name_en: country.name_en,
                name_es: country.name_es,
              } satisfies CountrySuggestion)
            : null,
          city: {
            id: row.id,
            slug: row.city_slug,
            name_en: row.display_name_en,
            name_es: row.display_name_es,
            lat: row.latitude,
            lng: row.longitude,
            country_iso2: country?.iso2 ?? "",
            country_name_en: country?.name_en ?? "",
            country_name_es: country?.name_es ?? null,
          } satisfies CitySuggestion,
        },
      ] as const;
    }),
  );

  const [{ data: fieldGroups }, { data: fieldDefs }, { data: talentScalarDefs }, { data: fieldValues }] =
    await Promise.all([
      supabase
        .from("field_groups")
        .select("id, slug, name_en, name_es, sort_order, archived_at")
        .is("archived_at", null)
        .order("sort_order"),
      supabase
        .from("field_definitions")
        .select(
          "id, field_group_id, key, label_en, label_es, help_en, help_es, value_type, required_level, public_visible, internal_only, card_visible, profile_visible, filterable, searchable, ai_visible, editable_by_talent, editable_by_staff, editable_by_admin, active, sort_order, taxonomy_kind, config, archived_at",
        )
        .eq("active", true)
        .is("archived_at", null)
        .eq("editable_by_staff", true)
        .order("field_group_id")
        .order("sort_order"),
      supabase
        .from("field_definitions")
        .select("id, value_type, required_level")
        .eq("active", true)
        .is("archived_at", null)
        .eq("editable_by_talent", true)
        .eq("profile_visible", true)
        .eq("internal_only", false)
        .in("value_type", ["text", "textarea", "number", "boolean", "date"]),
      supabase
        .from("field_values")
        .select("field_definition_id, value_text, value_number, value_boolean, value_date")
        .eq("talent_profile_id", id),
    ]);

  const groups = (fieldGroups ?? []) as FieldGroupRow[];
  const defs = filterOutReservedFieldDefinitions(
    ((fieldDefs ?? []) as FieldDefinitionRow[]).filter((d) => d.value_type !== "location"),
  );
  const editableByGroup = new Map<string, FieldDefinitionRow[]>();
  for (const d of defs) {
    const gid = d.field_group_id ?? "ungrouped";
    const arr = editableByGroup.get(gid) ?? [];
    arr.push(d);
    editableByGroup.set(gid, arr);
  }

  /* Taxonomy */
  const [allTermsRes, assignedRes, mediaRes, submissionHistoryRes, consentRes, workflowEventsRes] = await Promise.all([
    supabase
      .from("taxonomy_terms")
      .select("id, kind, slug, name_en")
      .is("archived_at", null)
      .order("kind")
      .order("sort_order"),
    supabase
      .from("talent_profile_taxonomy")
      .select("taxonomy_term_id")
      .eq("talent_profile_id", id),
    supabase
      .from("media_assets")
      .select("id, variant_kind, approval_state, sort_order, created_at")
      .eq("owner_talent_profile_id", id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(20),
    supabase
      .from("talent_submission_history")
      .select(
        "id, submitted_at, workflow_state_before, workflow_state_after, submission_kind, accepted_terms_version",
      )
      .eq("talent_profile_id", id)
      .order("submitted_at", { ascending: false })
      .limit(6),
    supabase
      .from("talent_submission_consents")
      .select("id, accepted_at, terms_version, submission_context")
      .eq("talent_profile_id", id)
      .order("accepted_at", { ascending: false })
      .limit(6),
    supabase
      .from("talent_workflow_events")
      .select("id, created_at, event_type, payload")
      .eq("talent_profile_id", id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const allTerms: Array<{ id: string; kind: string; name_en: string; slug: string }> =
    allTermsRes.data ?? [];
  const assignedIds: string[] = (assignedRes.data ?? []).map(
    (r: { taxonomy_term_id: string }) => r.taxonomy_term_id,
  );
  const media = mediaRes.data ?? [];
  const submissionHistory = submissionHistoryRes.data ?? [];
  const consentHistory = consentRes.data ?? [];
  const workflowEvents = workflowEventsRes.data ?? [];

  const taxonomyCount = assignedIds.length;
  const taxonomyRows = (await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id, is_primary, taxonomy_terms(kind)")
    .eq("talent_profile_id", id)).data ?? [];
  const typedTaxonomyRows = taxonomyRows as {
    taxonomy_term_id: string;
    is_primary: boolean;
    taxonomy_terms: { kind: string } | { kind: string }[] | null;
  }[];
  // Engine-driven check (v2-aware).
  const hasPrimaryTalentType =
    extractPrimaryRoleTerm(typedTaxonomyRows as unknown as ProfileTaxonomyRow[]) !== null;

  const mediaCount = media.length;
  const valueRows = (fieldValues ?? []) as Array<{
    field_definition_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_date: string | null;
  }>;
  const valuesById = buildScalarValuesByDefinitionId(valueRows);
  const talentScalarForCompletion = (talentScalarDefs ?? []) as Array<{
    id: string;
    value_type: FieldDefinitionRow["value_type"];
    required_level: FieldDefinitionRow["required_level"];
  }>;
  const {
    requiredScalarTotal: requiredScalarTotalTalent,
    requiredScalarComplete: requiredScalarCompleteTalent,
    recommendedScalarTotal: recommendedScalarTotalTalent,
    recommendedScalarComplete: recommendedScalarCompleteTalent,
  } = countTalentFacingScalarCompletion({
    definitions: talentScalarForCompletion,
    valuesByFieldId: valuesById,
  });

  type TalentProfileSelect = typeof profile;
  if (!profile) notFound();

  const openAiBioAvailable = await isResolvedAiChatConfigured();

  // Phase 5/6 M3 — agency overlay (tenant-scoped presentation editor).
  // Only surfaced when an active tenant scope resolves. RLS + the action
  // guard enforce the tenant boundary; this read is just for the form's
  // initial values.
  const tenantScope = await getTenantScope();
  let overlayInitial: Parameters<typeof AdminTalentOverlaySection>[0]["initial"] = null;
  let rosterOnTenant = false;
  let tenantName = "Agency overlay";
  if (tenantScope) {
    const [{ data: overlayRow }, { data: rosterRow }, { data: tenantRow }] =
      await Promise.all([
        supabase
          .from("agency_talent_overlays")
          .select("display_headline, local_bio, cover_media_asset_id, local_tags")
          .eq("tenant_id", tenantScope.tenantId)
          .eq("talent_profile_id", id)
          .maybeSingle(),
        supabase
          .from("agency_talent_roster")
          .select("status")
          .eq("tenant_id", tenantScope.tenantId)
          .eq("talent_profile_id", id)
          .maybeSingle(),
        supabase
          .from("agencies")
          .select("display_name")
          .eq("id", tenantScope.tenantId)
          .maybeSingle(),
      ]);
    rosterOnTenant = Boolean(rosterRow);
    if (tenantRow?.display_name) tenantName = tenantRow.display_name as string;
    if (overlayRow) {
      overlayInitial = {
        display_headline: (overlayRow.display_headline as string | null) ?? null,
        local_bio: (overlayRow.local_bio as string | null) ?? null,
        cover_media_asset_id:
          (overlayRow.cover_media_asset_id as string | null) ?? null,
        local_tags: Array.isArray(overlayRow.local_tags)
          ? (overlayRow.local_tags as string[])
          : [],
      };
    }
  }

  return (
    <>
    <AdminTalentCockpitClient
      id={id}
      openAiBioAvailable={openAiBioAvailable}
      profile={profile as TalentProfileSelect}
      initialResidence={
        locationSelections.get(
          (profile as { residence_city_id?: string | null }).residence_city_id ??
            (profile as { location_id?: string | null }).location_id ??
            "",
        ) ?? { country: null, city: null }
      }
      initialOrigin={
        locationSelections.get(
          (profile as { origin_city_id?: string | null }).origin_city_id ?? "",
        ) ?? { country: null, city: null }
      }
      allTerms={allTerms}
      assignedIds={assignedIds}
      media={media as unknown as Parameters<typeof AdminTalentCockpitClient>[0]["media"]}
      submissionHistory={
        submissionHistory as unknown as Parameters<typeof AdminTalentCockpitClient>[0]["submissionHistory"]
      }
      consentHistory={consentHistory as unknown as Parameters<typeof AdminTalentCockpitClient>[0]["consentHistory"]}
      workflowEvents={workflowEvents as unknown as Parameters<typeof AdminTalentCockpitClient>[0]["workflowEvents"]}
      fieldCatalog={{
        groups,
        editableByGroup,
        defs,
        requiredScalarTotal: requiredScalarTotalTalent,
        requiredScalarComplete: requiredScalarCompleteTalent,
        recommendedScalarTotal: recommendedScalarTotalTalent,
        recommendedScalarComplete: recommendedScalarCompleteTalent,
        hasPrimaryTalentType,
        taxonomyCount,
        mediaCount,
      }}
      fieldValues={fieldValues as unknown as Parameters<typeof AdminTalentCockpitClient>[0]["fieldValues"]}
    />
    {tenantScope ? (
      <AdminTalentOverlaySection
        talentProfileId={id}
        initial={overlayInitial}
        tenantName={tenantName}
        rosterOnTenant={rosterOnTenant}
      />
    ) : null}
    <section className="rounded-lg border border-border/60 bg-muted/10 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Editorial fields (M8)
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Drives editorial profile variants, directory Destination-Ready
          ribbon, and <code>featured_talent</code> source-mode filters.
        </p>
      </div>
      <AdminTalentEditorialForm
        talentId={id}
        initial={{
          intro_italic:
            (profile as { intro_italic?: string | null }).intro_italic ?? null,
          event_styles:
            (profile as { event_styles?: string[] | null }).event_styles ?? null,
          destinations:
            (profile as { destinations?: string[] | null }).destinations ?? null,
          languages:
            (profile as { languages?: string[] | null }).languages ?? null,
          travels_globally:
            (profile as { travels_globally?: boolean | null }).travels_globally ??
            null,
          team_size:
            (profile as { team_size?: string | null }).team_size ?? null,
          lead_time_weeks:
            (profile as { lead_time_weeks?: string | null }).lead_time_weeks ??
            null,
          starting_from:
            (profile as { starting_from?: string | null }).starting_from ?? null,
          booking_note:
            (profile as { booking_note?: string | null }).booking_note ?? null,
          service_category_slug:
            (profile as { service_category_slug?: string | null })
              .service_category_slug ?? null,
          package_teasers:
            (profile as { package_teasers?: unknown }).package_teasers ?? null,
          social_links:
            (profile as { social_links?: unknown }).social_links ?? null,
          embedded_media:
            (profile as { embedded_media?: unknown }).embedded_media ?? null,
        }}
      />
    </section>
    <AdminTalentAiSearchDebug talentId={id} />
    </>
  );
}
