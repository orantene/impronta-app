/**
 * Editor chrome i18n — message catalog for builder UI strings (EN/ES).
 *
 * Page content locale is separate; this covers panels, drawers, and tips.
 *
 * W2-C6 — this file previously carried 8 semantic `MessageKey` entries
 * consumed by exactly one component (navigator-panel.tsx). The rest of the
 * editor chrome (topbar, command dock, add gallery, publish drawer, inspector
 * rail, structure panel, page settings, common toasts) was 100% hardcoded
 * English in a bilingual product.
 *
 * Rather than invent a third i18n idiom, this extends the EXISTING editor-i18n
 * idiom with the pattern already proven at scale by
 * `components/admin/shell/internal/dashboard-i18n.ts`: an English-text-keyed
 * `Record<string, string>` (`ES_TEXT`) so call sites wrap their existing
 * hardcoded copy in `t("Exact English string")` instead of threading a new
 * semantic key through every component. `editorT` (aliased as the `t` returned
 * by `useEditorLocale`) now tries the legacy semantic-key table FIRST (so the
 * one existing consumer keeps working unmodified), then falls through to the
 * English-text table, and finally falls back to the input unchanged — so
 * tenant-authored / admin-overridden strings (e.g. Add-gallery tab
 * `label_override`, catalog category names) that don't match a dictionary
 * entry pass through untouched rather than breaking.
 */

export type EditorLocale = "en" | "es";

type MessageKey =
  | "layers.panel"
  | "inspector.panel"
  | "theme.panel"
  | "publish.panel"
  | "pageSettings.panel"
  | "zoom.fit"
  | "zoom.reset"
  | "compact.inspector.hint";

const MESSAGES: Record<EditorLocale, Record<MessageKey, string>> = {
  en: {
    "layers.panel": "Layers",
    "inspector.panel": "Inspector",
    "theme.panel": "Theme",
    "publish.panel": "Publish",
    "pageSettings.panel": "Page settings",
    "zoom.fit": "Fit",
    "zoom.reset": "100%",
    "compact.inspector.hint": "Swipe up for the inspector",
  },
  es: {
    "layers.panel": "Capas",
    "inspector.panel": "Inspector",
    "theme.panel": "Tema",
    "publish.panel": "Publicar",
    "pageSettings.panel": "Ajustes de página",
    "zoom.fit": "Ajustar",
    "zoom.reset": "100%",
    "compact.inspector.hint": "Desliza hacia arriba para el inspector",
  },
};

function isMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(MESSAGES.en, key);
}

/**
 * English-text-keyed catalog (dashboard-i18n idiom). Wrap any hardcoded
 * editor-chrome string in `t("...")`; if it's not in this table (tenant
 * overrides, dynamic content, or a string not yet covered) the original
 * English passes through unchanged rather than throwing or rendering blank.
 *
 * Coverage (W2-C6): topbar, command dock, add gallery chrome, publish drawer
 * chrome, inspector rail + design panel, structure/pages panels, page
 * settings tabs, common toasts. Deep per-block inspector field labels
 * (hero/CTA/gallery content editors, etc.) are NOT covered — see the PR
 * description for the deferred list.
 */
