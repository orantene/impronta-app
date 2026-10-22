/**
 * Hub landing chrome copy, en + es (TUL-1843 follow-up). Pure, so the hub page
 * (server) and the agency list (client) share one table. No em dashes.
 */
export type HubLandingCopy = {
  heroTitle: string;
  tagline: string;
  noAgencies: string;
  featuredOnHub: string;
  searchAgencies: string;
  noMatches: string;
  metaTitle: (brand: string) => string;
};

const EN: HubLandingCopy = {
  heroTitle: "Agencies on the platform",
  tagline:
    "Each agency runs its own storefront at its own domain. Visit one to browse its talent roster and open an inquiry.",
  noAgencies: "No active agency domains yet.",
  featuredOnHub: "Featured on the hub",
  searchAgencies: "Search agencies",
  noMatches: "No agencies match your search.",
  metaTitle: (brand) => `Agencies on the platform · ${brand}`,
};

const ES: HubLandingCopy = {
  heroTitle: "Agencias en la plataforma",
  tagline:
    "Cada agencia tiene su propio sitio en su propio dominio. Visita uno para ver su roster de talento y enviar una consulta.",
  noAgencies: "Todavía no hay dominios de agencias activos.",
  featuredOnHub: "Destacados en el hub",
  searchAgencies: "Buscar agencias",
  noMatches: "Ninguna agencia coincide con tu búsqueda.",
  metaTitle: (brand) => `Agencias en la plataforma · ${brand}`,
};

export function hubLandingCopy(locale: string | null | undefined): HubLandingCopy {
  return (locale ?? "").toLowerCase().startsWith("es") ? ES : EN;
}

/**
 * TUL-1884: the hub tenant row was seeded with the pre-rebrand literals "Impronta Hub" and
 * "The global talent directory." (migration 20260625100000). Those are placeholders, not
 * an operator's words: showing them on an ES hub home printed English and the old brand.
 * A seeded value falls back to the platform hub name / the localized tagline; anything an
 * operator typed is shown as written.
 */
const SEEDED_HUB_NAMES = new Set(["impronta hub"]);
const SEEDED_HUB_TAGLINES = new Set(["the global talent directory", "the global talent directory."]);

export function hubDisplayName(publicName: string | null | undefined, platformName: string): string {
  const v = publicName?.trim();
  return v && !SEEDED_HUB_NAMES.has(v.toLowerCase()) ? v : platformName;
}

export function hubDisplayTagline(tagline: string | null | undefined, localizedFallback: string): string {
  const v = tagline?.trim();
  return v && !SEEDED_HUB_TAGLINES.has(v.toLowerCase()) ? v : localizedFallback;
}

/**
 * TUL-1884: the seeded hub homepage row (cms_pages) also carries the literal "Impronta Hub" as its
 * title and meta title. A placeholder never beats the localized fallback; an operator's own title does.
 */
export function hubCmsTitle(title: string | null | undefined, localizedFallback: string): string {
  const v = title?.trim();
  return v && !SEEDED_HUB_NAMES.has(v.toLowerCase()) ? v : localizedFallback;
}
