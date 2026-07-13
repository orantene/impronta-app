"use server";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveAccountHref, getAppUrl } from "@/lib/auth-flow";
import { loadAccountMenuModel } from "@/lib/identity/account-menu-model";
import type { MarketingAccount } from "@/components/marketing/marketing-account-menu";

/**
 * Loads the identity-aware account model for the CURRENTLY signed-in user, so
 * the login modal can show a personalized post-login welcome (quick links to
 * the user's workspaces / talent pages / messages / bookings) without a page
 * navigation. Mirrors exactly what `MarketingShell` computes for the header
 * account menu. Returns null when not signed in (the modal then just refreshes).
 */
export async function loadWelcomeAccountModel(): Promise<MarketingAccount | null> {
  const actor = await getCachedActorSession();
  if (!actor.user || !actor.supabase) return null;

  const link = resolveAccountHref(true, actor.profile);
  const appUrl = getAppUrl();
  const displayName =
    actor.profile?.display_name?.trim() ||
    actor.user.email?.split("@")[0] ||
    "there";
  const email = actor.user.email ?? "";
  const fallbackDashboardHref = link.href.startsWith("http")
    ? link.href
    : `${appUrl}${link.href}`;

  return loadAccountMenuModel(actor.supabase, actor.user.id, {
    appUrl,
    displayName,
    email,
    appRole: actor.profile?.app_role,
    fallbackDashboardHref,
  });
}
