// Canonical workspace admin — talent profile edit page.
//
// Loads the talent profile + roster row + taxonomy state and hands off to
// TalentEditForm (client). The core fields (name, bio, phone, type, workflow,
// visibility) are editable here. Photo upload and full editorial fields ship
// in Phase 3.3 (canonical talent surface).
//
// Capability gate: agency.roster.edit.
// Security: also verifies the talent is on this tenant's roster.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { TalentEditForm, type TalentEditInitial } from "./TalentEditForm";
import {
  loadAllTaxonomyTerms,
  loadTalentTaxonomy,
  loadTalentLanguages,
  loadTalentServiceAreas,
  loadTalentPortfolio,
} from "./talent-data";
import {
  TaxonomySection,
  LanguagesSection,
  ServiceAreasSection,
  GallerySection,
  DeleteTalentButton,
} from "./EditorSections";
import { CompletenessCard } from "./CompletenessDial";
import { WorkflowPipe } from "./WorkflowPipe";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; id: string }>;

const C = {
  ink:      "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  border:   "rgba(24,24,27,0.10)",
} as const;
const F  = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadTalentForEdit(tenantId: string, talentId: string) {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const [profileRes, rosterRes, taxRes, mediaRes] = await Promise.all([
    admin
      .from("talent_profiles")
      .select(
        "id, display_name, first_name, last_name, short_bio, phone, workflow_status, visibility, profile_code, created_at, height_cm, gender, date_of_birth, invitation_email, home_city_text, social_links, user_id",
      )
      .eq("id", talentId)
      .is("deleted_at", null)
      .maybeSingle(),

    admin
      .from("agency_talent_roster")
      .select("status, agency_visibility")
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", talentId)
      .neq("status", "removed")
      .maybeSingle(),

    admin
      .from("talent_profile_taxonomy")
      .select("taxonomy_term_id, relationship_type")
      .eq("talent_profile_id", talentId)
      .eq("relationship_type", "primary_role"),

    // Load current card (avatar) photo
    admin
      .from("media_assets")
      .select("bucket_id, storage_path")
      .eq("owner_talent_profile_id", talentId)
      .eq("variant_kind", "card")
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (profileRes.error) {
    logServerError("roster/[id].loadTalentForEdit/profile", profileRes.error);
    return null;
  }
  if (!profileRes.data || !rosterRes.data) return null;

  type ProfileRow = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    short_bio: string | null;
    phone: string | null;
    workflow_status: string | null;
    visibility: string | null;
    profile_code: string | null;
    created_at: string | null;
    height_cm: number | null;
    gender: string | null;
    date_of_birth: string | null;
    invitation_email: string | null;
    home_city_text: string | null;
    social_links: { label: string; href: string }[] | null;
    user_id: string | null;
  };
  type RosterRow = { status: string; agency_visibility: string };

  const p = profileRes.data as ProfileRow;
  const r = rosterRes.data as RosterRow;
  const primaryTermId =
    (taxRes.data ?? []).find(
      (t: { taxonomy_term_id: string; relationship_type: string }) =>
        t.relationship_type === "primary_role",
    )?.taxonomy_term_id ?? null;

  // Derive photo URL from media_assets card row
  type MediaRow = { bucket_id: string; storage_path: string } | null;
  const photoRow = mediaRes.data as MediaRow;
  const photo_url = photoRow?.bucket_id && photoRow?.storage_path
    ? admin.storage.from(photoRow.bucket_id).getPublicUrl(photoRow.storage_path).data.publicUrl
    : null;

  return {
    id: p.id,
    display_name: p.display_name ?? "",
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    short_bio: p.short_bio ?? null,
    phone: p.phone ?? null,
    workflow_status: p.workflow_status ?? "draft",
    visibility: p.visibility ?? "hidden",
    profile_code: p.profile_code ?? null,
    created_at: p.created_at ?? null,
    agency_visibility: r.agency_visibility ?? "roster_only",
    primary_type_term_id: primaryTermId as string | null,
    photo_url,
    height_cm: p.height_cm ?? null,
    gender: p.gender ?? null,
    date_of_birth: p.date_of_birth ?? null,
    invitation_email: p.invitation_email ?? null,
    home_city_text: p.home_city_text ?? null,
    instagram: (p.social_links ?? []).find((l) => l.label?.toLowerCase() === "instagram")?.href?.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@").replace(/\/$/, "") ?? null,
    is_claimed: Boolean(p.user_id),
    is_archived: r.status === "removed" || p.workflow_status === "archived",
  };
}

async function loadTalentTypes() {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("taxonomy_terms")
    .select("id, name_en")
    .eq("kind", "talent_type")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    logServerError("roster/[id].loadTalentTypes", error);
    return [];
  }

  return (data ?? []).map((t) => ({
    id: t.id as string,
    name_en: t.name_en as string,
  }));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceRosterTalentPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug, id: talentId } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) notFound();

  // ── DEBUG: surface real loader errors instead of crashing the page render ──
  const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      logServerError(`roster/[id].${label}`, err);
      // eslint-disable-next-line no-console
      console.error(`[talent-detail] ${label} threw:`, err instanceof Error ? err.message : err);
      return fallback;
    }
  };

  const [talent, talentTypes, allTerms, talentTaxonomy, languages, areas, portfolio] = await Promise.all([
    safe("loadTalentForEdit", () => loadTalentForEdit(scope.tenantId, talentId), null),
    safe("loadTalentTypes", () => loadTalentTypes(), [] as Awaited<ReturnType<typeof loadTalentTypes>>),
    safe("loadAllTaxonomyTerms", () => loadAllTaxonomyTerms(), [] as Awaited<ReturnType<typeof loadAllTaxonomyTerms>>),
    safe("loadTalentTaxonomy", () => loadTalentTaxonomy(talentId), [] as Awaited<ReturnType<typeof loadTalentTaxonomy>>),
    safe("loadTalentLanguages", () => loadTalentLanguages(scope.tenantId, talentId), [] as Awaited<ReturnType<typeof loadTalentLanguages>>),
    safe("loadTalentServiceAreas", () => loadTalentServiceAreas(scope.tenantId, talentId), [] as Awaited<ReturnType<typeof loadTalentServiceAreas>>),
    safe("loadTalentPortfolio", () => loadTalentPortfolio(talentId), [] as Awaited<ReturnType<typeof loadTalentPortfolio>>),
  ]);

  if (!talent) notFound();

  const initial: TalentEditInitial = {
    display_name: talent.display_name,
    first_name: talent.first_name,
    last_name: talent.last_name,
    short_bio: talent.short_bio,
    phone: talent.phone,
    workflow_status: talent.workflow_status,
    visibility: talent.visibility,
    agency_visibility: talent.agency_visibility,
    primary_type_term_id: talent.primary_type_term_id,
    profile_code: talent.profile_code,
    photo_url: talent.photo_url,
    height_cm: talent.height_cm,
    gender: talent.gender,
    date_of_birth: talent.date_of_birth,
    invitation_email: talent.invitation_email,
    home_city_text: talent.home_city_text,
    instagram: talent.instagram,
  };

  return (
    <div style={{ fontFamily: F, color: C.ink }}>
      {/* Back nav */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/${tenantSlug}/admin/roster`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: C.inkMuted,
            textDecoration: "none",
            padding: "6px 0",
          }}
        >
          ← Roster
        </Link>
      </div>

      {/* Page heading */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: C.ink,
            margin: 0,
          }}
        >
          {talent.display_name || "Unnamed talent"}
        </h1>
        {talent.profile_code && (
          <p
            style={{
              fontFamily: F,
              fontSize: 12,
              color: C.inkMuted,
              margin: "5px 0 0",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <a
              href={`https://tulala.digital/t/${talent.profile_code}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2B3FA3", textDecoration: "none", fontFamily: '"ui-monospace", monospace', fontSize: 12 }}
            >
              /t/{talent.profile_code} ↗
            </a>
            {talent.created_at && (
              <span style={{ color: "rgba(11,11,13,0.35)" }}>
                Added{" "}
                {new Date(talent.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Workflow status pipeline + Profile completeness — visible above the form */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        gap: 16, marginBottom: 16,
      }}>
        <WorkflowPipe
          workflowStatus={talent.workflow_status}
          isClaimed={talent.is_claimed}
          isArchived={talent.is_archived}
        />
        <CompletenessCard
          initial={{
            display_name: talent.display_name,
            short_bio: talent.short_bio,
            home_city_text: talent.home_city_text,
            photo_url: talent.photo_url,
          }}
          taxonomy={talentTaxonomy}
          languages={languages}
          areas={areas}
          portfolio={portfolio}
        />
      </div>

      {/* Edit form + sidebar */}
      <TalentEditForm
        tenantSlug={tenantSlug}
        talentId={talentId}
        initial={initial}
        talentTypes={talentTypes}
      />

      {/* Extended sections — taxonomy + languages + service areas + gallery */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
        <TaxonomySection
          tenantSlug={tenantSlug}
          talentId={talentId}
          allTerms={allTerms}
          currentAssignments={talentTaxonomy}
        />
        <LanguagesSection
          tenantSlug={tenantSlug}
          talentId={talentId}
          languages={languages}
        />
        <ServiceAreasSection
          tenantSlug={tenantSlug}
          talentId={talentId}
          areas={areas}
        />
        <GallerySection
          tenantSlug={tenantSlug}
          talentId={talentId}
          portfolio={portfolio}
        />

        {/* Danger zone */}
        <section style={{
          background: "#fff",
          border: "1px solid rgba(176,74,34,0.20)",
          borderRadius: 14,
          padding: 18,
          fontFamily: F,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h3 style={{
              fontFamily: F, fontSize: 14, fontWeight: 700, color: "#8C3318",
              margin: 0, letterSpacing: -0.05,
            }}>Danger zone</h3>
          </div>
          <p style={{
            fontSize: 12.5, color: C.inkMuted, margin: "0 0 10px",
            lineHeight: 1.5,
          }}>
            Removing a talent hides them from your roster, public site, and discovery.
            The talent's underlying profile is kept intact in case they're on
            another agency or claim their account later.
          </p>
          <DeleteTalentButton
            tenantSlug={tenantSlug}
            talentId={talentId}
            talentName={talent.display_name || "this talent"}
          />
        </section>
      </div>
    </div>
  );
}
