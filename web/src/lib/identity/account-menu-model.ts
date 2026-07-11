import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActorIdentity } from "@/lib/identity/hybrid-mode";
import { loadRepresentation } from "@/lib/talent/load-representation";
import { talentPlanToTier } from "@/lib/access/talent-membership";
import type {
  MarketingAccount,
  MarketingTalentPage,
  MarketingWorkspaceLink,
} from "@/components/marketing/marketing-account-menu";

/** Owner first, then admin → viewer. Unknown roles sort last. */
const ROLE_PRIORITY: Record<string, number> = {
  owner: 0,
  admin: 1,
  coordinator: 2,
  editor: 3,
  viewer: 4,
};

/** Collapse the 7-state effective visibility into the 4 the menu displays. */
function mapPageStatus(effective: string): MarketingTalentPage["status"] {
  switch (effective) {
    case "live":
      return "live";
    case "pending":
      return "pending";
    case "winding_down":
      return "winding_down";
    // you_hid / agency_hidden / global_hidden all read as "Hidden" to the talent.
    default:
      return "hidden";
  }
}

/**
 * Composes the identity-aware account menu: workspace memberships (owner→viewer)
 * AND, when the user is a talent, their per-tenant public pages with effective
 * visibility + subscription-tier badge. Read-only over existing loaders
 * (`resolveActorIdentity` + `loadRepresentation`) — no new tables. The extra
 * talent reads only fire for talent accounts; pure workspace/client users pay
 * exactly the workspace query, same as before.
 */
export async function loadAccountMenuModel(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    appUrl: string;
    displayName: string;
    email: string;
    /** Existing single-destination fallback (`resolveAccountHref`). */
    fallbackDashboardHref: string;
  },
): Promise<MarketingAccount> {
  const { appUrl, displayName, email, fallbackDashboardHref } = opts;
  const identity = await resolveActorIdentity(supabase, userId);

  const workspaces: MarketingWorkspaceLink[] = (identity?.workspaces ?? [])
    .filter((w) => w.tenantSlug)
    .map((w) => ({
      slug: w.tenantSlug,
      name: w.tenantName,
      role: w.role,
      href: `${appUrl}/${w.tenantSlug}/admin`,
    }))
    .sort(
      (a, b) =>
        (ROLE_PRIORITY[a.role] ?? 9) - (ROLE_PRIORITY[b.role] ?? 9) ||
        a.name.localeCompare(b.name),
    );

  let talentPages: MarketingTalentPage[] = [];
  let globalHidden = false;
  let isTalent = false;
  let talentLinks: MarketingAccount["talentLinks"] = null;
  let talentUpgradeHref: string | null = null;

  if (identity?.talent) {
    isTalent = true;
    talentLinks = {
      dashboard: `${appUrl}/talent`,
      editProfile: `${appUrl}/talent/profile`,
      bookings: `${appUrl}/talent/calendar`,
      messages: `${appUrl}/talent/inbox`,
    };

    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("profile_code, talent_plan_key")
      .eq("id", identity.talent.profileId)
      .maybeSingle();
    const row = tp as { profile_code?: string | null; talent_plan_key?: string | null } | null;
    const profileCode = row?.profile_code ?? null;
    const tier = talentPlanToTier(row?.talent_plan_key ?? null);
    const planBadge: MarketingTalentPage["planBadge"] =
      tier === "max" ? "MAX" : tier === "pro" ? "PRO" : null;
    // Free talent → surface an upgrade CTA on their own page (unlocks the Max
    // custom page builder at /talent/site). Paid talent get a badge instead.
    talentUpgradeHref = tier === "free" ? `${appUrl}/talent/settings` : null;

    const rep = await loadRepresentation(identity.talent.profileId, profileCode);
    globalHidden = rep.globalHidden;
    talentPages = rep.entries
      .filter((e) => e.status !== "removed" && e.publicUrl)
      .map((e) => ({
        key: `${e.kind}:${e.tenantId}`,
        name: e.kind === "self_page" ? "Your Tulala page" : e.name,
        kind: e.kind,
        href: e.publicUrl,
        status: mapPageStatus(e.effective),
        // Tier badge belongs on the talent's own page, not agency/hub rows.
        planBadge: e.kind === "self_page" ? planBadge : null,
      }));

    // Dedupe: a roster row whose public URL collapses to the same canonical
    // `/t/<code>` as the talent's own page (e.g. the "Tulala" platform tenant,
    // or a roster_only membership with no agency-hosted URL) is the SAME page
    // listed twice. Drop those, keeping the "Your Tulala page" row.
    const selfHref = talentPages.find((p) => p.kind === "self_page")?.href;
    if (selfHref) {
      talentPages = talentPages.filter(
        (p) => p.kind === "self_page" || p.href !== selfHref,
      );
    }
  }

  return {
    displayName,
    email,
    dashboardHref: fallbackDashboardHref,
    // Clicking the identity header goes to the profile/account: talent → their
    // profile editor, everyone else → their dashboard.
    accountHref: isTalent ? `${appUrl}/talent/profile` : fallbackDashboardHref,
    workspaces,
    talentPages,
    isTalent,
    globalHidden,
    talentLinks,
    talentUpgradeHref,
  };
}
