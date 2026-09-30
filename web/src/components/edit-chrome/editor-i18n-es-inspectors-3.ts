/**
 * Spanish editor-chrome strings — third overflow split of
 * `editor-i18n-es-inspectors.ts` (LUMINA, 2026-09-16): the ticket_picker v2
 * inspector (event select, presentation switches, per-tier cards) and the
 * QR block's "Create a link" form. Same pattern as `-inspectors-2.ts`: spread
 * into the same flat `ES_TEXT` map.
 *
 * REGISTERED with `ES_CATALOG_FILES` in `es-parity.static.test.ts`.
 * House rules: no em dashes, `{token}` markers kept intact.
 */

export const ES_INSPECTOR_TEXT_3: Record<string, string> = {
  // ── ticket_picker v2 / QR link minting (LUMINA, 2026-09-16) ────────────
  "Event & presentation": "Evento y presentación",
  "Event id": "Id del evento",
  "List (one screen)": "Lista (una pantalla)",
  "Cards, in steps (ticket → how many → your details)": "Tarjetas, por pasos (entrada → cuántas → tus datos)",
  "On phones": "En teléfonos",
  "Show the tickets on the page": "Mostrar las entradas en la página",
  "Sticky Buy button that opens a sheet": "Botón Comprar fijo que abre un panel",
  "The sheet becomes a side panel on desktop.": "El panel se abre lateral en escritorio.",
  "Night picker": "Selector de noche",
  "Hide when there is one night": "Ocultar cuando hay una sola noche",
  "Always show": "Mostrar siempre",
  "Loading tickets…": "Cargando entradas…",
  "Couldn't load this event's tickets.": "No se pudieron cargar las entradas de este evento.",
  "This event has no ticket types yet. Add them under Events & Tickets → Entradas.": "Este evento aún no tiene tipos de entrada. Añádelos en Eventos y entradas → Entradas.",
  "Includes (one per line)": "Incluye (una por línea)",
  "Hide from the cards (reachable by link only)": "Ocultar de las tarjetas (solo por enlace)",
  "Choose an event…": "Elige un evento…",
  "Loading your events…": "Cargando tus eventos…",
  "Couldn't load your events. Paste the event id.": "No se pudieron cargar tus eventos. Pega el id del evento.",
  "No events yet. Create one under Events & Tickets, or paste an id.": "Aún no hay eventos. Crea uno en Eventos y entradas, o pega un id.",
  "Create a link…": "Crear un enlace…",
  "Sends guests to": "Lleva a los invitados a",
  "Create link": "Crear enlace",
  "Full bleed": "A sangre",
  "On": "Activado",
  "Span the screen edge to edge, even inside a narrower block.": "Ocupa la pantalla de borde a borde, incluso dentro de un bloque más estrecho.",
  // ── event_program inspector (Event Program engine, Wave 2 PR D) ─────────
  "Leave empty to use the heading set on the event's Program tab.": "Déjalo vacío para usar el título definido en la pestaña Programa del evento.",
  "This page belongs to an event, so the block shows that event's program:": "Esta página pertenece a un evento, así que el bloque muestra el programa de ese evento:",
  "Compact list": "Lista compacta",
  "Timeline: run of show, one column": "Línea de tiempo: orden del show, una columna",
  "Cards: cover, time and title in a grid": "Tarjetas: portada, hora y título en cuadrícula",
  "Compact: one line per item, for sidebars": "Compacto: una línea por elemento, para laterales",
  "Schedule: a column per stage, rows by time": "Horario: una columna por escenario, filas por hora",
  "Lineup: who is playing, image first": "Lineup: quién toca, con imagen primero",
  "Program": "Programa",
  "Group by": "Agrupar por",
  "Automatic (nights, then places)": "Automático (noches, luego lugares)",
  "Night": "Noche",
  "Place": "Lugar",
  "No groups": "Sin grupos",
  "Each row shows": "Cada fila muestra",
  "Times": "Horarios",
  "Performers only (a lineup)": "Solo artistas (un lineup)",
  "Show at most": "Mostrar como máximo",
  "All items": "Todos los elementos",
  "Kind label (a small word, never a symbol)": "Etiqueta de tipo (una palabra pequeña, nunca un símbolo)",
  "Run of show": "Orden del show",
  "Item links (Reserve a spot, See more)": "Enlaces del elemento (Reservar lugar, Ver más)",
  "Tap opens the item details (off for compact and schedule unless ticked)": "Tocar abre el detalle del elemento (apagado en compacto y horario salvo que lo marques)",
  // ── services_catalog inspector (#2283) ──────────────────────────────────
  "Section copy and which catalog items this widget shows. Prices and booking rules stay in Services - use Edit offering there.":
    "Texto de la sección y qué ítems del catálogo muestra este widget. Precios y reglas de reserva quedan en Servicios: úsalos en Editar oferta.",
  "Leave blank for behavior-aware labels": "Déjalo en blanco para etiquetas según el comportamiento",
  "Open Services catalog editor": "Abrir el editor del catálogo de Servicios",
  "Add your first offering": "Agrega tu primera oferta",
  "Featured offerings": "Ofertas destacadas",
  "Search to feature…": "Buscar para destacar…",
  "Presentation order": "Orden de presentación",
  "Catalog order": "Orden del catálogo",
  "Manual (selected ids order)": "Manual (orden de IDs seleccionados)",
  "Visible fields": "Campos visibles",
  "Show category": "Mostrar categoría",
  "Show delivery / location": "Mostrar entrega / ubicación",
  "Show booking badge": "Mostrar insignia de reserva",
  "Show price": "Mostrar precio",
  "Show Instant / Deposit badges": "Mostrar insignias Instantánea / Seña",
  "Show All chip in category filter": "Mostrar chip Todos en el filtro de categorías",
  "Show counts on category chips": "Mostrar conteos en chips de categoría",
  "Enable visitor catalog search": "Activar búsqueda del catálogo para visitantes",
  "Style preset": "Preset de estilo",
  "Image-led": "Con imagen",
  "Search offerings…": "Buscar ofertas…",
  "Details open in the booking sheet (modal on desktop, bottom sheet on mobile). Inline expansion is not supported in this release - no dead control.":
    "Los detalles se abren en la hoja de reserva (modal en escritorio, hoja inferior en móvil). La expansión en línea no está en esta versión: sin controles muertos.",
  "How visitors open details and start booking. Chat Ask handoff is shared with the booking sheet.":
    "Cómo abren los visitantes los detalles y empiezan a reservar. El Ask del chat se comparte con la hoja de reserva.",

  // ── Magazine / visit / reviews / masthead / contents (tip #2429) ─────────
  Contents: "Contenidos",
  Statement: "Declaración",
  Map: "Mapa",
  Neighbourhood: "Barrio",
  "Your visit": "Tu visita",
  Credit: "Crédito",
  "Credit and contact": "Crédito y contacto",
  Numbers: "Números",
  Optional: "Opcional",
  "Stacked words": "Palabras apiladas",
  "Word or line": "Palabra o línea",
  "Label EN": "Etiqueta EN",
  "Label ES": "Etiqueta ES",
  "Measure strip": "Franja de medidas",
  "Names instead of icons": "Nombres en vez de iconos",
  "Recent work": "Trabajo reciente",
  "Start with every question closed": "Empezar con todas las preguntas cerradas",
  "Optional credit": "Crédito opcional",
  "Optional role or issue line": "Línea opcional de rol o número",
  "Optional contact line": "Línea de contacto opcional",
  "Optional (leave blank for a bare strip)":
    "Opcional (déjalo en blanco para una franja sin título)",
  "Photographer, client, year": "Fotógrafo, cliente, año",
  "Available for editorial, campaign, and portrait commissions.":
    "Disponible para encargos editoriales, de campaña y de retrato.",
  "A chapter index with links to sections on this page. Anchors must match a block Anchor name (Data panel) or a chapter id like chapter-1.":
    "Un índice de capítulos con enlaces a secciones de esta página. Los anclajes deben coincidir con el nombre de ancla de un bloque (panel Datos) o con un id de capítulo como chapter-1.",
  "A short closing line for the page. Keep it to one or two sentences.":
    "Una línea breve de cierre para la página. Que sea una o dos frases.",
  "Autoplay pauses for reduced motion and while editing.":
    "La reproducción automática se pausa con movimiento reducido y al editar.",
  "Each row is one giant line in the masthead. With one line and Split words on, spaces become separate stack rows on the page.":
    "Cada fila es una línea grande en el masthead. Con una sola línea y Separar palabras activado, los espacios se convierten en filas apiladas en la página.",
  "Each row needs a label and an anchor. Drag to reorder.":
    "Cada fila necesita una etiqueta y un ancla. Arrastra para reordenar.",
  "Full-bleed photo behind the stacked words. B&W is the magazine default.":
    "Foto a sangre detrás de las palabras apiladas. El blanco y negro es el valor por defecto de la revista.",
  "Live facts from your service areas, languages, and booking days. The block hides itself when there are none.":
    "Datos en vivo de tus zonas de servicio, idiomas y días de reserva. El bloque se oculta cuando no hay ninguno.",
  "Live quotes from published client reviews. The block hides itself when there are none.":
    "Citas en vivo de reseñas publicadas de clientes. El bloque se oculta cuando no hay ninguna.",
  "Only fields marked public on the profile appear. Turning a measure off here hides it on the site even if the profile shows it.":
    "Solo aparecen los campos marcados como públicos en el perfil. Desactivar una medida aquí la oculta en el sitio aunque el perfil la muestre.",
  "Optional lines under the statement. Credit is usually the name; contact can be an email, handle, or short ask.":
    "Líneas opcionales bajo la declaración. El crédito suele ser el nombre; el contacto puede ser un correo, un handle o una petición breve.",
  "Optional. Without a map URL the facts render alone, even in the split layout.":
    "Opcional. Sin URL de mapa, los datos se muestran solos, incluso en el diseño dividido.",
  "Print the platform names in a line (Instagram · WhatsApp) instead of icons. Good for footer fine print.":
    "Imprime los nombres de las plataformas en una línea (Instagram · WhatsApp) en vez de iconos. Sirve para la letra pequeña del pie.",
  "Trio, single, or row on the shared slider.":
    "Trío, individual o fila en el carrusel compartido.",
  "Where the section links live on the page. Top bar is the classic sticky row. Overlay, side rail, bottom tabs, filter bar, and chapter dots are shared chrome modes any Design can use.":
    "Dónde viven los enlaces de sección en la página. La barra superior es la fila fija clásica. Superposición, carril lateral, pestañas inferiores, barra de filtros y puntos de capítulo son modos de chrome compartidos que cualquier Diseño puede usar.",
  "Where the section links live: classic top bar, overlay on the hero, side rail with scroll-spy, phone bottom tabs, filter chip bar, or chapter dots with labels.":
    "Dónde viven los enlaces de sección: barra superior clásica, superposición sobre el hero, carril lateral con seguimiento de scroll, pestañas inferiores en el teléfono, barra de chips de filtro o puntos de capítulo con etiquetas.",
  // PR 7: talent languages (LocaleFieldTabs + content-locale pill).
  "Field language": "Idioma del campo",
  "primary": "principal",
  "translated": "traducido",
  "missing": "falta",
  "Translate to {lang} with AI": "Traducir al {lang} con AI",
  "AI translation is not available on this plan.": "La traducción con AI no está disponible en este plan.",
  "AI limit reached. Try later or write it yourself.": "Llegaste al límite de AI. Inténtalo más tarde o escríbelo tú.",
  "Translation failed. Try again.": "No se pudo traducir. Inténtalo de nuevo.",
  "Show the page in {lang} (primary).": "Ver la página en {lang} (principal).",
  "Preview and translate in {lang}. Untranslated blocks dim.":
    "Ver y traducir en {lang}. Los bloques sin traducir se atenúan.",
  "Content language": "Idioma del contenido",
  // Release 2.5 (Maison v2 look): row cards, framed work cards, linked next-free chip.
  "Row style": "Estilo de las filas",
  "Hairline rows": "Filas con línea fina",
  "Raised cards": "Tarjetas elevadas",
  "Framed cards": "Tarjetas con marco",
  "Each photo sits in a raised card with its name and an arrow. Needs captions on to show the name.":
    "Cada foto va en una tarjeta elevada con su nombre y una flecha. Activa los pies de foto para ver el nombre.",
  "Custom accent": "Acento personalizado",
  "One color, the rest follows": "Un color, el resto se ajusta solo",
  "Accent color": "Color de acento",
  "Pick one color. Buttons use it as is; the soft tint, page ground and lines are derived, and text uses a version that stays readable.":
    "Elige un color. Los botones lo usan tal cual; el tinte suave, el fondo y las líneas se derivan, y el texto usa una versión que se lee bien.",
  "Pick any color. Text color and tints are derived, and contrast is checked.":
    "Elige cualquier color. El color del texto y los tintes se derivan, y se revisa el contraste.",
  "Link to": "Enlazar a",
  "Make the card a link, for example #services to jump to your menu. Leave empty for plain text.":
    "Convierte la tarjeta en un enlace, por ejemplo #services para ir a tu menú. Déjalo vacío para texto simple.",
<<<<<<< HEAD

  // ── Header section switcher (Maison v2 2.6, H-4) ───────────────────────
  "Section switcher": "Selector de secciones",
  "On phones, shows the current section and opens a menu of every section. Uses your menu links.":
    "En teléfonos, muestra la sección actual y abre un menú con todas las secciones. Usa tus enlaces del menú.",
  "{count} sections, shown on phones": "{count} secciones, visibles en teléfonos",
  "Needs at least two in-page menu links": "Necesita al menos dos enlaces del menú que apunten a secciones de la página",
  "Section number": "Número de sección",
  "The two-digit number shown before the section name.": "El número de dos dígitos que aparece antes del nombre de la sección.",
  "Show the number": "Mostrar el número",
  "Name only": "Solo el nombre",
=======
  // ── visit inspector: Location layout (2026-09-30) ─────────────────────
  Facts: "Datos",
  "Map + facts": "Mapa y datos",
  "Area map": "Mapa de la zona",
  "Map on the left": "Mapa a la izquierda",
  "Map on the right": "Mapa a la derecha",
  "Small map": "Mapa pequeño",
  "Medium map": "Mapa mediano",
  "Large map": "Mapa grande",
  "Show the View map button": "Mostrar el botón Ver mapa",
  "Who sees your address, the studio kind, the arrival note and photo come from Services, Defaults. The map area is drawn from your city and neighbourhood.":
    "Quién ve tu dirección, el tipo de estudio, la nota y la foto de llegada vienen de Servicios, Valores predeterminados. La zona del mapa se dibuja con tu ciudad y tu colonia.",
  "Appears once the interactive map is available. Until then only the area drawing shows.":
    "Aparece cuando el mapa interactivo esté disponible. Mientras tanto solo se ve el dibujo de la zona.",
  "Location · zone, hours, how to arrive": "Ubicación · zona, horario, cómo llegar",
>>>>>>> 91b4f8b57 (talent/: location section (settings, visit location layout, privacy gate, confirmation address) + Maison v2 Location block)
};
