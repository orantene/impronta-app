/**
 * Spanish (tú) for Website settings (WSF F1). Kept out of dashboard-i18n.ts,
 * which sits at its size-ratchet budget; folded into WEBSITE_ES_TEXT so the
 * grandfathered map keeps one spread.
 */

export const WEBSITE_SETTINGS_ES_TEXT: Record<string, string> = {
  "Policies and privacy": "Políticas y privacidad",
  "Paying in person": "Pago en persona",
  "Shown on your policies": "Se muestra en tus políticas",
  Cash: "Efectivo",
  "Bank transfer": "Transferencia",
  "Card on your terminal": "Tarjeta con tu terminal",
  "Cancelling, deposit and what your clients read before they book":
    "Cancelación, anticipo y lo que leen tus clientas antes de reservar",
  "Website settings": "Ajustes del sitio",
  "How clients book, timing, payments and cancelling": "Cómo reservan tus clientes, horarios, pagos y cancelaciones",
  "Services & booking": "Servicios y reservas",
  "Availability & timing": "Disponibilidad y horarios",
  "Client self-service": "Autogestión del cliente",
  "Saved · live now": "Guardado · ya en vivo",
  "{n} unsaved": "{n} sin guardar",
  "Couldn’t save": "No se pudo guardar",
  "Retry save": "Reintentar guardar",
  "Leave without saving?": "¿Salir sin guardar?",
  "You have 1 unsaved change.": "Tienes 1 cambio sin guardar.",
  "You have {n} unsaved changes.": "Tienes {n} cambios sin guardar.",
  "Save and leave": "Guardar y salir",
  "Discard changes": "Descartar cambios",
  "Keep editing": "Seguir editando",
  "Live on Save. Nothing changes for clients until you save.":
    "En vivo al guardar. Nada cambia para tus clientes hasta que guardes.",
  "Your settings could not load. Try again in a moment.": "Tus ajustes no se pudieron cargar. Inténtalo de nuevo en un momento.",
  "{before} min before · {after} min after · {notice} h notice":
    "{before} min antes · {after} min después · {notice} h de aviso",
  "Deposit {pct}% when they book": "Anticipo del {pct}% al reservar",
  "No deposit": "Sin anticipo",
  "Free cancelling until {c} h · rescheduling until {r} h": "Cancela gratis hasta {c} h · reprograma hasta {r} h",
  "Default": "Por defecto",
  "Default booking mode": "Modo de reserva por defecto",
  // WSF B2: same wording as the Services editor (global map).
  "Instant booking": "Reserva instantánea",
  "Inquiry only": "Solo consulta",
  "{n} of {total} with their own setting": "{n} de {total} con su propio ajuste",
  "Search services": "Buscar servicios",
  "You have no services yet.": "Aún no tienes servicios.",
  "No service matches.": "Ningún servicio coincide.",
  "Custom": "Propio",
  "Inherited": "Heredado",
  "Custom for this service": "Propio de este servicio",
  "Services follow 'Inquiry only' right now. Switch your default to change a service.":
    "Tus servicios siguen 'Solo consulta' por ahora. Cambia tu opción predeterminada para modificar un servicio.",
  "Untitled service": "Servicio sin nombre",
  "Preparation before": "Preparación antes",
  "Blocked before the appointment. Clients don't see it.": "Se bloquea antes de la cita. Tus clientes no lo ven.",
  "Cleanup after": "Limpieza después",
  "Blocked after the appointment.": "Se bloquea después de la cita.",
  "Minimum notice": "Aviso mínimo",
  "Less": "Menos",
  "More": "Más",
  "The balance is paid at the visit.": "El resto se paga en la visita.",
  "Every service starts with this. A service with its own deposit keeps it.":
    "Cada servicio empieza con esto. Un servicio con su propio anticipo lo mantiene.",
  "Sets the cancellation window shown to clients ({hours} hours). Refunds follow your published policy.":
    "Define la ventana de cancelación que ven los clientes ({hours} horas). Los reembolsos siguen tu política publicada.",
  "Inside {hours} hours the deposit is kept. The client is refunded in full before that.":
    "Dentro de las {hours} horas se retiene el anticipo. Antes de eso se reembolsa todo al cliente.",
  "The deposit moves to the new date. Inside {hours} hours it is kept and a new one is asked for.":
    "El anticipo pasa a la nueva fecha. Dentro de las {hours} horas se retiene y se pide uno nuevo.",
  "Applies to your website and Tulala profile.": "Aplica a tu sitio y a tu perfil de Tulala.",
  "Services set to instant booking can be booked on the spot. The rest take inquiries.":
    "Los servicios con reserva inmediata se reservan al momento. Los demás reciben consultas.",
  "Every service takes an inquiry. You talk first, then arrange the work.":
    "Todos los servicios reciben consultas. Primero hablan y luego acuerdan el trabajo.",
  "Needs a fixed price and its booking details first. Set them in Services.":
    "Primero necesita un precio fijo y sus datos de reserva. Ponlos en Servicios.",
  "{mode} by default · {n} of {total} services with their own setting": "{mode} por defecto · {n} de {total} servicios con ajuste propio",
  "Request to book": "Pedir reserva",
  "Request a quote": "Pedir cotización",
  "They pick a free time and it is booked": "Eligen un horario libre y queda reservado",
  "You approve before anything is held": "Tú apruebas antes de apartar nada",
  "They message you first, nothing is booked": "Te escriben primero, no se reserva nada",
  "You agree the amount with each client": "Acuerdas el monto con cada cliente",
  "This changes {n} services. The {m} with their own setting stay unchanged.":
    "Esto cambia {n} servicios. Los {m} con su propio ajuste no cambian.",
  "{n} of them will take requests until they have a fixed price: {names}":
    "{n} de ellos recibirán solicitudes hasta que tengan un precio fijo: {names}",
  "Quote services agree the price first. Change the price in Services to book instantly.":
    "En los servicios con cotización primero acuerdas el precio. Cambia el precio en Servicios para reservar al instante.",
  "Inherited from your default": "Sigue tu opción predeterminada",
  "{n} with their own setting": "{n} con su propio ajuste",
  "Default deposit": "Anticipo por defecto",
  "Uses your default": "Usa tu ajuste por defecto",
  "Reset to default": "Volver al ajuste por defecto",
  "Inherited from your default. Give it its own value in Services.":
    "Heredado de tu ajuste por defecto. Dale su propio valor en Servicios.",
  "Custom for this service. It takes a deposit to book instantly, so it keeps its own. Change it in Services.":
    "Propio de este servicio. Pide anticipo para reservar al momento, así que mantiene el suyo. Cámbialo en Servicios.",
  "Free cancelling until {c} h": "Cancela gratis hasta {c} h",
  "Nothing sooner than this can be booked. Editing it here comes later.":
    "No se puede reservar nada con menos aviso. Podrás editarlo aquí más adelante.",
  "No changes yet. Edit a setting to save.": "Aún no hay cambios. Edita un ajuste para guardar.",
  // WSF-C: switches and readiness.
  "Chat & inquiries": "Chat y consultas",
  "Appearance & visibility": "Apariencia y visibilidad",
  "Accept new bookings": "Aceptar nuevas reservas",
  "Pause keeps your website, portfolio and chat visible. Existing clients keep their booking links and conversations.":
    "Pausar mantiene visibles tu sitio, tu portafolio y el chat. Tus clientes actuales conservan sus enlaces de reserva y sus conversaciones.",
  "Agency bookings are managed by each agency.": "Las reservas de agencia las gestiona cada agencia.",
  "Website chat": "Chat del sitio",
  "Off hides the chat button. Existing conversations stay and you can still reply.":
    "Apagado oculta el botón de chat. Las conversaciones actuales se quedan y puedes seguir respondiendo.",
  "'Consultar' will open an inquiry form so inquiry-only services still reach you.":
    "'Consultar' abrirá un formulario de consulta para que los servicios solo por consulta te sigan llegando.",
  "Accept new inquiries": "Aceptar nuevas consultas",
  "Off hides Ask and Consultar. Clients with a booking can still message you.":
    "Apagado oculta Preguntar y Consultar. Los clientes con una reserva aún pueden escribirte.",
  "This service will show as unavailable: {services}": "Este servicio se mostrará como no disponible: {services}",
  "These {n} services will show as unavailable: {services}":
    "Estos {n} servicios se mostrarán como no disponibles: {services}",
  "Some changes saved": "Algunos cambios se guardaron",
  "Some changes saved. Still unsaved: {items}. Retry sends only these.":
    "Algunos cambios se guardaron. Falta guardar: {items}. Reintentar envía solo esos.",
  "Your defaults": "Tus ajustes por defecto",
  "Chat on": "Chat activo",
  "Chat off": "Chat apagado",
  "Taking inquiries": "Recibiendo consultas",
  "Inquiries paused": "Consultas en pausa",
  "Taking new bookings": "Recibiendo nuevas reservas",
  "New bookings paused": "Nuevas reservas en pausa",
  "Instant booking comes with the Website plan": "La reserva inmediata viene con el plan Website",
  "Add working hours to turn on instant booking": "Agrega tu horario de trabajo para activar la reserva inmediata",
  "Add a duration to this service to turn on instant booking":
    "Agrega una duración a este servicio para activar la reserva inmediata",
  // PAY-2 Option B — platform Checkout readiness, not Connect.
  "Turn on online payments to take deposits": "Activa el pago en línea para cobrar señas",
};
