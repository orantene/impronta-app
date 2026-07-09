/**
 * Workspace email copy fragment (EN + ES). Aggregated by `../email-copy.ts`.
 *
 * `WORKSPACE_ES: typeof WORKSPACE_EN` enforces key + shape parity at build
 * time. No `as const` — values stay `string` so ES can hold different words.
 *
 * Keys are the catalog `templateId` for each workspace email. Dynamic values
 * stay interpolated in the template via `{placeholder}` tokens:
 *   {name}   = recipient's name (coordinator/owner/admin)
 *   {brand}  = agency / account name
 *   plus payload-mirrored tokens ({event}, {talent}, {plan}, …).
 *
 * `BookingCanceled.tsx` is shared across three templateIds. Its frame text is
 * looked up under `workspace.booking_cancelled`; the sibling client/talent
 * subjects live here too so `getEmailSubject` localizes all three.
 */

export const WORKSPACE_EN = {
  "workspace.signup_welcome": {
    subject: "{workspaceName} is ready on Tulala",
    preview: "Your {workspace} workspace is ready",
    heading: "Your workspace is ready",
    intro:
      "Welcome, {name}. Your {plan} workspace, {workspace}, is live. Add your first talent, customize your public page, and start taking inquiries.",
    note: "Public link: {publicUrl}",
    button: "Open your dashboard →",
  },
  "workspace.team_invite": {
    subject: "{inviterName} invited you to {brand} on Tulala",
    preview: "Join {brand}",
    heading: "Join {brand}",
    intro: "{inviter} added you as {role}. Accept the invite to get into the workspace.",
    note: "Link expires {expires}.",
    button: "Accept invite →",
  },
  "roster.join_requested": {
    subject: "{talentName} wants to join your roster",
    preview: "{who} wants to join your roster",
    heading: "New roster request",
    intro:
      "{who} asked to join your roster from your public site. Review the request to approve or decline.",
    button: "Review request →",
  },
  "workspace.coordinator_assigned": {
    // {offeringSuffix} = ": <service title>" for storefront service requests,
    // "" for ordinary inquiries (missing vars interpolate to empty).
    subject: "New inquiry assigned to you{offeringSuffix}",
    preview: "New inquiry assigned to you",
    heading: "New inquiry assigned to you",
    intro: "Hi {name}, you've been assigned as coordinator for {event} at {brand}.",
    introWithDate: "Hi {name}, you've been assigned as coordinator for {event} at {brand}. The event is on {eventDate}.",
    note: "Review the inquiry and reach out to the client.",
    button: "Open inquiry →",
  },
  "workspace.form_submission": {
    subject: "New form submission — {formName}",
    subjectNoName: "New form submission — {formName}",
    preview: "New form submission from {name} — {form}",
    previewNoName: "New form submission — {form}",
    heading: "New form submission",
    intro: "A visitor submitted the {form} form on your {brand} site.",
    note: "Mark it as read or archive it in your forms inbox.",
    button: "Open inbox →",
    submittedFields: "Submitted fields",
    fieldForm: "Form",
    fieldName: "Name",
    fieldEmail: "Email",
    fieldReceived: "Received",
  },
  "workspace.offer_accepted": {
    subject: "An offer was accepted",
    preview: "Offer accepted",
    heading: "Offer accepted",
    intro: "Good news — the client accepted the offer for {event}.",
    note: "Confirm the booking and coordinate next steps.",
    button: "Open inquiry →",
    fieldTotal: "Total",
  },
  "workspace.offer_declined": {
    subject: "An offer was declined",
    preview: "Offer declined",
    heading: "Offer declined",
    intro: "The client declined the offer for {event}.",
    note: "You can revise the offer or follow up with the client.",
    button: "Open inquiry →",
  },
  "workspace.assignment_timed_out": {
    subject: "An inquiry needs a coordinator",
    preview: "An inquiry needs a coordinator",
    heading: "An inquiry needs a coordinator",
    intro:
      "Hi {name}, {event} hasn't been picked up automatically and is still waiting for a coordinator. Please assign someone so the client gets a timely reply.",
    note: "Open the inquiry to assign a coordinator.",
    button: "Assign coordinator →",
    fieldDate: "Date",
  },
  "workspace.talent_declined": {
    subject: "A talent declined an inquiry",
    preview: "A talent declined an inquiry",
    heading: "A talent declined",
    intro:
      "Hi {name}, {talent} declined the invite for {event}. You may want to line up an alternative or follow up with them.",
    note: "Open the inquiry to review the roster.",
    button: "Open inquiry →",
  },
  "workspace.booking_cancelled": {
    subject: "A booking was cancelled",
    preview: "Booking canceled",
    heading: "Booking canceled",
    intro: "{event} has been canceled.",
    note: "Check the inquiry for details and any follow-up needed.",
    button: "View details →",
    fieldDate: "Date",
  },
  "client.booking_cancelled": {
    subject: "Your booking was cancelled",
  },
  "talent.booking_cancelled": {
    subject: "A booking was cancelled",
  },
  "workspace.payment_received": {
    subject: "Payment received",
    preview: "Payment received",
    heading: "Payment received",
    intro: "A payment for {event} has been received.",
    note: "View the breakdown and payout status from the workspace.",
    button: "View payment →",
    fieldAmount: "Amount",
  },
  "workspace.over_seat_limit": {
    subject: "Your roster is over its plan limit",
    preview: "Your roster is over its plan limit",
    heading: "You've reached your roster limit",
    intro:
      "Hi {name}, {workspace} now has more talent on its roster than your {plan} plan allows. To keep adding talent — and make sure everyone stays visible and bookable — upgrade your plan or adjust your roster.",
    note: "Nothing is removed automatically. This is a heads-up so you can choose how to handle it.",
    button: "Manage your plan →",
    fieldRoster: "Roster",
    fieldRosterValue: "{count} talent",
    fieldPlanLimit: "Plan limit",
    fieldPlanLimitValue: "{seats} seats ({plan})",
  },
};

