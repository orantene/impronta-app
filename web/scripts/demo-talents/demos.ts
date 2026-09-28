/**
 * Demo talent roster (Stream D, 2026-09-28). Fictional people only: no real
 * brands, no invented credentials, reviews or outcomes. One consistent person
 * per demo. Prices are MXN cents. `booking` maps to the service booking mode:
 * instant = isInstantBook, request/quote = inquiry (quote has no amount).
 *
 * Photos are NOT listed here: they come from the design session's demo packs
 * via --photos <pack.json> (see seed.mts), with Unsplash sources recorded.
 */

export type DemoService = {
  name: string;
  description: string;
  pricingType: "hour" | "event" | "per_person" | "per_contact" | "flat_package" | "custom";
  amountMxn: number | null;
  booking: "instant" | "request" | "quote";
};

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
  /** Suggested theme from theme-popular-demos.md; applied once Designs land. */
  theme: string;
  tagline: string;
  bio: string;
  services: DemoService[];
};

export const DEMO_BATCH = "demo-2026-09-28";

export const DEMOS: DemoTalent[] = [
  {
    profileCode: "TAL-93001",
    email: "demo-valeria-baile@impronta.test",
    displayName: "Valeria Ortiz",
    siteSlug: "valeria-baila",
    city: "Ciudad de México",
    serviceCategorySlug: "dancers",
    talentTypeSlug: "latin-dancer",
    theme: "tempo",
    tagline: "Salsa y bachata · clases y shows en CDMX",
    bio: "Bailo salsa y bachata y doy clases privadas y para parejas. Preparo coreografías de primer baile y hago shows para eventos.",
    services: [
      { name: "Clase privada de salsa o bachata", description: "Una hora, para una persona o pareja, en tu casa o en estudio.", pricingType: "per_contact", amountMxn: 700, booking: "instant" },
      { name: "Coreografía de primer baile", description: "Tres ensayos para crear y practicar su baile de boda.", pricingType: "flat_package", amountMxn: 4500, booking: "request" },
      { name: "Show para eventos", description: "Presentación de salsa y bachata para bodas y fiestas.", pricingType: "custom", amountMxn: null, booking: "quote" },
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
    theme: "maison",
    tagline: "Extensiones y lifting de pestañas en Playa del Carmen",
    bio: "Trabajo pestañas clásicas, volumen y lifting en mi estudio. Cada set lo diseño según la forma de tus ojos.",
    services: [
      { name: "Pestañas clásicas", description: "Set completo, una extensión por pestaña natural.", pricingType: "per_contact", amountMxn: 900, booking: "instant" },
      { name: "Volumen ruso", description: "Set completo con abanicos hechos a mano.", pricingType: "per_contact", amountMxn: 1200, booking: "request" },
      { name: "Lifting y tinte", description: "Curvatura natural que dura de 6 a 8 semanas.", pricingType: "per_contact", amountMxn: 650, booking: "request" },
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
    theme: "maison",
    tagline: "Uñas acrílicas, gel y nail art en Guadalajara",
    bio: "Hago uñas acrílicas, gel y diseños a mano. Tú eliges el largo y la forma; yo te propongo el diseño.",
    services: [
      { name: "Manicure en gel", description: "Color liso con preparación completa.", pricingType: "per_contact", amountMxn: 350, booking: "instant" },
      { name: "Set acrílico", description: "Largo corto, medio o largo; el precio sube con el largo.", pricingType: "per_contact", amountMxn: 550, booking: "request" },
      { name: "Nail art por uña", description: "Diseño a mano sobre cualquier set.", pricingType: "per_contact", amountMxn: 40, booking: "request" },
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
      { name: "Sesión de catálogo", description: "Medio día en estudio o locación.", pricingType: "event", amountMxn: 6000, booking: "request" },
      { name: "Campaña o contenido de marca", description: "Tarifa según uso, medios y duración.", pricingType: "custom", amountMxn: null, booking: "quote" },
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
    theme: "stage",
    tagline: "DJ para bodas, fiestas y eventos en Monterrey",
    bio: "Soy DJ open format: latino, pop, house y clásicos. Llevo mi equipo de sonido y armo la música contigo antes del evento.",
    services: [
      { name: "DJ para boda", description: "Cinco horas con equipo de sonido e iluminación básica.", pricingType: "event", amountMxn: 12000, booking: "request" },
      { name: "DJ para fiesta privada", description: "Cuatro horas con equipo.", pricingType: "event", amountMxn: 7000, booking: "request" },
      { name: "Hora extra", description: "Se agrega el mismo día del evento.", pricingType: "hour", amountMxn: 1500, booking: "request" },
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
    theme: "table",
    tagline: "Chef privado · cenas en tu casa o villa en Tulum",
    bio: "Cocino cenas de varios tiempos con producto local de la península. Hago las compras, cocino en tu cocina y dejo todo limpio.",
    services: [
      { name: "Cena privada de 4 tiempos", description: "Precio por persona, mínimo 4 personas. Incluye compras y limpieza.", pricingType: "per_person", amountMxn: 1400, booking: "request" },
      { name: "Desayuno en villa", description: "Desayuno servido para tu grupo.", pricingType: "per_person", amountMxn: 450, booking: "request" },
      { name: "Evento o estancia completa", description: "Menú y precio según días y número de personas.", pricingType: "custom", amountMxn: null, booking: "quote" },
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
    theme: "table",
    tagline: "Bartender y mixóloga para eventos en Cancún",
    bio: "Diseño una carta de cócteles para tu evento y atiendo la barra toda la noche. Tú compras el alcohol con mi lista; yo llevo herramientas y cristalería.",
    services: [
      { name: "Barra para evento", description: "Cinco horas, hasta 60 invitados.", pricingType: "event", amountMxn: 6500, booking: "request" },
      { name: "Taller de coctelería", description: "Dos horas para grupos pequeños.", pricingType: "per_person", amountMxn: 600, booking: "request" },
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
    theme: "atlas",
    tagline: "Acompañamiento turístico y social en Mérida",
    bio: "Te muestro Mérida como local: centro, mercados, museos, comida y vida nocturna. Ayudo con traducción y compras. Acompañamiento turístico y social. No ofrezco servicios románticos ni íntimos. Nos vemos siempre en lugares públicos.",
    services: [
      { name: "Un día conmigo en Mérida", description: "Seis horas recorriendo el centro, mercados y museos.", pricingType: "event", amountMxn: 2800, booking: "request" },
      { name: "Cena y ciudad de noche", description: "Cena en un lugar local y paseo por el centro.", pricingType: "event", amountMxn: 1800, booking: "request" },
      { name: "Ayuda con compras y traducción", description: "Por hora, en español, inglés o maya básico.", pricingType: "hour", amountMxn: 450, booking: "request" },
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
    tagline: "Fotografía de retrato en Oaxaca",
    bio: "Hago retratos con luz natural en la calle y en estudio: personales, de pareja y para marca personal.",
    services: [
      { name: "Sesión de retrato", description: "Una hora, 20 fotos editadas.", pricingType: "per_contact", amountMxn: 2200, booking: "instant" },
      { name: "Retrato para marca personal", description: "Dos locaciones, 40 fotos editadas.", pricingType: "flat_package", amountMxn: 4200, booking: "request" },
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
    theme: "tempo",
    tagline: "Entrenador personal en Puerto Vallarta",
    bio: "Entreno fuerza y acondicionamiento en tu casa, en el parque o en la playa. Armamos un plan según tu nivel.",
    services: [
      { name: "Sesión de entrenamiento", description: "Una hora, a domicilio o al aire libre.", pricingType: "per_contact", amountMxn: 500, booking: "instant" },
      { name: "Paquete de 10 sesiones", description: "Diez sesiones con plan de entrenamiento.", pricingType: "flat_package", amountMxn: 4500, booking: "request" },
    ],
  },
];
