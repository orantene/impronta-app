/**
 * Talent freeform Page Builder — Max-tier-gated editor entry.
 *
 * Route: `/talent/page-builder` (app host). Resolves the signed-in talent's own
 * `talent_profiles.id`, plan key / tier, and managing agency `tenantId`
 * server-side, then mounts the ONE Page Builder Core (`TalentMaxBuilderMount`)
 * which persists to `talent_pages.blocks` via the talent-page adapter.
 *
 * Gating (§E): ONLY talents on the Max tier (`talent_plan_key='talent_portfolio'`)
 * may reach the editor. A non-Max talent gets an upsell notice (not a 404 — they
 * should learn the feature exists + how to unlock it). An anonymous / non-talent
 * user is redirected to login by the talent layout's session guard.
 *
 * The talent layout (`(workspace)/talent/layout.tsx`) renders this route bare
 * (no dashboard shell) so the editor owns the full viewport.
 */

import { redirect } from "next/navigation";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfileByUser } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { getActiveTalentAgencyContext } from "@/lib/talent/active-agency-context";
import { getRequestLocale } from "@/i18n/request-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { TalentPageBuilderScreen } from "@/components/talent/site/TalentPageBuilderScreen";

export const dynamic = "force-dynamic";

/** The talent_pages slug this editor manages. One freeform page per talent for now. */
const TALENT_PAGE_SLUG = "home";

export default async function TalentPageBuilderRoute() {
  const session = await getCachedActorSession();
  // The talent layout already redirects unauthenticated users; this is a
  // defensive backstop so the page never renders without a user.
  if (!session.supabase || !session.user) {
    redirect("/login?next=/talent/page-builder");
  }

  const profile = await loadTalentSelfProfileByUser(session.user.id);
  // No talent profile for this user → send them home rather than 500.
  if (!profile) {
    redirect("/talent/today");
  }

  const locale = await getRequestLocale();

  // Resolve the managing agency tenant for builder scope + the in-editor
  // section-embed preview. Prefer the active agency context (the scope the
  // dashboard uses); fall back to the profile's owning agency
  // (`created_by_agency_id`) so the editor's section-embed preview matches the
  // PUBLISHED renderer, which scopes embeds to that same tenant.
  const activeAgency = await getActiveTalentAgencyContext(profile.id);
  let tenantId = activeAgency?.tenantId ?? null;
  if (!tenantId) {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data } = await admin
        .from("talent_profiles")
        .select("created_by_agency_id")
        .eq("id", profile.id)
        .maybeSingle();
      tenantId =
        (data as { created_by_agency_id: string | null } | null)
          ?.created_by_agency_id ?? null;
    }
  }

  return (
    <TalentPageBuilderScreen
      talentProfileId={profile.id}
      pageSlug={TALENT_PAGE_SLUG}
      tenantId={tenantId ?? ""}
      talentPlanKey={profile.talentPlanKey}
      talentTier={profile.talentTier}
      talentDisplayName={profile.displayName}
      locale={locale}
    />
  );
}