export const WORKSPACE_ES: typeof WORKSPACE_EN = {
  "workspace.signup_welcome": {
    subject: "{workspaceName} ya está listo en Tulala",
    preview: "Tu espacio de trabajo {workspace} ya está listo",
    heading: "Tu espacio de trabajo ya está listo",
    intro:
      "Bienvenido, {name}. Tu espacio de trabajo {plan}, {workspace}, ya está activo. Agrega a tu primer talento, personaliza tu página pública y empieza a recibir solicitudes.",
    note: "Enlace público: {publicUrl}",
    button: "Abrir tu panel →",
  },
  "workspace.team_invite": {
    subject: "{inviterName} te invitó a {brand} en Tulala",
    preview: "Únete a {brand}",
    heading: "Únete a {brand}",
    intro: "{inviter} te agregó como {role}. Acepta la invitación para entrar al espacio de trabajo.",
    note: "El enlace caduca {expires}.",
    button: "Aceptar invitación →",
  },
  "roster.join_requested": {
    subject: "{talentName} quiere unirse a tu roster",
    preview: "{who} quiere unirse a tu roster",
    heading: "Nueva solicitud de roster",
    intro:
      "{who} solicitó unirse a tu roster desde tu sitio público. Revisa la solicitud para aprobarla o rechazarla.",
    button: "Revisar solicitud →",
  },
  "workspace.coordinator_assigned": {
    subject: "Se te asignó una nueva solicitud{offeringSuffix}",
    preview: "Se te asignó una nueva solicitud",
    heading: "Se te asignó una nueva solicitud",
    intro: "Hola {name}, se te asignó como coordinador de {event} en {brand}.",
    introWithDate: "Hola {name}, se te asignó como coordinador de {event} en {brand}. El evento es el {eventDate}.",
    note: "Revisa la solicitud y contacta al cliente.",
    button: "Abrir solicitud →",
  },
  "workspace.form_submission": {
    subject: "Nuevo envío de formulario — {formName}",
    subjectNoName: "Nuevo envío de formulario — {formName}",
    preview: "Nuevo envío de formulario de {name} — {form}",
    previewNoName: "Nuevo envío de formulario — {form}",
    heading: "Nuevo envío de formulario",
    intro: "Un visitante envió el formulario {form} en tu sitio de {brand}.",
    note: "Márcalo como leído o archívalo en tu bandeja de formularios.",
    button: "Abrir bandeja →",
    submittedFields: "Campos enviados",
    fieldForm: "Formulario",
    fieldName: "Nombre",
    fieldEmail: "Correo",
    fieldReceived: "Recibido",
  },
  "workspace.offer_accepted": {
    subject: "Se aceptó una oferta",
    preview: "Oferta aceptada",
    heading: "Oferta aceptada",
    intro: "Buenas noticias — el cliente aceptó la oferta de {event}.",
    note: "Confirma la reserva y coordina los siguientes pasos.",
    button: "Abrir solicitud →",
    fieldTotal: "Total",
  },
  "workspace.offer_declined": {
    subject: "Se rechazó una oferta",
    preview: "Oferta rechazada",
    heading: "Oferta rechazada",
    intro: "El cliente rechazó la oferta de {event}.",
    note: "Puedes revisar la oferta o dar seguimiento con el cliente.",
    button: "Abrir solicitud →",
  },
  "workspace.assignment_timed_out": {
    subject: "Una solicitud necesita coordinador",
    preview: "Una solicitud necesita coordinador",
    heading: "Una solicitud necesita coordinador",
    intro:
      "Hola {name}, {event} no se ha tomado automáticamente y sigue esperando un coordinador. Asigna a alguien para que el cliente reciba una respuesta a tiempo.",
    note: "Abre la solicitud para asignar un coordinador.",
    button: "Asignar coordinador →",
    fieldDate: "Fecha",
  },
  "workspace.talent_declined": {
    subject: "Un talento rechazó una solicitud",
    preview: "Un talento rechazó una solicitud",
    heading: "Un talento rechazó",
    intro:
      "Hola {name}, {talent} rechazó la invitación para {event}. Quizá quieras buscar una alternativa o dar seguimiento.",
    note: "Abre la solicitud para revisar el roster.",
    button: "Abrir solicitud →",
  },
  "workspace.booking_cancelled": {
    subject: "Se canceló una reserva",
    preview: "Reserva cancelada",
    heading: "Reserva cancelada",
    intro: "{event} se canceló.",
    note: "Revisa la solicitud para ver los detalles y cualquier seguimiento necesario.",
    button: "Ver detalles →",
    fieldDate: "Fecha",
  },
  "client.booking_cancelled": {
    subject: "Tu reserva se canceló",
  },
  "talent.booking_cancelled": {
    subject: "Se canceló una reserva",
  },
  "workspace.payment_received": {
    subject: "Pago recibido",
    preview: "Pago recibido",
    heading: "Pago recibido",
    intro: "Se recibió un pago de {event}.",
    note: "Consulta el desglose y el estado del pago desde el espacio de trabajo.",
    button: "Ver pago →",
    fieldAmount: "Monto",
  },
  "workspace.over_seat_limit": {
    subject: "Tu roster superó el límite de tu plan",
    preview: "Tu roster superó el límite de tu plan",
    heading: "Alcanzaste el límite de tu roster",
    intro:
      "Hola {name}, {workspace} ahora tiene más talento en su roster del que permite tu plan {plan}. Para seguir agregando talento — y que todos sigan visibles y reservables — mejora tu plan o ajusta tu roster.",
    note: "No se elimina nada automáticamente. Es solo un aviso para que decidas cómo manejarlo.",
    button: "Administrar tu plan →",
    fieldRoster: "Roster",
    fieldRosterValue: "{count} talento",
    fieldPlanLimit: "Límite del plan",
    fieldPlanLimitValue: "{seats} lugares ({plan})",
  },
};
