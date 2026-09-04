/**
 * rows.ts — the words registry. One row per noun the product shows a human.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Every screen names things: table, dish, order, tab, guest, reservation,
 * kitchen, ticket, lineup, door. Those words are what makes a restaurant
 * recognise the product and what makes a padel club, a spa or a tour operator
 * not recognise it, even though the engines underneath are identical. So the
 * noun becomes data: a row here, an optional per-tenant override, per language.
 *
 * This generalises `lib/scheduling/terminology.ts`, which already does exactly
 * this for one feature with four bundles. That module is NOT replaced: the
 * Appointments Manager owns it, the contracts registry marks its read path
 * "agreed (exists)", and the Reservations rows below default FROM it (see
 * `resolve.ts`). A words override wins on top. Nothing in `lib/scheduling/`
 * has to change for this to work.
 *
 * WHO WRITES ROWS
 * ───────────────
 * Every feature manager declares their own feature's rows here. The Front Door
 * Manager owns the table and the read path, not the vocabulary of features it
 * does not build. Adding a row is additive and safe; changing an existing
 * `key` is not, because a tenant's stored overrides are keyed by it.
 *
 * HOUSE RULES
 * ───────────
 * en and es for every row and every default. No em dashes in any value below;
 * these strings are customer-facing. Literal characters only.
 */

/** The tabs of the words table, in display order. */
export const WORD_FEATURES = [
  "workspace",
  "menu",
  "reservations",
  "events",
  "appointments",
  "customers",
  "team",
] as const;

export type WordFeature = (typeof WORD_FEATURES)[number];

/** Every language a words value can be authored in today. */
export const WORD_LOCALES = ["en", "es"] as const;
export type WordLocale = (typeof WORD_LOCALES)[number];

export type WordText = Readonly<Record<WordLocale, string>>;

export type WordRow = {
  /**
   * Stable identity. A tenant's overrides are keyed by this, so renaming one
   * silently drops that tenant's word. Add rows freely; never rename one.
   */
  readonly key: string;
  readonly feature: WordFeature;
  /** The words table's first column: where a human meets this noun. */
  readonly where: WordText;
  /** The product default. Blank in a tenant's override means "use this". */
  readonly fallback: WordText;
  /**
   * Set when the row's Reservations default is owned by the Appointments
   * terminology setting instead of by `fallback`. `resolve.ts` reads it.
   */
  readonly fromTerminology?: "singular" | "plural" | "verb" | "cta";
};

/** Feature tab labels for the settings UI. */
export const WORD_FEATURE_LABELS: Readonly<Record<WordFeature, WordText>> = {
  workspace: { en: "Workspace", es: "Espacio de trabajo" },
  menu: { en: "Menu and orders", es: "Menú y pedidos" },
  reservations: { en: "Reservations", es: "Reservas" },
  events: { en: "Events and ticketing", es: "Eventos y entradas" },
  appointments: { en: "Appointments", es: "Citas" },
  customers: { en: "Customers", es: "Clientes" },
  team: { en: "Team", es: "Equipo" },
};

/**
 * The rows. Ordered within a feature the way the settings table reads them:
 * the feature's own name first, then the nouns, then the strings a guest sees.
 */
