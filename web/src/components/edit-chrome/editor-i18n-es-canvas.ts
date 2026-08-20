/**
 * Spanish editor-chrome strings — WAVE 4 (2026-08-06): the floating canvas
 * control bars, publish preflight, and AI panels.
 *
 * Split out of `editor-i18n-es.ts` when that file crossed the 800-line cap
 * (same move that file itself made out of `editor-i18n.ts`). Pure data, no
 * logic. Spread into `ES_TEXT` in editor-i18n-es.ts; consumers keep importing
 * `ES_TEXT` from `editor-i18n` and never need to know about this file.
 * The es-parity duplicate-key guard scans this file too.
 */

export const ES_CANVAS_CHROME_TEXT: Record<string, string> = {
  // ── WAVE 4.3 — AI panels (rewrite, translate, brief, revise, image) ───
  Apply: "Aplicar",
  "Apply all": "Aplicar todo",
  "Thinking…": "Pensando...",
  "Working…": "Aplicando...",
  Rewrite: "Reescribir",
  "Rewrite with AI": "Reescribir con IA",
  "Rewrite {field} with AI": "Reescribir {field} con IA",
  "Rewrite {field}": "Reescribir {field}",
  "AI Rewrite": "Reescritura con IA",
  Polish: "Pulir",
  Shorter: "Más corto",
  Punchier: "Más directo",
  Friendlier: "Más cercano",
  'Or your own instruction (e.g. "translate to Spanish")':
    'O tu propia instrucción (p. ej. "traducir al inglés")',
  Translate: "Traducir",
  "Translating…": "Traduciendo...",
  "Translate this section's copy": "Traducir el texto de esta sección",
  "Translate section copy": "Traducir el texto de la sección",
  Spanish: "Español",
  French: "Francés",
  "Portuguese (Brazil)": "Portugués (Brasil)",
  Italian: "Italiano",
  German: "Alemán",
  Japanese: "Japonés",
  "Preview ({count} field)": "Vista previa ({count} campo)",
  "Preview ({count} fields)": "Vista previa ({count} campos)",
  "Describe the image in a few words.": "Describe la imagen en pocas palabras.",
  "Added. {count} image left this month.": "Agregada. Te queda {count} imagen este mes.",
  "Added. {count} images left this month.": "Agregada. Te quedan {count} imágenes este mes.",
  "e.g. a model on a Tulum beach at golden hour":
    "p. ej. una modelo en una playa de Tulum al atardecer",
  "Describe the image to generate": "Describe la imagen a generar",
  Generate: "Generar",
  "Design with AI": "Diseñar con IA",
  "Describe it in a line and AI builds it as editable blocks, then make it yours.":
    "Descríbelo en una línea y la IA lo construye como bloques editables, luego hazlo tuyo.",
  "Add a few words describing what you want.": "Agrega unas palabras que describan lo que quieres.",
  "Could not build that. Try rephrasing.": "No se pudo construir. Intenta expresarlo de otra forma.",
  "e.g. a portfolio for my wedding photography": "p. ej. un portafolio para mi fotografía de bodas",
  "Describe what you want": "Describe lo que quieres",
  "Could not apply the change. Try again.": "No se pudo aplicar el cambio. Inténtalo de nuevo.",
  "Revise this block with AI": "Revisar este bloque con IA",
  "Revise with AI": "Revisar con IA",
  "Editing your selected {kind} block. Nothing changes until you apply it.":
    "Editando el bloque {kind} seleccionado. Nada cambia hasta que lo apliques.",
  "Make another change": "Haz otro cambio",
  "What would you like to change or add?": "¿Qué te gustaría cambiar o agregar?",
  "e.g. Rewrite the headline to be bolder, add a short subheading, and include a Book talent button.":
    "p. ej. Reescribe el título para que sea más audaz, agrega un subtítulo corto e incluye un botón Reservar talento.",
  "Make the copy shorter and punchier": "Haz el texto más corto y directo",
  "Add a clear call-to-action button": "Agrega un botón claro de llamada a la acción",
  "Warmer, more editorial tone": "Tono más cálido y editorial",
  "Turn this into a 3-column feature grid": "Convierte esto en una cuadrícula de 3 columnas",
  "Revise again": "Revisar de nuevo",
  "Start from the original": "Empezar desde el original",
  "Claude is revising your block…": "Claude está revisando tu bloque...",
  "Reading the existing content and applying your change while keeping the rest intact.":
    "Leyendo el contenido existente y aplicando tu cambio sin tocar el resto.",
  "Revised block preview": "Vista previa del bloque revisado",
  "Desktop 1280px": "Escritorio 1280px",
  "Mobile 390px": "Móvil 390px",
  "Insert below original": "Insertar debajo del original",
  "Replace original": "Reemplazar el original",
  "Keep tweaking above, or add it to the page.": "Sigue ajustando arriba o agrégalo a la página.",

  // ── WAVE 4.2 — Publish preflight ──────────────────────────────────────
  "Publish checks timed out. The draft is safe; retry the checks.":
    "Las verificaciones de publicación tardaron demasiado. El borrador está a salvo; reintenta las verificaciones.",
  "Publish checks could not load.": "No se pudieron cargar las verificaciones de publicación.",
  "Publish checks could not load. Try again.":
    "No se pudieron cargar las verificaciones de publicación. Inténtalo de nuevo.",
  "Publish checks could not load: {error}":
    "No se pudieron cargar las verificaciones de publicación: {error}",
  "Running publish checks": "Ejecutando verificaciones de publicación",
  "Running publish checks…": "Ejecutando verificaciones de publicación...",
  "Retry checks": "Reintentar verificaciones",
  "✓ All publish checks passed.": "✓ Todas las verificaciones de publicación pasaron.",
  Headings: "Encabezados",
  "Alt text": "Texto alternativo",
  "Image size": "Tamaño de imagen",
  Accessibility: "Accesibilidad",
  "CTA links": "Enlaces de CTA",
  "Page structure": "Estructura de la página",
  "Featured roster": "Roster destacado",
  "Live content": "Contenido en vivo",
  "Link checks": "Verificación de enlaces",
  "Mobile overflow": "Desborde en móvil",
  Performance: "Rendimiento",
  Blocker: "Bloqueo",
  Advisory: "Aviso",
  "Show on canvas": "Mostrar en el lienzo",
  "Publish checks: {errors} blocking issue, {warns} advisory warnings.":
    "Verificaciones de publicación: {errors} problema bloqueante, {warns} avisos.",
  "Publish checks: {errors} blocking issues, {warns} advisory warnings.":
    "Verificaciones de publicación: {errors} problemas bloqueantes, {warns} avisos.",
  "Publish checks: no blockers, {warns} advisory warning.":
    "Verificaciones de publicación: sin bloqueos, {warns} aviso.",
  "Publish checks: no blockers, {warns} advisory warnings.":
    "Verificaciones de publicación: sin bloqueos, {warns} avisos.",
  "Publish checks: no issues found.": "Verificaciones de publicación: sin problemas.",
  "Publish checks": "Verificaciones de publicación",
  "{count} blocker · ": "{count} bloqueo · ",
  "{count} blockers · ": "{count} bloqueos · ",
  "{count} advisory": "{count} aviso",
  "{count} advisories": "{count} avisos",
  Blockers: "Los bloqueos",
  disable: "desactivan",
  "until fixed.": "hasta que se corrijan.",
  "Advisory items": "Los avisos",
  "are non-blocking, review them, then publish if you accept the risk.":
    "no bloquean: revísalos y publica si aceptas el riesgo.",
  "Publish blockers ({count})": "Bloqueos de publicación ({count})",
  "Go to first blocker": "Ir al primer bloqueo",
  "{count} blocker in {category}": "{count} bloqueo en {category}",
  "{count} blockers in {category}": "{count} bloqueos en {category}",
  "Advisory, non-blocking ({count})": "Avisos, no bloqueantes ({count})",

  // ── WAVE 4.1 — multi-selection toolbar ────────────────────────────────
  "Shift-click to select multiple blocks: align, group, and style them together.":
    "Shift + clic para seleccionar varios bloques: alinéalos, agrúpalos y dales estilo juntos.",
  "Selected blocks": "Bloques seleccionados",
  "{count} selected": "{count} seleccionados",
  "Align left": "Alinear a la izquierda",
  "Align center": "Alinear al centro",
  "Align right": "Alinear a la derecha",
  "Align top": "Alinear arriba",
  "Align middle": "Alinear al medio",
  "Align bottom": "Alinear abajo",
  "Distribute horizontally": "Distribuir horizontalmente",
  "Distribute vertically": "Distribuir verticalmente",
  "Group selected blocks": "Agrupar bloques seleccionados",
  "Ungroup selected block": "Desagrupar bloque seleccionado",
  "Duplicate selected blocks": "Duplicar bloques seleccionados",
  "Remove selected blocks": "Quitar bloques seleccionados",
  "More layout actions": "Más acciones de disposición",
  "Hide shared style": "Ocultar estilo compartido",
  "Edit shared style for all": "Editar el estilo compartido de todos",
  "Apply to all selected": "Aplicar a todos los seleccionados",
  "Text colour": "Color del texto",
  Background: "Fondo",
  "Corner radius": "Radio de esquinas",
  Opacity: "Opacidad",
  "{label} for all selected": "{label} para todos los seleccionados",
  "Clear {label} on all selected": "Quitar {label} en todos los seleccionados",
  "Clear {label}": "Quitar {label}",

  // ── WAVE 4.1 — canvas text toolbar ────────────────────────────────────
  "Font size: {value}px": "Tamaño de fuente: {value}px",
  "Font size": "Tamaño de fuente",
  "Increase font size": "Aumentar tamaño de fuente",
  "Decrease font size": "Reducir tamaño de fuente",
  "Theme size: {size}. Adjust to override.":
    "Tamaño del tema: {size}. Ajústalo para personalizarlo.",
  "Custom font size on this block": "Tamaño de fuente personalizado en este bloque",
  "{label} text toolbar": "Barra de texto de {label}",
  "{label}, open in inspector": "{label}, abrir en el inspector",
  "Text style": "Estilo de texto",
  Paragraph: "Párrafo",
  "Heading 1": "Título 1",
  "Heading 2": "Título 2",
  "Heading 3": "Título 3",
  "Heading 4": "Título 4",
  "Font: {font}": "Fuente: {font}",
  "Font family": "Familia tipográfica",
  "Theme default": "Predeterminada del tema",
  Bold: "Negrita",
  Italic: "Cursiva",
  "Align text left (inside this block)": "Alinear texto a la izquierda (dentro de este bloque)",
  "Align text center (inside this block)": "Alinear texto al centro (dentro de este bloque)",
  "Align text right (inside this block)": "Alinear texto a la derecha (dentro de este bloque)",
  "Justify text": "Justificar texto",
  "Move this block within its section": "Mover este bloque dentro de su sección",
  "Block position": "Posición del bloque",
  Block: "Bloque",
  "Move block to the left of its section": "Mover el bloque a la izquierda de su sección",
  "Center block in its section": "Centrar el bloque en su sección",
  "Move block to the right of its section": "Mover el bloque a la derecha de su sección",
  "Text color": "Color del texto",
  "Hide nested blocks": "Ocultar bloques anidados",
  "Show nested blocks": "Mostrar bloques anidados",
  "Advanced, open inspector": "Avanzado, abrir el inspector",
  "More actions": "Más acciones",
  "Edit in inspector": "Editar en el inspector",
  "Use theme font size": "Usar el tamaño de fuente del tema",
  "Copy style": "Copiar estilo",
  "Paste style": "Pegar estilo",
  "Reset style": "Restablecer estilo",
  "Hide on device": "Ocultar en este dispositivo",
  Lock: "Bloquear",
  Unlock: "Desbloquear",

  // ── WAVE 4.1 — selection layer (chips, context menu, drag chrome) ─────
  "No block selected.": "Ningún bloque seleccionado.",
  "That block is no longer on the page.": "Ese bloque ya no está en la página.",
  "{label} selected": "{label} seleccionado",
  Page: "Página",
  "Drag to reorder section": "Arrastra para reordenar la sección",
  "Drag to move {label}": "Arrastra para mover {label}",
  "Drag to move / nest this block": "Arrastra para mover o anidar este bloque",
  "Linked style class: {label}": "Clase de estilo vinculada: {label}",
  "Add block inside {label}": "Agregar bloque dentro de {label}",
  "Remove {label}": "Quitar {label}",
  "{label} component": "Componente {label}",
  "Saved component": "Componente guardado",
  "Name this reusable component": "Nombra este componente reutilizable",
  "Drag this grip to reorder or nest this block on the canvas.":
    "Arrastra este control para reordenar o anidar este bloque en el lienzo.",
  "Double-click any text on the canvas to edit it inline.":
    "Haz doble clic en cualquier texto del lienzo para editarlo directamente.",
  "{count} sections selected": "{count} secciones seleccionadas",
  "Drag onto the page": "Arrastra hacia la página",
  "Drag to place": "Arrastra para colocar",
  "Not allowed here": "No permitido aquí",
  "Nest in {parent}": "Anidar en {parent}",
  container: "contenedor",
  "Drop to place": "Suelta para colocar",
  "Drop to move": "Suelta para mover",
  "Pasting isn't allowed here": "No se puede pegar aquí",
  "Paste {label}": "Pegar {label}",
  "Paste copied block": "Pegar bloque copiado",
  "Selection actions for {label}": "Acciones de selección para {label}",
  "Block actions": "Acciones del bloque",
  "Section actions": "Acciones de la sección",
  "Edit content": "Editar contenido",
  "Add block inside": "Agregar bloque dentro",
  "Copy block": "Copiar bloque",
  "Duplicate block": "Duplicar bloque",
  "Reset size & position": "Restablecer tamaño y posición",
  "Reset this block's size and position":
    "Restablecer el tamaño y la posición de este bloque",
  "Move block up": "Subir bloque",
  "Move block down": "Bajar bloque",
  "Wrap in container": "Envolver en un contenedor",
  "Convert to component": "Convertir en componente",
  "Unlock block": "Desbloquear bloque",
  "Lock block": "Bloquear bloque",
  "Remove block": "Quitar bloque",
  "Move section up": "Subir sección",
  "Move section down": "Bajar sección",
  "Duplicate section": "Duplicar sección",
  "Show section": "Mostrar sección",
  "Hide section": "Ocultar sección",
  "Restore curated section": "Restaurar sección curada",
  "Make editable (eject to blocks)": "Hacer editable (convertir en bloques)",
  "Delete section...": "Eliminar sección...",
  "Close menu": "Cerrar menú",
  "Add block": "Agregar bloque",
  "Show nested blocks ({count})": "Mostrar bloques anidados ({count})",
  "Select the parent ({label})": "Seleccionar el bloque padre ({label})",
  "Parent is selected": "El bloque padre está seleccionado",
  "{count} block": "{count} bloque",
  "{count} blocks": "{count} bloques",
  "Hide nested blocks panel": "Ocultar el panel de bloques anidados",
  "Hide for this selection": "Ocultar para esta selección",
  "Move {label} up": "Subir {label}",
  "Move {label} down": "Bajar {label}",
  "Duplicate {label}": "Duplicar {label}",
  "Copy {label}": "Copiar {label}",
  "Paste copied {label}": "Pegar {label} copiado",
  "Add block near {label}": "Agregar bloque junto a {label}",
  // Nested-panel secondary labels (fixed variants; dynamic ones pass through).
  "Paragraph block": "Bloque de párrafo",
  "Rich text block": "Bloque de texto enriquecido",
  "Image block": "Bloque de imagen",
  "Video block": "Bloque de video",
  "Embed block": "Bloque incrustado",
  "TikTok post": "Publicación de TikTok",
  "Instagram post": "Publicación de Instagram",
  "TikTok feed": "Feed de TikTok",
  "Instagram feed": "Feed de Instagram",
  "Button link": "Enlace del botón",
  "Raw HTML (sandboxed)": "HTML sin procesar (aislado)",
  Divider: "Divisor",
  "Divider · muted": "Divisor · tenue",
  "Remove {count}?": "¿Quitar {count}?",
  "Remove?": "¿Quitar?",
  "Edit Content": "Editar contenido",
  "Show on storefront": "Mostrar en el sitio",
  "Hide from storefront": "Ocultar del sitio",
  "Remove section": "Quitar sección",
  "Remove block?": "¿Quitar bloque?",
  "Edit block content": "Editar el contenido del bloque",
  Edit: "Editar",
  "Add block after": "Agregar bloque después",
  "More block actions": "Más acciones del bloque",
  More: "Más",
  "Reset position": "Restablecer posición",
  "Add before": "Agregar antes",
  Cut: "Cortar",
  "Revise this section with AI": "Revisar esta sección con IA",
  // ── canvas rotation handle (direct manipulation pack) ────────────────────
  "Reset rotation": "Restablecer rotación",
  "Drag to rotate (double-click to reset)":
    "Arrastra para rotar (doble clic para restablecer)",
  "Drag to rotate · double-click to reset":
    "Arrastra para rotar · doble clic para restablecer",
  "⌘ free · ⇧ 15°": "⌘ libre · ⇧ 15°",
  // ── canvas resize handles (8-handle pack, shared modifier convention) ────
  "⌘ free": "⌘ libre",
  "⌘ free · ⇧ aspect · ⌥ center": "⌘ libre · ⇧ proporción · ⌥ centro",
  "⌘ free · ⌥ center": "⌘ libre · ⌥ centro",
  "Drag to resize width (double-click to reset)":
    "Arrastra para cambiar el ancho (doble clic para restablecer)",
  "Drag to resize height (double-click to reset)":
    "Arrastra para cambiar el alto (doble clic para restablecer)",
  "Drag to resize width and height (double-click to reset)":
    "Arrastra para cambiar el ancho y el alto (doble clic para restablecer)",
  "Drag to resize · double-click to reset":
    "Arrastra para cambiar el tamaño · doble clic para restablecer",
  // ── z-order commands (⌘] / ⌘[) ───────────────────────────────────────────
  "Bring forward": "Traer adelante",
  "Send backward": "Enviar atrás",
  "Bring to front": "Traer al frente",
  "Send to back": "Enviar al fondo",
  // ── Lane E (2026) — slash-command "/" insert menu ─────────────────────
  "Insert block": "Insertar bloque",
  "No blocks match “{query}”": "Ningún bloque coincide con “{query}”",
  "Type to search blocks…": "Escribe para buscar bloques…",
  "Search blocks to insert": "Buscar bloques para insertar",
  // ── Keyboard shortcuts overlay (kit/shortcuts.ts) — builder-leftovers
  // sweep, item 2: documenting shortcuts that already worked but weren't
  // advertised, plus disambiguating the ⌥+arrow (nudge vs section-move)
  // entries. NOTE: shortcut-overlay.tsx does not currently call t() on
  // SHORTCUTS entries (a pre-existing gap, out of scope here) — these
  // entries are added for catalog parity per the lane's brief and are ready
  // the moment the overlay is wired up. "Ungroup selected block" above
  // (multi-selection-toolbar.tsx's button label) already covers that shared
  // English source string.
  "Dissolves a group container, promoting its children back to its parent.":
    "Deshace un contenedor de grupo y devuelve sus hijos a su elemento padre.",
  "Align selected blocks right": "Alinear bloques seleccionados a la derecha",
  "Align selected blocks centre": "Alinear bloques seleccionados al centro",
  "Requires 2+ blocks selected.": "Requiere 2 o más bloques seleccionados.",
  "Distribute selected blocks horizontally":
    "Distribuir bloques seleccionados horizontalmente",
  "Spaces the middle blocks evenly between the outer two. Requires 3+ blocks selected.":
    "Espacia los bloques intermedios de forma uniforme entre los dos extremos. Requiere 3 o más bloques seleccionados.",
  "Move selected section up": "Mover la sección seleccionada hacia arriba",
  "With a section (not a nested block) selected, moves it one place earlier on the page. Selecting a block instead nudges it up (see \"Nudge selected block(s)\").":
    "Con una sección (no un bloque anidado) seleccionada, la mueve un lugar antes en la página. Si seleccionas un bloque en su lugar, lo desplaza hacia arriba (ver \"Mover bloque(s) seleccionado(s)\").",
  "Move selected section down": "Mover la sección seleccionada hacia abajo",
  "With a section (not a nested block) selected, moves it one place later on the page. Selecting a block instead nudges it down (see \"Nudge selected block(s)\").":
    "Con una sección (no un bloque anidado) seleccionada, la mueve un lugar después en la página. Si seleccionas un bloque en su lugar, lo desplaza hacia abajo (ver \"Mover bloque(s) seleccionado(s)\").",
  "With a nested block (not a section) selected and focus on the canvas, hold ⌥ and arrow to move it by 1px; add ⇧ for 10px. Also works on tablet/mobile preview, moving the block on that breakpoint only. Selecting a section instead reorders it (see \"Move section up/down\").":
    "Con un bloque anidado (no una sección) seleccionado y el foco en el lienzo, mantén ⌥ y una flecha para moverlo 1px; añade ⇧ para 10px. También funciona en la vista previa de tablet/móvil, y mueve el bloque solo en ese punto de quiebre. Si seleccionas una sección en su lugar, la reordena (ver \"Mover sección arriba/abajo\").",
  "Move selected block": "Mover el bloque seleccionado",
  "Drag the centre grip on a selected block to reposition it freely. Double-click the grip to snap it back to its natural position.":
    "Arrastra la asa central de un bloque seleccionado para reposicionarlo libremente. Haz doble clic en la asa para que vuelva a su posición natural.",
  "Step through blocks in document order": "Recorrer los bloques en el orden del documento",
  "Tab selects the next block in document order (a flat complement to the arrow keys' parent/child/sibling nav); Shift+Tab selects the previous. Wraps at the ends.":
    "Tab selecciona el siguiente bloque en el orden del documento (un complemento lineal a la navegación de padre/hijo/hermano con las flechas); Shift+Tab selecciona el anterior. Da la vuelta en los extremos.",
  // ── Quick-style popover (selection toolbar, 2026-08-15) ───────────────
  // Fill / Shadow / Default / Sharp / Pill already live in
  // editor-i18n-es-inspectors.ts (the popover reuses the inspector's shared
  // Segmented option lists); only the popover-specific strings are new.
  "Quick styles": "Estilos rápidos",
  "Padding": "Espaciado interior",
  "Corners": "Esquinas",
  "Locked by admin": "Bloqueado por el administrador",
  "Revisions (⌘⇧Y)": "Revisiones (⌘⇧Y)",
  "Open Revisions": "Abrir revisiones",
  "+{count} more changes": "+{count} cambios más",
  "No changes": "Sin cambios",
  "Component name": "Nombre del componente",
  "Save component": "Guardar componente",
  "Link URL": "URL del enlace",
  "Paste a URL": "Pega una URL",
  "Apply link": "Aplicar enlace",
  "Remove this link": "Quitar este enlace",
  "Dropdown list": "Lista desplegable",
  "Radio group": "Grupo de opciones",
  "Edit each field below. Use Submit for the send action. Dropdown, radio, and checkbox need one option per line.":
    "Edita cada campo abajo. Usa Enviar para el botón de envío. Lista desplegable, radio y casilla necesitan una opción por línea.",
  "One option per line": "Una opción por línea",
  "Hidden on every breakpoint. Click to show everywhere.":
    "Oculto en todos los tamaños. Haz clic para mostrar en todas partes.",
  "Desktop only. Click for mobile only.":
    "Solo escritorio. Haz clic para solo móvil.",
  "Mobile only. Click to hide.": "Solo móvil. Haz clic para ocultar.",
  "Visible everywhere. Click for desktop only.":
    "Visible en todas partes. Haz clic para solo escritorio.",
  "Hide on mobile": "Ocultar en móvil",
  "Hidden on mobile": "Oculto en móvil",
  "Hide on tablet": "Ocultar en tablet",
  "Hidden on tablet": "Oculto en tablet",
  "Tap to show": "Toca para mostrar",
  "Tap to hide": "Toca para ocultar",
  "Tablet order": "Orden en tablet",
  "Natural flow": "Flujo natural",
  "Override: {order} (lower shows first)":
    "Anulación: {order} (menor se muestra primero)",
  "Move earlier on mobile": "Mover antes en móvil",
  "Move later on mobile": "Mover después en móvil",
  "Move earlier on tablet": "Mover antes en tablet",
  "Move later on tablet": "Mover después en tablet",
  "Move earlier on mobile (paint this block sooner)":
    "Mover antes en móvil (este bloque se pinta primero)",
  "Move later on mobile (paint this block after siblings)":
    "Mover después en móvil (este bloque se pinta después de sus hermanos)",
  "Move earlier on tablet (paint this block sooner)":
    "Mover antes en tablet (este bloque se pinta primero)",
  "Move later on tablet (paint this block after siblings)":
    "Mover después en tablet (este bloque se pinta después de sus hermanos)",
  "This block is hidden on mobile, show it again":
    "Este bloque está oculto en móvil; muéstralo de nuevo",
  "Hide this block on mobile only (desktop + tablet unaffected)":
    "Ocultar este bloque solo en móvil (escritorio y tablet no cambian)",
  "This block is hidden on tablet, show it again":
    "Este bloque está oculto en tablet; muéstralo de nuevo",
  "Hide this block on tablet only (desktop + phone unaffected)":
    "Ocultar este bloque solo en tablet (escritorio y teléfono no cambian)",
  "This block has mobile-specific overrides":
    "Este bloque tiene ajustes específicos para móvil",
  "This block has tablet-specific overrides":
    "Este bloque tiene ajustes específicos para tablet",
  "This block behaves differently on mobile":
    "Este bloque se comporta distinto en móvil",
  "This block behaves differently on tablet":
    "Este bloque se comporta distinto en tablet",
  "Reset mobile order to natural flow":
    "Restablecer el orden en móvil al flujo natural",
  "Reset tablet order to natural flow":
    "Restablecer el orden en tablet al flujo natural",

  // Publish drawer — the one-line consequence that replaced the "What
  // publishing does" essay card (the essay now lives behind the ⓘ).
  "Publishing makes this draft the live page visitors see.":
    "Publicar convierte este borrador en la página en vivo que ven los visitantes.",
  "Publishing adds this template to the gallery. No live pages change.":
    "Publicar agrega esta plantilla a la galería. Ninguna página en vivo cambia.",

  // Freeform translation-status panel (topbar, beside the language pill).
  "Translations": "Traducciones",
  "Translation status": "Estado de traducción",
  "Compare this page against the {locale} version":
    "Compara esta página con la versión en {locale}",
  "{current} page compared with {sibling}":
    "Página en {current} comparada con {sibling}",
  "Refresh": "Actualizar",
  "Comparing both language versions…": "Comparando ambas versiones de idioma…",
  "The {locale} version of this page doesn't exist yet, so every block below is untranslated.":
    "La versión en {locale} de esta página aún no existe, así que todos los bloques de abajo están sin traducir.",
  "More than one {locale} row exists for this slug; showing the first. Worth cleaning up.":
    "Existe más de una fila en {locale} para este slug; se muestra la primera. Conviene limpiarlo.",
  "Couldn't load the sibling page. Try again.":
    "No se pudo cargar la página hermana. Inténtalo de nuevo.",
  "{count} text block(s) exist only on the {locale} page.":
    "{count} bloque(s) de texto existen solo en la página en {locale}.",
  "No text blocks on this page yet.": "Esta página aún no tiene bloques de texto.",
  "Translated": "Traducido",
  "Same text in both languages": "Mismo texto en ambos idiomas",
  "Empty in the other language": "Vacío en el otro idioma",
  "No counterpart block": "Sin bloque equivalente",
};
