import { getPublicHostContext } from "@/lib/saas/scope";
import { getRequestLocale } from "@/i18n/request-locale";
import { guestCookieSigningEnabled } from "@/lib/guest-cookie";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { headers } from "next/headers";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { MarketingSupportLauncher } from "./MarketingSupportLauncher";

export async function MarketingSupportLauncherMount() {
  const ctx = await getPublicHostContext();
  if (ctx.kind !== "marketing") return null;
  if (!guestCookieSigningEnabled()) return null;

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
