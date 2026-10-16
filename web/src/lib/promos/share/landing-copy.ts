import type { ShareLang } from "./captions";
import type { LandingState } from "./landing-core";

/** ES copy library (L9) plus EN. No em dashes. */
export type LandingCopy = {
  title: string;
  body: string | null;
  cta: string;
  alternativesTitle: string | null;
};

const ES: Record<LandingState, LandingCopy> = {
  live: { title: "Tu descuento ya está aplicado ✓", body: null, cta: "Reservar", alternativesTitle: null },
  scheduled: { title: "Esta promo empieza pronto", body: "Mientras tanto, mira lo disponible.", cta: "Ver lo disponible", alternativesTitle: null },
  ended: { title: "Esta promo terminó", body: "Pero puedes reservar:", cta: "Ver lo disponible", alternativesTitle: "Promos activas" },
  sold_out: { title: "Esta promo se agotó", body: "Pero puedes reservar:", cta: "Ver lo disponible", alternativesTitle: "Promos activas" },
  paused: { title: "Esta promo terminó", body: "Pero puedes reservar:", cta: "Ver lo disponible", alternativesTitle: "Promos activas" },
  gone: { title: "Esta promo ya no está disponible", body: null, cta: "Ver lo disponible", alternativesTitle: "Promos activas" },
  personal_locked: { title: "Esta oferta es personal", body: "Abre el enlace que te enviaron para verla.", cta: "Ver lo disponible", alternativesTitle: "Promos activas" },
};

const EN: Record<LandingState, LandingCopy> = {
  live: { title: "Your discount is applied ✓", body: null, cta: "Book now", alternativesTitle: null },
  scheduled: { title: "This promo starts soon", body: "In the meantime, see what is available.", cta: "See what is available", alternativesTitle: null },
  ended: { title: "This promo has ended", body: "But you can still book:", cta: "See what is available", alternativesTitle: "Active promos" },
  sold_out: { title: "This promo is sold out", body: "But you can still book:", cta: "See what is available", alternativesTitle: "Active promos" },
  paused: { title: "This promo has ended", body: "But you can still book:", cta: "See what is available", alternativesTitle: "Active promos" },
  gone: { title: "This promo is no longer available", body: null, cta: "See what is available", alternativesTitle: "Active promos" },
  personal_locked: { title: "This offer is personal", body: "Open the link you were sent to see it.", cta: "See what is available", alternativesTitle: "Active promos" },
};

export function landingCopy(state: LandingState, lang: ShareLang): LandingCopy {
  return (lang === "es" ? ES : EN)[state];
}

/** Every state is HTTP 200 and every promo page is noindex. */
export const LANDING_ROBOTS = { index: false, follow: false } as const;
