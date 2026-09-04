/**
 * presets.ts — the sixteen industry presets.
 *
 * A preset is a bundle of words, features, site design, header verb and chat
 * voice over the same engines. A padel club and a restaurant run identical
 * code; only the bundle differs.
 *
 * WHY THIS REPLACES `workspace_type` AS THE ARCHETYPE SIGNAL
 * ─────────────────────────────────────────────────────────
 * `agencies.workspace_type` has two values, "talent" and "business", and it is
 * currently asked a sixteen-value question. `workspace-signup.server.ts` writes
 * "talent" for every audience except "business", so a solo barber is stored as
 * a talent agency, which is why the starter seed hands them three fabricated
 * model profiles: the gate is correct, the signal is too coarse.
 *
 * `workspace_type` is NOT removed here. It keeps its job of deciding which
 * roster surfaces exist, and `rosterEnabled` keeps failing open toward
 * "talent". The preset is the finer signal layered over it, and
 * `presetRepresentsPeople` below is what a seed should ask instead.
 *
 * STORED AT `agencies.settings.industry_preset`. No migration: this follows the
 * precedent of `agencies.settings.appointments.terminology`, which is how the
 * terminology setting has shipped since Appointments.
 */

import type { WordLocale, WordText } from "./rows";

export const HEADER_VERBS = ["reserve", "order", "tickets", "book", "ask", "custom"] as const;
export type HeaderVerb = (typeof HEADER_VERBS)[number];

/**
 * The words key each verb renders through, so a header button can never be
 * free text pointing at a route that does not exist. "custom" is the one
 * escape hatch and is the only verb that carries an operator-authored href.
 */
export const HEADER_VERB_WORD_KEY: Readonly<Record<Exclude<HeaderVerb, "custom" | "ask">, string>> = {
  reserve: "reservations.cta",
  order: "menu.cta",
  tickets: "events.cta",
  book: "appointments.cta",
};

export const INDUSTRY_PRESET_IDS = [
  "restaurant",
  "bar_club",
  "beach_club",
  "spa_wellness",
  "salon_barber",
  "clinic",
  "studio_gym",
  "sports_venue",
  "tours_activities",
  "theatre_cinema",
  "coworking",
  "rentals",
  "workshop_print",
  "venue_for_hire",
  // Ratified by the CEO 2026-09-04. Ids are permanent: a rename after this is a
  // migration, because a tenant's stored `industry_preset` is keyed by it.
  "dropoff_service",
  "practice",
  "act",
  "agency",
  "custom",
] as const;

export type IndustryPresetId = (typeof INDUSTRY_PRESET_IDS)[number];

/** Which words table tabs a preset turns on. Others stay hidden until needed. */
export type PresetFeatures = {
  readonly menu: boolean;
  readonly reservations: boolean;
  readonly events: boolean;
  readonly appointments: boolean;
};

export type IndustryPreset = {
  readonly id: IndustryPresetId;
  readonly label: WordText;
  /** The one-line subtitle under the label in the picker. */
  readonly blurb: WordText;
  /** Overrides layered over `WORD_ROWS[].fallback`. Partial by design. */
  readonly words: Readonly<Record<string, WordText>>;
  readonly features: PresetFeatures;
  readonly headerVerb: HeaderVerb;
  /** The chat launcher's opening line. */
  readonly chatVoice: WordText;
  /**
   * `PAGE_DESIGNS` id this preset's signup lands on, or null to keep the
   * Lab-managed platform default. Every id here must survive the dead-href
   * tripwire; a preset may not point a new workspace at a design with a dead
   * link.
   */
  readonly designId: string | null;
  /**
   * Does this workspace represent PEOPLE it can list publicly? The starter
   * roster seed and the directory page should ask this, not `workspace_type`.
   */
  readonly representsPeople: boolean;
};

