import { cache } from "react";
import { getPublicSettings } from "@/lib/public-settings";
import { logDashboardLoaderFailure } from "@/lib/dashboard-loader-diagnostics";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";
import { createClient } from "@/lib/supabase/server";

type DirectorySearchContext = {
  q: string | null;
  location_slug: string | null;
  sort: string | null;
  taxonomy_term_ids: string[];
};

function readDirectoryContext(interpreted: Record<string, unknown> | null): DirectorySearchContext | null {
  if (!interpreted || typeof interpreted !== "object") return null;
  const dir = (interpreted as Record<string, unknown>).directory_search;
  if (!dir || typeof dir !== "object") return null;
  const d = dir as Record<string, unknown>;
  return {
    q: typeof d.q === "string" ? d.q : null,
    location_slug: typeof d.location_slug === "string" ? d.location_slug : null,
    sort: typeof d.sort === "string" ? d.sort : null,
    taxonomy_term_ids: Array.isArray(d.taxonomy_term_ids)
      ? d.taxonomy_term_ids.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export type ClientInquiryDetailTalentRow = {
  talent_profile_id: string;
  talent_profiles: {
    id: string;
    profile_code: string;
    display_name: string | null;
  } | null;
};

export type ClientInquiryDetailRow = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  guest_session_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  company: string | null;
  event_type_id: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  message: string | null;
  raw_ai_query: string | null;
  interpreted_query: Record<string, unknown> | null;
  source_page: string | null;
  inquiry_talent: ClientInquiryDetailTalentRow[] | null;
};

export type ClientInquiryDetailLoadResult =
  | {
      ok: true;
      data: {
        inquiry: ClientInquiryDetailRow;
        eventTypeName: string | null;
        resolvedDirectoryContext: {
          q: string | null;
          sort: string | null;
          locationSlug: string | null;
          locationLabel: string | null;
          filtersByKind: Record<
            "talent_type" | "tag" | "skill" | "industry" | "fit_label" | "location",
            { id: string; label: string }[]
          >;
          unresolvedTaxonomyIds: string[];
        } | null;
        agencyWhatsAppNumber: string | null;
        agencyContactEmail: string | null;
      };
    }
  | { ok: false; reason: "no_supabase" | "no_user" | "not_found" };

export const loadClientInquiryDetail = cache(
  async (inquiryId: string): Promise<ClientInquiryDetailLoadResult> => {
    const supabase = await createClient();
    if (!supabase) return { ok: false, reason: "no_supabase" };

    const identity = await resolveDashboardIdentity();
    if (!identity) return { ok: false, reason: "no_user" };
    const subjectId = subjectUserId(identity);

    try {
      const { data: inquiry, error } = await supabase
        .from("inquiries")
        .select(
          `
          id,
          status,
          created_at,
          updated_at,
          guest_session_id,
          contact_name,
          contact_email,
          contact_phone,
          company,
          event_type_id,
          event_date,
          event_location,
          quantity,
          message,
          raw_ai_query,
          interpreted_query,
          source_page,
          inquiry_talent (
            talent_profile_id,
            talent_profiles (
              id,
              profile_code,
              display_name
            )
          )
        `,
        )
        .eq("id", inquiryId)
        .eq("client_user_id", subjectId)
        .maybeSingle();

      if (error || !inquiry) return { ok: false, reason: "not_found" };

      const settings = await getPublicSettings();

      const { data: eventTypeRow } = inquiry.event_type_id
        ? await supabase
            .from("taxonomy_terms")
            .select("name_en")
            .eq("id", inquiry.event_type_id)
            .maybeSingle()
        : { data: null as { name_en: string } | null };

      const directory = readDirectoryContext(inquiry.interpreted_query as Record<string, unknown> | null);
      const taxonomyIds = Array.from(
        new Set((directory?.taxonomy_term_ids ?? []).filter((id) => typeof id === "string" && isUuid(id))),
      );

      type TaxonomyRow = { id: string; kind: string; name_en: string; slug: string };

      const [{ data: taxonomyRows }, { data: locationRow }] = await Promise.all([
        taxonomyIds.length
          ? supabase
              .from("taxonomy_terms")
              .select("id, kind, name_en, slug")
              .in("id", taxonomyIds)
              .is("archived_at", null)
          : Promise.resolve({ data: [] as TaxonomyRow[] }),
        directory?.location_slug
          ? supabase
              .from("locations")
              .select("display_name_en, country_code, city_slug")
              .eq("city_slug", directory.location_slug)
              .is("archived_at", null)
              .maybeSingle()
          : Promise.resolve({ data: null as null | { display_name_en: string; country_code: string; city_slug: string } }),
      ]);

      const taxonomyMap = new Map(
        ((taxonomyRows ?? []) as TaxonomyRow[]).map((row) => [row.id, row] as const),
      );
      const unresolvedTaxonomyIds = taxonomyIds.filter((id) => !taxonomyMap.has(id));

      const filtersByKind: Record<
        "talent_type" | "tag" | "skill" | "industry" | "fit_label" | "location",
        { id: string; label: string }[]
      > = {
        talent_type: [],
        tag: [],
        skill: [],
        industry: [],
        fit_label: [],
        location: [],
      };

      for (const id of taxonomyIds) {
        const row = taxonomyMap.get(id);
        if (!row) continue;
        const label = row.name_en?.trim() || row.slug;
        if (row.kind === "talent_type") filtersByKind.talent_type.push({ id, label });
        if (row.kind === "tag") filtersByKind.tag.push({ id, label });
        if (row.kind === "skill") filtersByKind.skill.push({ id, label });
        if (row.kind === "industry") filtersByKind.industry.push({ id, label });
        if (row.kind === "fit_label") filtersByKind.fit_label.push({ id, label });
      }

      const locationLabel = locationRow?.display_name_en?.trim() || null;
      if (directory?.location_slug && locationLabel) {
        filtersByKind.location.push({ id: directory.location_slug, label: locationLabel });
      }

      return {
        ok: true,
        data: {
          inquiry: inquiry as unknown as ClientInquiryDetailRow,
          eventTypeName: eventTypeRow?.name_en ?? null,
          resolvedDirectoryContext: directory
            ? {
                q: directory.q,
                sort: directory.sort,
                locationSlug: directory.location_slug,
                locationLabel,
                filtersByKind,
                unresolvedTaxonomyIds,
              }
            : null,
          agencyWhatsAppNumber: settings.agencyWhatsAppNumber,
          agencyContactEmail: settings.contactEmail,
        },
      };
    } catch (err) {
      await logDashboardLoaderFailure("loadClientInquiryDetail", err, {
        inquiryId,
        userId: subjectId,
      });
      throw err;
    }
  },
);

