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

  // ── Carousel slide manager (SLIDER-1, 2026-08-16) ────────────────────────
  // The inspector's slide list. "Slide {n}", "Add slide", "Drag to reorder" and
  // "Remove?" already live in the shared flat map (the roster / navigation /
  // canvas-chip lanes put them there), so only the strings this list invents
  // are added here.
  "Showing on canvas": "Se ve en el lienzo",
  "Empty slide": "Diapositiva vacía",
  "Duplicate slide": "Duplicar diapositiva",
  "Remove slide": "Quitar diapositiva",
  Keep: "Conservar",
  "No slides yet. Add one to start the slider.":
    "Todavía no hay diapositivas. Agrega una para empezar el carrusel.",

  // ── Site footer inspector + shell variant gallery (2026-08-16) ───────────
  // The footer parity drawer (`inspectors/site-footer/**`) and the Add Gallery's
  // shell-variant confirm. Both resolve through this same flat map: the tabs'
  // `title` / `info` / `label` / `help` props go through the inspector-kit
  // boundary, the list-row strings through `useInspectorT().t(...)` at the call
  // site, and the gallery's confirm copy through `useEditorLocale().t(...)`.
  // Two guards, one catalog.
  "Couldn’t load the footer.": "No se pudo cargar el pie de página.",
  "Loading footer…": "Cargando el pie de página...",
  "Nothing to undo": "No hay nada que deshacer",
  "This footer also has 1 custom block, edited on the canvas. Changes here won’t affect it.":
    "Este pie de página también tiene 1 bloque personalizado, que se edita en el lienzo. Los cambios de aquí no lo afectan.",
  "This footer also has custom blocks, edited on the canvas. Changes here won’t affect them.":
    "Este pie de página también tiene bloques personalizados, que se editan en el lienzo. Los cambios de aquí no los afectan.",
  "Footer style": "Estilo del pie de página",
  "The overall shape of the footer. Everything below refines the look you pick here.":
    "La forma general del pie de página. Todo lo de abajo ajusta el estilo que elijas aquí.",
  "Whether the footer keeps the page's tone or switches to its own light or dark surface.":
    "Si el pie de página mantiene el tono de la página o usa su propia superficie clara u oscura.",
  "The identity block at the top of the footer.":
    "El bloque de identidad en la parte superior del pie de página.",
  "What to show": "Qué mostrar",
  "Brand block above evenly weighted link columns. The safe default.":
    "Bloque de marca sobre columnas de enlaces con el mismo peso. La opción segura por defecto.",
  "One line: wordmark on the left, links on the right. Best when the page already ends with a strong call to action.":
    "Una sola línea: el nombre a la izquierda y los enlaces a la derecha. Ideal cuando la página ya termina con una llamada a la acción fuerte.",
  "Wide brand block, three link columns and a social row. Use when the footer is doing real navigation work.":
    "Bloque de marca amplio, tres columnas de enlaces y una fila social. Úsalo cuando el pie de página cumple una función real de navegación.",
  "Oversized serif wordmark with the columns tucked to the right. The most magazine-like of the four.":
    "Nombre en serif de gran tamaño con las columnas recogidas a la derecha. El más editorial de los cuatro.",
  "Follow page": "Seguir la página",
  "Inherit whatever tone the page already uses.":
    "Hereda el tono que ya usa la página.",
  "Pale surface with dark text.": "Superficie clara con texto oscuro.",
  "Dark canvas with light text.": "Fondo oscuro con texto claro.",
  "Use when the logo already contains the name, so the wordmark is not printed twice.":
    "Úsalo cuando el logo ya incluye el nombre, para no repetirlo dos veces.",
  "Wordmark and tagline, no image.": "Nombre y lema, sin imagen.",
  "Logo and text": "Logo y texto",
  "Logo above the wordmark.": "El logo sobre el nombre.",
  "Footer logo": "Logo del pie de página",
  "Often a simpler or single-colour version of the header logo.":
    "Suele ser una versión más simple o de un solo color del logo del encabezado.",
  "Choose a footer logo": "Elige un logo para el pie de página",
  "Logo alt text": "Texto alternativo del logo",
  "Read aloud by screen readers. Describe the logo, don't repeat the word 'logo'.":
    "Lo leen en voz alta los lectores de pantalla. Describe el logo, no repitas la palabra 'logo'.",
  "One short line under the name. Leave empty to hide it.":
    "Una línea corta debajo del nombre. Déjalo vacío para ocultarla.",
  "Casting and talent management, end to end.":
    "Casting y gestión de talento, de principio a fin.",
  "Link columns": "Columnas de enlaces",
  "The grouped link lists in the body of the footer. Drag a column to reorder it; drag a link to reorder it inside its column.":
    "Las listas de enlaces agrupadas en el cuerpo del pie de página. Arrastra una columna para reordenarla; arrastra un enlace para reordenarlo dentro de su columna.",
  "New column": "Columna nueva",
  "Add column": "Agregar columna",
  "Add link": "Agregar enlace",
  "A footer can hold at most 5 columns.":
    "Un pie de página admite como máximo 5 columnas.",
  "Drag to reorder column": "Arrastra para reordenar la columna",
  "Column heading": "Título de la columna",
  "Remove column": "Quitar columna",
  "No links in this column yet.": "Todavía no hay enlaces en esta columna.",
  "A column can hold at most 8 links.":
    "Una columna admite como máximo 8 enlaces.",
  "Drag to reorder link": "Arrastra para reordenar el enlace",
  "Link destination": "Destino del enlace",
  "/path or https://…": "/ruta o https://...",
  "No footer columns yet": "Todavía no hay columnas en el pie de página",
  "Group the links visitors look for at the end of a page: Studio, Roster, Contact.":
    "Agrupa los enlaces que los visitantes buscan al final de una página: Estudio, Roster, Contacto.",
  "Add first column": "Agregar la primera columna",
  "The icon row at the bottom of the footer. Leave it empty to hide the row entirely.":
    "La fila de íconos al final del pie de página. Déjala vacía para ocultarla por completo.",
  "No social links. The icon row is hidden.":
    "No hay enlaces sociales. La fila de íconos está oculta.",
  "Add social link": "Agregar enlace social",
  "A footer can show at most 6 social links.":
    "Un pie de página muestra como máximo 6 enlaces sociales.",
  "Drag to reorder social link": "Arrastra para reordenar el enlace social",
  "Remove social link": "Quitar enlace social",
  "Profile URL": "URL del perfil",
  "The small print on the last line of the page.":
    "La letra pequeña en la última línea de la página.",
  "Copyright line": "Línea de copyright",
  "Leave empty to hide it. The year is not filled in automatically, so write it the way you want it to read.":
    "Déjalo vacío para ocultarla. El año no se completa automáticamente, así que escríbelo como quieres que se lea.",
  "Small-print links": "Enlaces de letra pequeña",
  "No small-print links yet.": "Todavía no hay enlaces de letra pequeña.",
  "Add small-print link": "Agregar enlace de letra pequeña",
  "A footer can show at most 4 small-print links.":
    "Un pie de página muestra como máximo 4 enlaces de letra pequeña.",
  "Privacy": "Privacidad",
  "Click again to replace": "Haz clic otra vez para reemplazar",
  "This swaps out what's there now.": "Esto sustituye lo que hay ahora.",
  "This template has no saved layout, so it can't be applied.":
    "Esta plantilla no tiene un diseño guardado, así que no se puede aplicar.",
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

  // ── Multi-selection style panel (Inspector Reset P4, 2026-08-16) ─────────
  // Field-kit migration of the Mixed-aware bulk style inspector.
  "Editing {count} blocks": "Editando {count} bloques",
  'Shared styles apply to every selected block. "Mixed" means the blocks currently differ. Set a value to make them match.':
    'Los estilos compartidos se aplican a cada bloque seleccionado. "Mixto" significa que los bloques actualmente difieren. Define un valor para igualarlos.',
  "These blocks currently have different corner radii.":
    "Estos bloques actualmente tienen radios de esquina diferentes.",
  "These blocks currently have different values.":
    "Estos bloques actualmente tienen valores diferentes.",

  // ── Section style panel — plain-language font weights (P4) ───────────────
  // These used to be bare numbers ("400"/"700"/"800") in the heading/body
  // weight <select>; the number is kept as the honest resolved value but now
  // sits behind a name (t(opt.label) is a dynamic call, so the wave-0 guard
  // cannot see it, but the string still needs a real translation).
  "Regular (400)": "Regular (400)",
  "Medium (500)": "Medio (500)",
  "Semibold (600)": "Seminegrita (600)",
  "Bold (700)": "Negrita (700)",
  "Extrabold (800)": "Extranegrita (800)",

  // ── Inspector Reset — the VISUAL adoption (2026-08-16) ───────────────────
  // Strings introduced when the Style and Content panels were rebuilt onto the
  // field kit: the glyph-tile rows in Appearance, the preset+exact spacing
  // rows, the quick-style cards, the footer row, and the Content panel's
  // layout-intent cards.
  //
  // These land HERE rather than in editor-i18n-es-inspectors.ts because that
  // file is at its 796-line ceiling; ES_INSPECTOR_TEXT_2 merges into ES_TEXT,
  // so both parity guards resolve them identically.

  // Appearance — "Border" now names the STYLE tile row (solid / dashed /
  // dotted), with weight as its own row beneath it. "Borde" is the noun the
  // rest of the Spanish panel already uses for the edge itself.
  Border: "Borde",

  // Spacing — the four preset rows. The panel's own axis letters (X / Y) are
  // kept, as they are in the Spanish CSS vocabulary too.
  "Margin top": "Margen superior",
  "Margin bottom": "Margen inferior",
  "Padding X": "Relleno X",
  "Padding Y": "Relleno Y",
  "Left and right inside the block.": "Izquierda y derecha dentro del bloque.",
  "Top and bottom inside the block.": "Arriba y abajo dentro del bloque.",

  // Content panel — the variant picker, promoted from a grey word strip to
  // picture cards. "Variant" was a developer's word for it; the Spanish takes
  // the same plain-language turn the English does.
  "Layout intent": "Intención de diseño",

  // Quick-style cards — the scope caption above the card grid.
  "Applies to {device}": "Se aplica a {device}",

  // Footer row (Copy style · Paste · Reset…). "Copy style", "Paste" and
  // "Confirm reset" already have entries from earlier waves.
  "Reset…": "Restablecer…",
  "Reset this block's {device} style":
    "Restablecer el estilo de {device} de este bloque",
  "Copy once, paste anywhere.": "Copia una vez, pega donde quieras.",
  "Copied: {source}": "Copiado: {source}",

  // ── Container background media (2026-08-17) ─────────────────────────────
  // The Content-tab card that attaches a looping video or a YouTube clip
  // behind a container, plus its scrim. House rules: no em dashes, plain
  // language over the CSS words ("Overlay darkness", not "opacity").
  // Overflowed from `editor-i18n-es.ts`, which sits AT the 800-line cap, so it
  // could not take one more line next to its `dashboard.mediaField.*` siblings.
  "dashboard.mediaField.videoSelected": "Video seleccionado",
  // "Background" itself is already defined in `-canvas.ts` ("Fondo"); the
  // cross-file duplicate guard forbids a second definition here.
  "Video or YouTube behind this block": "Video o YouTube detrás de este bloque",
  "Background media": "Medios de fondo",
  "Plays muted and looped behind this block, with a still image for visitors who prefer reduced motion.":
    "Se reproduce sin sonido y en bucle detrás de este bloque, con una imagen fija para quienes prefieren menos movimiento.",
  "Video file": "Archivo de video",
  "Choose video": "Elegir video",
  "Choose a background video": "Elegir un video de fondo",
  "YouTube link": "Enlace de YouTube",
  "Paste any YouTube link. Watch, share and Shorts URLs all work.":
    "Pega cualquier enlace de YouTube. Funcionan las URL de reproducción, de compartir y de Shorts.",
  "Poster image": "Imagen de portada",
  "Poster image (optional)": "Imagen de portada (opcional)",
  "Choose poster": "Elegir portada",
  "Shown before the video starts and instead of it under reduced motion.":
    "Se muestra antes de que inicie el video y en su lugar cuando hay menos movimiento.",
  "Shown before the video starts and instead of it under reduced motion. Falls back to the YouTube thumbnail.":
    "Se muestra antes de que inicie el video y en su lugar cuando hay menos movimiento. Si no la eliges, se usa la miniatura de YouTube.",
  "Overlay darkness": "Oscuridad de la capa",
  "Darkens the background so headings and body copy stay readable.":
    "Oscurece el fondo para que los títulos y el texto sigan siendo legibles.",
  "Overlay color": "Color de la capa",
  "Any CSS color, or a theme token like var(--token-color-primary). Defaults to black.":
    "Cualquier color CSS, o un token del tema como var(--token-color-primary). Por defecto es negro.",
  "Focal point": "Punto focal",
  "Which part of the frame stays visible when it is cropped. Try center, top, or 50% 20%.":
    "Qué parte del encuadre queda visible al recortarse. Prueba center, top o 50% 20%.",
  "That is not a YouTube video link, so nothing will play. Copy the URL from the video page or the Share button.":
    "Ese no es un enlace de video de YouTube, así que no se reproducirá nada. Copia la URL desde la página del video o desde el botón Compartir.",
  "That video link cannot be used. Pick a file from the library, or paste an https URL.":
    "Ese enlace de video no se puede usar. Elige un archivo de la biblioteca o pega una URL https.",

  // ── Slideshow backgrounds (2026-08-17) ───────────────────────────────────
  "Video, YouTube or a slideshow behind this block":
    "Video, YouTube o una secuencia de fotos detrás de este bloque",
  Slideshow: "Secuencia",
  // "Images", "Crossfade" and "Cut" are deliberately absent: they already
  // carry a Spanish value in editor-i18n-es.ts / -inspectors.ts / -canvas.ts,
  // and `es-parity.static.test.ts` fails a key defined in two catalog files
  // (whichever spread lands last wins, invisibly).
  "Selected image": "Imagen seleccionada",
  "Choose image": "Elegir imagen",
  "Choose a background image": "Elige una imagen de fondo",
  "Add image": "Agregar imagen",
  "Image {n}": "Imagen {n}",
  "No image chosen": "Sin imagen elegida",
  "Duplicate image": "Duplicar imagen",
  "Remove image": "Quitar imagen",
  "No images yet. Add two or more to start the slideshow.":
    "Aún no hay imágenes. Agrega dos o más para iniciar la secuencia.",
  "That is the maximum number of images for one background.":
    "Ese es el número máximo de imágenes para un fondo.",
  "They cross-fade in this order. Visitors who prefer reduced motion see the first image only, and the rest load lazily.":
    "Se funden en este orden. Quienes prefieren menos movimiento ven solo la primera imagen, y el resto se carga de forma diferida.",
  "Seconds per image:": "Segundos por imagen:",
  "How long each image stays before the next one fades in.":
    "Cuánto tiempo permanece cada imagen antes de que aparezca la siguiente.",
  Transition: "Transición",
  "Hard cut": "Corte seco",

  // ── Backgrounds story in the Add gallery (2026-08-17) ────────────────────
  Backgrounds: "Fondos",
  "Slideshow Background": "Fondo con secuencia de fotos",
  "Full-bleed band with a photo slideshow behind your content.":
    "Franja a todo lo ancho con una secuencia de fotos detrás de tu contenido.",
  "Full-bleed band that cycles through a set of photos.":
    "Franja a todo lo ancho que va pasando por un conjunto de fotos.",
  "Video Background": "Fondo de video",
  "YouTube Background": "Fondo de YouTube",
  "Image Background": "Fondo de imagen",
  "Gradient Background": "Fondo degradado",
  "Full-bleed band with a looping video behind your content.":
    "Franja a todo lo ancho con un video en bucle detrás de tu contenido.",
  "Full-bleed band with a YouTube video playing behind content.":
    "Franja a todo lo ancho con un video de YouTube reproduciéndose detrás del contenido.",
  "Full-bleed band with a photo behind your content.":
    "Franja a todo lo ancho con una foto detrás de tu contenido.",
  "Full-bleed band with a soft brand-coloured gradient.":
    "Franja a todo lo ancho con un degradado suave en los colores de tu marca.",

  // ── Style panel group titles — Inspector Reset D4 (2026-08-17) ───────────
  // The six always-on accordions collapse to at most four groups, chosen per
  // block kind by `style-panel/group-recipes.ts`. Only ONE title is new here:
  // "Text", "Appearance" and "Advanced" already resolve through the shared
  // flat map (editor-i18n-es.ts / -inspectors.ts). The retired titles
  // ("Typography", "Dimensions", "Spacing", "Position & layout", "Effects &
  // motion") keep their existing entries: the SECTION panel and the
  // multi-select panel still render groups by those names, so deleting them
  // would drop those panels back to English.
  //
  // `group-recipes.test.ts` asserts every STYLE_GROUP_TITLES value resolves
  // here. The regex parity guard cannot: these titles reach InspectorGroup as
  // `title={STYLE_GROUP_TITLES.layout}`, an expression, not a literal.
  "Layout & spacing": "Diseño y espaciado",

  // Freeform form node — inbox picker + date/file/consent
  "Where submissions go": "Destino de los envíos",
  "Submissions are recorded in your workspace and emailed to admins. Pick the inbox form below.":
    "Los envíos se guardan en tu espacio de trabajo y se envían a los administradores. Elige el formulario de bandeja abajo.",
  "Posts the form straight to your own endpoint (Formspree, a custom handler, …).":
    "Envía el formulario directo a tu propio destino (Formspree, un receptor propio, …).",
  "Inbox form": "Formulario de bandeja",
  "Select a contact form…": "Selecciona un formulario de contacto…",
  "This destination opens a real inquiry, not an inbox row. File fields are not stored on that path.":
    "Este destino abre una solicitud real, no una fila de bandeja. Los archivos no se guardan en esa ruta.",
  "Required for inbox delivery. Without a destination the form renders but submissions are rejected.":
    "Obligatorio para la bandeja. Sin destino el formulario se ve pero los envíos se rechazan.",
  "What happens on submit": "Qué pasa al enviar",
  "An inquiry opens a real conversation your team replies to, and the sender gets your replies by email. An inbox message is just a recorded submission.":
    "Una solicitud abre una conversación real que tu equipo responde, y quien escribió recibe tus respuestas por correo. Un mensaje de bandeja solo queda registrado.",
  "Inbox message": "Mensaje de bandeja",
  "Open an inquiry": "Abrir una solicitud",
  "Submissions open a real inquiry your team can reply to. Replies reach the sender by email. File fields are not stored on this path.":
    "Los envíos abren una solicitud real que tu equipo puede responder. Las respuestas llegan por correo a quien escribió. Los archivos no se guardan en esta ruta.",
  "Submissions are recorded as inbox messages. Nobody can reply to them in a conversation.":
    "Los envíos se guardan como mensajes de bandeja. Nadie puede responderlos en una conversación.",
  "Submit URL": "URL de envío",
  "Full https:// URL the form data POSTs to.":
    "URL https:// completa a la que se envían los datos.",
  "Field name": "Nombre del campo",
  "The submission key. Use “email” and “name” for the contact fields.":
    "La clave del envío. Usa “email” y “name” para los campos de contacto.",
  "I agree to the privacy policy.": "Acepto la política de privacidad.",
  "Files only store when this form posts to an inbox destination that also declares a matching file field. Inquiry destinations cannot keep uploads.":
    "Los archivos solo se guardan cuando este formulario envía a una bandeja que también declara un campo de archivo coincidente. Los destinos de solicitud no conservan adjuntos.",
  "Visitors must fill this field before submitting.":
    "Los visitantes deben completar este campo antes de enviar.",
  "+ Add field": "+ Añadir campo",
  // Arrange items group (plain-language justify/align/wrap).
  "Arrange items": "Ordenar elementos",
  "How the things inside this box sit next to each other.":
    "Cómo se colocan entre sí los elementos dentro de esta caja.",
  "Across": "En horizontal",
  "When it runs out of room": "Cuando falta espacio",
  "One line": "En una línea",
  "Let it wrap": "Que baje de línea",
  // Nav panel labels that reached the operator untranslated.
  "Submenu style": "Estilo del submenú",
  "Menu background": "Fondo del menú",
  "Menu text": "Texto del menú",
  "Menu border": "Borde del menú",
  "Hamburger button label": "Etiqueta del botón de menú",
  "Auto-populate links from": "Rellenar enlaces automáticamente desde",
  "Colours for the open mobile menu. Any CSS colour or a theme token such as var(--token-color-ink). Leave blank for the default card.":
    "Colores del menú móvil abierto. Cualquier color CSS o un token del tema como var(--token-color-ink). Déjalo vacío para la tarjeta predeterminada.",
  "Edit label and destination for each link. Drag the handle to reorder.":
    "Edita el texto y el destino de cada enlace. Arrastra el asa para reordenar.",
  "Opens under the toggle. Simplest, no overlay.":
    "Se abre bajo el botón. Lo más simple, sin superposición.",
  // Nav panel v2 — link fields, mega layout, phone-menu contents.
  "Always open": "Siempre abierto",
  Collapsible: "Plegable",
  "Full width": "Ancho completo",
  "Under the link": "Bajo el enlace",
  "Top bar only": "Solo en la barra",
  "Phone menu only": "Solo en el menú móvil",
  "Shown under the label in a dropdown":
    "Se muestra bajo el texto en un desplegable",
  "Only shows in a dropdown or mega panel. The top bar stays one line.":
    "Solo aparece en un desplegable o panel mega. La barra superior se queda en una línea.",
  "Where it shows": "Dónde aparece",
  "One set of links. Choose where each one shows, so nothing has to be retyped for mobile.":
    "Un solo conjunto de enlaces. Elige dónde aparece cada uno, así no hay que reescribir nada para móvil.",
  "Mega columns": "Columnas del panel mega",
  "Mega panel width": "Ancho del panel mega",
  "Link hover": "Efecto al pasar el cursor",
  "Used by the link underline, badges and the phone menu button.":
    "Se usa en el subrayado de los enlaces, los distintivos y el botón del menú móvil.",
  "Phone menu button": "Botón del menú móvil",
  "Pinned to the bottom of the open menu. Needs both a label and a destination to appear.":
    "Fijado al final del menú abierto. Necesita texto y destino para aparecer.",
  "Also in the phone menu": "También en el menú móvil",
  "Social links row": "Fila de redes sociales",
  "Language row": "Fila de idiomas",
  "Each one hides itself when it has nothing to show, so an empty row never appears.":
    "Cada una se oculta cuando no tiene nada que mostrar, así nunca aparece una fila vacía.",
  "Phone menu groups": "Grupos del menú móvil",
  "Phone menu spacing": "Espaciado del menú móvil",
  // Nav submenu canvas preview. Inside ternaries, which the parity harvester
  // cannot read statically — added deliberately rather than left to a guard
  // that would never have flagged them. ("Show on canvas" is NOT here: it is
  // already defined in editor-i18n-es-canvas.ts, and a second definition would
  // let spread order pick the wording.)
  "Close preview": "Cerrar vista previa",
  "Platform default": "Icono de la plataforma",
  // Mega column + featured card editors.
  "Use as a column heading": "Usar como encabezado de columna",
  "+ Add link to this column": "+ Añadir enlace a esta columna",
  "Featured card": "Tarjeta destacada",
  "One line about what is behind the link":
    "Una línea sobre lo que hay detrás del enlace",
  // ── Standing helper copy moved behind ⓘ info tips (2026-08-19) ───────────
  // Former <Helper> / KIT.hint paragraphs, now `info=` boundary props.
  "Bound stays synced to live data. Manual is fully curated. Hybrid mixes live data with operator curation.":
    "Vinculado se mantiene sincronizado con los datos en vivo. Manual es totalmente curado. Híbrido combina datos en vivo con curación del operador.",
  "Wireframe for the future query builder. Today it stores operator intent.":
    "Boceto del futuro constructor de consultas. Hoy guarda la intención del operador.",
  "Show this block only on the selected storefront language.":
    "Muestra este bloque solo en el idioma seleccionado del sitio.",
  "Restrict to signed-in or signed-out visitors.":
    "Restringe a visitantes con sesión iniciada o sin sesión.",
  "Optional named flag. The block shows only when the page is rendered for this variant; an unknown variant always shows it.":
    "Indicador con nombre opcional. El bloque se muestra solo cuando la página se renderiza para esta variante; una variante desconocida siempre lo muestra.",
  "Leave decorative on when the icon only supports nearby text.":
    "Deja activado decorativo cuando el ícono solo acompaña al texto cercano.",
  "Use Structure to edit the answer blocks nested inside this item.":
    "Usa Estructura para editar los bloques de respuesta anidados en este elemento.",
  "Use Structure to edit the content blocks inside this tab.":
    "Usa Estructura para editar los bloques de contenido dentro de esta pestaña.",
  "“Mobile” keeps links visible on tablet and above.":
    "“Móvil” mantiene los enlaces visibles en tablet y superiores.",
  "How a link’s submenu opens on desktop. “Mega” uses a wider multi-column panel. Only affects links with child links.":
    "Cómo se abre el submenú de un enlace en escritorio. “Mega” usa un panel más ancho de varias columnas. Solo afecta a enlaces con enlaces hijos.",
  "How the collapsed hamburger menu opens on mobile.":
    "Cómo se abre el menú hamburguesa plegado en móvil.",
  "When set, the nav builds its links from your published pages or posts. The manual links below stay as the fallback when nothing resolves.":
    "Cuando está definido, la navegación construye sus enlaces desde tus páginas o publicaciones publicadas. Los enlaces manuales de abajo quedan como respaldo cuando nada resuelve.",
  "When on, this block shows the social/contact links from your workspace identity and ignores the manual list below.":
    "Al activarlo, este bloque muestra los enlaces sociales y de contacto de la identidad de tu espacio de trabajo e ignora la lista manual de abajo.",
  "Hero = full-screen image slider. Rail = horizontal scroll of cards.":
    "Hero = carrusel de imágenes a pantalla completa. Rail = desplazamiento horizontal de tarjetas.",
  "Per slide = each slide owns its content. Shared = one fixed block while backgrounds rotate.":
    "Por diapositiva = cada diapositiva tiene su propio contenido. Compartido = un bloque fijo mientras los fondos rotan.",
  "Controls the live data limit while keeping the section's editable copy.":
    "Controla el límite de datos en vivo sin perder el texto editable de la sección.",
  "Add the photo or video for each post, then paste the post link so visitors can open it. Live account sync arrives once the workspace connects Instagram or TikTok.":
    "Agrega la foto o el video de cada publicación y luego pega el enlace de la publicación para que los visitantes puedan abrirla. La sincronización con la cuenta en vivo llega cuando el espacio de trabajo conecta Instagram o TikTok.",
  "Pulls your latest posts from the account connected in Settings, Integrations. Until that account is connected, the posts you add below are shown instead.":
    "Trae tus publicaciones más recientes de la cuenta conectada en Ajustes, Integraciones. Hasta que esa cuenta se conecte, se muestran las publicaciones que agregues abajo.",
  // Motion-panel helper copy that moved to boundary props in the same program.
  "Travel distance": "Distancia de recorrido",
  "Applies to directional variants (fade-up, fade-down, etc.). Ignored for plain fade and zoom.":
    "Aplica a las variantes direccionales (fade-up, fade-down, etc.). Se ignora para el desvanecido simple y el zoom.",
  "Plays once when the section enters the viewport. Skipped when the visitor prefers reduced motion.":
    "Se reproduce una vez cuando la sección entra en la pantalla. Se omite cuando el visitante prefiere movimiento reducido.",
  "Section translates ±60px relative to scroll. Falls back to no motion in browsers without scroll-driven animation support, and for visitors who prefer reduced motion.":
    "La sección se desplaza ±60px según el scroll. Queda sin movimiento en navegadores sin soporte de animación por scroll y para visitantes que prefieren movimiento reducido.",

  // ── Site-header inspector: helper prose moved behind ⓘ (2026-08-19) ─────
  "Brand display": "Presentación de marca",
  "Pick “Wordmark text only” for the prototype look: the gold Cinzel IMPRONTA wordmark with the agency tagline beneath (tagline comes from Brand → Tagline).":
    "Elige “Solo texto, Cinzel + eslogan” para el look del prototipo: el nombre IMPRONTA en Cinzel dorado con el eslogan de la agencia debajo (el eslogan viene de Marca → Eslogan).",

  // Style panel — helper copy moved behind ⓘ info tips (2026-08-19).
  "Custom CSS": "CSS personalizado",
  "Custom curve": "Curva personalizada",
  "Interactions": "Interacciones",
  "Scroll parallax": "Parallax al desplazar",
  "Reveal on scroll": "Revelar al desplazar",
  "Plays once when the published page loads (not previewed in the editor). Respects reduced-motion.":
    "Se reproduce una vez cuando carga la página publicada (no se previsualiza en el editor). Respeta la preferencia de movimiento reducido.",
  "Overrides the named easing. Any CSS timing function: cubic-bezier(), steps(), linear().":
    "Anula el easing con nombre. Cualquier función de tiempo CSS: cubic-bezier(), steps(), linear().",
  "The block glides vertically over its on-screen pass. Drives the entrance slot when both are set. Entrance plays once, parallax is what keeps moving.":
    "El bloque se desliza verticalmente durante su paso por pantalla. Controla el hueco de entrada cuando ambos están definidos. La entrada se reproduce una vez; el parallax es lo que sigue en movimiento.",
  "Eases in the first time the block scrolls into view, then stays. Direction variants travel by the distance below.":
    "Aparece suavemente la primera vez que el bloque entra en pantalla y luego permanece. Las variantes direccionales se desplazan la distancia indicada abajo.",

  // The node-role "Selected block" variant of the device-rail sentence. It was
  // inline (and untranslated) before the info-tip pass; moving it onto a
  // boundary prop made the guard see it, which is the guard working.
  "Device is controlled by the device rail above (synced to the canvas).":
    "El dispositivo se controla desde la barra de dispositivos de arriba (sincronizada con el lienzo).",

  // Header inspector -> Style -> Typography: nav-only font override.
  "Menu link font": "Fuente de los enlaces del menú",
  "Applies to the header navigation links only. Leave empty to inherit the site font preset below.":
    "Se aplica solo a los enlaces de navegación del encabezado. Déjalo vacío para heredar la fuente del sitio de abajo.",
  "Reset to the site font": "Volver a la fuente del sitio",
  "Menu links can take their own font. The brand wordmark always follows the site heading font, so the logo stays consistent across pages.":
    "Los enlaces del menú pueden tener su propia fuente. El logotipo siempre sigue la fuente de títulos del sitio, así se mantiene consistente en todas las páginas.",

  // Form inspector -> Field style: the input boxes themselves.
  "Field style": "Estilo de los campos",
  "Borders, fill and corners of the inputs": "Bordes, relleno y esquinas de los campos",
  "The outline of each input box. Leave on Default to follow the site's palette.":
    "El contorno de cada campo. Déjalo en Predeterminado para seguir la paleta del sitio.",
  "Field fill": "Relleno del campo",
  "The background inside each input box.": "El fondo dentro de cada campo.",
  // "Sharp", "Reset" and "Default" are NOT redefined here - they already live
  // in editor-i18n-es-inspectors.ts ("Recto" / "Restablecer" /
  // "Predeterminado"), and a second definition would silently win or lose
  // depending on spread order. The parity test caught exactly that.
  Round: "Redondeadas",

  // ── WS7 Phase 0 — native data blocks (Search hero / Talent by discipline) ─
  // The two Content panels that replace the `section_embed` round-trip to the
  // curated `hero_search` / `talent_type_grid` sections. Landing here rather
  // than in `-inspectors.ts` because that file is at the 800-line cap.
  // "Copy", "Cards", "Columns", "Layout", "Headline", "Intro" and "Eyebrow"
  // are NOT redefined here - they already live in the catalog, and a second
  // definition would win or lose depending on spread order.
  "Search bar": "Barra de búsqueda",
  "Show the search bar": "Mostrar la barra de búsqueda",
  "Search talent by role, location or fit":
    "Busca talento por rol, ciudad o perfil",
  "Search the roster by role, location or fit.":
    "Busca en el roster por rol, ciudad o perfil.",
  "Find the right talent": "Encuentra el talento adecuado",
  "Talent count": "Número de talentos",
  "represented talent": "talentos representados",
  "Show how many talent are in each discipline":
    "Mostrar cuántos talentos hay en cada disciplina",
  "Show card images": "Mostrar imágenes en las tarjetas",
  "Group child types under their parent category":
    "Agrupar los tipos hijos bajo su categoría principal",
  "Disciplines appear here as soon as talent on your roster is tagged.":
    "Las disciplinas aparecen aquí en cuanto etiquetas al talento de tu elenco.",
  "See all": "Ver todo",
  "e.g. The roster": "p. ej. El elenco",
  "e.g. for your next campaign": "p. ej. para tu próxima campaña",
};
