/** EN/ES labels for the drawer's own chrome (aria-labels, tooltips). */
const ES = {
  copyLink: "Copiar enlace a este panel",
  linkCopied: "Enlace copiado. Quien tenga acceso llega aquí.",
  back: "Atrás",
  backTo: "Volver a",
  close: "Cerrar",
  closeDrawer: "Cerrar panel y volver a la página",
  sizes: { compact: "tamaño compacto", half: "media página", full: "página completa" },
  tips: { compact: "Panel lateral", half: "Media página", full: "Página completa" },
} as const;

const EN = {
  copyLink: "Copy link to this drawer",
  linkCopied: "Link copied. Anyone with access lands here.",
  back: "Back",
  backTo: "Back to",
  close: "Close",
  closeDrawer: "Close drawer and return to page",
  sizes: { compact: "compact size", half: "half size", full: "full size" },
  tips: { compact: "Side drawer", half: "Half-page", full: "Full-page" },
} as const;

export function drawerChrome(locale: string) {
  return locale.toLowerCase().startsWith("es") ? ES : EN;
}
