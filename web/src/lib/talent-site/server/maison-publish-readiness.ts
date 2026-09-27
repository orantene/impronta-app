/**
 * Maison Review readiness (W37–W38, W76) — named blockers + fix links.
 * Pure evaluator + thin server loader. No generic "every button…" copy.
 */

export type MaisonPublishBlocker = {
  id: string;
  message: string;
  fixLabel: string;
  /** In-app path or hash the Review UI can navigate to. */
  fixHref: string;
};

export type MaisonPublishSuggestion = {
  id: string;
  message: string;
};

export type MaisonPublishReadiness = {
  ready: boolean;
  blockers: MaisonPublishBlocker[];
  suggestions: MaisonPublishSuggestion[];
  /** One-line ready copy when nothing blocks. */
  readyDetail: string;
};

export type MaisonPublishReadinessInput = {
  siteSlug: string | null;
  themeDesignSlug: string | null;
  /** Optional portfolio count for soft suggestions only. */
  photoCount?: number | null;
  /**
   * AUD-024: true when the chosen address is already owned by another site in
   * the shared subdomain namespace (`isPlatformSubdomainLabelTaken`). `null` or
   * absent means the check could not run; the DB trigger stays the backstop.
   */
  slugTaken?: boolean | null;
  /** Copy locale for blocker strings. Defaults to English. */
  locale?: MaisonReadinessLocale;
};

export type MaisonReadinessLocale = "en" | "es";

const COPY = {
  en: {
    noSlug: "Your site needs an address before publishing.",
    noSlugFix: "Choose an address",
    slugTaken: (slug: string) =>
      `The address ${slug}.tulala.digital is already taken. Choose another one before publishing.`,
    slugTakenFix: "Change the address",
    noDesign: "Apply a design before publishing.",
    noDesignFix: "Choose a design",
    morePhotos: "Optional: add 4 more photos to fill Recent work.",
    readyDetail: "Your services, photos and contact details are complete.",
    ready: "Ready to publish",
    one: "1 thing before publishing",
    many: (n: number) => `${n} things before publishing`,
  },
  es: {
    noSlug: "Tu sitio necesita una dirección antes de publicar.",
    noSlugFix: "Elige una dirección",
    slugTaken: (slug: string) =>
      `La dirección ${slug}.tulala.digital ya está en uso. Elige otra antes de publicar.`,
    slugTakenFix: "Cambiar la dirección",
    noDesign: "Aplica un diseño antes de publicar.",
    noDesignFix: "Elige un diseño",
    morePhotos: "Opcional: agrega 4 fotos más para llenar Trabajos recientes.",
    readyDetail: "Tus servicios, fotos y datos de contacto están completos.",
    ready: "Listo para publicar",
    one: "1 cosa antes de publicar",
    many: (n: number) => `${n} cosas antes de publicar`,
  },
} as const;

export function evaluateMaisonPublishReadiness(
  input: MaisonPublishReadinessInput,
): MaisonPublishReadiness {
  const c = COPY[input.locale === "es" ? "es" : "en"];
  const blockers: MaisonPublishBlocker[] = [];
  const slug = (input.siteSlug ?? "").trim();
  if (!slug) {
    blockers.push({
      id: "no_slug",
      message: c.noSlug,
      fixLabel: c.noSlugFix,
      fixHref: "#maison-site-address",
    });
  } else if (input.slugTaken === true) {
    blockers.push({
      id: "slug_taken",
      message: c.slugTaken(slug),
      fixLabel: c.slugTakenFix,
      fixHref: "#maison-site-address",
    });
  }
  if (!input.themeDesignSlug) {
    blockers.push({
      id: "no_design",
      message: c.noDesign,
      fixLabel: c.noDesignFix,
      fixHref: "#maison-setup-host",
    });
  }

  const suggestions: MaisonPublishSuggestion[] = [];
  if (
    typeof input.photoCount === "number" &&
    input.photoCount >= 0 &&
    input.photoCount < 4
  ) {
    suggestions.push({
      id: "more_photos",
      message: c.morePhotos,
    });
  }

  return {
    ready: blockers.length === 0,
    blockers,
    suggestions,
    readyDetail: c.readyDetail,
  };
}

export function maisonReadinessHeadline(
  readiness: MaisonPublishReadiness,
  locale: MaisonReadinessLocale = "en",
): string {
  const c = COPY[locale === "es" ? "es" : "en"];
  if (readiness.ready) return c.ready;
  const n = readiness.blockers.length;
  return n === 1 ? c.one : c.many(n);
}
