/**
 * TUL-711: the onboarding seed writes the header menu rows once per locale, and often for
 * ONE language only. A visit in another language falls back to those rows
 * (`loadNavigationWithLocaleFallback`), so a Spanish visitor read "Home" / "Contact".
 * Only the untouched seeded pair on its seeded destination is translated; any label an
 * owner typed by hand ("Portada", "Get in touch") is shown as written.
 */
const SEEDED: ReadonlyArray<{ path: string; en: string; es: string }> = [
  { path: "/", en: "Home", es: "Inicio" },
  { path: "/contact", en: "Contact", es: "Contacto" },
];

function pathOf(href: string): string {
  const p = href.trim().split(/[?#]/)[0]!.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

export function localiseSeededCmsNavLabel(
  label: string,
  href: string,
  locale: string | null | undefined,
): string {
  const key = (locale ?? "").trim().toLowerCase().slice(0, 2);
  if (key !== "es" && key !== "en") return label;
  const path = pathOf(href);
  const t = label.trim();
  const hit = SEEDED.find((s) => s.path === path && (t === s.en || t === s.es));
  return hit ? hit[key] : label;
}
