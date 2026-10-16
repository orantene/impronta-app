/**
 * Spanish editor-chrome strings for the `promo` page-builder block (TUL-1051
 * part B): the inspector in `inspectors/promo-inspector.tsx`. The visitor-facing
 * widget copy is separate and lives in `lib/promos/widgets/copy.ts`.
 *
 * Registered in `editor-i18n-es.ts` and in `ES_CATALOG_FILES`
 * (`es-parity.static.test.ts`). House rules: no em dashes.
 */

export const ES_PROMO_WIDGET_TEXT: Record<string, string> = {
  // ── sections ─────────────────────────────────────────────────────────────
  "Look": "Estilo",
  "One block, seven looks. It shows one of your live promos and stays hidden when you have none.":
    "Un bloque, siete estilos. Muestra una de tus promos activas y se oculta cuando no tienes ninguna.",
  "Offer": "Oferta",
  "Pick one of your promos, or let the block show your best live promo.":
    "Elige una de tus promos, o deja que el bloque muestre tu mejor promo activa.",
  "Leave empty to use the default text in your site language.":
    "Déjalo vacío para usar el texto por defecto en el idioma de tu sitio.",
  "Pop-up": "Ventana emergente",
  "It opens on the first trigger that fires. Leave all three empty to open right away.":
    "Se abre con el primer disparador que se cumpla. Deja los tres vacíos para abrirla de inmediato.",
  "Who sees it": "Quién la ve",
  "A display rule only. The price a client pays is still decided when they book.":
    "Es solo una regla de visualización. El precio que paga un cliente se define al reservar.",
  "When": "Cuándo",
  "Optional dates, in your promo's time zone. Empty means the promo's own dates.":
    "Fechas opcionales, en la zona horaria de tu promo. Vacío usa las fechas de la promo.",
  "Where": "Dónde",
  "Pick the pages by their path, one per line. / is your home page and /menu/* covers everything under it.":
    "Elige las páginas por su ruta, una por línea. / es tu página de inicio y /menu/* cubre todo lo que cuelga de ella.",
  // ── looks ────────────────────────────────────────────────────────────────
  "Offer cards": "Tarjetas de oferta",
  "Reveal code": "Revelar código",
  "Countdown": "Cuenta regresiva",
  "Floating button": "Botón flotante",
  "Book button": "Botón de reservar",
  // ── fields ───────────────────────────────────────────────────────────────
  "Best live promo": "Mejor promo activa",
  "Selected promo": "Promo elegida",
  "Cards to show": "Tarjetas a mostrar",
  "max": "máx.",
  "Details": "Detalles",
  "Button goes to": "El botón lleva a",
  "Let visitors close it": "Permitir que el visitante la cierre",
  "Get 20% off": "Obtén 20% de descuento",
  "Book with this offer": "Reservar con esta oferta",
  "Slide in": "Deslizar",
  "seconds": "segundos",
  "After scrolling": "Al desplazarse",
  "% (0 = off)": "% (0 = apagado)",
  "When the visitor is about to leave (desktop)": "Cuando el visitante está por irse (escritorio)",
  "How often": "Con qué frecuencia",
  "Every visit": "En cada visita",
  "Once per visit": "Una vez por visita",
  "Once ever": "Una sola vez",
  "Once a day": "Una vez al día",
  "Once a week": "Una vez a la semana",
  "Bottom right": "Abajo a la derecha",
  "Bottom left": "Abajo a la izquierda",
  "Bottom center": "Abajo al centro",
  "Audience": "Público",
  "Everyone": "Todos",
  "First-time visitors": "Visitantes nuevos",
  "Returning visitors": "Visitantes que regresan",
  "Signed-in clients": "Clientes con sesión iniciada",
  "Guests": "Invitados",
  "From (YYYY-MM-DD)": "Desde (AAAA-MM-DD)",
  "Until (YYYY-MM-DD)": "Hasta (AAAA-MM-DD)",
  "Show on": "Mostrar en",
  "Only these pages": "Solo estas páginas",
  "All except these pages": "Todas menos estas páginas",
  // ── layer label ──────────────────────────────────────────────────────────
  "Promo · your live offer": "Promo · tu oferta activa",
  "Promo · banner, cards, pop-up and more": "Promo · banner, tarjetas, ventana emergente y más",
};
