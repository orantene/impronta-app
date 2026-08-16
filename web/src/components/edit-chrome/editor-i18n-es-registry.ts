/**
 * Spanish editor-chrome strings — WAVE 4.6 (2026-08-07): the BUILDER REGISTRY.
 *
 * Waves 4.4 and 4.5 translated the inspectors and the per-section Editor
 * panels. What neither could reach is the copy that originates in the builder
 * REGISTRY rather than in a panel: the node-kind labels and descriptions in
 * `lib/site-admin/builder-node/registry.ts`, the element-library category
 * headings and roadmap labels in `builder-node/mvp-allow-list.ts`, and the
 * curated Tulala component names in `builder-node/section-embed-presets.ts`.
 * Those modules cannot import edit-chrome (frozen `lib-edit-chrome-cycle-guard`
 * edge), and their values are plain data, so each is translated at the
 * edit-chrome RENDER boundary with `t(label)` and resolved through this map.
 *
 * That is why an operator on a Spanish editor still read "CONTAINER BLOCK" over
 * the inspector, "Container" in the layer tree, and an entirely English
 * "My blocks" / "Component library" panel: every one of those strings entered
 * the UI from the registry side.
 *
 * Split out of `editor-i18n-es.ts` for the 800-line cap, exactly like
 * `-canvas.ts` / `-sections.ts` / `-inspectors.ts` / `-section-panels{,-2}.ts`.
 * Pure data, no logic; spread into `ES_TEXT` in `editor-i18n-es.ts`.
 *
 * REGISTERED with `ES_CATALOG_FILES` in `es-parity.static.test.ts`. A split file
 * missing from that list silently stops being duplicate-checked while the test
 * still reports green, which is exactly the trap the two-lane merge hit. Every
 * key below was checked against the other five catalogs before being added:
 * keys those already own (Container, Heading, Layout, Directory, Polish…) are
 * deliberately NOT redefined here.
 *
 * House rules: no em dashes, "Solicitud" for inquiry, and `{token}` markers kept
 * intact and placed naturally for Spanish word order.
 */

