/**
 * Spanish for dashboard strings that were reaching Spanish screens in English
 * (2026-10-07 QA sweep): the talent default-currency card, the product-orders
 * queue, publish-requirement labels, the Pro-gated analytics card, and the
 * English messages returned by the talent field/skills server actions. Server
 * strings are unchanged; the client maps them through `copy.t`. No em dashes.
 * Merged into ES_TEXT through dashboard-i18n-rail.ts.
 */
export const LEAKS_1007_ES_TEXT: Record<string, string> = {
  // Default currency card (Settings)
  "Loading currency preference…": "Cargando preferencia de moneda…",
  "Which currency tab opens first on Money when multiple are present. Display only, no FX conversion.":
    "Qué moneda se abre primero en Dinero cuando hay varias. Solo de visualización, sin conversión de divisas.",
  // Product orders queue
  "Loading orders…": "Cargando pedidos…",
  "Product orders": "Pedidos de productos",
  "Mark an order shipped to release its payout. The money was collected at purchase and is held until you ship.":
    "Marca un pedido como enviado para liberar su pago. El dinero se cobró al comprar y se retiene hasta que lo envíes.",
  "New order": "Pedido nuevo",
  "Preparing": "En preparación",
  "Ready for pickup": "Listo para recoger",
  "Shipped": "Enviado",
  "Delivered": "Entregado",
  "Picked up": "Recogido",
  "Downloaded": "Descargado",
  "Returned": "Devuelto",
  "Tracking": "Seguimiento",
  "Fulfilled": "Completado",
  "Tracking # (optional)": "N.º de seguimiento (opcional)",
  "Mark shipped": "Marcar como enviado",
  // Publish requirements ("Agregar <label>")
  "stage name": "nombre artístico",
  "home base": "ubicación base",
  "a bio": "una biografía",
  "1 language": "1 idioma",
  // Profile performance, Pro-gated
  "Page analytics are part of Pro": "El análisis de la página es parte de Pro",
  "Your profile views and inquiry conversion are being recorded right now. Upgrade to Pro or Portfolio to see them.":
    "Las visitas a tu perfil y la conversión de consultas se están registrando ahora mismo. Mejora a Pro o Portfolio para verlas.",
  // Talent field + skills server messages (Services drawer save banner)
  "Couldn't read the current services.": "No se pudieron leer los servicios actuales.",
  "Couldn't remove services.": "No se pudieron quitar los servicios.",
  "Couldn't update services.": "No se pudieron actualizar los servicios.",
  "Couldn't validate selected services.": "No se pudieron validar los servicios seleccionados.",
  "Field no longer accepts input.": "Este campo ya no admite datos.",
  "Missing profile.": "Falta el perfil.",
  "Only workspace admins can unverify services.": "Solo los administradores del espacio pueden quitar la verificación de servicios.",
  "Only workspace admins can verify services.": "Solo los administradores del espacio pueden verificar servicios.",
  "Service not found on this profile.": "No se encontró el servicio en este perfil.",
  "Some selected contexts are invalid.": "Algunos contextos seleccionados no son válidos.",
  "Some selected services are no longer available.": "Algunos servicios seleccionados ya no están disponibles.",
  "Talent is not on any active roster.": "Este talento no está en ninguna lista activa.",
  "That service is no longer on this profile — reload and try again.":
    "Ese servicio ya no está en este perfil. Recarga e inténtalo de nuevo.",
  "This field becomes editable once you join an agency.": "Este campo se podrá editar cuando te unas a una agencia.",
  "This field can only be edited by the workspace admin.": "Este campo solo lo puede editar el administrador del espacio.",
  "This field is not available for your profile.": "Este campo no está disponible para tu perfil.",
  "This field is private and can't be shown publicly.": "Este campo es privado y no se puede mostrar públicamente.",
  "Unknown field.": "Campo desconocido.",
};
