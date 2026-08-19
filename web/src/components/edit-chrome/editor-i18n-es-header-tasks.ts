/**
 * Spanish for the header TASKS panel.
 *
 * Its own catalog because `editor-i18n-es.ts` is at the 800-line cap, and the
 * split is the house pattern (canvas, inspectors, sections… all live in their
 * own files). Register every new catalog in `ES_CATALOG_FILES` too, or the
 * parity guard silently stops checking it.
 */

export const ES_HEADER_TASKS_TEXT: Record<string, string> = {
  "Header tasks": "Tareas del encabezado",
  "Logo and brand": "Logo y marca",
  "Logo image, site name, colours and contact details.":
    "Imagen del logo, nombre del sitio, colores y datos de contacto.",
  "Links, icons, submenus and what shows on a phone.":
    "Enlaces, iconos, submenús y lo que se muestra en el móvil.",
  "This header has no menu yet.": "Este encabezado aún no tiene menú.",
  "Logo image": "Imagen del logo",
  "Swap the image or change its size.": "Cambia la imagen o su tamaño.",
  "This header has no image yet.": "Este encabezado aún no tiene imagen.",
  "in the bar: search, account, language and the rest.":
    "en la barra: búsqueda, cuenta, idioma y demás.",
  "No action widgets in this header.":
    "Este encabezado no tiene widgets de acción.",
  Manage: "Gestionar",
  "Bar style": "Estilo de la barra",
  "Height, background, blur and whether it sticks on scroll.":
    "Altura, fondo, desenfoque y si se fija al hacer scroll.",
  "Fonts and colours": "Tipografías y colores",
  "Site-wide type and palette. Changes every page, not just the header.":
    "Tipografía y paleta de todo el sitio. Cambia todas las páginas, no solo el encabezado.",
  "Edit the phone layout and open the menu on the canvas.":
    "Edita el diseño móvil y abre el menú en el lienzo.",
  Switch: "Cambiar",
  Open: "Abrir",
};
