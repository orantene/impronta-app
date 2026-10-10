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
 * The floating "?" launcher is hidden on marketing hosts unless
 * `NEXT_PUBLIC_MARKETING_SUPPORT_FAB=1` is set (owner ruling 2026-09-17).
 * The launcher owns the TULALA_SUPPORT_OPEN_EVENT listener, so with the flag
 * off the guest support panel is unreachable from tulala.digital by design,
 * and any in-page button that dispatches the event must check
 * `marketingSupportPanelAvailable()` first or it is a dead click.
 */
const SUPPORT_FAB_ENABLED = process.env.NEXT_PUBLIC_MARKETING_SUPPORT_FAB === "1";

export function marketingSupportPanelAvailable(): boolean {
  return SUPPORT_FAB_ENABLED && guestSupportMayServe(guestCookieSigningEnabled());
}

export async function MarketingSupportLauncherMount() {
  if (!marketingSupportPanelAvailable()) return null;
  const ctx = await getPublicHostContext();
  if (ctx.kind !== "marketing") return null;

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
    />
  );
}
