import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgencySettings = {
  tagline?: string | null;
  contact_email?: string | null;
  branding?: {
    primaryColor?: string | null;
  } | null;
};

type AgencyRow = {
  id: string;
  display_name: string;
  slug: string;
  settings: AgencySettings | null;
};

type PublishedTalent = {
  id: string;
  name: string;
  primaryTypeLabel: string | null;
  city: string | null;
  thumb: string | null;
};

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadAgency(slug: string): Promise<AgencyRow | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("agencies")
      .select("id, display_name, slug, settings")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      logServerError("workspace.homepage.loadAgency", error);
      return null;
    }
    return data as AgencyRow | null;
  } catch (err) {
    logServerError("workspace.homepage.loadAgency", err);
    return null;
  }
}

async function loadPublishedTalents(tenantId: string): Promise<PublishedTalent[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("agency_talent_roster")
      .select(
        `
        status,
        talent_profile_id,
        talent_profiles!talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          workflow_status,
          home_city_text,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( name_en, term_type )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_en )
          )
        )
        `,
      )
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(24);

    if (error) {
      logServerError("workspace.homepage.loadPublishedTalents", error);
      return [];
    }

    type RawRow = {
      status: string;
      talent_profiles: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        workflow_status: string | null;
        home_city_text: string | null;
        talent_profile_taxonomy: Array<{
          relationship_type: string | null;
          taxonomy_terms: { name_en: string | null; term_type: string | null } | null;
        }> | null;
        talent_service_areas: Array<{
          service_kind: string | null;
          locations: { display_name_en: string | null } | null;
        }> | null;
      } | null;
    };

    const PUBLISHED_STATUSES = new Set(["approved", "published"]);

    const talentIds: string[] = [];
    const rows = (data ?? []) as unknown as RawRow[];
    const eligible: RawRow[] = [];

    for (const row of rows) {
      const p = row.talent_profiles;
      if (!p) continue;
      if (!PUBLISHED_STATUSES.has(p.workflow_status ?? "")) continue;
      eligible.push(row);
      talentIds.push(p.id);
    }

    // Batch-load card thumbnails.
    const thumbMap = new Map<string, string>();
    if (talentIds.length > 0) {
      const { data: mediaRows } = await sb
        .from("media_assets")
        .select("owner_talent_profile_id, storage_path, variant_kind")
        .in("owner_talent_profile_id", talentIds)
        .in("variant_kind", ["card", "public_watermarked", "gallery", "portfolio", "original"])
        .is("deleted_at", null);

      const RANK: Record<string, number> = {
        card: 0,
        public_watermarked: 1,
        gallery: 2,
        portfolio: 3,
        original: 4,
      };
      const bestRank = new Map<string, number>();

      for (const m of ((mediaRows ?? []) as Array<{
        owner_talent_profile_id: string;
        storage_path: string;
        variant_kind: string;
      }>)) {
        const rank = RANK[m.variant_kind] ?? 99;
        const cur = bestRank.get(m.owner_talent_profile_id) ?? 99;
        if (rank < cur) {
          const { data: url } = sb.storage.from("media-public").getPublicUrl(m.storage_path);
          thumbMap.set(m.owner_talent_profile_id, url.publicUrl);
          bestRank.set(m.owner_talent_profile_id, rank);
        }
      }
    }

    return eligible.map((row) => {
      const p = row.talent_profiles!;
      const name =
        p.display_name?.trim() ||
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
        "Unnamed talent";

      const primaryTerm = (p.talent_profile_taxonomy ?? []).find(
        (t) =>
          (t.relationship_type === "primary_role" && t.taxonomy_terms?.term_type === "talent_type") ||
          (t.relationship_type === "primary" && t.taxonomy_terms?.term_type === "category"),
      );
      const primaryTypeLabel = primaryTerm?.taxonomy_terms?.name_en ?? null;

      const city =
        p.home_city_text?.trim() ||
        (p.talent_service_areas ?? []).find((a) => a.service_kind === "home_base")?.locations
          ?.display_name_en ||
        null;

      return {
        id: p.id,
        name,
        primaryTypeLabel: primaryTypeLabel ?? null,
        city: city ?? null,
        thumb: thumbMap.get(p.id) ?? null,
      };
    });
  } catch (err) {
    logServerError("workspace.homepage.loadPublishedTalents", err);
    return [];
  }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { tenantSlug } = await params;
  const agency = await loadAgency(tenantSlug);
  if (!agency) return { title: "Tulala" };
  const displayName = agency.display_name || "Workspace";
  const tagline = agency.settings?.tagline ?? null;
  return {
    title: `${displayName} — Tulala`,
    description: tagline ?? `${displayName} on Tulala`,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceHomepage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const agency = await loadAgency(tenantSlug);
  const talents = agency ? await loadPublishedTalents(agency.id) : [];

  if (!agency) notFound();

  const settings = agency.settings ?? {};
  const tagline = settings.tagline ?? "Coming soon";
  const primaryColor = settings.branding?.primaryColor ?? null;
  const contactEmail = settings.contact_email ?? null;
  const displayName = agency.display_name || "Workspace";

  const heroBg = primaryColor ?? "oklch(0.21 0.006 285)";

  const inquiryHref = contactEmail
    ? `mailto:${contactEmail}`
    : `/${tenantSlug}/inquiry`;

  return (
    <div className="flex min-h-svh flex-col bg-background font-sans antialiased">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header
        className="relative flex flex-col items-center justify-center gap-4 px-6 py-24 text-center sm:py-32"
        style={{ backgroundColor: heroBg }}
      >
        <h1 className="text-4xl font-semibold tracking-tight text-white drop-shadow sm:text-5xl">
          {displayName}
        </h1>
        <p className="max-w-xl text-base text-white/80 sm:text-lg">{tagline}</p>
        <a
          href={inquiryHref}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-6 py-2.5 text-sm font-medium text-white backdrop-blur hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          Get in touch
        </a>
      </header>

      {/* ── Roster grid ───────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-14 sm:px-6 lg:px-8">
        {talents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
            <span className="text-4xl" aria-hidden>✦</span>
            <p className="text-base">No talent yet — check back soon.</p>
          </div>
        ) : (
          <>
            <h2 className="mb-8 text-xl font-medium tracking-tight">Our talent</h2>
            <ul
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              role="list"
            >
              {talents.map((talent) => (
                <li key={talent.id} className="group">
                  <div className="overflow-hidden rounded-xl bg-muted">
                    {talent.thumb ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={talent.thumb}
                        alt={talent.name}
                        className="aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex aspect-[3/4] w-full items-center justify-center bg-muted text-muted-foreground">
                        <span className="text-3xl font-light" aria-hidden>
                          {talent.name.slice(0, 1)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 px-0.5">
                    <p className="truncate text-sm font-medium">{talent.name}</p>
                    {(talent.primaryTypeLabel || talent.city) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {[talent.primaryTypeLabel, talent.city].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      {/* ── Footer CTA ────────────────────────────────────────────────────── */}
      <footer className="border-t border-border px-6 py-10 text-center text-sm text-muted-foreground">
        <p>
          <a
            href={inquiryHref}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Send an inquiry
          </a>{" "}
          ·{" "}
          <a
            href="https://tulala.digital"
            className="hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Powered by Tulala
          </a>
        </p>
      </footer>
    </div>
  );
}
