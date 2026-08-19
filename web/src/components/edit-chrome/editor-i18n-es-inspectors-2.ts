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
};
