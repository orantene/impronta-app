/**
 * Demo talent roster (Stream D, 2026-09-28). Fictional people only: no real
 * brands, no invented credentials, reviews or outcomes. One consistent person
 * per demo. Prices are MXN cents. `booking` maps to the service booking mode:
 * instant = isInstantBook, request/quote = inquiry (quote has no amount).
 *
 * Photos are NOT listed here: they come from the design session's demo packs
 * via --photos <pack.json> (see seed.mts), with Unsplash sources recorded.
 */

import { ALBA } from "./alba";

export type DemoService = {
  name: string;
  description: string;
  pricingType: "hour" | "event" | "per_person" | "per_contact" | "flat_package" | "custom";
  amountMxn: number | null;
  /** Typical length in minutes (shown on the offering). */
  durationMin: number;
  booking: "instant" | "request" | "quote";
  /** Menu category (the category rail). */
  category?: string;
  /** exact = fixed price; from = "desde"; free = sin costo; quote = cotización. */
  priceDisplay?: "exact" | "from" | "free" | "quote";
  /** Free change / cancel window in hours (the visit "Changes" fact). */
  cancellationHours?: number;
  /** Options, one picked (absolute MXN price each). */
  variants?: { label: string; priceMxn: number }[];
  /** Stackable extras (MXN on top). */
  extras?: { label: string; priceMxn: number }[];
  /** Pack photo key used as this service's thumbnail. */
  photo?: string;
};

/** A photo key from the demo's photo folder (`<key>.jpg`). */
export type DemoPhotoPlan = {
  /** The headshot / hero photo (media variant `card`, first). */
  headshot: string;
  /** Recent work, in order, with caption + the service it links to (index in `services`). */
  work: { key: string; caption: string; service?: number }[];
  /** Everything else the site uses (inset, portrait, service thumbnails). */
  more: string[];
  alt?: Record<string, string>;
};

/** Page copy a demo sets in the builder after the design is applied. */
export type DemoSiteCopy = {
  heroHeading?: string;
  heroEyebrow?: string;
  heroLede?: string;
  /** Proof line under the hero CTAs; `{b}...{/b}` for the bold lead. */
  heroProof?: string;
  ticker?: string[];
  heroInset?: string;
  aboutPhoto?: string;
  menuSubtitle?: string;
  visitExtraFacts?: { label: string; value: string; note?: string }[];
  footerLine?: string;
  brandTagline?: string;
};


export type DemoHoursWindow = { startMin: number; endMin: number };

export type DemoTalent = {
  /** TAL-93xxx is reserved for this batch (TAL-91xxx / 92xxx are older demos). */
  profileCode: string;
  email: string;
  displayName: string;
  siteSlug: string;
  city: string;
  serviceCategorySlug: string;
  /** L3 talent_type slug, written as the primary talent_profile_taxonomy row. */
  talentTypeSlug: string;
  /** Live Design slug applied by apply-maison.mts ("maison", "maison-v2", "solace", "mono", "frame", "folio"). */
  theme: string;
  tagline: string;
  bio: string;
  services: DemoService[];
  /** Working hours for instant services (talent_booking_hours). Days: 0=Sun. */
  hours?: {
    timezone: string;
    days: number[];
    startMin: number;
    endMin: number;
    slotMinutes: number;
    /** Optional multi-window day (overrides startMin/endMin when set). */
    windows?: DemoHoursWindow[];
  };
  /** Comp-card / profile facts written into System-B field values. */
  compCard?: {
    heightCm: number;
    suitSize: string;
    shoeMx: string;
    languages: string;
  };
  /** Gallery palette key of `theme` (collection designs), e.g. "rose". */
  palette?: string;
  /** Photos from a local folder (`--photo-dir`), instead of a --photos pack. */
  photos?: DemoPhotoPlan;
  /** Published FAQ items (talent_faq_items). */
  faq?: { q: string; a: string }[];
  /** Demo reviews: labelled "Demo review" on the site (the talent is_demo). */
  reviews?: { name: string; body: string }[];
  siteCopy?: DemoSiteCopy;
  /**
   * Private profile fields so the checklist reads 100% (never shown on the
   * site). Fictional; the phone is an all-zero placeholder, not a real line.
   */
  profile?: { lastName: string; phone: string; gender: "female" | "male"; dateOfBirth: string };
};

