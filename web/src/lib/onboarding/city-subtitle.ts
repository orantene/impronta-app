/**
 * The second line under a city in the signup picker, in the page language.
 * Curated and Google rows carry the country in English ("Cancún, Mexico");
 * a Spanish page reads it as "México" (TUL-803). Pure.
 */
export function localizeCitySubtitle(
  city: { subtitle: string | null; countryIso2: string },
  locale: "en" | "es",
): string | null {
  const sub = city.subtitle;
  if (!sub || locale !== "es" || !/^[A-Za-z]{2}$/.test(city.countryIso2)) return sub;
  try {
    const code = city.countryIso2.toUpperCase();
    const en = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    const es = new Intl.DisplayNames(["es"], { type: "region" }).of(code);
    if (!en || !es || en === es) return sub;
    return sub.replace(new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), es);
  } catch {
    return sub;
  }
}
