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
  // Release 2.7 (hero + footer): lines that follow the profile.
  "Follows your profile": "Sigue tu perfil",
  "This line is filled in from your profile and stays up to date. Turn it off, or type your own words, to keep it as written.":
    "Esta línea se llena desde tu perfil y se mantiene al día. Desactívala, o escribe tus propias palabras, para dejarla tal cual.",
  "Link to": "Enlazar a",
  "Make the card a link, for example #services to jump to your menu. Leave empty for plain text.":
    "Convierte la tarjeta en un enlace, por ejemplo #services para ir a tu menú. Déjalo vacío para texto simple.",

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
  // ── Gridline G10/G11: spec table, work-order portfolio, area card ──────
  "Utility bar": "Barra de utilidad",
  "Utility bar · status and call": "Barra de utilidad · estado y llamada",
  "A dark header bar with your name, an emergencies status pill and a tap-to-call button. The call button shows only when you set a public number.": "Una barra oscura con tu nombre, un indicador de emergencias y un botón para llamar. El botón de llamada aparece solo si defines un número público.",
  "Alert band": "Banda de alerta",
  "Alert band · same-day emergency": "Banda de alerta · emergencia el mismo día",
  "A hazard-tape band for same-day emergencies with a safety note. Shown only while emergencies today is on.": "Una banda tipo cinta de precaución para emergencias del mismo día, con una nota de seguridad. Se muestra solo mientras Emergencias hoy está activado.",
  "Header": "Encabezado",
  "Subtitle": "Subtítulo",
  "Electrician · Monterrey": "Electricista · Monterrey",
  "Logo image URL": "URL de la imagen del logo",
  "Emergencies pill": "Indicador de emergencias",
  "Shows whether you take emergencies today. It follows your live Emergencies today switch.": "Indica si atiendes emergencias hoy. Sigue tu interruptor Emergencias hoy.",
  "Show the pill": "Mostrar el indicador",
  "Label when on": "Texto cuando está activo",
  "Label when off": "Texto cuando está apagado",
  "Emergencies today": "Emergencias hoy",
  "No emergencies today": "Sin emergencias hoy",
  "Call button": "Botón de llamada",
  "The button appears only when you have set a public call number in your site settings.": "El botón aparece solo si definiste un número público de llamada en los ajustes de tu sitio.",
  "Show the call button": "Mostrar el botón de llamada",
  "Call button label": "Texto del botón de llamada",
  "Action": "Acción",
  "A button shown on desktop only. Leave the label empty to hide it.": "Un botón que solo se ve en escritorio. Deja el texto vacío para ocultarlo.",
  "Action label": "Texto de la acción",
  "Action link": "Enlace de la acción",
  "This band shows only while your Emergencies today switch is on. When it is off, nothing is shown.": "Esta banda se muestra solo mientras tu interruptor Emergencias hoy está activado. Si está apagado, no se muestra nada.",
  "Headline": "Titular",
  "Safety note": "Nota de seguridad",
  "Advice for the client while they wait. Empty hides the note.": "Consejo para el cliente mientras espera. Vacío oculta la nota.",
  "Note label": "Etiqueta de la nota",
  "Safety note text": "Texto de la nota de seguridad",
  "Meanwhile:": "Mientras tanto:",
  // ── Gridline G9a: task picker ──────────────────────────────────────────
  "Task picker": "Selector de tareas",
  "Task picker · tasks and recommended services": "Selector de tareas · tareas y servicios recomendados",
  "What is happening, in the visitor's words. Each task recommends one of your services with its price, time and the right action.":
    "Lo que pasa, en palabras del visitante. Cada tarea recomienda uno de tus servicios con su precio, su tiempo y la acción correcta.",
  "Visitors pick what is happening and get one service recommended, with its price, time and the right action.":
    "El visitante elige lo que pasa y recibe un servicio recomendado, con su precio, su tiempo y la acción correcta.",
  "Start here": "Empieza aquí",
  "Shown while no task is picked. Usually your inspection or first visit.":
    "Se muestra mientras no hay tarea elegida. Normalmente tu revisión o primera visita.",
  "Start here service": "Servicio para empezar",
  "Label (Spanish)": "Etiqueta (español)",
  "Note": "Nota",
  "Note (Spanish)": "Nota (español)",
  "Tasks": "Tareas",
  "A task with no service chosen is not shown. Spanish text falls back to the English text when empty.":
    "Una tarea sin servicio elegido no se muestra. El texto en español usa el texto en inglés cuando está vacío.",
  "Choose a service": "Elige un servicio",
  "Unavailable service (not published)": "Servicio no disponible (no publicado)",
  "Task text": "Texto de la tarea",
  "Task text (Spanish)": "Texto de la tarea (español)",
  "Task (The power went out)": "Tarea (Se fue la luz)",
  "Task in Spanish": "Tarea en español",
  "Task icon": "Ícono de la tarea",
  "Recommended service": "Servicio recomendado",
  "Task note": "Nota de la tarea",
  "Task note (Spanish)": "Nota de la tarea (español)",
  "Note shown with the recommendation": "Nota que se muestra con la recomendación",
  "Note in Spanish": "Nota en español",
  "Add task": "Agregar tarea",
  "Remove task": "Quitar tarea",
  "Spec table": "Ficha técnica",
  "Spec table · key and value rows": "Ficha técnica · filas de dato y valor",
  "A short table of facts. On a phone it is stacked rows; on a desktop it becomes one strip with a column per row.":
    "Una tabla corta de datos. En el celular son filas apiladas; en escritorio se vuelve una franja con una columna por fila.",
  "Rows with an empty label or value are not shown.": "Las filas sin etiqueta o sin valor no se muestran.",
  "Row label": "Etiqueta de la fila",
  "Row value": "Valor de la fila",
  "Label (Warranty)": "Etiqueta (Garantía)",
  "Value (6 months, in writing)": "Valor (6 meses, por escrito)",
  "Add row": "Agregar fila",
  "Key and value rows (voltage, warranty, how you price). A strip on desktop, stacked rows on a phone.":
    "Filas de dato y valor (voltaje, garantía, cómo cotizas). Una franja en escritorio, filas apiladas en el celular.",
  "Work orders": "Órdenes de trabajo",
  "Job cards. Write each photo caption on two lines: the job on the first, the work order detail on the second. No faces or client names.":
    "Tarjetas de trabajo. Escribe cada pie de foto en dos líneas: el trabajo en la primera, el detalle de la orden en la segunda. Sin caras ni nombres de clientes.",
  "Job cards": "Tarjetas de trabajo",
  "Area card": "Tarjeta de zona",
  "An approximate area: a drawn grid, the places you travel to as chips and your arrival note. It never shows an address.":
    "Una zona aproximada: una cuadrícula dibujada, los lugares a los que viajas como etiquetas y tu nota de llegada. Nunca muestra una dirección.",
