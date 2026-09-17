/**
 * Header navigation — 2026-09 marketing patch (applied to the LIVE shell rows).
 *
 * The live shell (both locales) carries builder edits the seeder does not
 * know about — the LUMINA link, header version 51 — so, like the home and
 * studio pages, the nav gets a surgical patch: only the `links` array of the
 * `nav` node is rebuilt, and the existing "Our Talents" mega-menu entry and
 * the LUMINA entry are carried over untouched.
 *
 * NEW ORDER (owner's commercial map, 2026-09-17):
 *   Our Talents · Services (mega, six briefs + the Show featured) ·
 *   Experiences · The Show · About · Contact · LUMINA
 *
 * "Home" leaves the bar: the logo is the home link, and a seventh word in the
 * bar is what pushed the header to wrap at tablet width. Submenu labels stay
 * under ~26 characters: the drawer renders them uppercase, letter-spaced and
 * `nowrap`, so anything longer is clipped at 375px (seen live 2026-09-17). Spanish hrefs are
 * `/es/...`-prefixed exactly as the live Spanish shell already does.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

type NavLink = {
  id: string;
  label: string;
  href: string;
  icon?: string;
  description?: string;
  children?: NavLink[];
  featured?: { title: string; description?: string; href: string; imageSrc?: string; imageMediaId?: string };
};

type Locale = "en" | "es";

const COPY: Record<
  Locale,
  {
    services: string;
    servicesGroup: string;
    brands: string;
    brandsDesc: string;
    activations: string;
    activationsDesc: string;
    privateEvents: string;
    privateEventsDesc: string;
    hotels: string;
    hotelsDesc: string;
    runway: string;
    runwayDesc: string;
    studio: string;
    studioDesc: string;
    featuredTitle: string;
    featuredDesc: string;
    experiences: string;
    show: string;
    about: string;
    contact: string;
  }
> = {
  en: {
    services: "Services",
    servicesGroup: "By brief",
    brands: "Brands & designers",
    brandsDesc: "Campaigns, lookbooks, launches and runway.",
    activations: "Activations & promo",
    activationsDesc: "Hosts, promoters and staff for brand events.",
    privateEvents: "Private events & weddings",
    privateEventsDesc: "Entertainment and talent for celebrations.",
    hotels: "Hotels, resorts & clubs",
    hotelsDesc: "Shows, dancers, acrobats and guest activations.",
    runway: "Runway & audiovisual",
    runwayDesc: "Fashion shows, video and content, produced as one.",
    studio: "Studio & experiences",
    studioDesc: "Photo sessions, posing course, Model for a Day.",
    featuredTitle: "Show Impronta",
    featuredDesc: "A complete live show for hotels, resorts and venues. Season dates now open.",
    experiences: "Experiences",
    show: "The Show",
    about: "About",
    contact: "Contact",
  },
  es: {
    services: "Servicios",
    servicesGroup: "Por tipo de brief",
    brands: "Marcas y diseñadores",
    brandsDesc: "Campañas, lookbooks, lanzamientos y pasarela.",
    activations: "Activaciones y promo",
    activationsDesc: "Edecanes, promotores y personal para eventos de marca.",
    privateEvents: "Eventos privados y bodas",
    privateEventsDesc: "Entretenimiento y talento para celebraciones.",
    hotels: "Hoteles, resorts y clubes",
    hotelsDesc: "Shows, bailarines, acróbatas y activaciones para huéspedes.",
    runway: "Pasarela y audiovisual",
    runwayDesc: "Desfiles, video y contenido, producidos como uno solo.",
    studio: "Estudio y experiencias",
    studioDesc: "Sesiones de fotos, Curso de Posing, Modelo por un día.",
    featuredTitle: "Show Impronta",
    featuredDesc: "Un show en vivo completo para hoteles, resorts y venues. Fechas de temporada abiertas.",
    experiences: "Experiencias",
    show: "El Show",
    about: "Nosotros",
    contact: "Contacto",
  },
};

function prefixed(locale: Locale, href: string): string {
  return locale === "es" ? `/es${href}` : href;
}

export function buildMarketingNavLinks(
  locale: Locale,
  carried: { talents: NavLink | null; lumina: NavLink | null },
  opts: { showHeroUrl: string | null },
): NavLink[] {
  const c = COPY[locale];
  const id = (s: string) => `shellhdr-${locale}-nav-${s}`;
  const p = (href: string) => prefixed(locale, href);
  const seg = (key: string) => p(`/p/for-clients#rb-clients-seg-${key}`);

  const services: NavLink = {
    id: id("services"),
    label: c.services,
    href: p("/p/for-clients"),
    children: [
      {
        id: id("services-group"),
        label: c.servicesGroup,
        href: p("/p/for-clients"),
        children: [
          { id: id("svc-brands"), label: c.brands, href: seg("brands"), icon: "camera", description: c.brandsDesc },
          { id: id("svc-activations"), label: c.activations, href: seg("activations"), icon: "mic", description: c.activationsDesc },
          { id: id("svc-private"), label: c.privateEvents, href: seg("private"), icon: "gift", description: c.privateEventsDesc },
          { id: id("svc-hotels"), label: c.hotels, href: seg("hotels"), icon: "building", description: c.hotelsDesc },
          { id: id("svc-runway"), label: c.runway, href: seg("runway"), icon: "film", description: c.runwayDesc },
          { id: id("svc-studio"), label: c.studio, href: p("/p/experiences"), icon: "sparkle", description: c.studioDesc },
        ],
      },
    ],
    featured: {
      title: c.featuredTitle,
      description: c.featuredDesc,
      href: p("/p/show"),
      ...(opts.showHeroUrl ? { imageSrc: opts.showHeroUrl } : {}),
    },
  };

  const links: NavLink[] = [];
  if (carried.talents) links.push(carried.talents);
  links.push(services);
  links.push({ id: id("experiences"), label: c.experiences, href: p("/p/experiences") });
  links.push({ id: id("show"), label: c.show, href: p("/p/show") });
  links.push({ id: id("about"), label: c.about, href: p("/p/about") });
  links.push({ id: id("contact"), label: c.contact, href: p("/p/contact") });
  if (carried.lumina) links.push(carried.lumina);
  return links;
}

/**
 * Pure: finds the `nav` node (id `shellhdr-<locale>-nav`, or the first nav
 * node if the id drifted), carries over the "Our Talents" mega entry and the
 * LUMINA entry, and replaces `props.links`. Idempotent by content: if the
 * links already equal the target, `changed` is false.
 */
