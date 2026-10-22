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

/**
 * TUL-711 (staging QA 2026-10-22): the seeded "Home" link does not always resolve to the exact
 * home href. A page link to the seeded home page resolves to `/w/<slug>/home`, a root link can carry
 * a trailing slash, a hash or the locale prefix, so strict equality left "Home" on the ES site.
 * True when `href` is the home href, or a path whose last meaningful segment is the seeded home
 * page (root, `home`, `inicio`) under the locale / tenant prefix.
 */
export function isSeededHomeHref(href: string, homeHref: string): boolean {
  const clean = (v: string) => v.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  const h = clean(href);
  const home = clean(homeHref);
  if (h === home) return true;
  if (/^[a-z]+:\/\//i.test(href)) return false;
  const rest = h.startsWith(home === "/" ? "/" : `${home}/`) ? h.slice(home === "/" ? 1 : home.length + 1) : null;
  const tail = (rest ?? "").replace(/^[a-z]{2}(-[A-Za-z]{2})?(\/|$)/, "");
  return rest !== null && (tail === "" || tail === "home" || tail === "inicio");
}
