import { normalizeEmailLocale, type EmailLocale } from "@/lib/notifications/email-copy";

/**
 * Locale for an auth email (TUL-1179). The app's auth actions append `?lang=` to
 * redirectTo; that wins. Some redirects lose it on the way (Supabase rewrites,
 * old links), so fall back to `user_metadata.lang`, which sign-up stamps. Then EN.
 */
export function authEmailLocale(redirectTo: string | undefined, metadataLang: unknown): EmailLocale {
  if (redirectTo) {
    try {
      const fromRedirect = new URL(redirectTo).searchParams.get("lang");
      if (fromRedirect) return normalizeEmailLocale(fromRedirect);
    } catch {
      // malformed redirect: fall through to metadata
    }
  }
  return normalizeEmailLocale(typeof metadataLang === "string" ? metadataLang : null);
}
