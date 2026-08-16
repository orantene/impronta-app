/**
 * Spanish editor-chrome strings — INSPECTOR RESET P3 (2026-08-16): overflow
 * split of `editor-i18n-es-inspectors.ts`.
 *
 * That file hit the 800-line `max-lines` cap while this pass added the
 * Content-panel field-kit strings (icon glyph names, the new "Icon size" /
 * "Icon shape" GlyphTiles labels, and two divider/spacer hint lines that only
 * started reaching the `hint` boundary prop once those rows moved onto
 * `FieldRow`). Same pattern as `-section-panels-2.ts`: a second file for the
 * same catalog, spread into the same flat `ES_TEXT` map.
 *
 * REGISTERED with `ES_CATALOG_FILES` in `es-parity.static.test.ts` — see that
 * file's comment for why an unregistered split file is a silent trap.
 *
 * House rules: no em dashes, `{token}` markers kept intact.
 */

export const ES_INSPECTOR_TEXT_2: Record<string, string> = {
  // ── Icon glyph names (icon node, GlyphTiles) ─────────────────────────────
  // BUILDER_ICON_REGISTRY labels, translated at the GlyphTiles boundary.
  // Sparkle/Star/Camera/Calendar/Phone already have entries elsewhere in the
  // catalog (shared flat map); the rest were missing until this pass.
  Heart: "Corazón",
  Check: "Marca de verificación",
  "Arrow right": "Flecha derecha",
  "Map pin": "Pin de mapa",
  Mail: "Correo",
  Play: "Reproducir",
  Users: "Usuarios",
  "Icon size": "Tamaño del ícono",
  "Icon shape": "Forma del ícono",

  // ── Divider / spacer field-kit hint text ─────────────────────────────────
  // Pre-existing copy that only started flowing through the `hint` boundary
  // prop now that these rows are FieldRow-based (GlyphTiles / PresetNumberRow);
  // it had no catalog entry before, so it is added here rather than left as a
  // fallback-to-English gap.
  "Muted draws a fainter line for subtle section breaks.":
    "Atenuado dibuja una línea más tenue para separaciones sutiles entre secciones.",
  "Controls the vertical space this block adds between sections.":
    "Controla el espacio vertical que este bloque agrega entre secciones.",

  // ── WF-6: header "Arrange" tab (regions editor) ──────────────────────────
  // The site-header inspector's fourth tab, where the operator composes the
  // bar's left / middle / right zones. Every string here reaches them either
  // through an inspector-kit boundary prop or through `t()` in RegionsTab.
  Arrange: "Organizar",
  "Header layout": "Distribución del encabezado",
  "Drag an item to reorder it inside its zone, or open it to move it to another zone. Items point at content you manage on the other tabs, so removing one takes it out of the bar without deleting anything.":
    "Arrastra un elemento para reordenarlo dentro de su zona, o ábrelo para moverlo a otra zona. Los elementos apuntan al contenido que administras en las otras pestañas, así que quitar uno lo saca de la barra sin borrar nada.",

  // Zones
  "Left side": "Lado izquierdo",
  "Sits against the left edge of the bar.":
    "Se apoya en el borde izquierdo de la barra.",
  "Stays optically centred, whatever sits either side of it.":
    "Queda ópticamente centrado, sin importar qué haya a cada lado.",
  "Right side": "Lado derecho",
  "Sits against the right edge of the bar.":
    "Se apoya en el borde derecho de la barra.",
  Zone: "Zona",

  // Item kinds
  "Your logo image, linked to the home page.":
    "La imagen de tu logotipo, enlazada a la página de inicio.",
  "Business name": "Nombre del negocio",
  "Your business name set as text.":
    "El nombre de tu negocio compuesto como texto.",
  "Menu links": "Enlaces del menú",
  "The list of page links you manage on the Navigation tab.":
    "La lista de enlaces de páginas que administras en la pestaña Navegación.",
  "Main button": "Botón principal",
  "Your primary call to action, shown as a filled button.":
    "Tu llamada a la acción principal, mostrada como un botón relleno.",
  "Inquiry basket": "Cesta de solicitud",
  "Icon that opens the visitor's inquiry, with a live count.":
    "Ícono que abre la solicitud del visitante, con un contador en vivo.",
  "Saved talent": "Talento guardado",
  "Icon that opens the visitor's saved talent, with a count.":
    "Ícono que abre el talento guardado del visitante, con un contador.",
  "Social icons": "Íconos sociales",
  "A row of icons for the social accounts you have filled in.":
    "Una fila de íconos para las cuentas sociales que hayas completado.",
  "Phone number": "Número de teléfono",
  "Your phone number, tap to call on a mobile.":
    "Tu número de teléfono, se toca para llamar desde un móvil.",
  "Language switch": "Cambio de idioma",
  "The language codes a visitor can switch between.":
    "Los códigos de idioma entre los que puede cambiar un visitante.",
  "Flexible gap": "Espacio flexible",
  "Empty space that pushes whatever follows it further along.":
    "Espacio vacío que empuja hacia el final lo que venga después.",

  // Per-breakpoint behaviour
  Automatic: "Automático",
  "Icon and text": "Ícono y texto",
  "Icon only": "Solo ícono",
  "Inside the menu": "Dentro del menú",
  "On desktop": "En escritorio",
  "Wide screens. Automatic shows the icon and the text.":
    "Pantallas anchas. Automático muestra el ícono y el texto.",
  "On tablet": "En tableta",
  "Automatic copies whatever you chose for desktop.":
    "Automático copia lo que hayas elegido para escritorio.",
  "On phone": "En teléfono",
  "Automatic keeps the logo in the bar and moves everything else into the menu.":
    "Automático mantiene el logotipo en la barra y mueve todo lo demás al menú.",

  // Overflow priority
  "When space runs out": "Cuando falte espacio",
  "Decides which items give way first on a narrow screen.":
    "Decide qué elementos ceden primero en una pantalla angosta.",
  "Give way first": "Ceder primero",
  "Keep as long as possible": "Mantener el mayor tiempo posible",

  // Per-item fields
  "Leave empty to use the wording from the Brand tab.":
    "Déjalo vacío para usar el texto de la pestaña Marca.",
  "A path like /contact, or a full web address.":
    "Una ruta como /contact, o una dirección web completa.",
  "Where the saved talent icon takes the visitor.":
    "A dónde lleva al visitante el ícono de talento guardado.",
  "Count badge": "Insignia de contador",
  "Shows how many talent the visitor has added.":
    "Muestra cuánto talento ha agregado el visitante.",
  "Show the count": "Mostrar el contador",
  "Which icons, in which order": "Qué íconos y en qué orden",
  "Add your social links on the Brand tab and they appear here.":
    "Agrega tus enlaces sociales en la pestaña Marca y aparecerán aquí.",
  "Hide this icon": "Ocultar este ícono",

  // Row + zone chrome
  "Add an item here": "Agregar un elemento aquí",
  "This zone is full": "Esta zona está llena",
  "Nothing in this zone yet.": "Todavía no hay nada en esta zona.",
  "Open settings": "Abrir ajustes",
  "Close settings": "Cerrar ajustes",
  "Remove from header": "Quitar del encabezado",
  "Confirm remove": "Confirmar eliminación",
  "Confirm reset": "Confirmar restablecimiento",
  "Back to the preset layout for your header style.":
    "Vuelve a la distribución predefinida de tu estilo de encabezado.",

  // Row summaries
  "Uses the logo from the Brand tab":
    "Usa el logotipo de la pestaña Marca",
  "No logo uploaded yet": "Todavía no se ha subido un logotipo",
  "No business name set yet": "Todavía no se ha definido el nombre del negocio",
  "No button text set yet": "Todavía no se ha definido el texto del botón",
  "No phone number set yet": "Todavía no se ha definido un número de teléfono",
  "{count} links": "{count} enlaces",
  "{count} icons": "{count} íconos",
  "Icon with a live count": "Ícono con un contador en vivo",
  "Only shows when the site has more than one language":
    "Solo aparece cuando el sitio tiene más de un idioma",
  "Pushes the next item further along":
    "Empuja el siguiente elemento hacia el final",

  // Empty / locked states
  "Your header uses a preset layout":
    "Tu encabezado usa una distribución predefinida",
  "Switch to a custom layout to move your logo, menu, buttons and icons between the left, middle and right of the bar. We start you off with a copy of what your header shows today, so nothing changes until you move something.":
    "Cambia a una distribución personalizada para mover tu logotipo, menú, botones e íconos entre la izquierda, el centro y la derecha de la barra. Partimos de una copia de lo que tu encabezado muestra hoy, así que nada cambia hasta que muevas algo.",
  "One thing to know: your current style puts the menu on its own row under the logo. A custom layout is a single row, so the menu moves up beside everything else.":
    "Un detalle: tu estilo actual pone el menú en su propia fila debajo del logotipo. Una distribución personalizada es una sola fila, así que el menú sube junto a todo lo demás.",
  "Customize layout": "Personalizar distribución",
  "Custom header layout is a paid feature":
    "La distribución personalizada del encabezado es una función de pago",
  "Upgrade to Studio to move your logo, menu, buttons and icons between the left, middle and right of the bar. Your logo, links and button stay editable on the other tabs.":
    "Mejora a Studio para mover tu logotipo, menú, botones e íconos entre la izquierda, el centro y la derecha de la barra. Tu logotipo, enlaces y botón siguen siendo editables en las otras pestañas.",
  "Current style": "Estilo actual",
  "This site has no shell header yet":
    "Este sitio todavía no tiene encabezado de estructura",
  "Publish the site shell once and the header layout controls appear here.":
    "Publica la estructura del sitio una vez y los controles de distribución del encabezado aparecerán aquí.",
};
