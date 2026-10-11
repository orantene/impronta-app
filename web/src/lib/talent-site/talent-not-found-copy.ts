/**
 * GRK-028 / TUL-547 — copy for the 404 a guest sees on a talent site host.
 *
 * Both 404 paths share it: the proxy rewrite to `/_page-not-found` (paths the
 * host allow-list rejects) and `notFound()` inside `/_talent-site/[[...pageSlug]]`
 * (a one-word path that passes the allow-list but is not a page). The site's
 * own name brands it; Tulala never appears on a talent's 404.
 */

export type TalentNotFoundCopy = {
  lang: "es" | "en";
  /** Document title, absolute (no " · Tulala" template). */
  documentTitle: string;
  eyebrow: string;
  heading: string;
  body: string;
  home: string;
};

const COPY = {
  en: {
    fallbackName: "This site",
    heading: "Page not found",
    body: "That page isn't on this site. Head back home to keep browsing.",
    home: "Back to home",
  },
  es: {
    fallbackName: "Este sitio",
    heading: "Página no encontrada",
    body: "Esa página no está en este sitio. Vuelve al inicio para seguir navegando.",
    home: "Volver al inicio",
  },
} as const;

export function talentNotFoundLang(locale: string | null | undefined): "es" | "en" {
  return (locale ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
}

export function talentNotFoundCopy(
  locale: string | null | undefined,
  siteName: string | null | undefined,
): TalentNotFoundCopy {
  const lang = talentNotFoundLang(locale);
  const t = COPY[lang];
  const name = siteName?.trim() || null;
  return {
    lang,
    documentTitle: name ? `${t.heading} · ${name}` : t.heading,
    eyebrow: name ?? t.fallbackName,
    heading: t.heading,
    body: t.body,
    home: t.home,
  };
}
