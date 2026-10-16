import "server-only";

import { cookies, headers } from "next/headers";

import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { getRequestLocale, ORIGINAL_PATHNAME_HEADER, ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { pickClientLayoutLocale, urlNamesLocale } from "./client-layout-locale";

/** The client's saved account language, or null when none is stored or it cannot be read. */
async function savedAccountLocale(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin.from("client_profiles").select("preferred_locale").eq("user_id", userId).maybeSingle();
  if (error) {
    logServerError("clientAccount.locale.savedRead", error);
    return null;
  }
  return (data as { preferred_locale?: string | null } | null)?.preferred_locale ?? null;
}

/**
 * TUL-1191: the language every `/account*` view renders in.
 *
 * `getRequestLocale()` trusts the middleware locale header, which is derived from the PATH, so an
 * unprefixed `/account` always resolved to English, even for a visitor who signed in on a Spanish
 * page. Same rule as the client portal layout (TUL-968): a language named in the URL wins, then
 * the language cookie, then the client's saved account language.
 */
export async function resolveAccountLocale(userId: string | null): Promise<"en" | "es"> {
  const [requestLocale, h, jar, saved] = await Promise.all([
    getRequestLocale(),
    headers(),
    cookies(),
    userId ? savedAccountLocale(userId) : Promise.resolve(null),
  ]);
  return pickClientLayoutLocale({
    requestLocale,
    urlNamesLocale: urlNamesLocale(h.get(ORIGINAL_PATHNAME_HEADER), h.get(ORIGINAL_SEARCH_HEADER)),
    cookieLocale: jar.get(LOCALE_COOKIE)?.value,
    savedLocale: saved,
  });
}
