/**
 * maison-derive.ts — the Maison template's COPY and its pure derivations.
 *
 * Split out of MaisonProfileLayout.tsx when that file crossed the 800-line
 * budget. The split is not arbitrary: everything here is PURE — it takes the
 * profile's props and returns data, touches no React and no server code — and
 * it is the part of the template that decides what the page SAYS about a
 * talent when nobody has authored it. That is exactly the part worth testing
 * directly, so it lives where a test can reach it without importing the
 * component tree. See maison-derivations.test.ts.
 */

import type { TalentOffering } from "@/lib/talent/offerings-types";

import type { MaisonContent } from "./maison-content";
import type { MaisonShot } from "./MaisonGallery";
import type { MaisonProfileLayoutProps } from "./MaisonProfileLayout";

// ── Copy ────────────────────────────────────────────────────────────────────

export const COPY = {
  es: {
    navAbout: "Sobre mí",
    navServices: "Servicios",
    navResults: "Resultados",
    navVisit: "Tu cita",
    navFaq: "Preguntas",
    book: "Reservar",
    heroPrimary: "Ver servicios y reservar",
    heroSecondary: "Conóceme",
    servicesTitle: "Servicios",
    servicesAccent: "y precios",
    /** {currency} is filled from the catalogue — never hardcode a country. */
    servicesLead: "Todos los precios en {currency}.",
    menuKicker: "El menú",
    metaServices: "servicios",
    metaCategories: "categorías",
    requestOnlyNote: "Las citas quedan sujetas a confirmación.",
    select: "Seleccionar",
    options: "Elegir opciones",
    consult: "Consultar",
    selected: "Seleccionado",
    from: "Desde",
    durationNote: "duración estimada",
    barIdleTitle: "Elige tu servicio",
    barIdleHint: "Del menú completo, con sus opciones",
    barSeeServices: "Ver servicios",
    barContinue: "Continuar",
    menuEmptyTitle: "El menú llega pronto",
    menuEmptyBody: "Los servicios, precios y opciones se publican desde el catálogo del panel.",
    resultsTitle: "Trabajos",
    resultsAccent: "recientes",
    galleryEmptyTitle: "Las fotos llegan pronto",
    galleryEmptyBody: "Se publican desde el panel y aparecen aquí automáticamente.",
    close: "Cerrar",
    prev: "Anterior",
    next: "Siguiente",
    visitTitle: "Tu",
    visitAccent: "cita",
    visitWhere: "Dónde",
    visitTravels: "Va a",
    visitLanguages: "Idiomas",
    visitRemote: "En línea",
    faqTitle: "Antes de tu cita",
    stepsTitle: "Cómo reservar",
    askLead: "¿No encontrás tu respuesta? Escribime y lo vemos juntas.",
    askCta: "Hacer una pregunta",
    contactEmail: "Correo",
    reviews: "Reseñas",
    portraitPending: "El retrato aparece en cuanto se sube desde el panel.",
    artistFallbackGreeting: "Sobre mí",
    moreLabel: "Leer más",
  },
  en: {
    navAbout: "About",
    navServices: "Services",
    navResults: "Results",
    navVisit: "Your visit",
    navFaq: "FAQ",
    book: "Book",
    heroPrimary: "See services and book",
    heroSecondary: "Meet me",
    servicesTitle: "Services",
    servicesAccent: "and prices",
    servicesLead: "All prices in {currency}.",
    menuKicker: "The menu",
    metaServices: "services",
    metaCategories: "categories",
    requestOnlyNote: "Appointments are subject to confirmation.",
    select: "Select",
    options: "Choose options",
    consult: "Ask",
    selected: "Selected",
    from: "From",
    durationNote: "estimated duration",
    barIdleTitle: "Choose your service",
    barIdleHint: "From the full menu, with its options",
    barSeeServices: "See services",
    barContinue: "Continue",
    menuEmptyTitle: "Menu coming soon",
    menuEmptyBody: "Services, prices and options are published from the dashboard catalogue.",
    resultsTitle: "Recent",
    resultsAccent: "work",
    galleryEmptyTitle: "Photos coming soon",
    galleryEmptyBody: "They are published from the dashboard and appear here automatically.",
    close: "Close",
    prev: "Previous",
    next: "Next",
    visitTitle: "Your",
    visitAccent: "visit",
    visitWhere: "Where",
    visitTravels: "Travels to",
    visitLanguages: "Languages",
    visitRemote: "Online",
    faqTitle: "Before your appointment",
    stepsTitle: "How to book",
    askLead: "Not here? Message me and we will work it out.",
    askCta: "Ask a question",
    contactEmail: "Email",
    reviews: "Reviews",
    portraitPending: "The portrait appears as soon as it is uploaded from the dashboard.",
    artistFallbackGreeting: "About",
    moreLabel: "Read more",
  },
} as const;

export type Copy = { [K in keyof (typeof COPY)["es"]]: string };

export function pick(locale: string): Copy {
  return locale.toLowerCase().startsWith("es") ? COPY.es : COPY.en;
}

// ── Derivations ─────────────────────────────────────────────────────────────

