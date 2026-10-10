/** Step 3 copy, ES/EN pairs. Local like the screen-1 copy; no em dashes. */

import type { OnboardingChoice } from "./choice";
import type { FlowLocale } from "./flow";

export type SetupCopy = {
  title: Record<OnboardingChoice, string>;
  sub: Record<OnboardingChoice, string>;
  services: Record<OnboardingChoice, string>;
  servicesHint: string;
  serviceName: string;
  minutes: string;
  price: string;
  quote: string;
  quoteOn: string;
  addService: string;
  remove: string;
  hours: string;
  hoursHint: string;
  closed: string;
  applyAll: string;
  from: string;
  to: string;
  place: string;
  placeModes: { studio: string; home: string; client: string };
  area: string;
  areaHint: string;
  homePrivate: string;
  timezone: string;
  timezoneHint: string;
  provider: string;
  providerHint: string;
  providerEmail: string;
  providerLater: string;
  providerNote: string;
  /** Studio only: the owner also takes clients (default on) / does not. */
  ownerProvides: string;
  ownerProvidesHint: string;
  errors: { services: string; hours: string; place: string; timezone: string; providerEmail: string; save: string };
  next: string;
};

export const SETUP_COPY: Record<FlowLocale, SetupCopy> = {
  en: {
    title: { myself: "Set up the essentials", studio: "Set up your business", both: "Set up the essentials" },
    sub: {
      myself: "Your first services, your hours and where you work. You can change all of it later.",
      studio: "The services your team offers, your opening hours and where clients come.",
      both: "The services you do yourself, your hours and where you work. Invite your team later.",
    },
    services: { myself: "Your services", studio: "Services your team offers", both: "Services you do yourself" },
    servicesHint: "Name, how long it takes, and the price. No number? Choose price on quote.",
    serviceName: "Service name",
    minutes: "Minutes",
    price: "Price",
    quote: "Price on quote",
    quoteOn: "On quote",
    addService: "Add a service",
    remove: "Remove",
    hours: "Your hours",
    hoursHint: "Tap a day to open or close it.",
    closed: "Closed",
    applyAll: "Use these hours on all open days",
    from: "From",
    to: "To",
    place: "Where do you work?",
    placeModes: { studio: "At my studio", home: "At home", client: "I go to the client" },
    area: "Area clients see",
    areaHint: "Neighborhood or city",
    homePrivate: "Only the area is public. Your exact address is never shown; you share it after a booking.",
    timezone: "Your time zone",
    timezoneHint: "So bookings land at the right hour.",
    provider: "Your first provider",
    providerHint: "Invite someone who offers services with you.",
    providerEmail: "Their email",
    providerLater: "Add later",
    providerNote: "Bookings start when a provider is added.",
    ownerProvides: "I also take clients myself",
    ownerProvidesHint: "Your site takes bookings from day one, with the hours above. Turn it off if other people take the clients: it then takes enquiries until a provider joins.",
    errors: {
      services: "Add at least one service with a name.",
      hours: "Open at least one day.",
      place: "Choose where you work.",
      timezone: "Choose your time zone.",
      providerEmail: "That email does not look right. Fix it or choose Add later.",
      save: "We could not save this. Check your connection and try again.",
    },
    next: "Continue",
  },
  es: {
    title: { myself: "Configura lo esencial", studio: "Configura tu negocio", both: "Configura lo esencial" },
    sub: {
      myself: "Tus primeros servicios, tu horario y dónde trabajas. Todo se puede cambiar después.",
      studio: "Los servicios que ofrece tu equipo, tu horario y dónde te visitan los clientes.",
      both: "Los servicios que haces tú, tu horario y dónde trabajas. Invita a tu equipo después.",
    },
    services: { myself: "Tus servicios", studio: "Servicios que ofrece tu equipo", both: "Servicios que haces tú" },
    servicesHint: "Nombre, cuánto dura y el precio. ¿Sin número? Elige precio a cotizar.",
    serviceName: "Nombre del servicio",
    minutes: "Minutos",
    price: "Precio",
    quote: "Precio a cotizar",
    quoteOn: "A cotizar",
    addService: "Agregar un servicio",
    remove: "Quitar",
    hours: "Tu horario",
    hoursHint: "Toca un día para abrirlo o cerrarlo.",
    closed: "Cerrado",
    applyAll: "Usar este horario en todos los días abiertos",
    from: "Desde",
    to: "Hasta",
    place: "¿Dónde trabajas?",
    placeModes: { studio: "En mi estudio", home: "En casa", client: "Voy con el cliente" },
    area: "Zona que ven tus clientes",
    areaHint: "Colonia o ciudad",
    homePrivate: "Solo la zona es pública. Tu dirección exacta nunca se muestra; la compartes después de una reserva.",
    timezone: "Tu zona horaria",
    timezoneHint: "Para que las reservas caigan a la hora correcta.",
    provider: "Tu primer proveedor",
    providerHint: "Invita a quien ofrece servicios contigo.",
    providerEmail: "Su correo",
    providerLater: "Agregar después",
    providerNote: "Las reservas empiezan cuando agregas a un proveedor.",
    ownerProvides: "Yo también atiendo clientes",
    ownerProvidesHint: "Tu sitio recibe reservas desde el primer día, con el horario de arriba. Desactívalo si otras personas atienden a los clientes: entonces recibe consultas hasta que se una un proveedor.",
    errors: {
      services: "Agrega al menos un servicio con nombre.",
      hours: "Abre al menos un día.",
      place: "Elige dónde trabajas.",
      timezone: "Elige tu zona horaria.",
      providerEmail: "Ese correo no se ve bien. Corrígelo o elige Agregar después.",
      save: "No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.",
    },
    next: "Continuar",
  },
};
