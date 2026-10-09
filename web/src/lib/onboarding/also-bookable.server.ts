import "server-only";

// TUL-269: the DB reads behind "also take bookings myself". Every read checks
// its error: a failed read must refuse, never look like "not an owner".

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import type { AlsoBookableFacts } from "./also-bookable";
import { resolveProviderDisplayName } from "./how-you-work";

export async function loadAlsoBookableFacts(
  admin: SupabaseClient,
  userId: string,
  tenantId: string,
): Promise<{ ok: true; facts: AlsoBookableFacts } | { ok: false; error: string }> {
  const [mem, ag, tp, account] = await Promise.all([
    admin.from("agency_memberships").select("tenant_id").eq("profile_id", userId).eq("tenant_id", tenantId).eq("role", "owner").eq("status", "active").limit(1).maybeSingle(),
    admin.from("agencies").select("id, slug, display_name").eq("id", tenantId).maybeSingle(),
    admin.from("talent_profiles").select("id, display_name").eq("user_id", userId).is("deleted_at", null).limit(1).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);
  const failed = mem.error ?? ag.error ?? tp.error ?? account.error;
  if (failed) {
    logServerError("also-bookable.loadFacts", failed);
    return { ok: false, error: "Could not check your account right now." };
  }
  const talentProfileId = typeof tp.data?.id === "string" ? tp.data.id : null;

  let bookable = false;
  let hasOwnSite = false;
  if (talentProfileId) {
    const [roster, site] = await Promise.all([
      admin.from("agency_talent_roster").select("status, agency_visibility").eq("tenant_id", tenantId).eq("talent_profile_id", talentProfileId).maybeSingle(),
      admin.from("talent_sites").select("site_published_at").eq("talent_profile_id", talentProfileId).maybeSingle(),
    ]);
    const rf = roster.error ?? site.error;
    if (rf) {
      logServerError("also-bookable.loadFacts.state", rf);
      return { ok: false, error: "Could not check your account right now." };
    }
    const r = roster.data as { status: string; agency_visibility: string } | null;
    bookable = Boolean(r && r.status === "active" && (r.agency_visibility === "site_visible" || r.agency_visibility === "featured"));
    hasOwnSite = Boolean((site.data as { site_published_at: string | null } | null)?.site_published_at);
  }

  return {
    ok: true,
    facts: {
      hasTalentProfile: Boolean(talentProfileId),
      ownsWorkspace: Boolean(ag.data?.id),
      bookable,
      tenantId: typeof ag.data?.id === "string" ? ag.data.id : null,
      tenantSlug: typeof ag.data?.slug === "string" ? ag.data.slug : null,
      talentProfileId,
      // A studio-only owner has no talent profile yet: fall back to the account
      // name, then the workspace name (same chain as "How you work").
      displayName: resolveProviderDisplayName(
        typeof tp.data?.display_name === "string" ? tp.data.display_name : null,
        typeof account.data?.display_name === "string" ? account.data.display_name : null,
        typeof ag.data?.display_name === "string" ? ag.data.display_name : null,
      ),
      isOwner: Boolean(mem.data),
      hasOwnSite,
    },
  };
}
