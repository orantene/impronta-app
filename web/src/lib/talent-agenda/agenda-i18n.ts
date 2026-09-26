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
  "No-show": "No presentación",
  Requested: "Solicitado",
  "On hold": "En hold",
  "Hold expired": "Hold vencido",

  // Payment states
  "Not requested": "Sin solicitud",
  "Awaiting deposit": "Esperando depósito",
  "Checking payment": "Verificando pago",
  "Due at appointment": "Pago en cita",
  "Deposit paid": "Depósito pagado",
  Paid: "Pagado",
  Overdue: "Vencido",
  "Refund pending": "Reembolso pendiente",
  "Paid by agency": "Pagado por agencia",

  // Today page
  Hi: "Hola",
  "Hi,": "Hola,",
  "View all": "Ver todo",
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
  "Send request": "Enviar solicitud",
  "Creating link…": "Creando enlace…",

  // Finish collect
  "Finish and collect": "Finalizar y cobrar",
  "Collect deposit": "Cobrar depósito",
  "Creating deposit link…": "Creando enlace de depósito…",
  "Deposit link created ✓": "Enlace de depósito creado ✓",
  "Send on WhatsApp": "Enviar por WhatsApp",
  "Adjust lines": "Ajustar líneas",
  "Complete booking": "Completar reserva",
  "Completing…": "Completando…",

  // Reschedule
  "Reschedule": "Reagendar",
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
  "Collected in September": "Cobrado en septiembre",
  "Still to collect": "Por cobrar",
  "Due by today": "Por cobrar hasta hoy",
  "Next payout": "Próximo pago",
  "Next payout · estimated": "Próximo pago · estimado",
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
  "Amount (MXN)": "Importe (MXN)",
  "Add extras or deductions before closing out.":
    "Añade extras o descuentos antes de cerrar.",
  "Line description": "Descripción",
  Amount: "Importe",
  "Card needs an amount due": "La tarjeta necesita un importe pendiente",
  "Confirm transfer": "Confirmar transferencia",
  "Review intake": "Revisar intake",
  "Respond to reschedule": "Responder al cambio de fecha",
  "Reschedule proposed": "Cambio de fecha propuesto",
  "Accept to move the booking. Decline keeps the current time.":
    "Acepta para mover la reserva. Rechazar mantiene la hora actual.",
  "Accept to move the booking. Decline keeps the current time. Deposit stays with the booking.":
    "Acepta para mover la reserva. Rechazar mantiene la hora actual. El depósito se queda con la reserva.",
  "Accept new time": "Aceptar nueva hora",
  "Decline new time": "Rechazar nueva hora",
  "Booking moved. Deposit kept. Old time is free.":
    "Reserva movida. Depósito conservado. La hora anterior queda libre.",
  "Reschedule declined. Current time kept.":
    "Cambio de fecha rechazado. Se mantiene la hora actual.",
  Event: "Evento",
  Guests: "Invitados",
  Diet: "Dieta",
  Kitchen: "Cocina",
  Menu: "Menú",
  Prep: "Prep",
  Performance: "Performance",
  "Call time": "Hora de llamado",
  Sets: "Sets",
  "Venue rules": "Reglas del venue",
  Intake: "Intake",
  Status: "Estado",
  "Not received": "No recibido",
  "Resend form": "Reenviar formulario",
  "Time zones": "Zonas horarias",
  Estimate: "Estimación",
  "Booked to the top of the range. Finishing early frees the rest.":
    "Reservado al tope del rango. Terminar antes libera el resto.",
  Range: "Rango",
  Project: "Proyecto",
  Stage: "Etapa",
  Deliverables: "Entregables",
  Due: "Vence",
  "Calendar hold": "Hold de calendario",
  "This slot is reserved while the client completes the booking.":
    "Este horario está reservado mientras el cliente completa la reserva.",
  "This slot is reserved while the client completes the booking. It expires if not converted.":
    "Este horario está reservado mientras el cliente completa la reserva. Caduca si no se convierte.",
  "This booking is confirmed. Mark complete after the work is done.":
    "Esta reserva está confirmada. Márcala completa cuando termine el trabajo.",
  "This booking was cancelled.": "Esta reserva fue cancelada.",
  Request: "Solicitud",
  "Not blocking your time until you accept.": "No bloquea tu tiempo hasta que aceptes.",
  "Agency client": "Cliente de agencia",
  "Agency-managed": "Gestionado por agencia",
  Agreed: "Acordado",
  "Flexible timing": "Horario flexible",
  "As agreed": "Según lo acordado",
  "Client on hold": "Cliente en hold",
  "Creates a pay link you can open or send. Works even without a prior order.":
    "Crea un enlace de pago que puedes abrir o enviar. Funciona aunque no haya un pedido previo.",
  "Marks transfer awaiting. Confirm when the money lands.":
    "Marca la transferencia como pendiente. Confirma cuando llegue el dinero.",
  "Pay link ready": "Enlace de pago listo",
  "Could not record cash": "No se pudo registrar el efectivo",
  "Could not mark transfer": "No se pudo marcar la transferencia",
  "Could not create pay link": "No se pudo crear el enlace",
  "Could not complete": "No se pudo completar",
  "Booking completed as unpaid.": "Reserva completada como impaga.",
  "Booking completed. Cash recorded with you (no card payout).":
    "Reserva completada. Efectivo registrado contigo (sin pago con tarjeta).",
  "Booking completed. Transfer marked awaiting until you confirm paid.":
    "Reserva completada. Transferencia pendiente hasta que confirmes el cobro.",
  "Booking completed. Card link ready — open it on this phone or send it.":
    "Reserva completada. Enlace de tarjeta listo: ábrelo en este teléfono o envíalo.",
  "Convert to a confirmed booking or release the hold to free the slot.":
    "Convierte a reserva confirmada o libera el hold para liberar el horario.",
  "Convert to booking": "Convertir a reserva",
  "Confirm: convert this hold to a booking?": "¿Confirmar: convertir este hold a reserva?",
  "Confirm: release this hold?": "¿Confirmar: liberar este hold?",
  Confirm: "Confirmar",
  Cancel: "Cancelar",
  "Hold converted to a confirmed booking.": "Hold convertido a reserva confirmada.",
  "Hold released.": "Hold liberado.",
  "Could not convert": "No se pudo convertir",
  "Release failed": "Falló la liberación",
  "Available after the start time": "Disponible después de la hora de inicio",
  "Marking no-show…": "Marcando no presentación…",
  "Marked no-show ✓": "Marcado como no presentación ✓",
  "Could not mark no-show": "No se pudo marcar no presentación",
  "Cancelling…": "Cancelando…",
  "Cancelled ✓": "Cancelado ✓",
  "Cancel failed": "Falló la cancelación",
  "Refund of": "Reembolso de",
  initiated: "iniciado",
  All: "Todos",
  Requests: "Solicitudes",
  "New date": "Nueva fecha",
  Start: "Inicio",
  End: "Fin",
  "Reschedule fee (optional)": "Cargo por cambio (opcional)",
  "Leave at 0 to reschedule at no extra charge.":
    "Déjalo en 0 para cambiar sin cargo extra.",
  "The client will be notified and must accept before the booking moves.":
    "Se avisará al cliente y debe aceptar antes de mover la reserva.",
  "Reschedule request sent ✓": "Solicitud de cambio enviada ✓",
  Client: "Cliente",
  Name: "Nombre",
  "Work and time": "Trabajo y hora",
  Service: "Servicio",
  Payment: "Pago",
  "Record payment received": "Registrar pago recibido",
  "Due later": "Pagar después",
  "Request a payment link": "Pedir un enlace de pago",
  "Collect later (no link yet)": "Cobrar después (sin enlace aún)",
  "Does not create a pay link. Open Request payment from the booking when you are ready.":
    "No crea un enlace de pago. Abre Solicitar pago desde la reserva cuando estés listo.",
  "Save stays off until a payment choice is selected.":
    "Guardar se queda desactivado hasta elegir un pago.",
  Save: "Guardar",
  "Try one of these:": "Prueba una de estas:",
  "No order attached — payment links require a booking or POS order.":
    "Sin pedido: los enlaces de pago requieren una reserva o un pedido POS.",
  "Link created ✓": "Enlace creado ✓",
  "Could not save. Try another time.": "No se pudo guardar. Prueba otra hora.",
  "Payment recorded as received. The client has not been told.":
    "Pago registrado como recibido. El cliente no ha sido avisado.",
  "Payment link still needed. The client has not been told.":
    "Aún falta el enlace de pago. El cliente no ha sido avisado.",
  "Saved as unpaid. Request a payment link from the booking when you are ready. The client has not been told.":
    "Guardado sin pagar. Pide un enlace de pago desde la reserva cuando estés listo. El cliente no ha sido avisado.",
  "Due later. The client has not been told.":
    "Pago después. El cliente no ha sido avisado.",
  Failed: "Falló",

  // Booking record (request flow)
  Accept: "Aceptar",
  "Accepting…": "Aceptando…",
  "Accepting re-checks the hour on the server. Suggest another time keeps the request open. Decline closes it.":
    "Aceptar vuelve a comprobar la hora en el servidor. Sugerir otra hora mantiene la solicitud abierta. Rechazar la cierra.",
  "Open Messages to accept this request.": "Abre Mensajes para aceptar esta solicitud.",
  "Accepted. The hour was re-checked on the server.":
    "Aceptado. La hora se volvió a comprobar en el servidor.",
  "Could not accept": "No se pudo aceptar",
  "Suggest another time": "Sugerir otra hora",
  "Declining…": "Rechazando…",
  "Declined. The request is closed.": "Rechazado. La solicitud está cerrada.",
  "Could not decline": "No se pudo rechazar",
  "Decline request": "Rechazar solicitud",
  "Finished and collected ✓": "Finalizado y cobrado ✓",
  "Reschedule proposed. Waiting for the client.":
    "Cambio de fecha propuesto. Esperando al cliente.",
  "Mark transfer received": "Marcar transferencia recibida",
  "Transfer marked received ✓": "Transferencia marcada como recibida ✓",
  "Could not confirm transfer": "No se pudo confirmar la transferencia",
  Terms: "Términos",
  "Cancel this booking?": "¿Cancelar esta reserva?",
  "This cannot be undone. Any refund due is calculated when you confirm.":
    "Esto no se puede deshacer. El reembolso pendiente se calcula al confirmar.",
  "Message client": "Mensaje al cliente",

  // Quotes
  "New event quote": "Nueva cotización de evento",
  "New project quote": "Nueva cotización de proyecto",
  What: "Qué",
  "Event date": "Fecha del evento",
  "Hold this date for a few days": "Reservar esta fecha unos días",
  "Saves a draft only. No client email is sent. Nothing is reserved until accepted.":
    "Solo guarda un borrador. No se envía correo al cliente. Nada queda reservado hasta que se acepte.",
  "Saves a draft only. No client email is sent. Nothing is reserved until accepted, except the optional hold. Other requests still show.":
    "Solo guarda un borrador. No se envía correo al cliente. Nada queda reservado hasta que se acepte, salvo el hold opcional. Otras solicitudes siguen visibles.",
  "Save draft": "Guardar borrador",
  "Could not save draft": "No se pudo guardar el borrador",
  "Draft saved. Date blocked while the draft is out. Nothing else is reserved until accepted.":
    "Borrador guardado. La fecha queda bloqueada mientras el borrador está activo. Nada más queda reservado hasta que se acepte.",
  "Draft saved. Nothing is reserved until the quote is accepted.":
    "Borrador guardado. Nada queda reservado hasta que se acepte la cotización.",
  "Due date": "Fecha de entrega",
  "Project draft saved. Due dates appear on your calendar. No appointment was created. No client email was sent.":
    "Borrador de proyecto guardado. Las fechas de entrega aparecen en tu calendario. No se creó cita. No se envió correo al cliente.",
  "Saves a draft only. No appointment is created. Due dates appear in your calendar all-day row once saved.":
    "Solo guarda un borrador. No se crea cita. Las fechas de entrega aparecen en la fila de todo el día del calendario al guardar.",
  target: "objetivo",

  // Rebook
  "Save rebook": "Guardar reagendado",
  "Could not rebook. Try another time.": "No se pudo reagendar. Prueba otra hora.",
  "Rebook saved. The client has not been told yet.":
    "Reagendado guardado. El cliente aún no ha sido avisado.",
  Note: "Nota",
  Starts: "Inicia",
  Ends: "Termina",
  client: "cliente",

  // Calendar month chips
  Holds: "En hold",
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
