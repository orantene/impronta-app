/**
 * Copy for the deposit notices (TUL-1268 item 3): a deposit RESERVES a booking,
 * it does not confirm it. The full "Booking confirmed" goes out when the balance
 * is paid. Client voice for the client (no agency words, no em dashes); the
 * talent notice carries no client money.
 */

export const RESERVED_EN = {
  "client.booking_reserved": {
    subject: "Booking reserved",
    preview: "Booking reserved",
    heading: "Booking reserved",
    greetingNamed: "Hi {name},",
    greetingAnon: "Hi,",
    intro: "your deposit was received and your booking is reserved.",
    note: "We will confirm your booking once the balance is paid.",
    button: "View booking →",
    fieldService: "Service",
    fieldDate: "Date",
    fieldDeposit: "Deposit paid",
    fieldBalance: "Balance due",
    fieldDueBy: "Balance due by",
  },
  "talent.booking_reserved": {
    subject: "Booking reserved",
    preview: "Booking reserved",
    heading: "New booking reserved",
    greetingNamed: "Hi {name},",
    greetingAnon: "Hi,",
    intro: "a client reserved a time with you with a deposit.",
    note: "It will be confirmed once the client pays the balance.",
    button: "View my inquiries →",
    fieldService: "Service",
    fieldDate: "Date",
    fieldDeposit: "Deposit paid",
    fieldBalance: "Balance due",
    fieldDueBy: "Balance due by",
  },
};

export const RESERVED_ES: typeof RESERVED_EN = {
  "client.booking_reserved": {
    subject: "Reserva apartada",
    preview: "Reserva apartada",
    heading: "Reserva apartada",
    greetingNamed: "Hola {name},",
    greetingAnon: "Hola,",
    intro: "recibimos tu anticipo y tu reserva quedó apartada.",
    note: "Confirmaremos tu reserva cuando se pague el saldo.",
    button: "Ver reserva →",
    fieldService: "Servicio",
    fieldDate: "Fecha",
    fieldDeposit: "Anticipo pagado",
    fieldBalance: "Saldo pendiente",
    fieldDueBy: "Saldo a pagar antes del",
  },
  "talent.booking_reserved": {
    subject: "Reserva apartada",
    preview: "Reserva apartada",
    heading: "Nueva reserva apartada",
    greetingNamed: "Hola {name},",
    greetingAnon: "Hola,",
    intro: "un cliente apartó un horario contigo con un anticipo.",
    note: "Se confirmará cuando el cliente pague el saldo.",
    button: "Ver mis solicitudes →",
    fieldService: "Servicio",
    fieldDate: "Fecha",
    fieldDeposit: "Anticipo pagado",
    fieldBalance: "Saldo pendiente",
    fieldDueBy: "Saldo a pagar antes del",
  },
};
