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
        "id, display_name, first_name, last_name, short_bio, phone, workflow_status, visibility, profile_code, created_at, height_cm",
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

  const [talent, talentTypes] = await Promise.all([
    loadTalentForEdit(scope.tenantId, talentId),
    loadTalentTypes(),
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
            }}
          >
            Profile code: {talent.profile_code}
            {talent.created_at && (
              <span style={{ marginLeft: 12, color: "rgba(11,11,13,0.35)" }}>
                · Added{" "}
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

      {/* Edit form + sidebar */}
      <TalentEditForm
        tenantSlug={tenantSlug}
        talentId={talentId}
        initial={initial}
        talentTypes={talentTypes}
      />
    </div>
  );
}
