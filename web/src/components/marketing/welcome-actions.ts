"use server";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveAccountHref, getAppUrl } from "@/lib/auth-flow";
import { loadAccountMenuModel } from "@/lib/identity/account-menu-model";
import type { MarketingAccount } from "@/components/marketing/marketing-account-menu";

/** A single quick-link card in the welcome panel. Label + icon are resolved
 *  client-side from `key` (keeps this server action copy-free + locale-free). */
export type WelcomeQuickLinkKey =
  | "messages"
  | "bookings"
  | "earnings"
  | "services"
  | "dashboard"
  | "editProfile"
  | "appearance"
  | "membership"
  | "reviews"
  | "trust"
  | "saved"
  | "account";

export type WelcomeQuickLink = {
  key: WelcomeQuickLinkKey;
  href: string;
};

export type WelcomeModel = {
  account: MarketingAccount;
  /** Work / comms shortcuts, shown under the workspaces list. */
  quickLinks: WelcomeQuickLink[];
  /** Profile-management shortcuts, shown under the profile pages. */
  profileLinks: WelcomeQuickLink[];
};

/**
 * Loads the identity-aware account model + two grouped quick-link decks for the
 * post-login welcome panel. Reuses `loadAccountMenuModel` (same data the header
 * menu uses) and builds the quick links from real, existing talent/client
 * routes so every card is a valid one-click destination. Returns null when not
 * signed in (the modal then just refreshes).
 */
export async function loadWelcomeModel(): Promise<WelcomeModel | null> {
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

  const account = await loadAccountMenuModel(actor.supabase, actor.user.id, {
    appUrl,
    displayName,
    email,
    appRole: actor.profile?.app_role,
    fallbackDashboardHref,
  });

  const quickLinks: WelcomeQuickLink[] = [];
  const profileLinks: WelcomeQuickLink[] = [];

  if (account.isTalent) {
    quickLinks.push(
      { key: "messages", href: `${appUrl}/talent/inbox` },
      { key: "bookings", href: `${appUrl}/talent/calendar` },
      { key: "earnings", href: `${appUrl}/talent/money` },
      { key: "services", href: `${appUrl}/talent/services` },
      { key: "dashboard", href: `${appUrl}/talent` },
    );
    profileLinks.push(
      { key: "editProfile", href: `${appUrl}/talent/profile` },
      { key: "appearance", href: `${appUrl}/talent/site` },
      { key: "membership", href: `${appUrl}/talent/settings` },
      { key: "reviews", href: `${appUrl}/talent/reviews` },
      { key: "trust", href: `${appUrl}/talent/trust` },
    );
  } else if (account.isClient && account.clientLinks) {
    quickLinks.push(
      { key: "messages", href: account.clientLinks.messages },
      { key: "saved", href: account.clientLinks.saved },
      { key: "account", href: account.clientLinks.account },
    );
  }

  return { account, quickLinks, profileLinks };
}
