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
};