export const DEMO_BATCH = "demo-2026-09-28";

export const DEMOS: DemoTalent[] = [
  ALBA,
  {
    profileCode: "TAL-93001",
    email: "demo-valeria-baile@impronta.test",
    displayName: "Valeria Ortiz",
    siteSlug: "valeria-baila",
    city: "Ciudad de México",
    serviceCategorySlug: "dancers",
    talentTypeSlug: "latin-dancer",
    theme: "solace",
    hours: { timezone: "America/Mexico_City", days: [2, 3, 4, 5, 6], startMin: 16 * 60, endMin: 21 * 60, slotMinutes: 60 },
    tagline: "Salsa y bachata · clases y shows en CDMX",
    bio: "Bailo salsa y bachata desde niña y hoy enseño en Ciudad de México. Doy clases privadas para una persona o en pareja, en tu casa o en estudio, y preparo coreografías de primer baile para bodas. También bailo en fiestas y eventos. En mis clases empezamos por el ritmo y la conexión con tu pareja; los pasos llegan solos.",
    services: [
      { name: "Clase privada de salsa o bachata", description: "Una hora, para una persona o pareja, en tu casa o en estudio.", pricingType: "per_contact", amountMxn: 700, durationMin: 60, booking: "instant" },
      { name: "Coreografía de primer baile", description: "Tres ensayos para crear y practicar su baile de boda.", pricingType: "flat_package", amountMxn: 4500, durationMin: 180, booking: "request" },
      { name: "Paquete de 4 clases", description: "Cuatro clases privadas de una hora para avanzar de forma constante.", pricingType: "flat_package", amountMxn: 2500, durationMin: 60, booking: "request" },
      { name: "Show para eventos", description: "Presentación de salsa y bachata para bodas y fiestas.", pricingType: "custom", amountMxn: null, durationMin: 45, booking: "quote" },
    ],
  },
  {
    profileCode: "TAL-93002",
    email: "demo-renata-pestanas@impronta.test",
    displayName: "Renata Salgado",
    siteSlug: "renata-lashes",
    city: "Playa del Carmen",
    serviceCategorySlug: "beauty-services",
    talentTypeSlug: "lash-artist",
    theme: "maison-v2",
    hours: { timezone: "America/Cancun", days: [2, 3, 4, 5, 6], startMin: 10 * 60, endMin: 19 * 60, slotMinutes: 30 },
    tagline: "Extensiones y lifting de pestañas en Playa del Carmen",
    bio: "Soy lashista en Playa del Carmen. Trabajo pestañas clásicas, volumen y lifting en mi estudio, con citas tranquilas y sin prisa. Antes de empezar vemos juntas la forma de tus ojos y el efecto que buscas, natural o más marcado, y diseño el set para ti. Te explico cómo cuidarlas para que duren.",
    services: [
      { name: "Pestañas clásicas", description: "Set completo, una extensión por pestaña natural.", pricingType: "per_contact", amountMxn: 900, durationMin: 120, booking: "instant" },
      { name: "Volumen ruso", description: "Set completo con abanicos hechos a mano.", pricingType: "per_contact", amountMxn: 1200, durationMin: 150, booking: "request" },
      { name: "Lifting y tinte", description: "Curvatura natural que dura de 6 a 8 semanas.", pricingType: "per_contact", amountMxn: 650, durationMin: 60, booking: "request" },
      { name: "Retoque de pestañas", description: "Relleno entre 2 y 3 semanas después de tu set.", pricingType: "per_contact", amountMxn: 500, durationMin: 75, booking: "request" },
    ],
  },
  {
    profileCode: "TAL-93003",
    email: "demo-camila-unas@impronta.test",
    displayName: "Camila Rivas",
    siteSlug: "camila-nails",
    city: "Guadalajara",
    serviceCategorySlug: "beauty-services",
    talentTypeSlug: "nail-artist",
    theme: "maison-v2",
    hours: { timezone: "America/Mexico_City", days: [1, 2, 3, 4, 5, 6], startMin: 10 * 60, endMin: 20 * 60, slotMinutes: 30 },
    tagline: "Uñas acrílicas, gel y nail art en Guadalajara",
    bio: "Hago uñas acrílicas, gel y diseños a mano. Tú eliges el largo y la forma; yo te propongo el diseño.",
    services: [
      { name: "Manicure en gel", description: "Color liso con preparación completa.", pricingType: "per_contact", amountMxn: 350, durationMin: 60, booking: "instant" },
      { name: "Set acrílico", description: "Largo corto, medio o largo; el precio sube con el largo.", pricingType: "per_contact", amountMxn: 550, durationMin: 120, booking: "request" },
      { name: "Nail art por uña", description: "Diseño a mano sobre cualquier set.", pricingType: "per_contact", amountMxn: 40, durationMin: 10, booking: "request" },
    ],
  },
  {
    profileCode: "TAL-93004",
    email: "demo-lucia-modelo@impronta.test",
    displayName: "Lucía Herrera",
    siteSlug: "lucia-herrera",
    city: "Ciudad de México",
    serviceCategorySlug: "fashion-models",
    talentTypeSlug: "fashion-model",
    theme: "folio",
    tagline: "Modelo de moda y comercial en CDMX",
    bio: "Modelo para catálogo, campañas y contenido de marca. Trabajo en estudio y en locación.",
    services: [
      { name: "Sesión de catálogo", description: "Medio día en estudio o locación.", pricingType: "event", amountMxn: 6000, durationMin: 240, booking: "request" },
      { name: "Campaña o contenido de marca", description: "Tarifa según uso, medios y duración.", pricingType: "custom", amountMxn: null, durationMin: 480, booking: "quote" },
    ],
  },
  {
    profileCode: "TAL-93005",
    email: "demo-diego-dj@impronta.test",
    displayName: "Diego Navarro",
    siteSlug: "diego-navarro-dj",
    city: "Monterrey",
    serviceCategorySlug: "djs",
    talentTypeSlug: "open-format-dj",
    theme: "frame",
    tagline: "DJ para bodas, fiestas y eventos en Monterrey",
    bio: "Soy DJ open format: latino, pop, house y clásicos. Llevo mi equipo de sonido y armo la música contigo antes del evento.",
    services: [
      { name: "DJ para boda", description: "Cinco horas con equipo de sonido e iluminación básica.", pricingType: "event", amountMxn: 12000, durationMin: 300, booking: "request" },
      { name: "DJ para fiesta privada", description: "Cuatro horas con equipo.", pricingType: "event", amountMxn: 7000, durationMin: 240, booking: "request" },
      { name: "Hora extra", description: "Se agrega el mismo día del evento.", pricingType: "hour", amountMxn: 1500, durationMin: 60, booking: "request" },
    ],
  },
  {
    profileCode: "TAL-93006",
    email: "demo-andres-chef@impronta.test",
    displayName: "Andrés Molina",
    siteSlug: "andres-cocina",
    city: "Tulum",
    serviceCategorySlug: "culinary-experiences",
    talentTypeSlug: "private-dinner-chef",
    theme: "maison-v2",
    tagline: "Chef privado · cenas en tu casa o villa en Tulum",
    bio: "Soy chef privado en Tulum. Cocino cenas de varios tiempos con producto local de la península: pescado del día, cítricos, recados y maíz. Armamos el menú juntos según tu grupo y tus gustos. Hago las compras, cocino en tu cocina, sirvo en la mesa y dejo todo limpio al terminar.",
    services: [
      { name: "Cena privada de 4 tiempos", description: "Precio por persona, mínimo 4 personas. Incluye compras y limpieza.", pricingType: "per_person", amountMxn: 1400, durationMin: 240, booking: "request" },
      { name: "Desayuno en villa", description: "Desayuno servido para tu grupo.", pricingType: "per_person", amountMxn: 450, durationMin: 120, booking: "request" },
      { name: "Clase de cocina yucateca", description: "Cocinamos juntos tres platos de la península y comemos lo que preparamos.", pricingType: "per_person", amountMxn: 900, durationMin: 180, booking: "request" },
      { name: "Evento o estancia completa", description: "Menú y precio según días y número de personas.", pricingType: "custom", amountMxn: null, durationMin: 480, booking: "quote" },
    ],
  },
  {
    profileCode: "TAL-93007",
    email: "demo-sofia-barra@impronta.test",
    displayName: "Sofía Campos",
    siteSlug: "sofia-barra",
    city: "Cancún",
    serviceCategorySlug: "beverage-talent",
    talentTypeSlug: "mixologist",
    theme: "folio",
    tagline: "Bartender y mixóloga para eventos en Cancún",
    bio: "Diseño una carta de cócteles para tu evento y atiendo la barra toda la noche. Tú compras el alcohol con mi lista; yo llevo herramientas y cristalería.",
    services: [
      { name: "Barra para evento", description: "Cinco horas, hasta 60 invitados.", pricingType: "event", amountMxn: 6500, durationMin: 300, booking: "request" },
      { name: "Taller de coctelería", description: "Dos horas para grupos pequeños.", pricingType: "per_person", amountMxn: 600, durationMin: 120, booking: "request" },
    ],
  },
  {
    profileCode: "TAL-93008",
    email: "demo-mariana-merida@impronta.test",
    displayName: "Mariana Pech",
    siteSlug: "mariana-merida",
    city: "Mérida",
    serviceCategorySlug: "tours-experiences",
    talentTypeSlug: "local-experience-host",
    theme: "solace",
    tagline: "Acompañamiento turístico y social en Mérida",
    bio: "Acompañamiento turístico y social, sin servicios románticos ni íntimos. Te muestro Mérida como local: centro, mercados, museos, comida y vida nocturna, y te ayudo con traducción y compras. Nos vemos siempre en lugares públicos.",
    services: [
      { name: "Un día conmigo en Mérida", description: "Seis horas recorriendo el centro, mercados y museos.", pricingType: "event", amountMxn: 2800, durationMin: 360, booking: "request" },
      { name: "Cena y ciudad de noche", description: "Cena en un lugar local y paseo por el centro.", pricingType: "event", amountMxn: 1800, durationMin: 240, booking: "request" },
      { name: "Ayuda con compras y traducción", description: "Por hora, en español, inglés o maya básico.", pricingType: "hour", amountMxn: 450, durationMin: 60, booking: "request" },
    ],
  },
  {
    profileCode: "TAL-93009",
    email: "demo-tomas-foto@impronta.test",
    displayName: "Tomás Aguilar",
    siteSlug: "tomas-retratos",
    city: "Oaxaca",
    serviceCategorySlug: "photography",
    talentTypeSlug: "portrait-photographer",
    theme: "frame",
    hours: { timezone: "America/Mexico_City", days: [3, 4, 5, 6, 0], startMin: 9 * 60, endMin: 18 * 60, slotMinutes: 60 },
    tagline: "Fotografía de retrato en Oaxaca",
    bio: "Hago retratos con luz natural en la calle y en estudio: personales, de pareja y para marca personal.",
    services: [
      { name: "Sesión de retrato", description: "Una hora, 20 fotos editadas.", pricingType: "per_contact", amountMxn: 2200, durationMin: 60, booking: "instant" },
      { name: "Retrato para marca personal", description: "Dos locaciones, 40 fotos editadas.", pricingType: "flat_package", amountMxn: 4200, durationMin: 180, booking: "request" },
    ],
  },
  {
    profileCode: "TAL-93010",
    email: "demo-pablo-entrena@impronta.test",
    displayName: "Pablo Serrano",
    siteSlug: "pablo-entrena",
    city: "Puerto Vallarta",
    serviceCategorySlug: "sports-fitness",
    talentTypeSlug: "personal-trainer",
    theme: "mono",
    hours: { timezone: "America/Mexico_City", days: [1, 2, 3, 4, 5, 6], startMin: 6 * 60, endMin: 12 * 60, slotMinutes: 60 },
    tagline: "Entrenador personal en Puerto Vallarta",
    bio: "Entreno fuerza y acondicionamiento en tu casa, en el parque o en la playa. Armamos un plan según tu nivel.",
    services: [
      { name: "Sesión de entrenamiento", description: "Una hora, a domicilio o al aire libre.", pricingType: "per_contact", amountMxn: 500, durationMin: 60, booking: "instant" },
      { name: "Paquete de 10 sesiones", description: "Diez sesiones con plan de entrenamiento.", pricingType: "flat_package", amountMxn: 4500, durationMin: 600, booking: "request" },
    ],
  },,
  {
    // Folio featured demo (artifact Mateo Ferrer). Password only in seed/.env.local.
    profileCode: "TAL-93011",
    email: "demo-mateo-ferrer@impronta.test",
    displayName: "Mateo Ferrer",
    siteSlug: "mateo-ferrer",
    city: "Ciudad de México",
    serviceCategorySlug: "fashion-models",
    talentTypeSlug: "fashion-model",
    theme: "folio",
    look: "folio-stone",
    hours: {
      timezone: "America/Mexico_City",
      days: [1, 2, 3, 4, 5],
      startMin: 10 * 60,
      endMin: 19 * 60,
      slotMinutes: 90,
      // Casting slots: 10:00, 11:30, 13:00, 16:00, 17:30 CDMX.
      windows: [
        { startMin: 10 * 60, endMin: 14 * 60 + 30 },
        { startMin: 16 * 60, endMin: 19 * 60 },
      ],
    },
    tagline: "Editorial, runway y campañas. 1.88 m, CDMX.",
    bio: "Modelo con siete años entre pasarela y editorial. Llego puntual, con el cabello y la piel listos para cámara.",
    compCard: {
      heightCm: 188,
      suitSize: "40L",
      shoeMx: "28.5",
      languages: "ES/EN",
    },
    albums: [
      { id: "album-mateo-editorial", name: "Editorial" },
      { id: "album-mateo-runway", name: "Runway" },
    ],
    services: [
      {
        name: "Editorial shoot, half day",
        description: "Half-day editorial session.",
        category: "Editorial",
        pricingType: "event",
        amountMxn: 9500,
        durationMin: 240,
        booking: "request",
        priceDisplay: "exact",
      },
      {
        name: "Runway show booking",
        description: "Booking for a runway show.",
        category: "Runway",
        pricingType: "event",
        amountMxn: 7000,
        durationMin: 180,
        booking: "request",
        priceDisplay: "from",
      },
      {
        name: "Lookbook / e-commerce day",
        description: "Full e-commerce or lookbook day.",
        category: "E-commerce",
        pricingType: "event",
        amountMxn: 16000,
        durationMin: 480,
        booking: "request",
        priceDisplay: "exact",
      },
      {
        name: "Casting en persona",
        description: "In-person casting. Free.",
        category: "Casting",
        pricingType: "per_contact",
        amountMxn: null,
        durationMin: 30,
        booking: "instant",
        priceDisplay: "free",
      },
    ],
  },

];