export function patchShellNavLinks(
  live: BuilderNode[],
  locale: Locale,
  opts: { showHeroUrl: string | null },
): { tree: BuilderNode[]; changed: boolean; problems: string[] } {
  const problems: string[] = [];
  let changed = false;
  let found = false;

  const walk = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes.map((node) => {
      if (!found && node.kind === "nav") {
        found = true;
        const props = node.props as { links?: NavLink[] };
        const current = props.links ?? [];
        const talents =
          current.find((l) => l.id === `shellhdr-${locale}-nav-divisions`) ??
          current.find((l) => /\/directory$/.test(l.href) && Array.isArray(l.children)) ??
          null;
        const lumina = current.find((l) => /lumina/i.test(l.label) || /\/lumina$/.test(l.href)) ?? null;
        if (!talents) problems.push(`${locale}: "Our Talents" mega entry not found; nav left unchanged`);
        if (problems.length) return node;
        const next = buildMarketingNavLinks(locale, { talents, lumina }, opts);
        if (JSON.stringify(next) === JSON.stringify(current)) return node;
        changed = true;
        return { ...node, props: { ...node.props, links: next } } as BuilderNode;
      }
      const children = (node as { children?: BuilderNode[] }).children;
      if (Array.isArray(children)) {
        const nextChildren = walk(children);
        if (nextChildren.some((c, i) => c !== children[i])) return { ...node, children: nextChildren } as BuilderNode;
      }
      return node;
    });

  const tree = walk(live);
  if (!found) problems.push(`${locale}: no nav node in the shell tree`);
  return { tree, changed, problems };
}