export function publicOfferings(offerings: TalentOffering[]): TalentOffering[] {
  return offerings
    .filter(
      (o) =>
        o.status === "published" &&
        o.moderationState === "approved" &&
        o.visibility !== "agency_only",
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function categoriesFrom(
  offerings: TalentOffering[],
  override: MaisonContent["menuCategories"],
): { id: string; label: string; note?: string | null }[] {
  if (override?.length) return override.filter((c) => offerings.some((o) => o.category === c.id));
  const seen: string[] = [];
  for (const o of offerings) {
    const c = o.category?.trim();
    if (c && !seen.includes(c)) seen.push(c);
  }
  return seen.map((c) => ({ id: c, label: c }));
}

/** Facts for the hero, from the structured skills model when not authored. */
export function derivedFacts(props: MaisonProfileLayoutProps): string[] {
  const es = props.locale.toLowerCase().startsWith("es");
  const out: string[] = [];
  const years = props.resolvedSkills.reduce(
    (max, s) => (s.years_experience && s.years_experience > max ? s.years_experience : max),
    0,
  );
  if (years > 0) out.push(es ? `${years} años de experiencia` : `${years} years of experience`);
  const primary =
    props.resolvedSkills.find((s) => s.relationship_type === "primary_role") ??
    props.resolvedSkills[0];
  if (primary) {
    const term = (es ? primary.skill_name_es : null) ?? primary.skill_name_en;
    // "Lash Artist" already names the role — appending "specialist" to it
    // produced "Lash Artist specialist".
    const namesRole = /\b(artist|specialist|stylist|technician|pro)\b/i.test(term);
    out.push(
      es
        ? `Especialista en ${term.toLowerCase()}`
        : namesRole
          ? term
          : `${term} specialist`,
    );
  } else if (props.primaryType) {
    out.push(props.primaryType);
  }
  return out;
}

/**
 * The sentence naming the currency a menu is priced in.
 *
 * The template shipped with "pesos mexicanos (MXN)" written into its copy,
 * which is correct for the studio it was designed against and wrong for every
 * other talent this template is meant to serve. Derive it instead: name the
 * currency only when the whole catalogue agrees on one, and say nothing rather
 * than something false when it does not.
 */
export function priceNoteFor(offerings: TalentOffering[], locale: string, template: string): string | null {
  const currencies = new Set(
    offerings.map((o) => (o.currency || "").toUpperCase()).filter(Boolean),
  );
  if (currencies.size !== 1) return null;
  const code = [...currencies][0]!;
  let label = code;
  try {
    const names = new Intl.DisplayNames([locale], { type: "currency" });
    const long = names.of(code);
    // Intl returns the CODE itself when it has no name for it, and a bare
    // "MXN (MXN)" would read worse than nothing.
    if (long && long.toUpperCase() !== code) label = `${long} (${code})`;
  } catch {
    // Unsupported locale/ICU build: the code alone is still true.
  }
  return template.replace("{currency}", label);
}

/**
 * Where she works, from the structured service-area rows — the same data the
 * profile already shows elsewhere, so this adds no query and can never
 * disagree with the rest of the page. Returns null when there is nothing to
 * say, and the band then hides itself rather than rendering empty headings.
 */
export function derivedVisiting(
  props: MaisonProfileLayoutProps,
  c: Copy,
): NonNullable<MaisonContent["visiting"]> | null {
  const es = props.locale.toLowerCase().startsWith("es");
  const lang = es ? "es" : "en";
  const facts: NonNullable<MaisonContent["visiting"]>["facts"] = [];

  const place = (a: (typeof props.serviceAreas)[number]): string | null => {
    const n = a.locations?.display_name_i18n;
    return (n?.[lang] ?? n?.en ?? n?.es ?? null) || null;
  };

  const base = props.serviceAreas.find((a) => a.service_kind === "home_base");
  const baseName = base ? place(base) : null;
  if (baseName ?? props.livesIn) {
    facts.push({ label: c.visitWhere, value: baseName ?? props.livesIn!, icon: "place" });
  }

  const travel = props.serviceAreas.filter((a) => a.service_kind === "travel_to");
  const travelNames = travel.map(place).filter((x): x is string => Boolean(x));
  if (travelNames.length) {
    facts.push({ label: c.visitTravels, value: travelNames.join(" · "), icon: "studio" });
  } else if (props.serviceAreas.some((a) => a.service_kind === "remote_only")) {
    facts.push({ label: c.visitWhere, value: c.visitRemote, icon: "studio" });
  }

  if (props.languages.length) {
    facts.push({ label: c.visitLanguages, value: props.languages.join(" · "), icon: "languages" });
  }

  return facts.length ? { facts } : null;
}

export function paragraphsOf(text: string): string[] {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function resolveMaisonContent(props: MaisonProfileLayoutProps, c: Copy): MaisonContent {
  const m = props.maison ?? {};
  const offerings = publicOfferings(props.storefrontOfferings);
  const bio = paragraphsOf(props.aboutText);
  const categories = categoriesFrom(offerings, m.menuCategories);
  return {
    ...m,
    heroKicker: m.heroKicker ?? props.livesIn ?? null,
    heroTitle: m.heroTitle ?? props.name,
    heroTitleAccent: m.heroTitleAccent ?? null,
    heroLead: m.heroLead ?? bio[0] ?? null,
    heroImageUrl: m.heroImageUrl ?? props.bannerUrl ?? props.galleryItems[0]?.url ?? null,
    heroInsetUrl: m.heroInsetUrl ?? props.galleryItems[1]?.url ?? null,
    heroFacts: m.heroFacts ?? derivedFacts(props),
    marquee: m.marquee ?? categories.map((x) => x.label),
    artist:
      m.artist ??
      (bio.length
        ? { greeting: c.artistFallbackGreeting, paragraphs: bio.slice(0, 2), more: bio.slice(2) }
        : null),
    menuCategories: categories,
    visiting: m.visiting !== undefined ? m.visiting : derivedVisiting(props, c),
    gallery:
      m.gallery ??
      props.galleryItems.map<MaisonShot>((g, i) => ({
        id: g.id,
        url: g.url,
        label: props.name,
        wide: i === 2,
      })),
  };
}
