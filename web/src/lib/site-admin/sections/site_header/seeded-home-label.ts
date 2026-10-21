/**
 * TUL-711: the onboarding seed stores the home nav label in ONE language
 * ("Home"), so a Spanish visitor on an English-seeded workspace saw "Home" in
 * the header (also on /book and the 404). Only the untouched seed pair is
 * rewritten, and only on the link that points at the site home; any other
 * label an owner typed stays as written.
 */
const SEEDED_HOME: Readonly<Record<"en" | "es", string>> = { en: "Home", es: "Inicio" };

export function localiseSeededHomeLabel(
  label: string,
  isHomeLink: boolean,
  locale: string | null | undefined,
): string {
  if (!isHomeLink) return label;
  const key = (locale ?? "").trim().toLowerCase().slice(0, 2);
  if (key !== "es" && key !== "en") return label;
  const t = label.trim();
  return t === SEEDED_HOME.en || t === SEEDED_HOME.es ? SEEDED_HOME[key] : label;
}
