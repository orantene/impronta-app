import type { Locale } from "@/i18n/config";

/**
 * Which language the top bar's ES/EN pill lights (TUL-1277).
 *
 * The page copy renders the SERVER-resolved locale (DashboardLocaleProvider),
 * so the pill lights that same value. It used to read the `locale` cookie,
 * which can disagree with what was rendered (a stale duplicate cookie, or a
 * seed hop), and Today stayed in English with ES lit until a navigation. A
 * click lights the pick only until the reload lands.
 */
export function activeLocalePill(input: {
  rendered: string;
  picked: Locale | null;
  locales: readonly Locale[];
  fallback: Locale;
}): Locale {
  if (input.picked) return input.picked;
  const rendered = input.locales.find((code) => code === input.rendered.trim());
  return rendered ?? input.fallback;
}