const RESTAURANT_WORDS: Readonly<Record<string, WordText>> = {
  "menu.item": { en: "Dish", es: "Platillo" },
  "menu.items": { en: "Dishes", es: "Platillos" },
  "menu.board": { en: "Kitchen", es: "Cocina" },
  "reservations.place": { en: "Table", es: "Mesa" },
  "reservations.person": { en: "Guest", es: "Invitado" },
  "workspace.people": { en: "Team", es: "Equipo" },
  "workspace.person": { en: "Team member", es: "Miembro del equipo" },
};

/** Every non-agency preset represents staff, not listable talent. */
const STAFF_WORDS: Readonly<Record<string, WordText>> = {
  "workspace.people": { en: "Team", es: "Equipo" },
  "workspace.person": { en: "Team member", es: "Miembro del equipo" },
};

const PRESETS: Readonly<Record<IndustryPresetId, IndustryPreset>> = {
  restaurant: {
    id: "restaurant",
    label: { en: "Restaurant", es: "Restaurante" },
    blurb: { en: "tables, menu, tabs", es: "mesas, menú, cuentas" },
    words: RESTAURANT_WORDS,
    features: { menu: true, reservations: true, events: false, appointments: false },
    headerVerb: "reserve",
    chatVoice: { en: "Table, order, or a question?", es: "¿Mesa, pedido o una pregunta?" },
    designId: "restaurant-orderable",
    representsPeople: false,
  },
  bar_club: {
    id: "bar_club",
    label: { en: "Bar, club", es: "Bar, club" },
    blurb: { en: "tables, events, tickets", es: "mesas, eventos, entradas" },
    words: {
      ...RESTAURANT_WORDS,
      "events.session": { en: "Night", es: "Noche" },
      "events.lineup": { en: "Lineup", es: "Cartel" },
    },
    features: { menu: true, reservations: true, events: true, appointments: false },
    headerVerb: "tickets",
    chatVoice: {
      en: "Tickets, a table, or booking an act?",
      es: "¿Entradas, una mesa o contratar un artista?",
    },
    designId: "restaurant-orderable",
    representsPeople: false,
  },
  beach_club: {
    id: "beach_club",
    label: { en: "Beach club", es: "Club de playa" },
    blurb: { en: "sunbeds, cabanas, menu", es: "camastros, cabañas, menú" },
    words: {
      ...RESTAURANT_WORDS,
      "reservations.place": { en: "Sunbed", es: "Camastro" },
      "reservations.place_group": { en: "Area", es: "Zona" },
    },
    features: { menu: true, reservations: true, events: true, appointments: false },
    headerVerb: "reserve",
    chatVoice: { en: "A sunbed, a cabana, or the menu?", es: "¿Un camastro, una cabaña o el menú?" },
    designId: "restaurant-orderable",
    representsPeople: false,
  },
  spa_wellness: {
    id: "spa_wellness",
    label: { en: "Spa, wellness", es: "Spa, bienestar" },
    blurb: { en: "treatments, rooms", es: "tratamientos, salas" },
    words: {
      ...STAFF_WORDS,
      "menu.item": { en: "Treatment", es: "Tratamiento" },
      "menu.items": { en: "Treatments", es: "Tratamientos" },
      "appointments.item": { en: "Treatment", es: "Tratamiento" },
      "appointments.items": { en: "Treatments", es: "Tratamientos" },
      "appointments.provider": { en: "Therapist", es: "Terapeuta" },
      "appointments.cta": { en: "Book", es: "Agendar" },
      "reservations.place": { en: "Room", es: "Sala" },
    },
    features: { menu: true, reservations: false, events: false, appointments: true },
    headerVerb: "book",
    chatVoice: { en: "Book a time or ask us", es: "Agenda una cita o pregúntanos" },
    designId: "services",
    representsPeople: false,
  },
  salon_barber: {
    id: "salon_barber",
    label: { en: "Salon, barber", es: "Salón, barbería" },
    blurb: { en: "chairs, staff", es: "sillas, personal" },
    words: {
      ...STAFF_WORDS,
      "appointments.provider": { en: "Stylist", es: "Estilista" },
      "appointments.cta": { en: "Book", es: "Agendar" },
      "reservations.place": { en: "Chair", es: "Silla" },
      "customers.person": { en: "Client", es: "Cliente" },
      "customers.people": { en: "Clients", es: "Clientes" },
    },
    features: { menu: true, reservations: false, events: false, appointments: true },
    headerVerb: "book",
    chatVoice: { en: "Book a time or ask us", es: "Agenda una cita o pregúntanos" },
    designId: "services",
    representsPeople: false,
  },
  clinic: {
    id: "clinic",
    label: { en: "Clinic", es: "Clínica" },
    blurb: { en: "consultations, patients", es: "consultas, pacientes" },
    words: {
      ...STAFF_WORDS,
      "appointments.item": { en: "Consultation", es: "Consulta" },
      "appointments.items": { en: "Consultations", es: "Consultas" },
      "appointments.provider": { en: "Doctor", es: "Doctor" },
      "appointments.cta": { en: "Book", es: "Agendar" },
      "reservations.place": { en: "Room", es: "Consultorio" },
      "customers.person": { en: "Patient", es: "Paciente" },
      "customers.people": { en: "Patients", es: "Pacientes" },
      "reservations.person": { en: "Patient", es: "Paciente" },
    },
    features: { menu: true, reservations: false, events: false, appointments: true },
    headerVerb: "book",
    chatVoice: { en: "Book a time or ask us", es: "Agenda una cita o pregúntanos" },
    designId: "services",
    representsPeople: false,
  },
  studio_gym: {
    id: "studio_gym",
    label: { en: "Studio, gym", es: "Estudio, gimnasio" },
    blurb: { en: "classes, passes", es: "clases, pases" },
    words: {
      ...STAFF_WORDS,
      "events.session": { en: "Class", es: "Clase" },
      "events.ticket": { en: "Spot", es: "Lugar" },
      "events.tickets": { en: "Spots", es: "Lugares" },
      "appointments.provider": { en: "Instructor", es: "Instructor" },
      "appointments.cta": { en: "Book", es: "Agendar" },
      "reservations.place": { en: "Room", es: "Sala" },
      "customers.person": { en: "Member", es: "Miembro" },
      "customers.people": { en: "Members", es: "Miembros" },
    },
    features: { menu: false, reservations: false, events: true, appointments: true },
    headerVerb: "book",
    chatVoice: { en: "Which class, and how many spots?", es: "¿Qué clase y cuántos lugares?" },
    designId: "studio",
    representsPeople: false,
  },
  sports_venue: {
    id: "sports_venue",
    label: { en: "Sports venue", es: "Instalación deportiva" },
    blurb: { en: "courts, lanes, players", es: "canchas, pistas, jugadores" },
    words: {
      ...STAFF_WORDS,
      "reservations.feature": { en: "Bookings", es: "Reservas" },
      "reservations.place": { en: "Court", es: "Cancha" },
      "reservations.place_group": { en: "Court type", es: "Tipo de cancha" },
      "reservations.party_size": { en: "Players", es: "Jugadores" },
      "reservations.window": { en: "Session", es: "Turno" },
      "reservations.person": { en: "Player", es: "Jugador" },
      "reservations.front_desk": { en: "Front desk", es: "Recepción" },
      "reservations.turn_time": { en: "Match length", es: "Duración" },
      "reservations.cta": { en: "Book a court", es: "Reservar cancha" },
      "reservations.confirmed": { en: "Your court is booked", es: "Tu cancha está reservada" },
      "reservations.reminder": { en: "See you on court at", es: "Nos vemos en la cancha a las" },
    },
    features: { menu: true, reservations: true, events: true, appointments: false },
    headerVerb: "reserve",
    chatVoice: { en: "A court, or a question?", es: "¿Una cancha o una pregunta?" },
    designId: "studio",
    representsPeople: false,
  },
  tours_activities: {
    id: "tours_activities",
    label: { en: "Tours, activities", es: "Tours, actividades" },
    blurb: { en: "departures, guides", es: "salidas, guías" },
    words: {
      "workspace.people": { en: "Guides", es: "Guías" },
      "workspace.person": { en: "Guide", es: "Guía" },
      "events.session": { en: "Departure", es: "Salida" },
      "events.ticket": { en: "Place", es: "Lugar" },
      "events.tickets": { en: "Places", es: "Lugares" },
      "events.lineup": { en: "Guides", es: "Guías" },
      "appointments.cta": { en: "Book", es: "Agendar" },
      "menu.item": { en: "Extra", es: "Extra" },
      "menu.items": { en: "Extras", es: "Extras" },
    },
    features: { menu: true, reservations: false, events: true, appointments: false },
    headerVerb: "book",
    chatVoice: { en: "Which trip, and how many of you?", es: "¿Qué tour y cuántos son?" },
    designId: "studio",
    representsPeople: true,
  },
  theatre_cinema: {
    id: "theatre_cinema",
    label: { en: "Theatre, cinema", es: "Teatro, cine" },
    blurb: { en: "seat maps, shows", es: "mapas de asientos, funciones" },
    words: {
      ...STAFF_WORDS,
      "events.session": { en: "Screening", es: "Función" },
      "reservations.place": { en: "Seat", es: "Asiento" },
      "reservations.place_group": { en: "Section", es: "Sección" },
      "events.lineup": { en: "Cast", es: "Reparto" },
    },
    features: { menu: true, reservations: false, events: true, appointments: false },
    headerVerb: "tickets",
    chatVoice: { en: "Which show, and how many seats?", es: "¿Qué función y cuántos asientos?" },
    designId: "conference",
    representsPeople: true,
  },
  coworking: {
    id: "coworking",
    label: { en: "Coworking", es: "Coworking" },
    blurb: { en: "desks, rooms, members", es: "escritorios, salas, miembros" },
    words: {
      ...STAFF_WORDS,
      "reservations.place": { en: "Desk", es: "Escritorio" },
      "reservations.place_group": { en: "Floor", es: "Piso" },
      "reservations.person": { en: "Member", es: "Miembro" },
      "customers.person": { en: "Member", es: "Miembro" },
      "customers.people": { en: "Members", es: "Miembros" },
      "events.session": { en: "Workshop", es: "Taller" },
      "menu.item": { en: "Item", es: "Artículo" },
    },
    features: { menu: true, reservations: true, events: true, appointments: false },
    headerVerb: "reserve",
    chatVoice: { en: "A desk, a room, or membership?", es: "¿Un escritorio, una sala o membresía?" },
    designId: "saas",
    representsPeople: false,
  },
  rentals: {
    id: "rentals",
    label: { en: "Rentals", es: "Rentas" },
    blurb: { en: "bikes, boats, hours", es: "bicis, barcos, horas" },
    words: {
      ...STAFF_WORDS,
      "reservations.feature": { en: "Rentals", es: "Rentas" },
      "reservations.place": { en: "Unit", es: "Unidad" },
      "reservations.place_group": { en: "Fleet", es: "Flota" },
      "reservations.window": { en: "Rental window", es: "Periodo de renta" },
      "reservations.cta": { en: "Rent", es: "Rentar" },
      "menu.item": { en: "Add-on", es: "Adicional" },
      "menu.items": { en: "Add-ons", es: "Adicionales" },
    },
    features: { menu: true, reservations: true, events: false, appointments: false },
    headerVerb: "reserve",
    chatVoice: { en: "What would you like to rent?", es: "¿Qué te gustaría rentar?" },
    designId: "store-orderable",
    representsPeople: false,
  },
  workshop_print: {
    id: "workshop_print",
    // RELABELLED, id unchanged. "Workshop, print" with "jobs, proofs" meant a
    // frozen-pizza maker read it, did not see themselves, picked Custom and got
    // nothing. The shape underneath was always right; the words were too narrow.
    // This also picks up bakers, roasters and small-batch anything.
    label: { en: "Maker and workshop", es: "Taller y producción" },
    blurb: { en: "made to order, batches", es: "por encargo, lotes" },
    words: {
      ...STAFF_WORDS,
      "menu.item": { en: "Job", es: "Trabajo" },
      "menu.items": { en: "Jobs", es: "Trabajos" },
      "menu.board": { en: "Workshop", es: "Taller" },
      "menu.cta": { en: "Request a quote", es: "Pedir cotización" },
      "menu.order_sent": { en: "We have your job", es: "Tenemos tu trabajo" },
      "menu.ready": { en: "Ready to collect", es: "Listo para recoger" },
    },
    features: { menu: true, reservations: false, events: false, appointments: false },
    headerVerb: "ask",
    chatVoice: { en: "Tell us about the job", es: "Cuéntanos sobre el trabajo" },
    designId: "store-orderable",
    representsPeople: false,
  },
  venue_for_hire: {
    id: "venue_for_hire",
    label: { en: "Venue for hire", es: "Espacio para eventos" },
    blurb: { en: "buyouts, catering", es: "eventos privados, banquetes" },
    words: {
      ...STAFF_WORDS,
      "reservations.place": { en: "Room", es: "Salón" },
      "events.session": { en: "Private event", es: "Evento privado" },
      "menu.feature": { en: "Catering", es: "Banquetes" },
      "menu.item": { en: "Dish", es: "Platillo" },
      "menu.items": { en: "Dishes", es: "Platillos" },
    },
    features: { menu: true, reservations: true, events: true, appointments: false },
    headerVerb: "ask",
    chatVoice: { en: "Tell us about your event", es: "Cuéntanos sobre tu evento" },
    designId: "noir",
    representsPeople: false,
  },
  dropoff_service: {
    id: "dropoff_service",
    label: { en: "Drop-off service", es: "Servicio de entrega" },
    blurb: { en: "drop off, turnaround, collect", es: "dejas, plazo, recoges" },
    // Laundry, dry cleaner, jeweller repairs, tailor, shoe and device repair.
    // Their defining fact is TURNAROUND, which no other preset asks for and
    // which is the first question every one of their customers has — hence the
    // `menu.turnaround` row, which exists for this preset.
    words: {
      ...STAFF_WORDS,
      "menu.item": { en: "Job", es: "Trabajo" },
      "menu.items": { en: "Jobs", es: "Trabajos" },
      "menu.board": { en: "Workshop", es: "Taller" },
      "menu.cta": { en: "Drop something off", es: "Dejar algo" },
      "menu.turnaround": { en: "Ready in", es: "Listo en" },
      "menu.order_sent": { en: "We have it", es: "Ya lo tenemos" },
      "menu.ready": { en: "Ready to collect", es: "Listo para recoger" },
    },
    features: { menu: true, reservations: false, events: false, appointments: false },
    headerVerb: "order",
    chatVoice: { en: "What can we take in for you?", es: "¿Qué te recibimos?" },
    designId: "services",
    representsPeople: false,
  },
  practice: {
    id: "practice",
    label: { en: "Professional practice", es: "Despacho profesional" },
    blurb: { en: "consultations, cases", es: "consultas, casos" },
    // Deliberately distinct from `clinic`, which is medical. This is
    // professional: legal, accounting, architecture, consulting.
    words: {
      ...STAFF_WORDS,
      "menu.item": { en: "Service", es: "Servicio" },
      "menu.items": { en: "Services", es: "Servicios" },
      "appointments.item": { en: "Consultation", es: "Consulta" },
      "appointments.items": { en: "Consultations", es: "Consultas" },
      "appointments.cta": { en: "Book", es: "Agendar" },
      "customers.person": { en: "Client", es: "Cliente" },
      "customers.people": { en: "Clients", es: "Clientes" },
    },
    features: { menu: true, reservations: false, events: false, appointments: true },
    headerVerb: "book",
    chatVoice: { en: "Tell us what you need help with", es: "Cuéntanos en qué necesitas ayuda" },
    designId: "services",
    representsPeople: false,
  },
  act: {
    id: "act",
    label: { en: "Performer or act", es: "Artista o espectáculo" },
    blurb: { en: "dates, sets, riders", es: "fechas, sets, riders" },
    // The ONLY one of the three with representsPeople true, and that flag is
    // the whole reason it is separate from `practice` rather than folded in.
    words: {
      "workspace.people": { en: "The act", es: "El espectáculo" },
      "workspace.person": { en: "Performer", es: "Artista" },
      "events.session": { en: "Show", es: "Show" },
      "menu.item": { en: "Set", es: "Set" },
      "menu.items": { en: "Sets", es: "Sets" },
      "appointments.cta": { en: "Book", es: "Agendar" },
    },
    features: { menu: true, reservations: false, events: true, appointments: false },
    headerVerb: "book",
    chatVoice: { en: "Tell us about the date", es: "Cuéntanos de la fecha" },
    designId: "coach",
    representsPeople: true,
  },
  agency: {
    id: "agency",
    label: { en: "Agency", es: "Agencia" },
    blurb: { en: "talent, quotes", es: "talento, cotizaciones" },
    words: {},
    features: { menu: false, reservations: false, events: false, appointments: false },
    headerVerb: "ask",
    chatVoice: {
      en: "Tell us about the project and we will line up the right talent",
      es: "Cuéntanos del proyecto y te armamos el equipo",
    },
    // Was null while a "Production agency" design sat in the registry unused.
    designId: "agency",
    representsPeople: true,
  },
  custom: {
    id: "custom",
    label: { en: "Custom", es: "Personalizado" },
    // Was "start empty", an honest description of the thing being eliminated.
    // There should be no route through this product that ends in a page with
    // no design.
    blurb: { en: "a page you shape", es: "una página a tu medida" },
    words: {},
    features: { menu: false, reservations: false, events: false, appointments: false },
    headerVerb: "ask",
    chatVoice: { en: "How can we help?", es: "¿Cómo te podemos ayudar?" },
    designId: "services",
    representsPeople: false,
  },
};