export const WORD_ROWS: ReadonlyArray<WordRow> = [
  // ── Workspace ──────────────────────────────────────────────────────────
  {
    key: "workspace.people",
    feature: "workspace",
    where: { en: "The people you represent", es: "Las personas que representas" },
    fallback: { en: "Talent", es: "Talento" },
  },
  {
    key: "workspace.person",
    feature: "workspace",
    where: { en: "One of them", es: "Una de ellas" },
    fallback: { en: "Talent", es: "Talento" },
  },

  // ── Menu and orders ────────────────────────────────────────────────────
  {
    key: "menu.feature",
    feature: "menu",
    where: { en: "The feature name: rail, header, site", es: "Nombre de la función: barra, cabecera, sitio" },
    fallback: { en: "Menu", es: "Menú" },
  },
  {
    key: "menu.item",
    feature: "menu",
    where: { en: "One item", es: "Un artículo" },
    fallback: { en: "Item", es: "Artículo" },
  },
  {
    key: "menu.items",
    feature: "menu",
    where: { en: "Several items", es: "Varios artículos" },
    fallback: { en: "Items", es: "Artículos" },
  },
  {
    key: "menu.order",
    feature: "menu",
    where: { en: "One order", es: "Un pedido" },
    fallback: { en: "Order", es: "Pedido" },
  },
  {
    key: "menu.tab",
    feature: "menu",
    where: { en: "An open bill", es: "Una cuenta abierta" },
    fallback: { en: "Tab", es: "Cuenta" },
  },
  {
    key: "menu.board",
    feature: "menu",
    where: { en: "The board", es: "El tablero" },
    fallback: { en: "Kitchen", es: "Cocina" },
  },
  {
    key: "menu.cta",
    feature: "menu",
    where: { en: "Button on the site", es: "Botón en el sitio" },
    fallback: { en: "Order now", es: "Pedir ahora" },
  },
  {
    // The defining fact of a drop-off business, and the first question every one
    // of their customers has. No other preset asks for it; `dropoff_service`
    // exists partly because nothing could express it.
    key: "menu.turnaround",
    feature: "menu",
    where: { en: "How long it takes", es: "Cuánto tarda" },
    fallback: { en: "Turnaround", es: "Tiempo de entrega" },
  },
  {
    key: "menu.sold_out",
    feature: "menu",
    where: { en: "Sold out", es: "Agotado" },
    fallback: { en: "Sold out", es: "Agotado" },
  },
  {
    key: "menu.order_sent",
    feature: "menu",
    where: { en: "Guest: order sent", es: "Invitado: pedido enviado" },
    fallback: { en: "Your order is in", es: "Tu pedido está en marcha" },
  },
  {
    key: "menu.ready",
    feature: "menu",
    where: { en: "Guest: ready", es: "Invitado: listo" },
    fallback: { en: "Ready to pick up", es: "Listo para recoger" },
  },

  // ── Reservations ───────────────────────────────────────────────────────
  // The feature name and the site button default from the Appointments
  // terminology setting, so a workspace that already picked "Agenda" keeps it.
  {
    key: "reservations.feature",
    feature: "reservations",
    where: { en: "The feature name: rail, header, site", es: "Nombre de la función: barra, cabecera, sitio" },
    fallback: { en: "Reservations", es: "Reservas" },
    fromTerminology: "plural",
  },
  {
    key: "reservations.one",
    feature: "reservations",
    where: { en: "One of them", es: "Una de ellas" },
    fallback: { en: "Reservation", es: "Reserva" },
    fromTerminology: "singular",
  },
  {
    key: "reservations.place",
    feature: "reservations",
    where: { en: "One bookable place", es: "Un lugar reservable" },
    fallback: { en: "Table", es: "Mesa" },
  },
  {
    key: "reservations.place_group",
    feature: "reservations",
    where: { en: "A group of places", es: "Un grupo de lugares" },
    fallback: { en: "Table group", es: "Grupo de mesas" },
  },
  {
    key: "reservations.party_size",
    feature: "reservations",
    where: { en: "How many people", es: "Cuántas personas" },
    fallback: { en: "Party size", es: "Personas" },
  },
  {
    key: "reservations.window",
    feature: "reservations",
    where: { en: "A service window", es: "Una franja de servicio" },
    fallback: { en: "Service", es: "Servicio" },
  },
  {
    key: "reservations.person",
    feature: "reservations",
    where: { en: "The person booking", es: "Quien reserva" },
    fallback: { en: "Guest", es: "Invitado" },
  },
  {
    key: "reservations.front_desk",
    feature: "reservations",
    where: { en: "Front desk view", es: "Vista de recepción" },
    fallback: { en: "Host stand", es: "Recepción" },
  },
  {
    key: "reservations.turn_time",
    feature: "reservations",
    where: { en: "Turn time", es: "Duración" },
    fallback: { en: "Turn time", es: "Duración" },
  },
  {
    key: "reservations.cta",
    feature: "reservations",
    where: { en: "Button on the site", es: "Botón en el sitio" },
    fallback: { en: "Reserve", es: "Reservar" },
    fromTerminology: "cta",
  },
  {
    key: "reservations.confirmed",
    feature: "reservations",
    where: { en: "Guest: confirmed", es: "Invitado: confirmado" },
    fallback: { en: "Your table is booked", es: "Tu mesa está reservada" },
  },
  {
    key: "reservations.reminder",
    feature: "reservations",
    where: { en: "Guest: reminder", es: "Invitado: recordatorio" },
    fallback: { en: "See you at", es: "Nos vemos a las" },
  },
  {
    key: "reservations.no_show_fee",
    feature: "reservations",
    where: { en: "No-show fee", es: "Cargo por no presentarse" },
    fallback: { en: "No-show fee", es: "Cargo por no presentarse" },
  },

  // ── Events and ticketing ───────────────────────────────────────────────
  {
    key: "events.feature",
    feature: "events",
    where: { en: "The feature name: rail, header, site", es: "Nombre de la función: barra, cabecera, sitio" },
    fallback: { en: "Events", es: "Eventos" },
  },
  {
    key: "events.session",
    feature: "events",
    where: { en: "One occurrence", es: "Una ocurrencia" },
    fallback: { en: "Show", es: "Función" },
  },
  {
    key: "events.ticket",
    feature: "events",
    where: { en: "One admission", es: "Una entrada" },
    fallback: { en: "Ticket", es: "Entrada" },
  },
  {
    key: "events.tickets",
    feature: "events",
    where: { en: "Several admissions", es: "Varias entradas" },
    fallback: { en: "Tickets", es: "Entradas" },
  },
  {
    key: "events.lineup",
    feature: "events",
    where: { en: "Who is on", es: "Quién actúa" },
    fallback: { en: "Lineup", es: "Cartel" },
  },
  {
    key: "events.door",
    feature: "events",
    where: { en: "Where they are scanned", es: "Dónde se escanean" },
    fallback: { en: "Door", es: "Puerta" },
  },
  {
    key: "events.cta",
    feature: "events",
    where: { en: "Button on the site", es: "Botón en el sitio" },
    fallback: { en: "Tickets", es: "Entradas" },
  },

  // ── Appointments ───────────────────────────────────────────────────────
  {
    key: "appointments.item",
    feature: "appointments",
    where: { en: "What is booked", es: "Lo que se reserva" },
    fallback: { en: "Service", es: "Servicio" },
  },
  {
    key: "appointments.items",
    feature: "appointments",
    where: { en: "Several of them", es: "Varios de ellos" },
    fallback: { en: "Services", es: "Servicios" },
  },
  {
    key: "appointments.provider",
    feature: "appointments",
    where: { en: "Who performs it", es: "Quién lo realiza" },
    fallback: { en: "Staff", es: "Personal" },
  },
  {
    key: "appointments.cta",
    feature: "appointments",
    where: { en: "Button on the site", es: "Botón en el sitio" },
    fallback: { en: "Book", es: "Agendar" },
    fromTerminology: "cta",
  },

  // ── Customers ──────────────────────────────────────────────────────────
  {
    key: "customers.person",
    feature: "customers",
    where: { en: "The person buying", es: "Quien compra" },
    fallback: { en: "Customer", es: "Cliente" },
  },
  {
    key: "customers.people",
    feature: "customers",
    where: { en: "Several of them", es: "Varios de ellos" },
    fallback: { en: "Customers", es: "Clientes" },
  },
  {
    key: "customers.home",
    feature: "customers",
    where: { en: "Their home page title", es: "Título de su página" },
    fallback: { en: "Your visits", es: "Tus visitas" },
  },

  // ── Team ───────────────────────────────────────────────────────────────
  {
    key: "team.feature",
    feature: "team",
    where: { en: "The feature name: rail, header", es: "Nombre de la función: barra, cabecera" },
    fallback: { en: "Team", es: "Equipo" },
  },
  {
    key: "team.member",
    feature: "team",
    where: { en: "One of them", es: "Uno de ellos" },
    fallback: { en: "Team member", es: "Miembro del equipo" },
  },
];

/** Every key the registry defines. The write path validates against this. */
export const WORD_KEYS: ReadonlyArray<string> = WORD_ROWS.map((row) => row.key);

const ROW_BY_KEY: ReadonlyMap<string, WordRow> = new Map(
  WORD_ROWS.map((row) => [row.key, row]),
);

export function getWordRow(key: string): WordRow | undefined {
  return ROW_BY_KEY.get(key);
}

export function wordRowsForFeature(feature: WordFeature): ReadonlyArray<WordRow> {
  return WORD_ROWS.filter((row) => row.feature === feature);
}

export function isWordLocale(raw: unknown): raw is WordLocale {
  return typeof raw === "string" && (WORD_LOCALES as readonly string[]).includes(raw);
}
