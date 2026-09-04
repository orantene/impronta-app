/**
 * Spanish editor-chrome strings — BUILDER 2027 · P2A.
 *
 * The Content-tab copy for the twelve native kinds (marquee, directory,
 * featured talent, location map, the four header widgets, sticky scroll,
 * reveal, stats, before/after). The English originals live in the pure field
 * schema `lib/site-admin/builder-node/builder-2027-fields.ts` and are
 * translated at the
 * inspector boundary (`useInspectorT`), the same way every other deep-inspector
 * string is.
 *
 * Only strings the catalog did not already carry are listed here: a key that
 * duplicates one in another `editor-i18n-es*.ts` file shadows it at runtime,
 * and `es-parity.static.test.ts` fails the build on exactly that.
 *
 * REGISTERED with `ES_CATALOG_FILES` in `es-parity.static.test.ts` — an
 * unregistered split file is invisible to both duplicate guards while every
 * test still reports green.
 *
 * House rules: no em dashes, `{token}` markers kept intact.
 */

export const ES_BUILDER_2027_TEXT: Record<string, string> = {
  // ── Group titles ─────────────────────────────────────────────────────────
  "When nobody matches": "Cuando no hay coincidencias",
  "The map": "El mapa",
  "The panel over the map": "El panel sobre el mapa",
  "The cities": "Las ciudades",
  "Search control": "Control de búsqueda",
  "Account control": "Control de cuenta",
  "Inquiry control": "Control de solicitud",
  "Language switcher": "Selector de idioma",
  "The pinned picture": "La imagen fija",
  "The two pictures": "Las dos imágenes",
  "The slider": "El deslizador",

  // ── Field labels ─────────────────────────────────────────────────────────
  "Show the heading": "Mostrar el encabezado",
  "Show the label as text": "Mostrar la etiqueta como texto",
  "Leave empty to use the default": "Déjalo vacío para usar el predeterminado",
  Order: "Orden",
  "Only show talent with a photo": "Mostrar solo talento con foto",
  "Columns on desktop": "Columnas en escritorio",
  "Columns on tablet": "Columnas en tableta",
  "Columns on mobile": "Columnas en móvil",
  "People per page": "Personas por página",
  "Show the search box": "Mostrar el buscador",
  "Search box wording": "Texto del buscador",
  "Search…": "Buscar…",
  "Search button": "Botón de búsqueda",
  "Show the result count": "Mostrar el número de resultados",
  "Show the sort control": "Mostrar el control de orden",
  "How many cards": "Cuántas tarjetas",
  "How many cities": "Cuántas ciudades",
  "When nobody is featured": "Cuando no hay nadie destacado",
  "When there are no cities": "Cuando no hay ciudades",
  "Show the map": "Mostrar el mapa",
  "Map style": "Estilo del mapa",
  "Embed address": "Dirección para insertar",
  "City list layout": "Diseño de la lista de ciudades",
  "Show how many people are in each city":
    "Mostrar cuántas personas hay en cada ciudad",
  "Show how many items are saved": "Mostrar cuántos elementos hay guardados",
  "Show a search field instead of an icon":
    "Mostrar un campo de búsqueda en lugar de un ícono",
  "Field wording": "Texto del campo",
  "Wording when signed out": "Texto con la sesión cerrada",
  "Wording when signed in": "Texto con la sesión iniciada",
  "Image address": "Dirección de la imagen",
  "Image description": "Descripción de la imagen",
  "Picture side": "Lado de la imagen",
  "Block style": "Estilo del bloque",
  Effect: "Efecto",
  "Travel (px)": "Recorrido (px)",
  "Duration (ms)": "Duración (ms)",
  "Delay (ms)": "Retraso (ms)",
  "Gap between blocks (ms)": "Intervalo entre bloques (ms)",
  "Only animate the first time": "Animar solo la primera vez",
  "Count up when it scrolls into view":
    "Contar hacia arriba al entrar en pantalla",
  "Count-up length (ms)": "Duración del conteo (ms)",
  "Pause when the pointer is over it": "Pausar cuando el puntero está encima",
  "Before image address": "Dirección de la imagen inicial",
  "Before image description": "Descripción de la imagen inicial",
  "After image address": "Dirección de la imagen final",
  "After image description": "Descripción de la imagen final",
  "Before label": "Etiqueta inicial",
  "After label": "Etiqueta final",
  "Starting position (%)": "Posición inicial (%)",
  "Slider description": "Descripción del deslizador",
  "See the whole roster": "Ver todo el elenco",

  // ── Option labels ────────────────────────────────────────────────────────
  "Plain text": "Texto simple",
  "Right to left": "De derecha a izquierda",
  "Left to right": "De izquierda a derecha",
  "Everyone on the roster": "Todo el elenco",
  "By field": "Por campo",
  "By service": "Por servicio",
  "A list I pick": "Una lista que elijo",
  "Newest first": "Más recientes primero",
  "A to Z": "De la A a la Z",
  "Available first": "Disponibles primero",
  "The order I set": "El orden que defino",
  "Talent I marked featured": "Talento que marqué como destacado",
  "Recently added": "Añadidos recientemente",
  "Swipeable row": "Fila deslizable",
  "Drawn pins (no third party)": "Pines dibujados (sin terceros)",
  "Embedded map": "Mapa insertado",
  Panorama: "Panorámica",
  "Where my roster lives": "Donde vive mi elenco",
  "Cities I list": "Ciudades que enumero",
  "Short codes (EN, ES)": "Códigos cortos (EN, ES)",
  "Full names (English, Espanol)": "Nombres completos (English, Espanol)",
  "One row": "Una fila",
  "From below": "Desde abajo",
  "From above": "Desde arriba",
  "From the right": "Desde la derecha",
  "From the left": "Desde la izquierda",
  "Scale up": "Ampliar",
  Sharpen: "Enfocar",
  "Wipe up": "Barrido hacia arriba",
  "With a rule": "Con una línea",
  "Side to side": "De lado a lado",
  "Top to bottom": "De arriba a abajo",

  // ── Placeholders and default copy ────────────────────────────────────────
  "The roster": "El elenco",
  "Search by role, location or fit": "Busca por rol, ubicación o perfil",
  "No matches yet": "Todavía no hay coincidencias",
  "Where we work": "Dónde trabajamos",
  "How it works": "Cómo funciona",
  "Search talent": "Buscar talento",
  "Sign in": "Iniciar sesión",
  Account: "Cuenta",
  Before: "Antes",
  After: "Después",
  "Reveal slider": "Deslizador de comparación",
  "Describe the picture for screen readers":
    "Describe la imagen para lectores de pantalla",
  "https://www.google.com/maps/embed?...":
    "https://www.google.com/maps/embed?...",
  "/": "/",

  // ── Group notes ──────────────────────────────────────────────────────────
  "The strip stops moving for visitors who have asked for reduced motion.":
    "La banda deja de moverse para las personas que han pedido menos movimiento.",
  "This block only ever shows your own roster. It cannot reach another workspace.":
    "Este bloque solo muestra tu propio elenco. No puede acceder a otro espacio de trabajo.",
  "Embedded maps only accept Google Maps or OpenStreetMap addresses.":
    "Los mapas insertados solo aceptan direcciones de Google Maps o OpenStreetMap.",
  "Leave the link empty and it goes to your directory.":
    "Deja el enlace vacío y lleva a tu directorio.",
  "On the live site this becomes the full account menu. On this canvas it shows the link a signed-out visitor sees.":
    "En el sitio publicado esto se convierte en el menú de cuenta completo. En este lienzo muestra el enlace que ve una visita sin sesión.",
  "On the live site this opens the inquiry drawer. On this canvas it shows the link.":
    "En el sitio publicado esto abre el panel de solicitudes. En este lienzo muestra el enlace.",
  "On a site with one language this control hides itself rather than showing a switch that does nothing.":
    "En un sitio con un solo idioma este control se oculta en lugar de mostrar un selector que no hace nada.",
  "Blocks inside stay visible for anyone whose device or browser has animation turned off.":
    "Los bloques del interior siguen visibles para quien tenga la animación desactivada en su dispositivo o navegador.",
  "The finished number is what gets published, so search engines and visitors without animation always read the real figure.":
    "El número final es lo que se publica, así que los buscadores y quienes no ven animaciones siempre leen la cifra real.",
  "The slider is a real range control, so it works with a keyboard and is announced by screen readers.":
    "El deslizador es un control de rango real, así que funciona con el teclado y lo anuncian los lectores de pantalla.",
  // RESERVATIONS — the reserve_table props panel.
  "Party size": "Tamaño del grupo",
  "Shown only when your venue asks for a card":
    "Se muestra solo cuando tu local pide una tarjeta",
  "Your venue": "Tu local",
  // C11 — the anchor field on the Data panel. Lives in the Builder 2027
  // catalog rather than editor-i18n-es-inspectors.ts, which sits at exactly
  // the 800-line max-lines budget: adding here keeps the budget intact
  // without grandfathering new growth into the suppressions baseline.
  "Anchor": "Ancla",
  "Anchor name": "Nombre del ancla",
  "Link to this block from elsewhere on the page":
    "Enlaza a este bloque desde otra parte de la página",
};
