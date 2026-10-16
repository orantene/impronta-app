import { getPublicHostContext } from "@/lib/saas/scope";
import { getRequestLocale } from "@/i18n/request-locale";
import { guestCookieSigningEnabled } from "@/lib/guest-cookie";
import { guestSupportMayServe } from "@/lib/support/guest-support-serve";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { headers } from "next/headers";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { MarketingSupportLauncher } from "./MarketingSupportLauncher";

/**
 * The floating "?" button stays hidden on marketing hosts unless
 * `NEXT_PUBLIC_MARKETING_SUPPORT_FAB=1` (owner ruling 2026-09-17). The panel
 * itself is always mounted (button-less) so in-page CTAs that dispatch
 * TULALA_SUPPORT_OPEN_EVENT (/support hero, header support menu) open it
 * regardless of the flag. Nothing renders in the DOM until the event fires.
 */
const SUPPORT_FAB_ENABLED = process.env.NEXT_PUBLIC_MARKETING_SUPPORT_FAB === "1";

export async function MarketingSupportLauncherMount() {
  const ctx = await getPublicHostContext();
  if (ctx.kind !== "marketing") return null;
  if (!guestSupportMayServe(guestCookieSigningEnabled())) return null;

  const locale = await getRequestLocale();
  const actor = await getCachedActorSession();
  const h = await headers();
  const originalPath = h.get("x-impronta-original-pathname") ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    originalPath,
    FALLBACK_LANGUAGE_SETTINGS,
  );

  return (
    <MarketingSupportLauncher
      locale={locale === "es" ? "es" : "en"}
      originSlug={pathnameWithoutLocale || "/"}
      signedIn={Boolean(actor.user)}
      showFab={SUPPORT_FAB_ENABLED}
    />
  );
}
