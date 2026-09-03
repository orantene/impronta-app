/**
 * Spanish editor-chrome strings — WAVE 4.4 (2026-08-07): the DEEP INSPECTORS.
 *
 * Covers `components/edit-chrome/inspectors/**`: the style, layout, motion,
 * data, site-header and per-block content panels. Those panels hand their copy
 * to the inspector kit primitives as `label` / `title` / `hint` / `help` /
 * `description` / `placeholder` props, so the strings are resolved at the kit
 * boundary (`inspectors/kit/use-inspector-t.ts`) rather than at each of the
 * ~660 call sites. The resolver is unchanged: `editorT` over this same
 * EN-text-keyed map.
 *
 * Split out of `editor-i18n-es.ts` for the 800-line cap, exactly like
 * `-canvas.ts` and `-sections.ts`. Pure data, no logic. Spread into `ES_TEXT`
 * in `editor-i18n-es.ts`; consumers keep importing `ES_TEXT` from
 * `editor-i18n`. Both parity guards scan this file.
 *
 * House rules that apply to every entry here: no em dashes, "cliente" never
 * "comprador", "elenco" for roster, and `{placeholder}` tokens kept intact and
 * placed naturally for Spanish word order.
 */

export const ES_INSPECTOR_TEXT: Record<string, string> = {
  // ── Alignment, position, direction ──────────────────────────────────────
  Align: "Alineación",
  Baseline: "Línea base",
  Both: "Ambos",
  Bottom: "Abajo",
  Top: "Arriba",
  Right: "Derecha",
  Middle: "Centro vertical",
  Start: "Inicio",
  End: "Final",
  Between: "Entre",
  Around: "Alrededor",
  Evenly: "Uniforme",
  Stretch: "Estirar",
  Up: "Arriba",
  Down: "Abajo",
  Under: "Debajo",
  Back: "Atrás",
  Absolute: "Absoluta",
  Relative: "Relativa",
  Fixed: "Fija",
  Inline: "En línea",
  "Text centered": "Texto centrado",
  Centered: "Centrado",
  "Stack order": "Orden de apilado",
  "Section-level stack order is desktop-only in v1.":
    "El orden de apilado a nivel de sección solo aplica en escritorio en la v1.",

  // ── Sizing, spacing, dimensions ─────────────────────────────────────────
  Dimensions: "Dimensiones",
  Width: "Ancho",
  Height: "Alto",
  "Exact width": "Ancho exacto",
  "Max width": "Ancho máximo",
  "Max width (preset)": "Ancho máximo (preajuste)",
  "Max height": "Alto máximo",
  "Min width": "Ancho mínimo",
  "Min height": "Alto mínimo",
  Gap: "Espaciado",
  "Micro gap": "Espacio mínimo",
  "Section gap": "Espacio entre secciones",
  Spacing: "Espaciado",
  "Quick spacing": "Espaciado rápido",
  Whitespace: "Espacio en blanco",
  "Padding top": "Relleno superior",
  "Padding bottom": "Relleno inferior",
  "Pad top (px)": "Relleno superior (px)",
  "Pad bottom (px)": "Relleno inferior (px)",
  "Pad Y": "Relleno vertical",
  "Margin top (px)": "Margen superior (px)",
  "Margin bottom (px)": "Margen inferior (px)",
  Radius: "Radio",
  Size: "Tamaño",
  "Text size": "Tamaño del texto",
  Narrow: "Estrecho",
  Full: "Completo",
  "Full-screen": "Pantalla completa",
  Large: "Grande",
  Small: "Pequeño",
  Mega: "Enorme",
  Semi: "Semi",
  Ratio: "Proporción",
  Square: "Cuadrado",
  Circle: "Círculo",
  Pill: "Píldora",
  Sharp: "Recto",
  Hairline: "Filo",
  Flush: "Al ras",
  Bare: "Sin adornos",
  Tile: "Mosaico",

  // ── Color, surface, background ──────────────────────────────────────────
  Appearance: "Apariencia",
  Accent: "Acento",
  Color: "Color",
  Colors: "Colores",
  "Brand colors": "Colores de marca",
  "Border color": "Color del borde",
  "Page background": "Fondo de la página",
  "Background & Surface": "Fondo y superficie",
  Surface: "Superficie",
  "Surface band": "Franja de superficie",
  "Surface contained": "Superficie contenida",
  Gradient: "Degradado",
  Radial: "Radial",
  Solid: "Sólido",
  Plain: "Simple",
  Elevated: "Elevado",
  Subtle: "Sutil",
  Muted: "Atenuado",
  Light: "Claro",
  Dark: "Oscuro",
  Hue: "Tono",
  Contain: "Contener",
  Cover: "Cubrir",
  Fill: "Rellenar",
  Custom: "Personalizado",
  // Field kit (Inspector Reset, D9): the exact-value input that sits beside
  // every preset row, and the explicit custom state a typed value drops into.
  "Custom value": "Valor personalizado",
  "Exact value": "Valor exacto",
  Shadow: "Sombra",
  Blur: "Desenfoque",
  Scrim: "Velo",
  "Legibility scrim": "Velo de legibilidad",
  "Overlay & texture": "Superposición y textura",
  Texture: "Textura",
  "Film grain": "Grano de película",
  Vignette: "Viñeta",
  "Soft minimal": "Suave minimalista",
  "Through text": "A través del texto",
  "Mesh blush": "Malla rosada",
  "Mesh noir": "Malla noir",
  "Pick text color": "Elegir color del texto",
  "Pick fill color": "Elegir color de relleno",
  "Pick border color": "Elegir color del borde",
  "Pick background color": "Elegir color de fondo",
  "Pick custom background color": "Elegir color de fondo personalizado",
  "#hex or rgba()": "#hex o rgba()",
  "e.g. #111111": "p. ej. #111111",
  "e.g. #ffffff": "p. ej. #ffffff",
  "e.g. #6366f1": "p. ej. #6366f1",
  "e.g. #111111 or rgba()": "p. ej. #111111 o rgba()",
  "e.g. #111111, or use the swatch": "p. ej. #111111, o usa la muestra",
  "e.g. #ffffff, or use the swatch": "p. ej. #ffffff, o usa la muestra",
  "e.g. 1px #111111": "p. ej. 1px #111111",

  // ── Blend modes (CSS mix-blend-mode) ────────────────────────────────────
  Multiply: "Multiplicar",
  Screen: "Trama",
  Darken: "Oscurecer",
  Lighten: "Aclarar",
  "Soft light": "Luz suave",
  "Hard light": "Luz fuerte",
  Difference: "Diferencia",
  Exclusion: "Exclusión",
  Luminosity: "Luminosidad",
  Dodge: "Sobreexponer",
  Burn: "Subexponer",

  // ── Typography ──────────────────────────────────────────────────────────
  Font: "Fuente",
  Body: "Cuerpo",
  Weight: "Grosor",
  "Body weight": "Grosor del cuerpo",
  "Heading weight": "Grosor del título",
  Normal: "Normal",
  "Letter spacing": "Espaciado entre letras",
  "Letter spacing slider (em)": "Control de espaciado entre letras (em)",
  "Line height": "Altura de línea",
  "Line height slider": "Control de altura de línea",
  "Text wrap": "Ajuste del texto",
  "No wrap": "Sin ajuste",
  "Pre-wrap": "Ajuste previo",
  Balance: "Equilibrado",
  Pretty: "Refinado",
  Strike: "Tachado",
  "Editorial title": "Título editorial",
  "Quiet kicker": "Antetítulo discreto",
  "Small muted intro label": "Etiqueta de entrada pequeña y discreta",
  "Readable intro copy.": "Texto de entrada legible.",
  "Small supporting text.": "Texto de apoyo pequeño.",
  "Serif display, generous spacing.":
    "Serif de gran tamaño, espaciado generoso.",
  "Oversized, dramatic.": "Sobredimensionado, dramático.",
  "Bold contrast": "Contraste marcado",

  // ── Motion and animation ────────────────────────────────────────────────
  "Size & motion": "Tamaño y movimiento",
  "Effects & motion": "Efectos y movimiento",
  "Entrance animation": "Animación de entrada",
  "Entrance animation preset": "Preajuste de animación de entrada",
  Ease: "Suavizado",
  Easing: "Curva de suavizado",
  Linear: "Lineal",
  In: "Entrada",
  Out: "Salida",
  "In-out": "Entrada y salida",
  "In-Out": "Entrada y salida",
  Bounce: "Rebote",
  Fade: "Fundido",
  Crossfade: "Fundido cruzado",
  Rise: "Ascenso",
  Fall: "Descenso",
  Flip: "Giro",
  Slide: "Deslizar",
  "Slide ←": "Deslizar ←",
  "Slide →": "Deslizar →",
  "← Slide": "← Deslizar",
  Smooth: "Suave",
  Transform: "Transformación",
  Trigger: "Activador",
  "On load": "Al cargar",
  "On scroll": "Al desplazar",
  Off: "Desactivado",
  Parallax: "Paralaje",
  "Scroll reveal": "Revelado al desplazar",
  "Scroll cue": "Indicador de desplazamiento",
  "Reveal timing": "Tiempos del revelado",
  "Reveal delay (CSS time, e.g. 0s or 200ms)":
    "Retardo del revelado (tiempo CSS, p. ej. 0s o 200ms)",
  "Reveal duration (CSS time, e.g. 0.6s or 400ms)":
    "Duración del revelado (tiempo CSS, p. ej. 0.6s o 400ms)",
  "Reveal travel distance (CSS length, e.g. 24px or 2rem). Used by directional reveal variants.":
    "Distancia de recorrido del revelado (longitud CSS, p. ej. 24px o 2rem). La usan las variantes de revelado direccional.",
  "Reduced motion": "Movimiento reducido",
  Respect: "Respetar",
  "Force animate": "Forzar animación",
  "Preview animation in canvas": "Previsualizar la animación en el lienzo",
  "Live preview": "Vista previa en vivo",
  Loop: "Bucle",
  "Loop slides": "Repetir las diapositivas en bucle",
  Autoplay: "Reproducción automática",
  "Pause on hover": "Pausar al pasar el cursor",
  "Per slide": "Por diapositiva",
  "Items per view": "Elementos visibles",
  "Wrap from the last slide back to the first.":
    "Volver de la última diapositiva a la primera.",

  // ── Layout, composition, grid ───────────────────────────────────────────
  "Position & layout": "Posición y diseño",
  Container: "Contenedor",
  "Container width, alignment, and composition for this hero.":
    "Ancho, alineación y composición del contenedor para esta portada.",
  Column: "Columna",
  Columns: "Columnas",
  "Two columns": "Dos columnas",
  Row: "Fila",
  "Col dense": "Columna densa",
  "Row dense": "Fila densa",
  Wrap: "Ajustar",
  Stacked: "Apilado",
  "Only for grid": "Solo para cuadrícula",
  "Image fit": "Ajuste de la imagen",
  "Reset layout": "Restablecer el diseño",
  "Hero layout": "Diseño de la portada",
  "Quick style preset": "Preajuste de estilo rápido",
  "Quick Styles": "Estilos rápidos",
  "Apply a prebuilt visual style to this section.":
    "Aplica un estilo visual prediseñado a esta sección.",

  // ── Layout preset descriptions ──────────────────────────────────────────
  "Stack the two columns vertically on mobile.":
    "Apila las dos columnas en vertical en móvil.",
  "Even columns with a mobile stack.":
    "Columnas iguales, apiladas en móvil.",
  "Classic split grid with mobile stack.":
    "Cuadrícula dividida clásica, apilada en móvil.",
  "Flexible row that wraps gracefully.":
    "Fila flexible que se ajusta con elegancia.",
  "Four columns for image-heavy discovery.":
    "Cuatro columnas para descubrir con mucha imagen.",
  "Three-up desktop, two-up tablet, one-up mobile.":
    "Tres por fila en escritorio, dos en tablet, una en móvil.",
  "Three-column editorial masonry.": "Mosaico editorial de tres columnas.",
  "Three visible slides for dense story rows.":
    "Tres diapositivas visibles para filas de historia densas.",
  "Two visible slides with arrows and dots.":
    "Dos diapositivas visibles con flechas y puntos.",
  "Single-slide feature carousel with slow autoplay.":
    "Carrusel destacado de una diapositiva con reproducción automática lenta.",
  "Tall model/profile frame.": "Marco vertical de perfil o modelo.",
  "No corners, wide crop.": "Sin esquinas, recorte ancho.",
  "Text column leads with supporting media.":
    "La columna de texto lidera y los medios acompañan.",
  "Stronger visual column on the left.":
    "Columna visual más fuerte a la izquierda.",
  "Copy on the left.": "Texto a la izquierda.",
  "Copy on the left, background photo on the right.":
    "Texto a la izquierda, foto de fondo a la derecha.",
  "Background photo on the left.": "Foto de fondo a la izquierda.",
  "Background photo on the left, copy on the right.":
    "Foto de fondo a la izquierda, texto a la derecha.",
  "Copy centered, image full-bleed behind.":
    "Texto centrado, imagen a sangre completa detrás.",
  "Copy centered, image full-bleed behind. Editorial default.":
    "Texto centrado, imagen a sangre completa detrás. Opción editorial por defecto.",
  "Dark feature moment.": "Momento destacado en oscuro.",
  "Full-width cinematic band.": "Franja cinematográfica a todo el ancho.",
  "Contained background panel.": "Panel de fondo contenido.",
  "Fuller content block.": "Bloque de contenido más amplio.",
  "Large centered conversion.": "Conversión grande y centrada.",
  "Large, centered, strong width.": "Grande, centrado, de ancho contundente.",
  "Quiet rectangular action.": "Acción rectangular discreta.",
  "Solid action button.": "Botón de acción sólido.",
  "Sharp editorial page lead.": "Entrada de página editorial y recta.",
  "Sharp, open page rhythm.": "Ritmo de página recto y abierto.",
  "Safe editorial default.": "Opción editorial segura por defecto.",
  "Default editorial breathing room.":
    "Aire editorial por defecto.",
  "Large breathing room.": "Mucho aire.",
  "Larger lead-in and close-out spacing.":
    "Más espacio de entrada y de cierre.",
  "Maximum premium whitespace.": "Máximo espacio en blanco premium.",
  "Tight rhythm, compact type.": "Ritmo ceñido, tipografía compacta.",
  "Tight separation.": "Separación ceñida.",
  "Tight vertical rhythm for dense utility pages.":
    "Ritmo vertical ceñido para páginas de utilidad densas.",
  "Vertical rhythm for copy-led sections.":
    "Ritmo vertical para secciones lideradas por el texto.",
  "Tenant theme picks the rhythm.": "El tema del espacio elige el ritmo.",
  "Pairs with full-bleed hero images.":
    "Combina con portadas de imagen a sangre completa.",
  "Adds background and padding.": "Agrega fondo y relleno.",
  "Remove vertical padding for embedded layouts.":
    "Quita el relleno vertical para diseños incrustados.",
  "One supporting line.": "Una línea de apoyo.",

  // ── Layout preset names ─────────────────────────────────────────────────
  Editorial: "Editorial",
  "Editorial reel": "Reel editorial",
  "Editorial stack": "Pila editorial",
  Clean: "Limpio",
  "Clean stack": "Pila limpia",
  Classic: "Clásico",
  Minimal: "Minimalista",
  Hybrid: "Híbrido",
  "Full strip": "Franja completa",
  "Campaign strip": "Franja de campaña",
  "Card grid": "Cuadrícula de tarjetas",
  "Dense board": "Tablero denso",
  "Auto showcase": "Escaparate automático",
  "Portfolio wall": "Muro de portafolio",
  "Portrait card": "Tarjeta vertical",
  "Media row": "Fila de medios",
  "Media left": "Medios a la izquierda",
  "Text left, media right": "Texto a la izquierda, medios a la derecha",
  "Text right, media left": "Texto a la derecha, medios a la izquierda",
  "Copy led": "Liderado por el texto",
  "Left lead": "Entrada a la izquierda",
  "Centered lead": "Entrada centrada",
  "Contrast feature": "Destacado por contraste",
  "Wide action": "Acción ancha",
  "Wide copy": "Texto ancho",
  "Sharp contained": "Recto y contenido",
  "Sharp editorial": "Recto editorial",
  "Secondary sharp": "Secundario recto",
  "Default (Clean)": "Por defecto (Limpio)",

  // ── Site header inspector ───────────────────────────────────────────────
  "Header navigation": "Navegación de la cabecera",
  "Header style": "Estilo de la cabecera",
  "Header surface": "Superficie de la cabecera",
  "Brand layout": "Diseño de la marca",
  "Brand position": "Posición de la marca",
  "Brand text": "Texto de la marca",
  "Nav alignment": "Alineación de la navegación",
  Navigation: "Navegación",
  "Mobile menu": "Menú móvil",
  "Mobile menu style": "Estilo del menú móvil",
  "CTA placement": "Ubicación del CTA",
  "Mobile CTA placement": "Ubicación del CTA en móvil",
  "Collapse on mobile": "Colapsar en móvil",
  "Pin header to viewport": "Fijar la cabecera a la ventana",
  "Pin top": "Fijar arriba",
  "Pin bottom": "Fijar abajo",
  Sticky: "Fijo",
  "Scroll behavior": "Comportamiento al desplazar",
  "Transparent over hero": "Transparente sobre la portada",
  "Transparent on hero, solid on scroll":
    "Transparente en la portada, sólida al desplazar",
  "In bar": "En la barra",
  "Inside menu": "Dentro del menú",
  Drawer: "Panel lateral",
  "Drawer right": "Panel lateral derecho",
  "Full screen": "Pantalla completa",
  "Menu": "Menú",
  Dropdown: "Desplegable",
  Sheet: "Hoja",
  "Sheet bottom": "Hoja inferior",
  Logo: "Logotipo",
  "Logo only": "Solo el logotipo",
  "Social & contact": "Redes y contacto",
  "Social links": "Enlaces a redes",
  "Sync from workspace social profiles":
    "Sincronizar desde los perfiles sociales del espacio de trabajo",
  // ── Social feed block (Instagram / TikTok gallery) ────────────────────
  "e.g. impronta_models": "p. ej. impronta_models",
  "Shown on hover and in the viewer":
    "Se muestra al pasar el cursor y en el visor",
  "Your brand or site name": "El nombre de tu marca o de tu sitio",
  "Optional, e.g. Models & image agency":
    "Opcional, p. ej. Agencia de modelos e imagen",
  "Talent Agency · Tulum": "Agencia de talento · Tulum",

  // ── Site header help copy ───────────────────────────────────────────────
  "Shown in the header bar, tabs, browser title, and OpenGraph defaults.":
    "Se muestra en la barra de cabecera, las pestañas, el título del navegador y los valores de OpenGraph.",
  "Square mark, 60×60 minimum. SVG preferred so it stays crisp on retina.":
    "Marca cuadrada, 60×60 como mínimo. Se prefiere SVG para que se vea nítida en pantallas retina.",
  "The premium header layout the live site renders. 'Editorial split' is the agency look: social/contact left · centered brand · utilities right · nav row beneath.":
    "El diseño premium de cabecera que renderiza el sitio publicado. 'División editorial' es el look de agencia: redes y contacto a la izquierda · marca centrada · utilidades a la derecha · fila de navegación debajo.",
  "The text links that appear in the header bar and inside the mobile menu. Drag to reorder. Changes save and publish on each edit.":
    "Los enlaces de texto que aparecen en la barra de cabecera y dentro del menú móvil. Arrastra para reordenar. Cada cambio se guarda y se publica al editarlo.",
  "Where the brand anchors in the header bar. Independent of the lockup style below.":
    "Dónde se ancla la marca en la barra de cabecera. Es independiente del estilo de lockup de abajo.",
  "Where the inline links sit on desktop. Mobile keeps them inside the hamburger menu regardless.":
    "Dónde se sitúan los enlaces en escritorio. En móvil siempre quedan dentro del menú hamburguesa.",
  "Whether the header stays pinned to the top as the visitor scrolls.":
    "Si la cabecera queda fijada arriba mientras la persona visitante se desplaza.",
  "How the mark and text sit together in the header.":
    "Cómo conviven la marca y el texto en la cabecera.",
  "How the navigation reveals when a visitor taps the hamburger.":
    "Cómo se despliega la navegación cuando alguien toca el menú hamburguesa.",
  "How the navigation reveals on mobile when a visitor taps the hamburger.":
    "Cómo se despliega la navegación en móvil cuando alguien toca el menú hamburguesa.",
  "Header reads transparent over the first hero section, turns solid as the visitor scrolls past it. Works best with full-bleed heroes.":
    "La cabecera se ve transparente sobre la primera portada y se vuelve sólida al desplazarse más allá. Funciona mejor con portadas a sangre completa.",
  "Overall visual treatment of the bar. Try one, colors below let you customize from there.":
    "Tratamiento visual general de la barra. Prueba uno y personalízalo con los colores de abajo.",
  "Scroll + interaction. Sticky pins the bar; transparent-on-hero pairs with full-bleed heroes.":
    "Desplazamiento e interacción. Fija ancla la barra; transparente en la portada combina con portadas a sangre completa.",
  "Override the bar's bg / text / hairline with any CSS color (hex, rgba, hsla, oklch). Empty = follow the page background mode below.":
    "Sustituye el fondo, el texto y el filo de la barra por cualquier color CSS (hex, rgba, hsla, oklch). Vacío = sigue el modo de fondo de página de abajo.",
  "Override the header bar's bg / text / hairline with any CSS color (hex, rgba, hsla, oklch). Leave empty to follow the page background mode below.":
    "Sustituye el fondo, el texto y el filo de la barra de cabecera por cualquier color CSS (hex, rgba, hsla, oklch). Déjalo vacío para seguir el modo de fondo de página de abajo.",
  "The header bar's surface color. Wins against the variant + page mode.":
    "El color de superficie de la barra de cabecera. Prevalece sobre la variante y el modo de página.",
  "The canvas the header sits on. A curated mood, or leave it and customize the surface above.":
    "El lienzo sobre el que se apoya la cabecera. Un ambiente predefinido, o déjalo y personaliza la superficie de arriba.",
  "The canvas the header sits on. Use a curated mode, or leave it and customize the header surface above.":
    "El lienzo sobre el que se apoya la cabecera. Usa un modo predefinido, o déjalo y personaliza la superficie de arriba.",
  "Bottom border tone. A subtle line for warmth, or transparent for a clean float.":
    "Tono del borde inferior. Una línea sutil para dar calidez, o transparente para que flote limpia.",
  "Bottom border tone. Subtle line, or transparent for clean float.":
    "Tono del borde inferior. Línea sutil, o transparente para que flote limpia.",
  "Primary drives buttons + active states. Accent is the gold/highlight register.":
    "El primario gobierna los botones y los estados activos. El acento es el registro dorado o de resalte.",
  "Primary drives the CTA button + active states across the site. Accent is the gold/highlight register: small chips, link underlines, dividers.":
    "El primario gobierna el botón CTA y los estados activos de todo el sitio. El acento es el registro dorado o de resalte: fichas pequeñas, subrayados de enlaces y separadores.",
  "Main brand hue. Used by the CTA button and active selection.":
    "Tono principal de la marca. Lo usan el botón CTA y la selección activa.",
  "The CTA button and active selection.":
    "El botón CTA y la selección activa.",
  "Secondary highlight: gold-line dividers, link underlines.":
    "Resalte secundario: separadores de línea dorada y subrayados de enlaces.",
  "Secondary highlight: small chips, gold-line dividers, link underlines.":
    "Resalte secundario: fichas pequeñas, separadores de línea dorada y subrayados de enlaces.",
  "Renders the brand's primary call-to-action button. Picks up its label and link from Brand → Primary CTA.":
    "Renderiza el botón principal de llamada a la acción de la marca. Toma su etiqueta y su enlace de Marca → CTA principal.",
  "Header type follows the site-wide font preset. Full Google Fonts picker is in design settings.":
    "La tipografía de la cabecera sigue el preajuste de fuente del sitio. El selector completo de Google Fonts está en los ajustes de diseño.",
  "The brand's font preset. Header type follows it; full Google Fonts picker is one click away in design settings.":
    "El preajuste de fuente de la marca. La tipografía de la cabecera lo sigue; el selector completo de Google Fonts está a un clic en los ajustes de diseño.",
  "Fine-tune header proportions. 'Default' keeps the chosen style's tuned sizing.":
    "Ajusta las proporciones de la cabecera. 'Por defecto' mantiene el dimensionado afinado del estilo elegido.",
  "Mobile-specific override of the desktop CTA decision.":
    "Ajuste específico para móvil que sustituye la decisión de CTA de escritorio.",
  "On keeps the bar accessible while reading.":
    "Activado mantiene la barra accesible durante la lectura.",
  "Brand label, nav links, utility icons.":
    "Etiqueta de marca, enlaces de navegación e iconos de utilidad.",
  "Brand label, nav links, utility icons. Works with any header background.":
    "Etiqueta de marca, enlaces de navegación e iconos de utilidad. Funciona con cualquier fondo de cabecera.",
  "Shown in the premium header cluster (and the footer, one source of truth). Leave a field blank to hide it. Nothing is auto-generated; only what you enter renders.":
    "Se muestra en el grupo premium de la cabecera (y en el pie, una sola fuente de verdad). Deja un campo vacío para ocultarlo. Nada se genera solo; únicamente se renderiza lo que escribas.",

  // ── Visibility rules ────────────────────────────────────────────────────
  Visibility: "Visibilidad",
  "Visibility rules": "Reglas de visibilidad",
  "Visibility variant flag": "Bandera de variante de visibilidad",
  "Section visibility": "Visibilidad de la sección",
  Show: "Mostrar",
  Hide: "Ocultar",
  Shown: "Se muestra",
  Hidden: "Oculto",
  Visible: "Visible",
  "Visible limit": "Límite visible",
  "Signed-in": "Con sesión iniciada",
  "Signed-out": "Sin sesión iniciada",
  Anyone: "Cualquiera",
  Any: "Cualquiera",
  All: "Todos",
  Blocked: "Bloqueado",
  Locked: "Bloqueado por el administrador",
  Required: "Obligatorio",
  Behavior: "Comportamiento",
  "A/B test": "Prueba A/B",
  "Variant label": "Etiqueta de la variante",
  "Variant A weight": "Peso de la variante A",
  "Variant B copy": "Texto de la variante B",

  // ── Data panel and field bindings ───────────────────────────────────────
  "Data source": "Fuente de datos",
  "Data tab": "Pestaña de datos",
  "Choose builder data source": "Elige la fuente de datos del constructor",
  "Field bindings": "Vínculos de campo",
  Fields: "Campos",
  "New field": "Campo nuevo",
  "Binding health": "Estado del vínculo",
  Bound: "Vinculado",
  Linked: "Enlazado",
  Shared: "Compartido",
  Manual: "Manual",
  "Set manually": "Definir manualmente",
  Inherit: "Heredar",
  Source: "Origen",
  "Keep this block manually edited, or connect it to workspace data.":
    "Mantén este bloque con edición manual, o conéctalo a los datos del espacio de trabajo.",
  "Example: featured=true, location=Cancun, category=models":
    "Ejemplo: featured=true, location=Cancun, category=models",
  "cms_sections row id (UUID)": "id de fila de cms_sections (UUID)",
  "Compact note": "Nota compacta",

  // ── Components, classes and presets ─────────────────────────────────────
  "Blocks linked to this class keep their current look.":
    "Los bloques enlazados a esta clase conservan su aspecto actual.",
  "Delete class": "Eliminar la clase",
  "Delete preset": "Eliminar el preajuste",
  "Delete block": "Eliminar el bloque",
  "Linked instances on this page": "Instancias enlazadas en esta página",
  "Linked to a class not stored in this browser":
    "Enlazado a una clase que no está guardada en este navegador",
  "Select an instance of this component on the page":
    "Selecciona una instancia de este componente en la página",
  "Insert a linked instance that can be re-synced from this master":
    "Insertar una instancia enlazada que se puede volver a sincronizar desde este maestro",
  "Insert an editable copy of the master to modify it":
    "Insertar una copia editable del maestro para modificarla",
  "Overwrite this master with the selected block, published instances update live":
    "Sobrescribir este maestro con el bloque seleccionado; las instancias publicadas se actualizan al instante",
  "Push the selected block into this master, instances update live":
    "Enviar el bloque seleccionado a este maestro; las instancias se actualizan al instante",
  "Push this master's content to every linked instance on the page":
    "Enviar el contenido de este maestro a todas las instancias enlazadas de la página",
  "Push this block's style into the class (updates all linked blocks)":
    "Enviar el estilo de este bloque a la clase (actualiza todos los bloques enlazados)",
  "Reset to master": "Restablecer al maestro",
  "Reuse Style": "Reutilizar el estilo",
  "Import presets JSON": "Importar preajustes en JSON",
  "Presets JSON": "Preajustes en JSON",
  "Preset name": "Nombre del preajuste",
  "Preset name…": "Nombre del preajuste…",
  "Name this style preset": "Ponle nombre a este preajuste de estilo",
  "Name this block pattern": "Ponle nombre a este patrón de bloque",
  "Name this block (e.g. Pricing card)":
    "Ponle nombre a este bloque (p. ej. Tarjeta de precios)",
  "Pattern name…": "Nombre del patrón…",
  "Enter name…": "Escribe un nombre…",
  "Your collections": "Tus colecciones",
  "Search by name or code…": "Busca por nombre o código…",
  "Clear search": "Borrar la búsqueda",
  "Find a setting": "Buscar un ajuste",
  "Find a setting…": "Buscar un ajuste…",
  "Find a setting in the inspector": "Buscar un ajuste en el inspector",
  "Tulala block": "Bloque Tulala",

  // ── Responsive overrides ────────────────────────────────────────────────
  "Responsive settings": "Ajustes adaptables",
  Override: "Sustituir",
  "Overridden on this breakpoint": "Sustituido en este punto de ruptura",
  "Desktop only": "Solo escritorio",
  "Spacing has tablet/mobile overrides":
    "El espaciado tiene sustituciones en tablet o móvil",
  "Typography has tablet/mobile overrides":
    "La tipografía tiene sustituciones en tablet o móvil",
  "Reset to desktop value": "Restablecer al valor de escritorio",
  "Paste device spacing only": "Pegar solo el espaciado del dispositivo",
  "Paste device typography only": "Pegar solo la tipografía del dispositivo",
  "Fast-start spacing preset for this device.":
    "Preajuste de espaciado de arranque rápido para este dispositivo.",
  "Hide on this device": "Ocultar en este dispositivo",
  "Switch to tablet or mobile to hide this only there.":
    "Cambia a tableta o móvil para ocultarlo solo allí.",
  "Editing {device}": "Editando {device}",
  "{count} override": "{count} sustitución",
  "{count} overrides": "{count} sustituciones",
  "Inherits {base}": "Hereda de {base}",
  "{base} is the base, switch tiers to add overrides.":
    "{base} es la base; cambia de nivel para agregar sustituciones.",
  "Overridden on this block": "Sustituido en este bloque",
  "Theme inheritance": "Herencia del tema",
  "Inherit follows the theme": "Heredar sigue al tema",
  "Selected block": "Bloque seleccionado",
  "Query container": "Contenedor de consulta",
  "Device is controlled by the device rail above the inspector (synced to the canvas).":
    "El dispositivo se controla desde la barra de dispositivos encima del inspector (sincronizada con el lienzo).",
  "Editing {device} overrides: {count} field set.":
    "Editando sustituciones de {device}: {count} campo definido.",
  "Editing {device} overrides: {count} fields set.":
    "Editando sustituciones de {device}: {count} campos definidos.",
  "Copy desktop to {device}": "Copiar escritorio a {device}",
  "Reset block": "Restablecer el bloque",
  // ── Nested-block cards (builder-node content panel) ─────────────────────
  Variant: "Variante",
  // Rendered as a Segmented chip, which truncates with an ellipsis rather
  // than wrapping. "Grupo de tarjetas" clipped to "Grupo de …" at inspector
  // width (QA 2026-08-07), so this uses the short form the sibling chips use.
  "Card Group": "Tarjetas",
  "Restyles to a preset look, your content stays.":
    "Cambia el estilo a un aspecto predefinido; tu contenido se mantiene.",
  "{count} nested block": "{count} bloque anidado",
  "{count} nested blocks": "{count} bloques anidados",
  "No nested blocks yet.": "Todavía no hay bloques anidados.",
  "This is a layout wrapper. Add, move, and edit nested blocks in Structure, then use Layout for grid/stack behavior.":
    "Esto es un envoltorio de diseño. Agrega, mueve y edita los bloques anidados en Estructura, y luego usa Diseño para el comportamiento de cuadrícula o apilado.",
  "This split owns its child blocks. Edit the copy and media inside the split from Structure; use Layout for ratio and collapse behavior.":
    "Esta división es dueña de sus bloques hijos. Edita el texto y los medios de la división desde Estructura; usa Diseño para la proporción y el colapso.",
  "Accordion groups do not hold direct copy. Select each accordion item in Structure to rename its question and edit nested content.":
    "Los grupos de acordeón no contienen texto directo. Selecciona cada elemento del acordeón en Estructura para renombrar su pregunta y editar el contenido anidado.",
  "Tabs are defined by their panels. Select each tab panel in Structure to rename the tab and edit its nested content.":
    "Las pestañas se definen por sus paneles. Selecciona cada panel en Estructura para renombrar la pestaña y editar su contenido anidado.",
  "Carousel content comes from its nested blocks. Add slides or cards in Structure, then tune autoplay and controls in Layout.":
    "El contenido del carrusel viene de sus bloques anidados. Agrega diapositivas o tarjetas en Estructura y ajusta la reproducción automática y los controles en Diseño.",
  "Masonry content is managed through its child blocks. Add images or cards in Structure; columns and gap live in Layout.":
    "El contenido del mosaico se gestiona desde sus bloques hijos. Agrega imágenes o tarjetas en Estructura; las columnas y el espacio están en Diseño.",
  "Card blocks wrap heading, paragraph, image, and button children, not nested layout shells. Edit blocks in Structure; surface style in Layout.":
    "Los bloques de tarjeta envuelven hijos de título, párrafo, imagen y botón, no envoltorios de diseño anidados. Edita los bloques en Estructura; el estilo de superficie en Diseño.",
  "CTA groups hold buttons only. Add headline or body copy as sibling blocks outside this group (e.g. in a container). Row vs stack lives in Layout.":
    "Los grupos de CTA solo contienen botones. Agrega el titular o el texto como bloques hermanos fuera de este grupo (p. ej. en un contenedor). Fila o apilado está en Diseño.",
  "Divider blocks render a horizontal rule. Use Layout to switch tone and Style for spacing.":
    "Los bloques separadores renderizan una línea horizontal. Usa Diseño para cambiar el tono y Estilo para el espaciado.",
  "Layout checks": "Comprobaciones de diseño",
  "No obvious responsive layout issues found for this node.":
    "No se han detectado problemas evidentes de diseño adaptable en este nodo.",
  // Lowercase viewport ids as they arrive from the device rail.
  desktop: "escritorio",
  tablet: "tablet",
  mobile: "móvil",
  Reset: "Restablecer",
  "{device} override. Tap Reset to inherit {base}":
    "Sustitución de {device}. Toca Restablecer para heredar de {base}",
  "Reset {device} override": "Restablecer la sustitución de {device}",
  "{device}: {count} mobile health issue":
    "{device}: {count} problema de salud en móvil",
  "{device}: {count} mobile health issues":
    "{device}: {count} problemas de salud en móvil",
  "{count} mobile health issue, review in Mobile preview":
    "{count} problema de salud en móvil, revísalo en la vista previa móvil",
  "{count} mobile health issues, review in Mobile preview":
    "{count} problemas de salud en móvil, revísalos en la vista previa móvil",

  // ── Multi-selection and theme inheritance ───────────────────────────────
  "These blocks have different values for this property.":
    "Estos bloques tienen valores distintos para esta propiedad.",
  "Use a brand style for this property":
    "Usar un estilo de marca para esta propiedad",
  "Stop following the brand style (use a fixed value)":
    "Dejar de seguir el estilo de marca (usar un valor fijo)",

  // ── Row and layer actions ───────────────────────────────────────────────
  "Move layer up": "Subir la capa",
  "Move layer down": "Bajar la capa",
  "Remove layer": "Quitar la capa",
  "Remove link": "Quitar el enlace",
  "Remove secondary button": "Quitar el botón secundario",
  "New link": "Enlace nuevo",
  "New sub-link": "Subenlace nuevo",
  "New feature": "Característica nueva",
  Feature: "Característica",
  "Feature label": "Etiqueta de la característica",
  "Feature one": "Característica uno",
  Change: "Cambiar",
  Replace: "Reemplazar",
  Redo: "Rehacer",
  "Undo last change": "Deshacer el último cambio",

  // ── Structural block types ──────────────────────────────────────────────
  Accordion: "Acordeón",
  "Accordion item": "Elemento del acordeón",
  "Accordion items": "Elementos del acordeón",
  "Answer blocks": "Bloques de respuesta",
  "Allow multiple open": "Permitir varios abiertos",
  "Allow multiple items open": "Permitir varios elementos abiertos",
  "Visitors can expand more than one item at the same time.":
    "Las personas visitantes pueden desplegar más de un elemento a la vez.",
  Tabs: "Pestañas",
  "Tab content": "Contenido de la pestaña",
  "Tab panel": "Panel de pestaña",
  "Tab panels": "Paneles de pestañas",
  Counter: "Contador",
  Spacer: "Separador",
  Video: "Vídeo",
  Form: "Formulario",
  "Raw HTML": "HTML sin procesar",
  // "Embed" deliberately omitted: the section catalog already owns it
  // ("Incrustar") and this file spreads AFTER it, so an entry here would
  // silently override the section wording. Caught by
  // section-catalog-es-parity.static.test.ts.
  Slider: "Carrusel",
  "Progress bar": "Barra de progreso",
  "Pricing table": "Tabla de precios",
  "Submit button": "Botón de envío",

  // ── Buttons, links, media controls ──────────────────────────────────────
  Button: "Botón",
  "Button text": "Texto del botón",
  "Where it goes": "A dónde lleva",
  "Address": "Dirección",
  "A full web address, or a path on this site that you have made.":
    "Una dirección web completa, o una ruta de este sitio que ya hayas creado.",
  "Opens your booking page": "Abre tu página de reservas",
  "Opens the chat, ready to take an order": "Abre el chat, listo para tomar un pedido",
  "Opens the chat, ready to talk tickets": "Abre el chat, listo para hablar de entradas",
  "Opens the chat": "Abre el chat",
  "You provide the address": "Tú das la dirección",
  "Reserve a time": "Reservar un horario",
  "Book an appointment": "Agendar una cita",
  "Order": "Pedir",
  "Tickets": "Entradas",
  "Ask us a question": "Hacernos una pregunta",
  "A link I choose": "Un enlace que yo elijo",
  "Button label, e.g. Explore services":
    "Etiqueta del botón, p. ej. Explora los servicios",
  "Button label, e.g. Start a booking":
    "Etiqueta del botón, p. ej. Inicia una reserva",
  Secondary: "Secundario",
  Ghost: "Fantasma",
  Highlighted: "Resaltado",
  Decorative: "Decorativo",
  "Text only": "Solo texto",
  Default: "Predeterminado",
  "Display mode": "Modo de visualización",
  "Link label": "Etiqueta del enlace",
  "Link href (master default)": "Href del enlace (por defecto del maestro)",
  "External URL": "URL externa",
  "Explore the roster": "Explora el elenco",
  "Start an inquiry": "Iniciar una solicitud",
  "Workspace inbox": "Bandeja del espacio de trabajo",
  Message: "Mensaje",
  Email: "Correo electrónico",
  Phone: "Teléfono",
  English: "Inglés",
  "Short description of this plan": "Descripción breve de este plan",
  "Optional hint text": "Texto de ayuda opcional",
  "Clear image": "Quitar la imagen",
  "Clear logo": "Quitar el logotipo",
  "Pick from library": "Elegir de la biblioteca",
  "Describe the image": "Describe la imagen",
  "Describe the icon": "Describe el icono",
  "Load priority (LCP)": "Prioridad de carga (LCP)",
  "Allow full screen": "Permitir pantalla completa",
  "Show arrows": "Mostrar flechas",
  "Show dots": "Mostrar puntos",
  "Show controls": "Mostrar controles",
  Arrows: "Flechas",
  Dots: "Puntos",
  Dot: "Punto",
  Dash: "Discontinuo",
  Reverse: "Invertido",
  "Render pagination dots below the slider.":
    "Muestra los puntos de paginación debajo del carrusel.",
  "Render previous and next arrow controls.":
    "Muestra los controles de flecha anterior y siguiente.",

  // ── Width presets ───────────────────────────────────────────────────────
  Read: "Lectura",
  Reading: "Lectura",

  // ── Hover / interaction state ───────────────────────────────────────────
  Hover: "Al pasar el cursor",
  Pointer: "Puntero",
  Grab: "Agarrar",
  "Pass-through": "Dejar pasar",
  "Hover box-shadow (CSS box-shadow value)":
    "Sombra al pasar el cursor (valor CSS de box-shadow)",
  "Hover scale (unitless factor, e.g. 1.03)":
    "Escala al pasar el cursor (factor sin unidad, p. ej. 1.03)",
  "Hover translate (1-2 CSS lengths, e.g. 0 -4px)":
    "Desplazamiento al pasar el cursor (1 o 2 longitudes CSS, p. ej. 0 -4px)",
  "Style overrides applied on cursor-over. Pairs with the CSS transition on the Style tab.":
    "Sustituciones de estilo que se aplican al pasar el cursor. Combina con la transición CSS de la pestaña Estilo.",
  "all .2s ease (auto when state set)":
    "all .2s ease (automático al definir un estado)",

  // ── Example placeholders ────────────────────────────────────────────────
  "Small muted intro label.": "Etiqueta de entrada pequeña y discreta.",
  "Faces with an": "Rostros con",
  "imprint.": "huella.",
  "e.g. About": "p. ej. Acerca de",
  "e.g. Get started": "p. ej. Empieza ahora",
  "e.g. Get a quote": "p. ej. Pide un presupuesto",
  "e.g. Card shadow": "p. ej. Sombra de tarjeta",
  "e.g. Demo video": "p. ej. Vídeo de demostración",
  "e.g. per month": "p. ej. al mes",
  "e.g. promo": "p. ej. promo",
  "e.g. Pro": "p. ej. Pro",
  "e.g. email": "p. ej. email",
  "e.g. $49 or Free": "p. ej. $49 o Gratis",
  "e.g. Impronta": "p. ej. Impronta",
  "e.g. hello@improntamodels.com": "p. ej. hello@improntamodels.com",
  "e.g. +52 984 000 0000": "p. ej. +52 984 000 0000",
  "e.g. https://facebook.com/impronta": "p. ej. https://facebook.com/impronta",
  "e.g. https://instagram.com/impronta":
    "p. ej. https://instagram.com/impronta",
  "e.g. https://linkedin.com/company/impronta":
    "p. ej. https://linkedin.com/company/impronta",
  "e.g. https://tiktok.com/@impronta": "p. ej. https://tiktok.com/@impronta",
  "e.g. https://x.com/impronta": "p. ej. https://x.com/impronta",
  "e.g. https://youtube.com/@impronta": "p. ej. https://youtube.com/@impronta",
};
