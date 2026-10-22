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
