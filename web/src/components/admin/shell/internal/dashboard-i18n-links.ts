/**
 * Spanish for the QR & Links surfaces.
 *
 * Its own module rather than fifteen more lines in `dashboard-i18n.ts`, which
 * is on the size ratchet: that file is grandfathered past eslint's max-lines
 * cap, so the ratchet is the only thing holding it, and every feature adding
 * "just a few strings" is how it got to three and a half thousand lines.
 * Spread into `ES_TEXT`, so lookups are unchanged.
 */
export const LINKS_ES_TEXT: Record<string, string> = {
  "Share this link": "Comparte este enlace",
  "QR code for {name}": "Código QR de {name}",
  "Tracked link": "Enlace con seguimiento",
  "scans · 30d": "escaneos · 30 d",
  "WhatsApp": "WhatsApp",
  "PNG": "PNG",
  "Print PDF": "PDF para imprimir",
  "Copy the link, then paste it into your Story": "Copia el enlace y pégalo en tu historia",
  "Design it": "Diséñalo",
  "The print designer is not built yet": "El diseñador de impresión todavía no existe",
  "Coming soon. For now, use Print PDF.": "Muy pronto. Por ahora usa PDF para imprimir.",
  "Table tent": "Portamenú de mesa",
  "Flyer": "Volante",
  "Sticker": "Calcomanía",
  "Story": "Historia",
};