export const ES_BUILDER_REGISTRY_TEXT: Record<string, string> = {
  // ── Node-kind labels not already owned by another catalog ───────────────
  // (Container, Section, Card, Split, Accordion, Tabs, Carousel, Heading,
  //  Paragraph, Button, Image, Video, Embed, Icon, Divider, Spacer,
  //  Navigation, Social links, Form and Pricing table already have entries.)
  "CTA group": "Grupo de CTA",
  "Accordion Item": "Elemento del acordeón",
  "Tab Panel": "Panel de pestaña",
  Masonry: "Mosaico",
  "Social post": "Publicación social",
  "Rich text": "Texto enriquecido",
  "Code / HTML": "Código / HTML",
  "Tulala component": "Componente de Tulala",
  "CMS section row": "Fila de sección del CMS",
  "Columns (split)": "Columnas (división)",

  // ── Node-kind descriptions (inspector fallback card, layer subtitles) ────
  "Top-level page section row.": "Fila de sección de nivel superior de la página.",
  "Layout container for nested nodes.": "Contenedor de maquetación para bloques anidados.",
  // House rule: no em dashes in user-facing copy. The registry source carried
  // one here and was corrected in the same commit, so key and source match.
  "Bounded surface for heading, copy, image, and buttons. No nested containers.":
    "Superficie delimitada para título, texto, imagen y botones. Sin contenedores anidados.",
  "Inline primary and secondary actions (buttons only).":
    "Acciones principal y secundaria en línea (solo botones).",
  "Two-column split container.": "Contenedor dividido en dos columnas.",
  "Accordion group container.": "Contenedor de grupo de acordeón.",
  "Single accordion item with nested content.":
    "Un solo elemento de acordeón con contenido anidado.",
  "Tabbed container.": "Contenedor con pestañas.",
  "Single tab panel with nested content.":
    "Un solo panel de pestaña con contenido anidado.",
  "Carousel/slider container.": "Contenedor de carrusel o deslizador.",
  "Masonry grid container.": "Contenedor de cuadrícula en mosaico.",
  "Simple text heading node.": "Bloque simple de título de texto.",
  "Simple paragraph text node.": "Bloque simple de texto de párrafo.",
  "Simple CTA node.": "Bloque simple de llamada a la acción.",
  "Standalone image node.": "Bloque de imagen independiente.",
  "Hosted video with poster, playback, and control options.":
    "Video alojado con miniatura, reproducción y opciones de control.",
  "Sandboxed iframe for video, maps, booking, or other embeds.":
    "Iframe aislado para video, mapas, reservas u otras incrustaciones.",
  "Inline SVG icon that inherits current text color.":
    "Icono SVG en línea que hereda el color de texto actual.",
  "Two to four pricing tiers with features and calls to action.":
    "De dos a cuatro niveles de precio con características y llamadas a la acción.",
  "Body copy with bold, italic, and sanitized links.":
    "Texto de cuerpo con negrita, cursiva y enlaces saneados.",
  "Horizontal rule separator.": "Separador de línea horizontal.",
  "Vertical spacing node.": "Bloque de espaciado vertical.",
  // These six carried em dashes in their ENGLISH source, against house rule 9.
  // The registry was corrected in this same commit, so key and source match.
  "Feature one Instagram or TikTok post. Paste the post URL and it renders with the provider's own embed.":
    "Destaca una publicación de Instagram o TikTok. Pega la URL de la publicación y se muestra con la incrustación del propio proveedor.",
  "Raw HTML/CSS in a sandboxed iframe (owner only), for static markup the Embed node can't cover.":
    "HTML/CSS sin procesar en un iframe aislado (solo para propietarios), para marcado estático que el bloque de incrustación no cubre.",
  "Header navigation bar: inline links on desktop, hamburger menu on mobile. Links stay reachable at every width. Each link can open a dropdown or mega submenu.":
    "Barra de navegación del encabezado: enlaces en línea en escritorio y menú de hamburguesa en móvil. Los enlaces siguen accesibles en todos los anchos. Cada enlace puede abrir un desplegable o un submenú ampliado.",
  "A row of social/contact icon links (Instagram, TikTok, X, …). Bind to your workspace social profiles or set links by hand.":
    "Una fila de iconos de enlaces sociales o de contacto (Instagram, TikTok, X, …). Vincúlalos a los perfiles sociales de tu espacio de trabajo o define los enlaces a mano.",
  "Lead/contact form: text, email, phone, and message fields plus a submit button. Submissions land in your workspace inbox.":
    "Formulario de contacto o captación: campos de texto, correo, teléfono y mensaje, más un botón de envío. Los envíos llegan a la bandeja de entrada de tu espacio de trabajo.",
  "Embed a live Tulala component (directory, featured talent, booking, or CTA) anywhere on the canvas. Connects to real workspace data on publish.":
    "Incrusta un componente en vivo de Tulala (directorio, talento destacado, reservas o llamada a la acción) en cualquier parte del lienzo. Se conecta con los datos reales del espacio de trabajo al publicar.",

  // ── Element-library categories (the picker's group headings) ─────────────
  // Layout / Structure / Typography / Media already exist in editor-i18n-es.ts.
  Actions: "Acciones",
  Utility: "Utilidades",

  // ── Curated Tulala component presets (the picker's "Tulala" group) ───────
  // Directory, Stats, Logo cloud and the four Header widgets already exist.
  "Featured talent": "Talento destacado",
  Booking: "Reservas",
  CTA: "Llamada a la acción",
  Testimonials: "Testimonios",
  Gallery: "Galería",
  FAQ: "Preguntas frecuentes",
  "Location map": "Mapa de ubicaciones",

  // ── Composed kind labels (the "CONTAINER BLOCK" line and its siblings) ───
  // Built from a template so the kind label can be translated on its own; the
  // header renders these uppercased in CSS, which Spanish handles fine.
  "{label} block": "Bloque {label}",
  "{label} section": "Sección {label}",
  "{label} blocks": "Bloques de {label}",
  "{label} pattern": "Patrón de {label}",
  "Saved block pattern": "Patrón de bloque guardado",
  "Copied: {label}": "Copiado: {label}",
  "Select {label}": "Seleccionar {label}",
  "Select a block": "Selecciona un bloque",

  // ── Element-library insert picker ────────────────────────────────────────
  "Search elements": "Buscar elementos",
  "Search blocks…": "Buscar bloques...",
  "No elements match this search.": "Ningún elemento coincide con esta búsqueda.",
  "No elements can be inserted here right now (catalog empty). Reload the page or pick another section. If this persists, the builder tree may still be loading.":
    "Ahora mismo no se puede insertar ningún elemento aquí (catálogo vacío). Recarga la página o elige otra sección. Si el problema continúa, puede que el árbol del constructor aún se esté cargando.",

  // ── "My blocks" panel (living components) ────────────────────────────────
  "My blocks": "Mis bloques",
  "Save this block to My blocks": "Guardar este bloque en Mis bloques",
  "Save block": "Guardar bloque",
  "Loading saved blocks…": "Cargando bloques guardados...",
  "No saved blocks yet. Select a block and save it to reuse it anywhere.":
    "Aún no hay bloques guardados. Selecciona un bloque y guárdalo para reutilizarlo donde quieras.",
  "{count} nodes": "{count} bloques",
  "Insert copy": "Insertar copia",
  "Insert linked": "Insertar vinculado",
  "Update master": "Actualizar maestro",
  "Sync instances": "Sincronizar instancias",
  "Delete {name}": "Eliminar {name}",
  "Linked instance inserted. Edit the master then Sync.":
    "Instancia vinculada insertada. Edita el maestro y luego sincroniza.",
  "Synced {count} instance.": "Se sincronizó {count} instancia.",
  "Synced {count} instances.": "Se sincronizaron {count} instancias.",
  "No linked instances of this block on the page.":
    "No hay instancias vinculadas de este bloque en la página.",
  'Updated "{name}" master. Published instances reflect it live; in-editor, Sync to refresh.':
    'Se actualizó el maestro "{name}". Las instancias publicadas lo reflejan al momento; en el editor, sincroniza para verlo.',
  "Couldn't save the block.": "No se pudo guardar el bloque.",
  "Couldn't insert the block.": "No se pudo insertar el bloque.",
  "Couldn't insert the linked instance.":
    "No se pudo insertar la instancia vinculada.",
  "Couldn't sync instances.": "No se pudieron sincronizar las instancias.",
  "Couldn't update the master.": "No se pudo actualizar el maestro.",
  "Couldn't delete the block.": "No se pudo eliminar el bloque.",

  // ── Component library panel ──────────────────────────────────────────────
  "Component library": "Biblioteca de componentes",
  "Saved components and where they’re used on this page. Insert a linked instance, or edit a master to update every instance at once.":
    "Componentes guardados y dónde se usan en esta página. Inserta una instancia vinculada o edita un maestro para actualizar todas las instancias a la vez.",
  "Loading components…": "Cargando componentes...",
  "No saved components yet. Select a block, save it to “My blocks”, then insert it linked to build a component.":
    "Aún no hay componentes guardados. Selecciona un bloque, guárdalo en “Mis bloques” y luego insértalo vinculado para crear un componente.",
  "Only container/card components can be linked instances. Save a container or card block to use the library.":
    "Solo los componentes de contenedor o tarjeta pueden ser instancias vinculadas. Guarda un bloque de contenedor o de tarjeta para usar la biblioteca.",
  instance: "instancia",
  instances: "instancias",
  "Edit master": "Editar maestro",
  "Find instance": "Buscar instancia",
  'Added a linked instance of "{name}".':
    'Se añadió una instancia vinculada de "{name}".',
  'Editing a copy of "{name}". Tweak it, then use "Update master" below to push your changes to all {count} instance(s).':
    'Estás editando una copia de "{name}". Ajústala y luego usa "Actualizar maestro" abajo para enviar tus cambios a las {count} instancia(s).',
  'Updated "{name}" and re-synced {count} instance(s).':
    'Se actualizó "{name}" y se volvieron a sincronizar {count} instancia(s).',
  'Updated "{name}" master. Published instances reflect it live.':
    'Se actualizó el maestro "{name}". Las instancias publicadas lo reflejan al momento.',
  'Selected an instance of "{name}".':
    'Se seleccionó una instancia de "{name}".',
  '"{name}" has no instances on this page yet.':
    '"{name}" aún no tiene instancias en esta página.',
  "Couldn't open the master for editing.":
    "No se pudo abrir el maestro para editarlo.",
  // ── Instance staleness (feat/component-instance-sync, 2026-08-15) ────────
  "Published pages always show the latest master. Each page's editor keeps its own copy; Sync refreshes it.":
    "Las páginas publicadas siempre muestran el maestro más reciente. El editor de cada página guarda su propia copia; sincroniza para actualizarla.",
  "{count} out of date on this page": "{count} desactualizada(s) en esta página",
  "The master changed since these were placed. Published pages already show the latest; Sync updates this page's editor view.":
    "El maestro cambió desde que se colocaron. Las páginas publicadas ya muestran lo último; sincroniza para actualizar la vista del editor en esta página.",
  "Sync this page": "Sincronizar esta página",
  "Refresh this page's instances from the latest master":
    "Actualizar las instancias de esta página desde el maestro más reciente",
  "Couldn't load the latest master. Try again.":
    "No se pudo cargar el maestro más reciente. Inténtalo de nuevo.",
};