const ES_TEXT: Record<string, string> = {
  // ── Topbar — page picker ──────────────────────────────────────────────
  Rename: "Renombrar",
  "Click to switch page · double-click to rename":
    "Clic para cambiar de página, doble clic para renombrar",
  Pages: "Páginas",
  "Add new page": "Agregar página nueva",
  "Upgrade your plan to create additional pages.":
    "Mejora tu plan para crear páginas adicionales.",
  "Loading…": "Cargando...",
  "No pages yet.": "Aún no hay páginas.",
  "New page": "Página nueva",
  "Creating…": "Creando...",
  "Manage pages…": "Gestionar páginas...",
  Homepage: "Página de inicio",

  // ── Topbar — save status ──────────────────────────────────────────────
  "Saving…": "Guardando...",
  "Save conflict": "Conflicto al guardar",
  "Couldn't save": "No se pudo guardar",
  "This page changed in another tab or session. Choose Reload latest or Keep editing this copy in the banner.":
    "Esta página cambió en otra pestaña o sesión. Elige Cargar lo más reciente o Seguir con esta copia en el aviso.",
  "Your last draft didn't save. It will retry on your next edit; reload the editor if it persists.":
    "Tu último borrador no se guardó. Se reintentará con tu próxima edición; recarga el editor si continúa.",
  "Unsaved draft": "Borrador sin guardar",
  "Edits are only in your draft until you publish. If the canvas or device preview looks one step behind, wait for autosave to finish or switch viewport to refresh the preview.":
    "Los cambios solo están en tu borrador hasta que publiques. Si el lienzo o la vista previa se ven un paso atrás, espera a que termine el guardado automático o cambia de vista para actualizar la vista previa.",
  "Draft saved": "Borrador guardado",
  "Draft last saved at {when}. Visitors see the last published version until you publish.":
    "Borrador guardado por última vez a las {when}. Los visitantes ven la última versión publicada hasta que publiques.",
  "Draft is saved on our servers. Visitors still see the published site until you click Publish.":
    "El borrador está guardado en nuestros servidores. Los visitantes siguen viendo el sitio publicado hasta que hagas clic en Publicar.",
  "Unpublished changes": "Cambios sin publicar",
  "You have unpublished changes. The live site still shows the previous published version.":
    "Tienes cambios sin publicar. El sitio en vivo todavía muestra la versión publicada anterior.",
  "The live site visitors see does not yet reflect your saved draft. Click Publish to push these changes live.":
    "Lo que ven los visitantes aún no refleja tu borrador guardado. Haz clic en Publicar para que estos cambios queden en vivo.",

  // ── Topbar — viewport switcher ─────────────────────────────────────────
  Desktop: "Escritorio",
  Wide: "Ancho",
  Tablet: "Tablet",
  Mobile: "Móvil",
  Compact: "Compacto",
  "full-width editing canvas": "lienzo de edición a ancho completo",
  "device-width iframe preview, reloads when the draft saves so breakpoints stay accurate":
    "vista previa con el ancho del dispositivo, se recarga al guardar el borrador para que los puntos de quiebre sean precisos",
  "Mobile editing: edit the mobile layout, scope style edits to mobile, hide/reorder blocks per-phone, run mobile health checks":
    "Edición móvil: edita el diseño móvil, limita los cambios de estilo al móvil, oculta o reordena bloques por teléfono, ejecuta revisiones de salud móvil",
  "Mobile editing mode": "Modo de edición móvil",
  "Canvas preview width": "Ancho de vista previa del lienzo",
  "Custom preview width (px). The frame resizes and storefront breakpoints re-fire at this width.":
    "Ancho de vista previa personalizado (px). El marco cambia de tamaño y los puntos de quiebre del sitio se vuelven a activar en este ancho.",
  "Custom preview width in pixels": "Ancho de vista previa personalizado en píxeles",
  "Clear the custom width to rotate the device frame":
    "Borra el ancho personalizado para rotar el marco del dispositivo",
  "Portrait, rotate the frame back": "Vertical, rotar el marco de nuevo",
  "Landscape, rotate the device frame (breakpoints re-fire at the wider width)":
    "Horizontal, rotar el marco del dispositivo (los puntos de quiebre se activan de nuevo con el ancho mayor)",
  Landscape: "Horizontal",
  "Reset the frame to this device's natural width":
    "Restablecer el marco al ancho natural de este dispositivo",
  "Reset preview frame": "Restablecer marco de vista previa",
  "Breakpoints, custom screen sizes": "Puntos de quiebre, tamaños de pantalla personalizados",
  Breakpoints: "Puntos de quiebre",
  "Min-width tiers for responsive style editing and device preview frames.":
    "Niveles de ancho mínimo para edición de estilo responsivo y marcos de vista previa.",
  "Add tier": "Agregar nivel",
  "Reset defaults": "Restablecer valores predeterminados",
  Save: "Guardar",

  // ── Topbar — preview toggle ─────────────────────────────────────────────
  "Exit preview, show editing tools": "Salir de la vista previa, mostrar herramientas de edición",
  "Preview, hide editing tools and interact with the page":
    "Vista previa, oculta las herramientas de edición e interactúa con la página",
  "Exit preview": "Salir de la vista previa",
  Preview: "Vista previa",

  // ── Topbar — publish split button + menu ────────────────────────────────
  "Review publish checks in the drawer, then publish your draft to the live site":
    "Revisa las verificaciones de publicación en el panel y luego publica tu borrador en el sitio en vivo",
  Publish: "Publicar",
  "Publish options": "Opciones de publicación",
  "Save draft": "Guardar borrador",
  "Checkpoint without publishing": "Punto de control sin publicar",
  "View page as a visitor": "Ver la página como un visitante",
  "Schedule publish…": "Programar publicación...",
  "Choose a date and time": "Elige una fecha y hora",
  "Revision history": "Historial de revisiones",
  "Browse and restore past saves": "Explora y restaura guardados anteriores",
  "Pull from live: Replace": "Traer del sitio en vivo: Reemplazar",
  "Replace your draft with the live homepage":
    "Reemplaza tu borrador con la página de inicio en vivo",
  "Pull from live: Add above": "Traer del sitio en vivo: Agregar arriba",
  "Add the live homepage blocks above your draft":
    "Agrega los bloques de la página de inicio en vivo encima de tu borrador",
  "Pull from live: Add below": "Traer del sitio en vivo: Agregar abajo",
  "Add the live homepage blocks below your draft":
    "Agrega los bloques de la página de inicio en vivo debajo de tu borrador",
  "Page settings": "Ajustes de página",
  "SEO, URL, metadata": "SEO, URL, metadatos",
  "Duplicate page": "Duplicar página",
  "Clone this page to a new draft": "Clona esta página en un borrador nuevo",
  "Unpublish / Archive": "Despublicar / Archivar",
  "Take this page offline": "Quitar esta página de circulación",

  // ── Topbar — exit / undo / redo / comments / share ──────────────────────
  "Exit edit mode and view your live published site":
    "Salir del modo de edición y ver tu sitio publicado en vivo",
  "Exiting…": "Saliendo...",
  "Exit to live site": "Salir al sitio en vivo",
  Exit: "Salir",
  "Undo (⌘Z)": "Deshacer (⌘Z)",
  "Redo (⇧⌘Z)": "Rehacer (⇧⌘Z)",
  Comments: "Comentarios",
  "Share preview link": "Compartir enlace de vista previa",
  Share: "Compartir",
  "Share a preview link": "Compartir un enlace de vista previa",
  "Anyone with the link can view this draft until it expires.":
    "Cualquiera con el enlace puede ver este borrador hasta que caduque.",
  "Link expiration": "Caducidad del enlace",
  "Generating…": "Generando...",
  "Generate & copy link": "Generar y copiar enlace",
  "Save draft (⌘S)": "Guardar borrador (⌘S)",
  "Save named checkpoint": "Guardar punto de control con nombre",
  "Give this draft a label so you can identify it in the Revisions history.":
    "Ponle un nombre a este borrador para identificarlo en el historial de revisiones.",
  Cancel: "Cancelar",
  "Saving checkpoint…": "Guardando punto de control...",
  "Save checkpoint": "Guardar punto de control",
  "Checkpoint label": "Nombre del punto de control",

  // ── Command dock (W2-C3 six items) ──────────────────────────────────────
  "Builder tools": "Herramientas del editor",
  Add: "Agregar",
  "Add gallery": "Galería para agregar",
  Structure: "Estructura",
  "Structure (⌘\\)": "Estructura (⌘\\)",
  Design: "Diseño",
  "Design (brand + theme)": "Diseño (marca y tema)",
  Assets: "Recursos",
  "Asset library": "Biblioteca de recursos",
  Help: "Ayuda",
  "Keyboard shortcuts (?)": "Atajos de teclado (?)",
  "All pages": "Todas las páginas",

  // ── Design panel ─────────────────────────────────────────────────────────
  Brand: "Marca",
  Theme: "Tema",
  "Global theme and brand styles: colours, typography, spacing, effects, and the code view for the whole site. This opens the full-height theme editor.":
    "Estilos globales de tema y marca: colores, tipografía, espaciado, efectos y la vista de código de todo el sitio. Esto abre el editor de tema a pantalla completa.",
  "Open theme editor": "Abrir editor de tema",

  // ── Inspector command rail + tab config ─────────────────────────────────
  "Section editor tabs": "Pestañas del editor de sección",
  Layout: "Diseño",
  Content: "Contenido",
  Style: "Estilo",
  Data: "Datos",
  Motion: "Movimiento",
  "Edit text, images, and controls for this block":
    "Edita texto, imágenes y controles de este bloque",
  "Spacing, width, and how the block sits on the page":
    "Espaciado, ancho y cómo se ubica el bloque en la página",
  "Colors, type, borders, and surfaces": "Colores, tipografía, bordes y superficies",
  "Connect this block to live roster or catalog data":
    "Conecta este bloque a datos en vivo de la lista o del catálogo",
  "Entrance motion when visitors scroll to this block":
    "Animación de entrada cuando los visitantes llegan a este bloque al hacer scroll",

  // ── Add gallery ──────────────────────────────────────────────────────────
  "Add gallery tabs": "Pestañas de la galería para agregar",
  Elements: "Elementos",
  Sections: "Secciones",
  Connected: "Conectado",
  "Page Templates": "Plantillas de página",
  Shell: "Estructura del sitio",
  "Add Layout": "Agregar diseño",
  "Add Elements": "Agregar elementos",
  "Add Sections": "Agregar secciones",
  "Add Connected": "Agregar conectado",
  "Add Shell Templates": "Agregar plantillas de estructura",
  "Add Page Templates": "Agregar plantillas de página",
  Categories: "Categorías",
  "Search gallery": "Buscar en la galería",
  "Search sections and blocks": "Buscar secciones y bloques",
  "No results": "Sin resultados",
  "No matches": "Sin coincidencias",
  "Try a different search or browse another category.":
    "Prueba otra búsqueda o explora otra categoría.",
  "Drag to a specific position, or click to insert after the selected block.":
    "Arrastra a una posición específica, o haz clic para insertar después del bloque seleccionado.",

  // ── Publish drawer ───────────────────────────────────────────────────────
  Published: "Publicado",
  "Just published": "Recién publicado",
  "Last published": "Última publicación",
  "loading…": "cargando...",
  "couldn't load": "no se pudo cargar",
  "What publishing does": "Qué hace publicar",
  "Publishing to the live site. Please wait.":
    "Publicando en el sitio en vivo. Espera un momento.",
  "Saving only stores your draft. It does not mean visitors see these changes. Scroll the canvas, try Preview mode, and review the publish checks below before publishing.":
    "Guardar solo almacena tu borrador. No significa que los visitantes vean estos cambios. Recorre el lienzo, prueba el modo Vista previa y revisa las verificaciones de publicación de abajo antes de publicar.",
  "changes since last publish": "cambios desde la última publicación",
  "changes since last publish (first publish)":
    "cambios desde la última publicación (primera publicación)",
  "Checking the last published snapshot…": "Revisando la última instantánea publicada...",
  "Couldn't load the last published snapshot, so the change count is unavailable.":
    "No se pudo cargar la última instantánea publicada, así que el número de cambios no está disponible.",
  Retry: "Reintentar",
  "Diff shows no section changes vs last publish. The canvas or device preview can still lag your saved draft. Use Preview, review checks below, wait for autosave, or reload composition if the tree looks stale.":
    "La comparación no muestra cambios de sección respecto a la última publicación. El lienzo o la vista previa aún pueden ir un paso atrás de tu borrador guardado. Usa Vista previa, revisa las verificaciones de abajo, espera al guardado automático o recarga la composición si el árbol se ve desactualizado.",
  "Reloading…": "Recargando...",
  "Reload composition": "Recargar composición",
  Added: "Agregado",
  Moved: "Movido",
  "Save a draft checkpoint without publishing":
    "Guarda un punto de control del borrador sin publicar",
  "Discard your draft edits and reset to the currently published version":
    "Descarta las ediciones de tu borrador y restablece a la versión publicada actual",
  "Resetting…": "Restableciendo...",
  "Copy from live": "Copiar del sitio en vivo",
  "Draft reset to the published version": "Borrador restablecido a la versión publicada",
  "Publishing to the live site, please wait": "Publicando en el sitio en vivo, espera un momento",
  "Publishing…": "Publicando...",
  "Publish now": "Publicar ahora",
  Close: "Cerrar",

  // ── Publish drawer — success body ───────────────────────────────────────
  "This template is now in the page-builder gallery. Keep editing. Your next publish updates it when you click Publish again.":
    "Esta plantilla ya está en la galería del editor de páginas. Sigue editando. Tu próxima publicación la actualizará cuando vuelvas a hacer clic en Publicar.",
  "Visitors see the new homepage now. Keep editing. Your next publish only replaces the live page when you click Publish again.":
    "Los visitantes ya ven la nueva página de inicio. Sigue editando. Tu próxima publicación solo reemplaza la página en vivo cuando vuelvas a hacer clic en Publicar.",
  "Visitors see the new page now. Keep editing. Your next publish only replaces the live page when you click Publish again.":
    "Los visitantes ya ven la nueva página. Sigue editando. Tu próxima publicación solo reemplaza la página en vivo cuando vuelvas a hacer clic en Publicar.",

  // ── Structure / navigator panel ──────────────────────────────────────────
  "Close Structure": "Cerrar Estructura",
  "Layers view mode": "Modo de vista de capas",
  Layers: "Capas",
  Outline: "Esquema",
  Classes: "Clases",
  "Every block on the page, in order": "Cada bloque de la página, en orden",
  "Just the headings, as a document outline": "Solo los encabezados, como un esquema del documento",
  "Reusable style classes you can apply across blocks":
    "Clases de estilo reutilizables que puedes aplicar en varios bloques",
  "Outline shows just the headings. Jump through long pages faster.":
    "El esquema muestra solo los encabezados. Navega páginas largas más rápido.",
  "Search headings…": "Buscar encabezados...",
  "Search classes…": "Buscar clases...",
  "Search layers…": "Buscar capas...",
  "Expand all nested blocks": "Expandir todos los bloques anidados",
  "Collapse all nested blocks": "Contraer todos los bloques anidados",
  "Add a section": "Agregar una sección",
  "Edit colours, type, and spacing": "Editar colores, tipografía y espaciado",
  "Cancel rename": "Cancelar cambio de nombre",

  // ── All-pages panel ──────────────────────────────────────────────────────
  "Page title": "Título de la página",
  "page-slug": "url-de-la-pagina",
  "Delete page": "Eliminar página",
  "Deleting…": "Eliminando...",
  "Add page": "Agregar página",
  "Upgrade plan": "Mejorar plan",
  Home: "Inicio",
  Directory: "Directorio",
  Draft: "Borrador",
  "Converting…": "Convirtiendo...",
  "Convert to editable page": "Convertir en página editable",
  Delete: "Eliminar",
  "Manage in admin": "Gestionar en admin",
  "More page actions": "Más acciones de página",

  // ── Page settings drawer ─────────────────────────────────────────────────
  Basics: "Básicos",
  SEO: "SEO",
  Social: "Redes sociales",
  "URL & robots": "URL y robots",
  "Search preview": "Vista previa de búsqueda",
  "Social card preview": "Vista previa de tarjeta social",
  "OpenGraph overrides": "Anulaciones de OpenGraph",
  "URL slug": "URL de la página",
  "Structured data": "Datos estructurados",
  "Canonical URL": "URL canónica",
  "Search engines": "Motores de búsqueda",
  Redirects: "Redirecciones",

  // ── Common toasts (edit-shell.tsx) ──────────────────────────────────────
  "Live preview can lag a moment after inserts. The draft on the server is still what Publish will read.":
    "La vista previa en vivo puede ir un momento atrás después de insertar. El borrador en el servidor sigue siendo lo que leerá Publicar.",
  Undo: "Deshacer",
  applied: "aplicado",
  "Builder change blocked": "Cambio del editor bloqueado",
  "Next step:": "Siguiente paso:",
  "Reload latest": "Cargar lo más reciente",
  "Load the changes from the other tab or session. Your unsaved local changes are discarded and undo history resets.":
    "Carga los cambios de la otra pestaña o sesión. Tus cambios locales sin guardar se descartan y el historial de deshacer se reinicia.",
  "Keep editing this copy": "Seguir con esta copia",
  "Save your copy over the change from the other tab or session. Your undo history is kept.":
    "Guarda tu copia sobre el cambio de la otra pestaña o sesión. Se conserva tu historial de deshacer.",
  "You have this page open in another tab. That edit landed first.":
    "Tienes esta página abierta en otra pestaña. Ese cambio se guardó primero.",

  // ── Mutation error operations / suggestions (edit-shell.tsx) ─────────────
  Insert: "Insertar",
  Move: "Mover",
  Duplicate: "Duplicar",
  Paste: "Pegar",
  Update: "Actualizar",
  "This block is stale or already removed. Refresh and try the action again.":
    "Este bloque está desactualizado o ya se eliminó. Actualiza e intenta la acción de nuevo.",
  "Destination container no longer exists. Pick a different target or refresh.":
    "El contenedor de destino ya no existe. Elige otro destino o actualiza.",
  "Choose another destination or move the parent group first.":
    "Elige otro destino o mueve primero el grupo superior.",
  "Pick a compatible container/section for this block type.":
    "Elige un contenedor o sección compatible para este tipo de bloque.",
  "Insert this block inside a section or layout group.":
    "Inserta este bloque dentro de una sección o grupo de diseño.",
  "Adjust incompatible settings, then try again.":
    "Ajusta los valores incompatibles e intenta de nuevo.",
  "This area is protected by plan or shell rules.":
    "Esta área está protegida por reglas del plan o de la estructura del sitio.",
  "Pick one: Reload latest to take the other change, or Keep editing this copy to save yours over it.":
    "Elige una opción: Cargar lo más reciente para tomar el otro cambio, o Seguir con esta copia para guardar la tuya sobre él.",
  "Try again. If it persists, reload the editor.":
    "Intenta de nuevo. Si continúa, recarga el editor.",
};

/** Substring-anchored template lookups (`{placeholder}` still needs a
 *  caller-side `.replace()`, same convention as dashboard-i18n.ts). */

function isMessageKeyOrText(key: string): key is MessageKey {
  return isMessageKey(key);
}

/**
 * Unified translate function. Accepts either a legacy semantic `MessageKey`
 * (kept for the one pre-existing consumer) or an arbitrary English string
 * (the W2-C6 bulk-coverage idiom). Falls back to the input unchanged when no
 * translation exists — safe for tenant overrides / dynamic content.
 */
export function editorT(key: string, locale: EditorLocale = "en"): string {
  if (isMessageKeyOrText(key)) {
    return MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  }
  if (locale !== "es") return key;
  return ES_TEXT[key] ?? key;
}

/** Client-only navigator-language guess, used only as the pre-hydration seed
 *  before the cookie read resolves (see useEditorLocale). */
export function detectEditorLocale(): EditorLocale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language.toLowerCase();
  return lang.startsWith("es") ? "es" : "en";
}