// ── Contenido nested-block UX (page-builder panel cleanup) ─────────────
  // Short helpers + NestedBlocksCard chrome. Lives here because
  // editor-i18n-es-inspectors.ts is at the 800-line max-lines ceiling.
  // Skip "Drag to reorder" / "Saved block pattern", already owned elsewhere.
  "Add and reorder the blocks inside this group.":
    "Agrega y reordena los bloques de este grupo.",
  "Open each column to edit its text and photos. Ratio is under Design.":
    "Abre cada columna para editar su texto y fotos. La proporción está en Diseño.",
  "Open each item to rename the question and edit what’s inside.":
    "Abre cada elemento para renombrar la pregunta y editar lo que hay dentro.",
  "Open each tab to rename it and edit what’s inside.":
    "Abre cada pestaña para renombrarla y editar lo que hay dentro.",
  "Add slides below. Autoplay and controls are under Design.":
    "Agrega diapositivas abajo. La reproducción automática y los controles están en Diseño.",
  "Add images or cards below. Columns and gap are under Design.":
    "Agrega imágenes o tarjetas abajo. Las columnas y el espacio están en Diseño.",
  "Edit the heading, text, image, and button blocks below.":
    "Edita abajo los bloques de título, texto, imagen y botón.",
  "This group holds buttons only. Add headline text as a sibling block.":
    "Este grupo solo contiene botones. Agrega el titular como un bloque hermano.",
  "A horizontal line. Tone is under Design; spacing under Style.":
    "Una línea horizontal. El tono está en Diseño; el espaciado en Estilo.",
  "Empty space. Change its size under Design.":
    "Espacio vacío. Cambia su tamaño en Diseño.",
  "Library & saved blocks": "Biblioteca y bloques guardados",
  "Blocks in this group": "Bloques de este grupo",
  "Insert at top": "Insertar arriba",
  "Done selecting": "Listo",
  "Select multiple": "Seleccionar varios",
  "{count} block selected": "{count} bloque seleccionado",
  "{count} blocks selected": "{count} bloques seleccionados",
  "Select blocks for bulk actions": "Selecciona bloques para acciones en lote",
  "Select all": "Seleccionar todos",
  "Insert after": "Insertar después",
  "Paste in group": "Pegar en el grupo",
  "Paste the copied block into this group":
    "Pega el bloque copiado en este grupo",
  "Save pattern": "Guardar patrón",
  "Block presets": "Preajustes de bloque",
  "Add a block": "Agregar un bloque",
  "Insert block here": "Insertar bloque aquí",
  "Section packs": "Paquetes de sección",
  blocks: "bloques",
  Starter: "Inicio",
  // ── Estilo panel density (page-builder panel cleanup) ──────────────────
  "Following the theme": "Sigue el tema",
  "container name": "nombre del contenedor",
  "Box model": "Modelo de caja",
  "How the things inside this box sit next to each other.":
    "Cómo se acomodan las cosas dentro de este cuadro.",
  // ── Portada Diseño density (page-builder panel cleanup) ────────────────
  "Pick a look, then fine-tune the columns.":
    "Elige un aspecto y luego ajusta las columnas.",
  "Gap & mobile": "Espacio y móvil",
  "Keep side by side": "Mantener lado a lado",
  "Stack on phone": "Apilar en el teléfono",
  "Stacking & visibility": "Apilado y visibilidad",
  // ── Site Diseño Marca / Tema entry (page-builder panel cleanup) ────────
  "Site colours used across every page. Tema opens the full editor.":
    "Colores del sitio en todas las páginas. Tema abre el editor completo.",
};
