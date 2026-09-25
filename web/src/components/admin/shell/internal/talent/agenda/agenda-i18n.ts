/**
 * T9.4 Agenda V2 EN / ES strings. Prefer useDashboardText for shell keys;
 * use these for agenda-only copy that is not yet in the dashboard catalog.
 */

export const AGENDA_I18N = {
  en: {
    needsAttention: "Needs attention",
    viewAll: "View all",
    nextUp: "Next up",
    restOfToday: "Rest of today",
    newBooking: "New booking",
    openCalendar: "Open calendar",
    availability: "Availability",
    blockTime: "Block time",
    cancelBooking: "Cancel booking",
    markNoShow: "Mark no-show",
    requestPayment: "Request payment",
    finishCollect: "Finish and collect",
    nothingNeedsAttention: "Nothing needs attention",
    emptyDay: "Empty day",
  },
  es: {
    needsAttention: "Necesita atención",
    viewAll: "Ver todo",
    nextUp: "Siguiente",
    restOfToday: "Resto del día",
    newBooking: "Nueva reserva",
    openCalendar: "Abrir calendario",
    availability: "Disponibilidad",
    blockTime: "Bloquear tiempo",
    cancelBooking: "Cancelar reserva",
    markNoShow: "Marcar no-show",
    requestPayment: "Pedir pago",
    finishCollect: "Terminar y cobrar",
    nothingNeedsAttention: "Nada necesita atención",
    emptyDay: "Día vacío",
  },
} as const;

export type AgendaLocale = keyof typeof AGENDA_I18N;

export function agendaT(locale: AgendaLocale, key: keyof typeof AGENDA_I18N.en): string {
  return AGENDA_I18N[locale][key] ?? AGENDA_I18N.en[key];
}
