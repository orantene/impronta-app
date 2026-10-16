/**
 * Spanish for dashboard strings that reached Spanish screens in English
 * (TUL-146, 2026-10-16 sweep): every `copy.t("...")` literal with no entry in
 * the merged ES_TEXT map. Covers the Pro-gated analytics card, the Web Office
 * plan states, the website activation nudge, the duplicate-review screen, the
 * stale-deployment banner and a few labels. The profile-performance card keys
 * are in dashboard-i18n-leaks-1007.ts (PR #3560). No em dashes. Merged into
 * ES_TEXT through dashboard-i18n-rail.ts.
 */
export const LEAKS_146_ES_TEXT: Record<string, string> = {
  // Participant thread shell
  "Unknown": "Desconocido",

  // Invite link note (profile modals)
  "Recorded on the invite. Send the link yourself; SMS delivery is not switched on.":
    "Registrado en la invitación. Envía el enlace por tu cuenta; el envío por SMS no está activado.",

  // Analytics card
  "Profile views · 7d": "Visitas al perfil · 7 d",
  "Profile views · 30d": "Visitas al perfil · 30 d",
  "unique viewers": "visitantes únicos",
  "Inquiries · 30d": "Consultas · 30 d",
  "in the last 7 days": "en los últimos 7 días",
  "Views per day · last 30 days": "Visitas por día · últimos 30 días",
  "Counted from views of your public profile pages and from inquiries you were named on. Booking accept rate, average day rate and per-client spend are not tracked yet.":
    "Se cuenta a partir de las visitas a tus páginas públicas de perfil y de las consultas en las que se te nombró. La tasa de aceptación de reservas, la tarifa promedio por día y el gasto por cliente aún no se miden.",
  "Page analytics — profile views and inquiry conversion — are part of Pro and Portfolio. Your views are being recorded now; upgrade to read them. Your earnings and pipeline are live on the Money page today.":
    "Las analíticas de páginas (visitas al perfil y conversión de consultas) forman parte de Pro y Portfolio. Tus visitas se están registrando ahora; mejora tu plan para verlas. Tus ingresos y tu flujo ya están disponibles hoy en la página de Dinero.",

  // Stale deployment banner
  "Reload": "Recargar",

  // Duplicate review screen
  "Price and length": "Precio y duración",
  "Booking rules": "Reglas de reserva",

  // Location settings card
  "Neighbourhood": "Colonia",

  // Website activation nudge
  "Your website exists but is not live yet. Publish it to give clients a real address to visit.":
    "Tu sitio ya existe, pero aún no está en línea. Publícalo para darles a tus clientes una dirección real que visitar.",
  "Activate it and we build it from your profile": "Actívalo y lo armamos a partir de tu perfil",
  "Finish setup": "Terminar la configuración",

  // Web Office plan states
  "Review your Web Office plan, then continue to card payment.":
    "Revisa tu plan de Oficina Web y continúa al pago con tarjeta.",
  "Payment is still processing.": "El pago aún se está procesando.",
  "The card was declined. Try again. One retry replaces the old link.":
    "Se rechazó la tarjeta. Inténtalo de nuevo. Un nuevo intento reemplaza el enlace anterior.",
  "Web Office is on.": "Oficina Web está activa.",
  "Trial is active. No custom domain during the trial.":
    "La prueba está activa. No hay dominio propio durante la prueba.",
  "The trial has ended.": "La prueba terminó.",

  // Studio
  "Work flows": "Flujos de trabajo",
};
