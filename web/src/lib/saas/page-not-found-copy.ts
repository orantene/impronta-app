/**
 * Branded hard-404 (`/_page-not-found`) copy.
 *
 * Talent-site allow-list rejects (reserved / multi-segment) rewrite here before
 * Max-site SEO runs. Title must be locale-aware so Spanish hosts do not keep
 * the English child metadata that overrides the root default (TUL-121 theme9 P2).
 *
 * Neutral Mexican Spanish (tú). No em dashes.
 */
import { isSpanishLocale } from "@/lib/locale-time";
import { TULALA_BRAND } from "@/lib/brand/tulala";

export type PageNotFoundCopy = {
  /** Absolute browser-tab title (overrides root `%s · Tulala` template). */
  title: string;
  heading: string;
  body: string;
  homeCta: string;
  signInCta: string;
};

export function pageNotFoundCopy(locale: string | undefined | null): PageNotFoundCopy {
  if (isSpanishLocale(locale)) {
    return {
      title: `Página no encontrada · ${TULALA_BRAND.name}`,
      heading: "Página no encontrada",
      body: "La página que buscas no existe o puede haberse movido. Vuelve al inicio, o inicia sesión en tu espacio de trabajo.",
      homeCta: "Ir al inicio",
      signInCta: "Iniciar sesión",
    };
  }
  return {
    title: `Page not found · ${TULALA_BRAND.name}`,
    heading: "Page not found",
    body: "The page you're looking for doesn't exist or may have moved. Head back to the homepage, or sign in to your workspace.",
    homeCta: "Go to homepage",
    signInCta: "Sign in",
  };
}
