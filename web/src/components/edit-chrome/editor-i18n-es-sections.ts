/**
 * Spanish strings for the add-block gallery's section cards.
 *
 * Split out of `editor-i18n-es.ts` when that file crossed the 800-line cap.
 * These are the `label` / `description` strings from every
 * `lib/site-admin/sections/<kind>/meta.ts`: the gallery frame was already
 * translated but its 55 item cards were not, so a Spanish operator got a
 * Spanish frame wrapped around an English catalog.
 *
 * Kept in meta.ts key order so a new section is easy to slot in.
 */

export const ES_SECTION_CATALOG_TEXT: Record<string, string> = {
  Directory: "Directorio",
  Hero: "Portada",
  // ── Add-block gallery — section card labels + descriptions (FIX #7) ─────
  // The gallery frame was translated but its 55 item cards were not; these are
  // the `label` / `description` strings from every `lib/site-admin/sections/
  // */meta.ts`. Kept in meta.ts key order so a new section is easy to slot in.
  // A missing entry silently falls back to English, so keep this in sync with meta.ts.
  "Anchor nav": "Navegación de anclas",
  "Sticky-able horizontal nav of links to anchors elsewhere on the page (or external URLs).":
    "Navegación horizontal fijable con enlaces a anclas en otras partes de la página (o URL externas).",
  "Before / after": "Antes / después",
  "Two images stacked with a draggable divider. CSS-only, no JS required.":
    "Dos imágenes superpuestas con un divisor arrastrable. Solo CSS, sin JS.",
  "Blank section": "Sección en blanco",
  "Blank canvas for Advanced Mode. Compose headings, copy, media, and layout blocks from the element library; each one is saved with the page. Nothing renders until you add blocks. Turn on Show advanced sections, or search for blank canvas or custom composition.":
    "Lienzo en blanco para el Modo avanzado. Compón títulos, texto, medios y bloques de diseño desde la biblioteca de elementos; cada uno se guarda con la página. No se muestra nada hasta que agregas bloques. Activa Mostrar secciones avanzadas, o busca lienzo en blanco o composición personalizada.",
  "Blog post detail": "Detalle de entrada de blog",
  "Long-form post with hero image, byline, body, optional pull-quote.":
    "Entrada extensa con imagen principal, autoría, cuerpo y cita destacada opcional.",
  "Blog index": "Índice de blog",
  "Card grid of recent posts. Each item is editor-managed (manual list), and can be pointed at a real CMS query later.":
    "Cuadrícula de tarjetas con entradas recientes. Cada elemento se gestiona desde el editor (lista manual) y luego puede apuntar a una consulta real del CMS.",
  "Booking widget": "Widget de reservas",
  "Embedded scheduling widget (Calendly / Cal.com / Acuity / SavvyCal). First-class section with pre-tuned defaults.":
    "Widget de agenda incrustado (Calendly / Cal.com / Acuity / SavvyCal). Sección de primer nivel con valores predeterminados ya ajustados.",
  "Category grid": "Cuadrícula de categorías",
  "Portrait or icon-tile grid for services / categories / verticals. Three layout variants with configurable columns.":
    "Cuadrícula de retratos o mosaicos de iconos para servicios / categorías / verticales. Tres variantes de diseño con columnas configurables.",
  Embed: "Incrustar",
  "Sandboxed iframe embed (Calendly, YouTube, Vimeo, Spotify). Operator pastes the URL; we never inject raw HTML.":
    "Incrustación en iframe aislado (Calendly, YouTube, Vimeo, Spotify). El operador pega la URL; nunca inyectamos HTML sin procesar.",
  "Code snippet": "Fragmento de código",
  "Monospaced code block with optional file name + copy button. Plain-text rendering (no syntax highlight).":
    "Bloque de código monoespaciado con nombre de archivo y botón de copiar opcionales. Se muestra como texto plano (sin resaltado de sintaxis).",
  "Comparison table": "Tabla comparativa",
  "Feature × column matrix with check / dash / text values. Used for plan comparisons or service tiers.":
    "Matriz de características × columnas con valores de marca / guion / texto. Sirve para comparar planes o niveles de servicio.",
  "Contact form": "Formulario de contacto",
  "Native HTML form with configurable fields and submit endpoint (Formspree, Netlify, custom API, mailto).":
    "Formulario HTML nativo con campos configurables y destino de envío (Formspree, Netlify, API propia, mailto).",
  "Content tabs": "Pestañas de contenido",
  "Tabbed panels with rich-text bodies. CSS-only, built on radio inputs plus :checked.":
    "Paneles con pestañas y cuerpos de texto enriquecido. Solo CSS, basado en entradas de tipo radio y :checked.",
  "CTA banner": "Banner de llamada a la acción",
  "Emotional conversion block for the end of the page. Three variants (centered overlay, split image, minimal band) with primary / secondary / reassurance line.":
    "Bloque de conversión emocional para el final de la página. Tres variantes (superposición centrada, imagen dividida, banda mínima) con línea principal / secundaria / de confianza.",
  "Destinations mosaic": "Mosaico de destinos",
  "One oversized hero tile + 2–4 secondary tiles. Used for service areas, cities, or destination coverage.":
    "Un mosaico principal de gran tamaño más 2 a 4 mosaicos secundarios. Sirve para zonas de servicio, ciudades o cobertura de destinos.",
  'A portable, filterable talent directory. Drop it on any page, scope it to a talent type (e.g. "Our Chefs"), pick a template + card style, and add optional AI search. One engine, unlimited directory pages.':
    'Un directorio de talento portátil y filtrable. Colócalo en cualquier página, acótalo a un tipo de talento (p. ej. "Nuestros chefs"), elige una plantilla y un estilo de tarjeta, y añade búsqueda con IA opcional. Un solo motor, páginas de directorio ilimitadas.',
  "Donation form": "Formulario de donación",
  "Amount selector, suggested tiers, and a payment link. Operator wires the payment URL (Stripe / Donorbox / etc).":
    "Selector de importe, niveles sugeridos y un enlace de pago. El operador configura la URL de pago (Stripe / Donorbox / etc.).",
  "Editorial split hero": "Portada editorial dividida",
  "Two-column editorial hero: copy plus CTA group on one side, media frame on the other. Configurable side, mobile order, overlay. Theme-neutral.":
    "Portada editorial a dos columnas: texto y grupo de llamadas a la acción de un lado, marco de medios del otro. Lado, orden en móvil y superposición configurables. Neutral respecto al tema.",
  "Event listing": "Listado de eventos",
  "Upcoming events list with date / time / location / RSVP link.":
    "Lista de próximos eventos con fecha / hora / lugar / enlace de confirmación.",
  "FAQ accordion": "Acordeón de preguntas frecuentes",
  "Question + answer list. Click to expand. SEO-friendly (uses native <details>).":
    "Lista de preguntas y respuestas. Haz clic para desplegar. Compatible con SEO (usa <details> nativo).",
  "Featured professionals": "Profesionales destacados",
  "Talent cards on the homepage. Source modes: manual pick, featured flag, service, destination, recent. Inherits the tenant's active directory card family.":
    "Tarjetas de talento en la página de inicio. Modos de origen: selección manual, marca de destacado, servicio, destino y recientes. Hereda la familia de tarjetas del directorio activa del tenant.",
  "Gallery strip": "Franja de galería",
  "Editorial image mosaic with aspect-ratio cycling (wide/tall/square). Optional italic caption below.":
    "Mosaico editorial de imágenes que alterna proporciones (ancha/vertical/cuadrada). Pie de foto en cursiva opcional debajo.",
  "Header account": "Cuenta en el encabezado",
  "The header's account menu / sign-in affordance. Live on the published shell; a placeholder chip in the editor.":
    "El menú de cuenta / control de inicio de sesión del encabezado. Activo en el sitio publicado; una ficha de marcador de posición en el editor.",
  "Header favorites": "Favoritos en el encabezado",
  "The header's saved-talent / favorites affordance (bookmark icon). Live on the published shell; a placeholder chip in the editor.":
    "El control de talento guardado / favoritos del encabezado (icono de marcador). Activo en el sitio publicado; una ficha de marcador de posición en el editor.",
  "Header inquiry": "Solicitud en el encabezado",
  "The header's inquiry lineup control (plane icon, opens the inquiry drawer). Live on the published shell; a placeholder chip in the editor.":
    "El control de lineup de solicitudes del encabezado (icono de avión, abre el panel de solicitud). Activo en el sitio publicado; una ficha de marcador de posición en el editor.",
  "Header search": "Búsqueda en el encabezado",
  "The header's talent-search affordance (search icon → directory). Live on the published shell; a placeholder chip in the editor.":
    "El control de búsqueda de talento del encabezado (icono de búsqueda que lleva al directorio). Activo en el sitio publicado; una ficha de marcador de posición en el editor.",
  "Above-the-fold section: headline, sub-headline, optional CTAs, optional background media. Reference type shipped in M0.":
    "Sección superior visible sin desplazar: titular, subtítulo, llamadas a la acción opcionales y medios de fondo opcionales. Tipo de referencia entregado en M0.",
  "Hero with search": "Portada con búsqueda",
  "Search-first hero: eyebrow, headline + highlight, subcopy, directory search, two CTAs, chips and a stat line. Theme-neutral; reusable across tenants.":
    "Portada centrada en la búsqueda: antetítulo, titular con resalte, texto de apoyo, búsqueda en el directorio, dos llamadas a la acción, fichas y una línea de cifras. Neutral respecto al tema y reutilizable entre tenants.",
  "Hero (split)": "Portada (dividida)",
  "Hero with copy on one side, large media on the other. Cleaner than the standard overlay hero for portfolio-led sites.":
    "Portada con el texto de un lado y medios grandes del otro. Más limpia que la portada con superposición estándar en sitios centrados en el portafolio.",
  "Image + copy (alternating)": "Imagen y texto (alternados)",
  "Editorial alternating image/copy rows. Each item is one row with image left/right. Ideal for service pages, category deep-dives, feature walkthroughs.":
    "Filas editoriales que alternan imagen y texto. Cada elemento es una fila con la imagen a la izquierda o a la derecha. Ideal para páginas de servicio, categorías a fondo y recorridos de funciones.",
  "Image with floating tags": "Imagen con etiquetas flotantes",
  "A central image with annotation pins / labels positioned around it. Used for product callouts, ingredient maps, anatomy diagrams.":
    "Una imagen central con marcadores o etiquetas de anotación a su alrededor. Sirve para destacar productos, mapas de ingredientes o diagramas anatómicos.",
  "Join / Register": "Únete / Regístrate",
  "A call-to-action that opens your branded talent registration, so people can join your roster directly from your site.":
    "Una llamada a la acción que abre tu registro de talento con tu marca, para que la gente pueda unirse a tu roster directamente desde tu sitio.",
  "Location discovery": "Descubrimiento de ubicaciones",
  "Markets/cities block: manual locations, or tenant-roster-derived cities with optional counts and directory links. Theme-neutral; zero-data safe.":
    "Bloque de mercados y ciudades: ubicaciones manuales, o ciudades derivadas del roster del tenant con conteos y enlaces al directorio opcionales. Neutral respecto al tema y seguro sin datos.",
  "Logo cloud": "Nube de logotipos",
  "Grid of partner / client / press logos with optional captions. Distinct from the press_strip text marquee.":
    "Cuadrícula de logotipos de socios, clientes o prensa con pies de foto opcionales. Distinta de la franja de prensa con texto en movimiento.",
  "Lookbook spread": "Doble página de lookbook",
  "Two-page magazine spread layout (left + right images with optional caption beneath). Repeat the section for a multi-spread book.":
    "Diseño de doble página tipo revista (imágenes izquierda y derecha con pie de foto opcional debajo). Repite la sección para un libro de varias dobles páginas.",
  "Lottie animation": "Animación Lottie",
  "Embeds a Lottie animation via the LottieFiles web-component. Loop / autoplay / hover-to-play.":
    "Incrusta una animación Lottie mediante el componente web de LottieFiles. Bucle, reproducción automática o al pasar el cursor.",
  "Magazine layout": "Diseño de revista",
  "Asymmetric grid: one large hero card + 2-4 smaller cards. Editorial spread feel.":
    "Cuadrícula asimétrica: una tarjeta principal grande y de 2 a 4 tarjetas más pequeñas. Sensación de doble página editorial.",
  "Map with content overlay": "Mapa con contenido superpuesto",
  "Embedded map (Google Maps) with a copy panel overlaid. Used for studio location pages, hours, contact.":
    "Mapa incrustado (Google Maps) con un panel de texto superpuesto. Sirve para páginas de ubicación del estudio, horarios y contacto.",
  "Marquee strip": "Franja en movimiento",
  "Continuously scrolling row of text or logos. Used for press strips, partner logos, value statements.":
    "Fila de texto o logotipos que se desplaza de forma continua. Sirve para franjas de prensa, logotipos de socios y declaraciones de valor.",
  "Masonry gallery": "Galería tipo mampostería",
  "Pinterest-style masonry layout. Pure CSS columns, no JS. Best for portrait + landscape mixed media.":
    "Diseño de mampostería al estilo Pinterest. Columnas de CSS puro, sin JS. Ideal para mezclar medios verticales y horizontales.",
  "Press strip": "Franja de prensa",
  'Horizontal row of publication names or logos. Used as "As seen in" social proof.':
    'Fila horizontal de nombres o logotipos de publicaciones. Se usa como prueba social del tipo "Visto en".',
  "Pricing grid": "Cuadrícula de precios",
  "2-4 plan cards with price, features, and CTA. Highlight one plan for emphasis.":
    "De 2 a 4 tarjetas de plan con precio, características y llamada a la acción. Destaca un plan para darle énfasis.",
  "Process steps": "Pasos del proceso",
  "How-it-works block with 2–6 numbered cards. Choose numbered-column, horizontal-timeline, or alternating-image variant.":
    "Bloque de cómo funciona con 2 a 6 tarjetas numeradas. Elige la variante de columna numerada, línea de tiempo horizontal o imagen alternada.",
  "Scroll carousel": "Carrusel de desplazamiento",
  "Horizontally scrollable card row with snap points. CSS-only, no library, no JS.":
    "Fila de tarjetas con desplazamiento horizontal y puntos de anclaje. Solo CSS, sin biblioteca y sin JS.",
  "Site footer": "Pie del sitio",
  "The footer that wraps every page on this tenant: brand recap, link columns, social, legal copy. Edited as a section, published as part of the site shell.":
    "El pie que envuelve cada página de este tenant: resumen de marca, columnas de enlaces, redes sociales y texto legal. Se edita como sección y se publica como parte del armazón del sitio.",
  "Site header": "Encabezado del sitio",
  "The header that wraps every page on this tenant: brand mark, primary navigation, optional CTA. Edited as a section, published as part of the site shell.":
    "El encabezado que envuelve cada página de este tenant: marca, navegación principal y llamada a la acción opcional. Se edita como sección y se publica como parte del armazón del sitio.",
  "Split screen": "Pantalla dividida",
  "Two side-by-side panels: image + copy, or copy + copy. Optional reverse + sticky media.":
    "Dos paneles uno junto al otro: imagen y texto, o texto y texto. Inversión y medios fijos opcionales.",
  Stats: "Cifras",
  "Big number row (3-6 metrics) with optional caption. Trust signals like '12 years', '180 cities', 'NPS 72'.":
    "Fila de cifras grandes (de 3 a 6 métricas) con pie de texto opcional. Señales de confianza como '12 años', '180 ciudades', 'NPS 72'.",
  "Sticky scroll": "Desplazamiento fijo",
  "Two-column layout where the media column sticks while the text column scrolls past.":
    "Diseño a dos columnas donde la columna de medios queda fija mientras la de texto se desplaza.",
  "Talent by discipline": "Talento por disciplina",
  "Category/discipline grid: manual cards, or tenant-roster-derived taxonomy with optional parent rollup, counts and directory links. Theme-neutral; works for any tenant.":
    "Cuadrícula de categorías y disciplinas: tarjetas manuales, o taxonomía derivada del roster del tenant con agrupación por categoría superior, conteos y enlaces al directorio opcionales. Neutral respecto al tema; funciona para cualquier tenant.",
  "Team grid": "Cuadrícula de equipo",
  "Headshots + name + role grid. For an in-house team page (separate from the talent roster).":
    "Cuadrícula de retratos con nombre y cargo. Para una página del equipo interno (independiente del roster de talento).",
  "Testimonials trio": "Trío de testimonios",
  "Three (or up to four) editorial quote cards with palette accents. Layout variants for trio, single hero, or carousel.":
    "Tres (o hasta cuatro) tarjetas editoriales de cita con acentos de la paleta. Variantes de diseño en trío, cita principal única o carrusel.",
  Timeline: "Línea de tiempo",
  "Vertical milestones with date + title + body. For founder stories, project phases, release notes.":
    "Hitos verticales con fecha, título y cuerpo. Para historias de fundadores, fases de proyecto y notas de versión.",
  "Trust strip": "Franja de confianza",
  "Small band of positioning value-props: icon row with serif numerals, metrics row with stats, or logo row. Three variants, all token-styled.":
    "Banda pequeña de propuestas de valor: fila de iconos con numerales serif, fila de métricas con cifras, o fila de logotipos. Tres variantes, todas con estilo de tokens.",
  "Values trio": "Trío de valores",
  "Three numbered value cards with optional label + detail. Used on About pages and principle statements.":
    "Tres tarjetas de valor numeradas con etiqueta y detalle opcionales. Se usan en páginas de Acerca de y declaraciones de principios.",
  "Video reel with chapters": "Reel de video con capítulos",
  "Single video player with operator-defined chapter markers (jump-to-time links beneath).":
    "Reproductor de video único con marcadores de capítulo definidos por el operador (enlaces de salto a un momento debajo).",
};
