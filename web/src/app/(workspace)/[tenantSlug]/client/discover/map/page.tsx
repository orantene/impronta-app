// D9 — Discover Map view. Server-rendered shell that pulls
// discoverable talents with lat/lng + hands them to the client map.
//
// Query intentionally lives inline here (not in the shared bridge) so
// this slice ships without coordination on the bridge's evolving shape.
// When the bridge stabilizes around D1+D9 in one place, this can fold
// into `loadDiscoverTalents`.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadClientSelfProfile } from "../../../_data-bridge";
import { logServerError } from "@/lib/server/safe-error";
import { resolveGoogleMapsKeyForClient } from "@/lib/integrations/resolve";
import { DiscoverMapShell, type DiscoverMapTalent } from "./DiscoverMapShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:      "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  accent:   "#1D4ED8",
} as const;

const PHOTO_VARIANT_PRIORITY = [
  "hero",
  "card",
  "public_watermarked",
  "watermarked",
  "gallery",
  "original",
];

/**
 * Cross-tenant discoverable talent + locations join. Lean variant of
 * loadDiscoverTalents — only the fields the map needs. RLS bypassed
 * via service-role; the page-level auth gate (client_profile present)
 * already enforces "client of this tenant" access.
 */
async function loadMappableTalents(): Promise<{
  mappable: DiscoverMapTalent[];
  unmappedCount: number;
}> {
  const admin = createServiceRoleClient();
  if (!admin) return { mappable: [], unmappedCount: 0 };

  const { data, error } = await admin
    .from("talent_profiles")
    .select(
      `
      id, display_name, first_name, last_name, profile_code,
      home_country_text, home_city_text,
      residence_city_id,
      is_discoverable, workflow_status,
      locations!residence_city_id ( latitude, longitude ),
      talent_profile_taxonomy (
        relationship_type,
        taxonomy_terms ( name_i18n )
      ),
      agency_talent_roster!talent_profile_id (
        tenant_id, status, is_primary,
        agencies!tenant_id ( display_name )
      )
      `,
    )
    .eq("is_discoverable", true)
    .in("workflow_status", ["approved", "published"])
    .limit(300);

  if (error) {
    logServerError("client.discoverMap.loadTalents", error);
    return { mappable: [], unmappedCount: 0 };
  }

  type Row = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_code: string | null;
    home_country_text: string | null;
    home_city_text: string | null;
    residence_city_id: string | null;
    locations:
      | { latitude: number | null; longitude: number | null }
      | { latitude: number | null; longitude: number | null }[]
      | null;
    talent_profile_taxonomy: Array<{
      relationship_type: string | null;
      taxonomy_terms: { name_i18n: Record<string, string | null> | null } | null;
    }> | null;
    agency_talent_roster: Array<{
      tenant_id: string;
      status: string;
      is_primary: boolean;
      agencies:
        | { display_name: string | null }
        | { display_name: string | null }[]
        | null;
    }> | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  // Batch-fetch a single best-rank photo per talent (same pattern as
  // /api/discover/talents).
  const ids = rows.map((r) => r.id);
  const photoByTalent = new Map<string, string>();
  if (ids.length > 0) {
    const { data: photos } = await admin
      .from("media_assets")
      .select("owner_talent_profile_id, storage_path, variant_kind")
      .in("owner_talent_profile_id", ids)
      .in("variant_kind", PHOTO_VARIANT_PRIORITY)
      .is("deleted_at", null);
    const bestRank = new Map<string, number>();
    for (const m of (photos ?? []) as Array<{
      owner_talent_profile_id: string;
      storage_path: string;
      variant_kind: string;
    }>) {
      const rank = PHOTO_VARIANT_PRIORITY.indexOf(m.variant_kind);
      if (rank < 0) continue;
      const current = bestRank.get(m.owner_talent_profile_id);
      if (current === undefined || rank < current) {
        bestRank.set(m.owner_talent_profile_id, rank);
        const url = m.storage_path.startsWith("http")
          ? m.storage_path
          : admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
        photoByTalent.set(m.owner_talent_profile_id, url);
      }
    }
  }

  const mappable: DiscoverMapTalent[] = [];
  let unmappedCount = 0;

  for (const row of rows) {
    const locRowOrArr = row.locations;
    const locRow = Array.isArray(locRowOrArr) ? locRowOrArr[0] : locRowOrArr;
    const lat = typeof locRow?.latitude === "number" ? locRow.latitude : null;
    const lng = typeof locRow?.longitude === "number" ? locRow.longitude : null;
    if (lat == null || lng == null) {
      unmappedCount++;
      continue;
    }

    const displayName =
      (row.display_name ?? "").trim() ||
      `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
      "Unnamed";

    const tax = row.talent_profile_taxonomy ?? [];
    const primary = tax.find((t) => t.relationship_type === "primary_role");

    const roster = row.agency_talent_roster ?? [];
    const active = roster.filter(
      (r) => r.status === "active" || r.status === "pending",
    );
    const primaryRoster = active.find((r) => r.is_primary) ?? null;
    const agencyRowOrArr = primaryRoster?.agencies;
    const agencyRow = Array.isArray(agencyRowOrArr)
      ? agencyRowOrArr[0]
      : agencyRowOrArr;

    mappable.push({
      id: row.id,
      displayName,
      profileCode: row.profile_code,
      primaryTypeLabel: primary?.taxonomy_terms?.name_i18n?.en ?? null,
      homeCity: row.home_city_text,
      homeCountry: row.home_country_text,
      agencyName: agencyRow?.display_name ?? null,
      isExclusive: !!primaryRoster?.is_primary,
      headshotUrl: photoByTalent.get(row.id) ?? null,
      homeLat: lat,
      homeLng: lng,
    });
  }

  return { mappable, unmappedCount };
}

export default async function ClientDiscoverMapPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const [{ mappable, unmappedCount }] = await Promise.all([
    loadMappableTalents(),
  ]);

  // Tenant-aware Maps key: the tenant's own custom Google Maps key (when
  // credential_mode='custom' + a secret is stored) else the platform env key.
  const apiKey = await resolveGoogleMapsKeyForClient(scope.tenantId);

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 1280 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase", color: C.inkMuted, marginBottom: 6,
        }}>
          Client · Discover
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 700, color: C.ink,
          margin: 0, marginBottom: 6, letterSpacing: -0.4,
        }}>
          Map view
        </h1>
        <p style={{
          fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.55,
          maxWidth: 640,
        }}>
          Every discoverable talent geocoded by their home city. Click a
          marker to see who they are and open their profile.{" "}
          <Link href={`/${tenantSlug}/client/discover`} style={{ color: C.accent, fontWeight: 600 }}>
            Back to grid →
          </Link>
        </p>
      </div>

      <DiscoverMapShell
        talents={mappable}
        apiKey={apiKey}
        tenantSlug={tenantSlug}
        unmappedCount={unmappedCount}
      />
    </div>
  );
}
