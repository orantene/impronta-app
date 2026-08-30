import { headers } from "next/headers";
import { getRequestLocale } from "@/i18n/request-locale";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveAccountHref, getAppUrl } from "@/lib/auth-flow";
import { loadAccountMenuModel } from "@/lib/identity/account-menu-model";
import { signOut } from "@/app/auth/actions";
import { MarketingHeader } from "./header";
import type { MarketingAccount } from "./marketing-account-menu";
import { MarketingFooter } from "./footer";
import { MarketingModalHost } from "./marketing-modal-host";
import { MarketingSupportLauncherMount } from "./support/MarketingSupportLauncherMount";

/**
 * The outer layout for every platform marketing surface (homepage + sub-pages).
 *
 * Wraps content in `data-platform-surface="marketing"` so the Rostra platform
 * design tokens and typography (see globals.css) apply inside this subtree
 * only — never leaking into tenant storefronts or workspace chrome.
 *
 * Resolves the active locale + clean path once and hands them to the header so
 * the nav, CTAs, and the EN|ES toggle render in the right language.
 */
export async function MarketingShell({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const h = await headers();
  const originalPath = h.get("x-impronta-original-pathname") ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    originalPath,
    FALLBACK_LANGUAGE_SETTINGS,
  );

  // Auth-aware header: when a session exists (auth cookies are parent-domain
  // scoped, so the marketing host can read them), the top-right shows the
  // signed-in account menu instead of the logged-out CTAs.
  const actor = await getCachedActorSession();
  let account: MarketingAccount | undefined;
  if (actor.user) {
    const link = resolveAccountHref(true, actor.profile);
    const appUrl = getAppUrl();
    const displayName =
      actor.profile?.display_name?.trim() ||
      actor.user.email?.split("@")[0] ||
      "Account";
    const email = actor.user.email ?? "";
    const fallbackDashboardHref = link.href.startsWith("http")
      ? link.href
      : `${appUrl}${link.href}`;

    // Identity-aware menu: workspace memberships AND (for talents) their public
    // pages with visibility + tier badge. Composed from existing loaders.
    account = actor.supabase
      ? await loadAccountMenuModel(actor.supabase, actor.user.id, {
          appUrl,
          displayName,
          email,
          appRole: actor.profile?.app_role,
          fallbackDashboardHref,
        })
      : {
          displayName,
          email,
          dashboardHref: fallbackDashboardHref,
          accountHref: fallbackDashboardHref,
          workspaces: [],
          talentPages: [],
          isTalent: false,
          globalHidden: false,
          talentLinks: null,
          talentUpgradeHref: null,
          isClient: false,
          clientTenants: [],
          clientLinks: null,
        };
  }

  return (
    <div
      data-platform-surface="marketing"
      /* overflow-x-clip: a single component running a few px past the
         viewport makes EVERY page scroll sideways on phones (it happened —
         the footer's un-wrappable bottom row, fixed 2026-07-23). `clip`
         guards against the next regression without creating a scroll
         container, so position:sticky descendants keep working ("hidden"
         would break them). Scoped here, not on <body>, so admin and
         storefront surfaces are untouched. */
      className="flex min-h-screen flex-col overflow-x-clip"
      style={{ background: "var(--plt-bg)", color: "var(--plt-ink)" }}
    >
      <MarketingHeader
        locale={locale}
        pathnameWithoutLocale={pathnameWithoutLocale}
        account={account}
        signOutAction={signOut}
      />
      <main className="flex-1 pt-[var(--plt-header-h,64px)] sm:pt-[72px]">{children}</main>
      <MarketingFooter />
      <MarketingSupportLauncherMount />
      <MarketingModalHost locale={locale} />
    </div>
  );
}
