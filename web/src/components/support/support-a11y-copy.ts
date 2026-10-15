/**
 * Small ES/EN copy map for Support Desk hints and states. Kept local (not in
 * messages/*.json) so it does not collide with the many branches editing those
 * catalogs. Plain sentences, no em dashes.
 */
type Copy = {
  ideaTitleHint: string;
  pushBusy: string;
  pushDeniedHelp: string;
  pushUnsupportedHelp: string;
  guideLoading: string;
  guideUnavailable: string;
  submitFailedPrefix: string;
};

const EN: Copy = {
  ideaTitleHint: "Add a short title to send your idea.",
  pushBusy: "Working",
  pushDeniedHelp: "Allow notifications for this site in your browser settings, then reload.",
  pushUnsupportedHelp: "Use a recent Chrome, Edge or Firefox on desktop to get notifications.",
  guideLoading: "Loading the article",
  guideUnavailable: "This article is not available right now. Go back and pick another one.",
  submitFailedPrefix: "",
};

const ES: Copy = {
  ideaTitleHint: "Agrega un título corto para enviar tu idea.",
  pushBusy: "Un momento",
  pushDeniedHelp: "Permite las notificaciones de este sitio en los ajustes del navegador y recarga.",
  pushUnsupportedHelp: "Usa una versión reciente de Chrome, Edge o Firefox en computadora para recibir avisos.",
  guideLoading: "Cargando el artículo",
  guideUnavailable: "Este artículo no está disponible por ahora. Vuelve y elige otro.",
  submitFailedPrefix: "",
};

export function supportA11yCopy(locale: string): Copy {
  return locale.toLowerCase().startsWith("es") ? ES : EN;
}
