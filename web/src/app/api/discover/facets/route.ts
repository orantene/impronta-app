// D2 — Discover facets endpoint.
//
// GET /api/discover/facets
//   → 200 { countries: FacetCount[], categories: FacetCountWithLabel[] }
//   → 401 unauthenticated
//
// Returns counts per filter value across the discoverable catalog. Powers
// the filter chip UI on the buyer-side Discover surface — admins/clients
// see counts like "Italy (12)" or "Fashion model (15)" before applying.
//
// v1 returns unfiltered facets (counts across the whole discoverable
// catalog). v2 will accept the active filter set and return
// context-filtered facets so "Country: Italy" shows category counts only
// among Italian talents.
//
// See: web/docs/discover-and-unified-inquiry-2026-05-14.md §7.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export type FacetCount = { value: string; count: number };
export type FacetCountWithLabel = { value: string; label: string; count: number };

export async function GET() {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ countries: [], categories: [] });
  }

  const { data, error } = await admin
    .from("talent_profiles")
    .select(
      `
      home_country_text,
      talent_profile_taxonomy (
        relationship_type,
        taxonomy_terms ( name_en, slug )
      )
      `,
    )
    .eq("is_discoverable", true)
    .in("workflow_status", ["approved", "published"]);

  if (error) {
    logServerError("api.discover.facets", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  type Row = {
    home_country_text: string | null;
    talent_profile_taxonomy: Array<{
      relationship_type: string | null;
      taxonomy_terms: { name_en: string | null; slug: string | null } | null;
    }> | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  const countryCounts = new Map<string, number>();
  const categoryCounts = new Map<string, { label: string; count: number }>();

  for (const row of rows) {
    const country = row.home_country_text?.trim();
    if (country) {
      countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    }
    const tax = row.talent_profile_taxonomy ?? [];
    const primary = tax.find((t) => t.relationship_type === "primary_role");
    const slug = primary?.taxonomy_terms?.slug?.trim();
    const label = primary?.taxonomy_terms?.name_en?.trim();
    if (slug && label) {
      const existing = categoryCounts.get(slug);
      categoryCounts.set(slug, {
        label: existing?.label ?? label,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  const countries: FacetCount[] = Array.from(countryCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const categories: FacetCountWithLabel[] = Array.from(categoryCounts.entries())
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return NextResponse.json({ countries, categories });
}
