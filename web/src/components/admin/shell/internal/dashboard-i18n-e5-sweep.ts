/**
 * Spanish for the E5 copy sweep (TUL-702, TUL-721): the sidebar tooltips that
 * were still English, the independent-Profesional wording on booking terms,
 * and the trust pill. A separate table because dashboard-i18n.ts is held only
 * by the size ratchet; the rail table folds this one in.
 */
export const E5_SWEEP_ES_TEXT: Record<string, string> = {
  // Sidebar tooltips (PAGE_META descriptions).
  "Appointments, sessions and series, with the series editor":
    "Citas, sesiones y series, con el editor de series",
  "The host stand: today's book, arrivals, and who is still unseated":
    "La recepción: las reservas de hoy, las llegadas y quién aún no tiene mesa",
  "Every order taken, and what is still owed on each":
    "Cada pedido tomado y lo que aún se debe de cada uno",
  "Jobs with a brief, a crew and a deadline": "Trabajos con un brief, un equipo y una fecha límite",
  "Your own shifts, bookings and jobs": "Tus propios turnos, reservas y trabajos",
  "Refunds, tickets, inquiries and jobs that need a human":
    "Reembolsos, tickets, consultas y trabajos que necesitan a una persona",
  "What this workspace sells, and what customers can order":
    "Lo que vende este espacio y lo que los clientes pueden pedir",
  "Ticketed events: tiers, lineup, sales, and the door":
    "Eventos con entradas: niveles, programa, ventas y la puerta",
  "Rooms, tables and the open checks on them": "Salas, mesas y las cuentas abiertas en ellas",
  "Everyone who works here, is bookable here, or has access":
    "Todas las personas que trabajan aquí, se pueden reservar aquí o tienen acceso",
  "Reported reviews, review photos, and rating integrity":
    "Reseñas reportadas, fotos de reseñas e integridad de las calificaciones",
  "Funnel, money, website, and reviews": "Embudo, dinero, sitio web y reseñas",
  "Workspace-owned items customers can order from your site":
    "Artículos del espacio que los clientes pueden pedir desde tu sitio",
  // Booking terms for a Profesional who works on their own (TUL-721).
  "Each offer sets its own refund terms.": "Cada oferta define sus propios términos de reembolso.",
  "Signals the talent is happy to be booked without a back-and-forth. Whether instant-book is offered still depends on the project.":
    "Indica que aceptas ser reservado sin ida y vuelta. Que se ofrezca la reserva instantánea depende del proyecto.",
  // Trust pill.
  "Trust health": "Confianza",
  "Internal heuristic: verifications, claim status, account age, recent rejections.":
    "Cálculo interno: verificaciones, estado del reclamo, antigüedad de la cuenta y rechazos recientes.",
};
