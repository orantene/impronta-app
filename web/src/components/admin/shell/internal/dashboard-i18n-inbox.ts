/**
 * Spanish for the talent inbox (/talent/inbox): the job list, its filter
 * strip, row meta, empty states, and the rail / mobile handles around it.
 *
 * Keyed by the English literal, like every other dashboard catalog. Generic
 * words the inbox also draws ("Inquiry", "Hold", "Booked", "Today", "Offer",
 * "Wrapped", ...) already have rows in dashboard-i18n.ts and are not repeated.
 * Kept out of dashboard-i18n.ts, which sits on the size ratchet.
 */
export const INBOX_ES_TEXT: Record<string, string> = {
  "My jobs": "Mis trabajos",
  "All jobs": "Todos los trabajos",
  "Search jobs…": "Buscar trabajos…",
  "No job selected": "Ningún trabajo seleccionado",
  "Collapse jobs list": "Contraer la lista de trabajos",
  "Collapse to rail": "Contraer a la barra lateral",
  "Expand jobs list": "Expandir la lista de trabajos",
  "Open jobs list": "Abrir la lista de trabajos",
  "Open jobs": "Abrir trabajos",
  "jobs": "trabajos",
  "unread": "sin leer",
  "NEW": "NUEVO",
  "awaiting you": "esperando tu respuesta",
  "No matches for": "Sin resultados para",
  "Nothing in this view": "No hay nada en esta vista",
  "Try a different keyword, or clear the search.": "Prueba con otra palabra o borra la búsqueda.",
  "Try the All jobs filter or clear your search to see everything.": "Prueba el filtro Todos los trabajos o borra la búsqueda para verlo todo.",
  "Clear (Esc)": "Borrar (Esc)",
  "Mark unread": "Marcar como no leído",
  "Pinned": "Fijado",
  "Unpinned": "Dejado de fijar",
  "Marked read": "Marcado como leído",
  "Marked unread": "Marcado como no leído",
  "fresh": "reciente",
  "aging": "envejeciendo",
};
