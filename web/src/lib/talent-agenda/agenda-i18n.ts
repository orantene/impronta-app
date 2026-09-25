/**
 * Agenda V2 i18n strings — EN + ES.
 * Usage: `const t = agendaI18n(locale); t("Today")`
 */

export type AgendaLocale = "en" | "es";

const ES: Record<string, string> = {
  // Navigation
  Today: "Hoy",
  Calendar: "Calendario",
  "Needs attention": "Necesita atención",
  Availability: "Disponibilidad",
  "New booking": "Nueva reserva",
  "Back to calendar": "Volver al calendario",
  Back: "Atrás",

  // Status chips
  Hold: "Reserva temporal",
  Confirmed: "Confirmado",
  Completed: "Completado",
  Cancelled: "Cancelado",
  "No show": "No presentó",
  Requested: "Solicitado",

  // Payment states
  "Awaiting deposit": "Esperando depósito",
  "Due at appointment": "Pago en cita",
  Paid: "Pagado",
  Overdue: "Vencido",
  "Refund pending": "Reembolso pendiente",
  "Paid by agency": "Pagado por agencia",

  // Today page
  "Hi,": "Hola,",
  "Nothing needs attention": "Sin elementos que atender",
  "Next up": "A continuación",
  "Rest of today": "El resto de hoy",
  "Nothing coming up yet": "Nada próximamente",
  "The rest of today is open": "El resto del día está libre",

  // Calendar page
  "Bookings, holds, and availability": "Reservas, bloqueos y disponibilidad",
  "Clear week ahead": "Semana despejada",
  "Nothing on today's calendar": "Nada en el calendario hoy",
  "No upcoming events": "Sin eventos próximos",

  // Booking record
  When: "Cuándo",
  Where: "Dónde",
  "Came from": "Origen",
  Message: "Mensaje",
  "Mark finished": "Marcar como terminado",
  "Cancel booking": "Cancelar reserva",
  "Mark no-show": "Marcar sin presentación",
  "More actions": "Más acciones",

  // Availability
  "Booking hours": "Horario de reservas",
  "Your timezone": "Tu zona horaria",
  "Weekly schedule": "Horario semanal",
  Monday: "Lunes",
  Tuesday: "Martes",
  Wednesday: "Miércoles",
  Thursday: "Jueves",
  Friday: "Viernes",
  Saturday: "Sábado",
  Sunday: "Domingo",
  Unavailable: "No disponible",
  "Save hours": "Guardar horario",
  "Existing date exceptions are kept.": "Las excepciones de fecha existentes se conservan.",

  // Readiness
  "Get started": "Comenzar",
  "steps complete": "pasos completados",
  "Welcome to your agenda": "Bienvenido/a a tu agenda",
  "Add your display name": "Añade tu nombre para mostrar",
  "Set your home city": "Establece tu ciudad",
  "Upload a profile photo": "Sube una foto de perfil",
  "Add at least one service": "Añade al menos un servicio",
  "Connect payouts": "Conecta pagos",
  "Set your booking hours": "Configura tu horario de reservas",

  // Pay request
  "Request payment": "Solicitar pago",
  "Amount (USD)": "Importe (USD)",
  "Send request": "Enviar solicitud",
  "Creating link…": "Creando enlace…",

  // Finish collect
  "Finish and collect": "Finalizar y cobrar",
  "Adjust lines": "Ajustar líneas",
  "Complete booking": "Completar reserva",
  "Completing…": "Completando…",

  // Reschedule
  "Propose reschedule": "Proponer cambio de fecha",
  "Send proposal": "Enviar propuesta",
  "Sending…": "Enviando…",

  // Rebook
  "Suggest a new date": "Sugerir nueva fecha",
  "Send suggestion": "Enviar sugerencia",
  "Suggestion sent ✓": "Sugerencia enviada ✓",

  // Honesty / calendar polish
  "Release hold": "Liberar reserva",
  "Open booking": "Abrir reserva",
  Collect: "Cobrar",
  Reply: "Responder",
  "Free times": "Huecos libres",
  "No free gaps": "Sin huecos libres",
  Deadline: "Entrega",
  Month: "Mes",
  Refresh: "Actualizar",
  Dismiss: "Cerrar",
  "Could not load your agenda": "No se pudo cargar tu agenda",
  "Nothing else changed.": "Nada más cambió.",
  "Working…": "Trabajando…",

  // First-day / availability / money
  "Set up your day": "Prepara tu día",
  "Add a photo": "Añade una foto",
  "Add a service": "Añade un servicio",
  "Set your location": "Define tu ubicación",
  "Set availability": "Configura disponibilidad",
  "Preview your page": "Vista previa de tu página",
  "Create your website": "Crea tu sitio",
  "Book a time": "Reservar un horario",
  "Request a booking": "Pedir una reserva",
  "% ready": "% listo",
  "Your page is live": "Tu página está publicada",
  View: "Ver",
  Edit: "Editar",
  Live: "En vivo",
  "Collected this month": "Cobrado este mes",
  "Still to collect": "Por cobrar",
  "Next payout": "Próximo pago",
  "See payouts": "Ver pagos",
  "No payout": "Sin pago",
  "not shared": "sin dato",
  "Time off and one-day hours": "Ausencias y horarios de un día",
  "Closed all day": "Cerrado todo el día",
  Closed: "Cerrado",
  Add: "Añadir",
  Remove: "Quitar",
  "Direct booking": "Reserva directa",
  "Save availability": "Guardar disponibilidad",
  "Saving…": "Guardando…",
  "Availability saved.": "Disponibilidad guardada.",
  "Talent agenda": "Agenda de talento",
  "Open calendar": "Abrir calendario",
  "most urgent first": "los más urgentes primero",
  items: "elementos",
  "Agenda could not load": "No se pudo cargar la agenda",
  "This item left Needs attention after the action succeeded.":
    "Este elemento salió de Necesita atención tras la acción.",
  "Nothing needs attention right now": "Nada necesita atención ahora",
  "When a request arrives or a hold needs action, it will appear here in urgency order.":
    "Cuando llegue una solicitud o un hold necesite acción, aparecerá aquí por urgencia.",
  "Requests need a service and a location. Booking a time also needs availability.":
    "Las solicitudes necesitan un servicio y una ubicación. Reservar un horario también necesita disponibilidad.",
  Readiness: "Preparación",
  ready: "listo",
  Sun: "Dom",
  Mon: "Lun",
  Tue: "Mar",
  Wed: "Mié",
  Thu: "Jue",
  Fri: "Vie",
  Sat: "Sáb",
  to: "a",
  Date: "Fecha",
  "Buffer (minutes)": "Buffer (minutos)",
  Timezone: "Zona horaria",
  "Weekly hours, time off, buffer, and timezone. Travel stays on each booking.":
    "Horario semanal, ausencias, buffer y zona. El viaje queda en cada reserva.",
  "Closed dates block bookings. Alternate windows replace that day's weekly hours.":
    "Las fechas cerradas bloquean reservas. Ventanas alternativas reemplazan el horario de ese día.",
  "No exceptions yet.": "Sin excepciones aún.",
  "Let clients book open times on your page without a message first.":
    "Permite que clientes reserven horarios libres en tu página sin escribir primero.",
  "Cash stays with you. There is no card payout.":
    "El efectivo se queda contigo. No hay pago con tarjeta.",
  Week: "Semana",
  Day: "Día",
  List: "Lista",
  "Calendar view": "Vista de calendario",
  "Add event or block": "Añadir evento o bloqueo",
  "Block time": "Bloquear tiempo",
  "Time blocked": "Tiempo bloqueado",
  Undo: "Deshacer",
  Now: "Ahora",
  "Not blocking": "No bloquea",
  Suggestion: "Sugerencia",
  Rebook: "Reagendar",
  Close: "Cerrar",
  This: "Esta",
  week: "semana",
  "This week": "Esta semana",
  appointments: "citas",
  "Nothing next": "Nada a continuación",
  "The rest of the day is open.": "El resto del día está libre.",
  "Nothing else today": "Nada más hoy",
  "Open the calendar to see the week.": "Abre el calendario para ver la semana.",
  "How was it paid?": "¿Cómo se pagó?",
  Cash: "Efectivo",
  Card: "Tarjeta",
  Transfer: "Transferencia",
  "Not paid yet": "Aún no pagado",
  "Complete stays off until a method is selected.":
    "Completar se queda desactivado hasta elegir un método.",
};

export function agendaI18n(locale: AgendaLocale = "en") {
  return function t(key: string): string {
    if (locale === "es") return ES[key] ?? key;
    return key;
  };
}

/** React-hook-compatible translator for the Agenda V2 surface. */
export function useAgendaI18n(locale: AgendaLocale = "en") {
  return { t: agendaI18n(locale) };
}
