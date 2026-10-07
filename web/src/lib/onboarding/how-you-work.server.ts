import "server-only";

// TUL-86 · 1E: the DB reads/writes behind the Settings "How you work" actions.
// Nothing here deletes a row.

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import type { HowYouWorkFacts } from "./how-you-work";

type Admin = SupabaseClient;

export async function loadFacts(admin: Admin, userId: string): Promise<{ facts: HowYouWorkFacts; workspaceName: string | null }> {
  const [tp, mem] = await Promise.all([
    admin.from("talent_profiles").select("id, display_name").eq("user_id", userId).is("deleted_at", null).limit(1).maybeSingle(),
    admin.from("agency_memberships").select("tenant_id").eq("profile_id", userId).eq("role", "owner").eq("status", "active"),
  ]);
  const talentProfileId = typeof tp.data?.id === "string" ? tp.data.id : null;
  const tenantIds = ((mem.data ?? []) as { tenant_id: string }[]).map((m) => m.tenant_id);

  let tenantId: string | null = null;
  let tenantSlug: string | null = null;
  let workspaceName: string | null = null;
  let bookable = false;
  if (tenantIds.length > 0) {
    const [ag, roster] = await Promise.all([
      admin.from("agencies").select("id, slug, display_name").in("id", tenantIds).order("created_at", { ascending: true }),
      talentProfileId
        ? admin.from("agency_talent_roster").select("tenant_id, status, agency_visibility").eq("talent_profile_id", talentProfileId).in("tenant_id", tenantIds)
        : Promise.resolve({ data: [] as { tenant_id: string; status: string; agency_visibility: string }[] }),
    ]);
    const rows = (roster.data ?? []) as { tenant_id: string; status: string; agency_visibility: string }[];
    const visible = rows.find((r) => r.status === "active" && (r.agency_visibility === "site_visible" || r.agency_visibility === "featured"));
    const agencies = (ag.data ?? []) as { id: string; slug: string; display_name: string }[];
    const pick = (visible && agencies.find((a) => a.id === visible.tenant_id)) || agencies[0] || null;
    if (pick) {
      tenantId = pick.id;
      tenantSlug = pick.slug;
      workspaceName = pick.display_name;
      bookable = Boolean(visible);
    }
  }
  return {
    workspaceName,
    facts: {
      hasTalentProfile: Boolean(talentProfileId),
      ownsWorkspace: Boolean(tenantId),
      bookable,
      tenantId,
      tenantSlug,
      talentProfileId,
      displayName: typeof tp.data?.display_name === "string" ? tp.data.display_name : null,
    },
  };
}


export async function hideSelfFromBooking(admin: Admin, tenantId: string, talentProfileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin
    .from("agency_talent_roster")
    .update({ agency_visibility: "roster_only", direct_booking_enabled: false })
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .in("agency_visibility", ["site_visible", "featured"]);
  if (error) {
    logServerError("how-you-work.hide", error);
    return { ok: false, error: "Could not update your booking visibility." };
  }
  return { ok: true };
}

export async function setHomeSurfacePreference(admin: Admin, userId: string, surface: "talent" | "workspace"): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.from("profiles").update({ home_surface_preference: surface }).eq("id", userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