/** Picker display order. */
export const INDUSTRY_PRESETS: ReadonlyArray<IndustryPreset> = INDUSTRY_PRESET_IDS.map(
  (id) => PRESETS[id],
);

/**
 * Raw `agencies.settings.industry_preset` to a preset id.
 *
 * Fails toward "custom", which turns nothing on and overrides no word, so an
 * unrecognised value can never rename a live workspace's nouns.
 */
export function parseIndustryPresetId(raw: unknown): IndustryPresetId {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (INDUSTRY_PRESET_IDS as readonly string[]).includes(value)
    ? (value as IndustryPresetId)
    : "custom";
}

export function resolveIndustryPreset(raw: unknown): IndustryPreset {
  return PRESETS[parseIndustryPresetId(raw)];
}

/**
 * Does this preset represent people it can list publicly?
 *
 * The starter roster seed and the directory page should ask THIS, not
 * `workspace_type`, which cannot tell a solo barber from a model agency
 * because signup writes "talent" for both.
 */
export function presetRepresentsPeople(raw: unknown): boolean {
  return resolveIndustryPreset(raw).representsPeople;
}

/** The header button's label for this preset, in this language. */
export function presetHeaderVerbLabel(
  preset: IndustryPreset,
  locale: WordLocale,
  lookup: (key: string) => string,
): string {
  if (preset.headerVerb === "ask") return locale === "es" ? "Escríbenos" : "Get in touch";
  if (preset.headerVerb === "custom") return "";
  return lookup(HEADER_VERB_WORD_KEY[preset.headerVerb]);
}
