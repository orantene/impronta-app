/**
 * TUL-584: pure copy builder for the "Google Business Profile" setup guide.
 * Pre-fills each field from the talent's own data so they can copy-paste it
 * into Google. No Google API calls. Missing data yields `value: null` so the
 * UI can show a "add this first" hint instead of an empty or fake value.
 */

export type GbpLang = "en" | "es";

export type GbpProfileInput = {
  displayName?: string | null;
  /** Primary trade label, e.g. "Makeup Artist" or "Barbera". */
  tradeLabel?: string | null;
  homeCity?: string | null;
  /** Street address when the talent works from a fixed place. */
  address?: string | null;
  /** True when the talent travels to clients (service-area business). */
  travelsToClients?: boolean | null;
  /** Free text hours, already human readable. */
  hours?: string | null;
  siteUrl?: string | null;
  bookingUrl?: string | null;
};

export type GbpFieldKey =
  | "name"
  | "category"
  | "location"
  | "hours"
  | "website"
  | "booking";

export type GbpField = {
  key: GbpFieldKey;
  label: string;
  hint: string;
  /** Copy-paste value, or null when the talent has not provided it yet. */
  value: string | null;
  /** Extra copy-ready alternatives (category suggestions). */
  alternatives: string[];
};

export type GbpStep = { id: string; title: string; hint: string; fieldKey: GbpFieldKey | null };

export type GbpGuide = {
  fields: GbpField[];
  steps: GbpStep[];
  missing: GbpFieldKey[];
  claimUrl: string;
};

export const GBP_CLAIM_URL = "https://business.google.com/create";

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : null;
};

/** Trade keyword to Google category suggestions (English labels as Google shows them). */
const CATEGORY_RULES: Array<{ match: RegExp; categories: string[] }> = [
  { match: /make-?up|maquill/i, categories: ["Makeup artist", "Beauty salon"] },
  { match: /hair|barber|estilist|peluq|barbe/i, categories: ["Hair stylist", "Barber shop"] },
  { match: /nail|u(ñ|n)as|manicur/i, categories: ["Nail salon", "Manicurist"] },
  { match: /photograph|fot(o|ó)graf/i, categories: ["Photographer", "Portrait studio"] },
  { match: /model|modelo/i, categories: ["Model", "Talent agency"] },
  { match: /dj\b|music|m(ú|u)sic/i, categories: ["DJ service", "Musician"] },
  { match: /massage|masaj|spa/i, categories: ["Massage therapist", "Day spa"] },
  { match: /trainer|fitness|entrenad/i, categories: ["Personal trainer", "Fitness instructor"] },
  { match: /tattoo|tatuaj/i, categories: ["Tattoo shop", "Tattoo artist"] },
  { match: /lash|pesta(ñ|n)as|brow|ceja/i, categories: ["Eyelash salon", "Beauty salon"] },
];

export function suggestGbpCategories(trade: string | null | undefined): string[] {
  const t = clean(trade);
  if (!t) return [];
  for (const rule of CATEGORY_RULES) if (rule.match.test(t)) return [...rule.categories];
  return [t];
}

const COPY = {
  en: {
    name: ["Business name", "Use the same name your clients know you by."],
    category: ["Main category", "Pick one main category, then add up to two more."],
    locationFixed: ["Address", "Use this if clients come to you."],
    locationArea: ["Service area", "Use this if you travel to clients. Hide your home address."],
    hours: ["Opening hours", "Match the hours clients can book you."],
    website: ["Website", "Your Tulala site."],
    booking: ["Booking link", "Add as the appointment link."],
    steps: [
      ["search", "Search your name on Google Maps", "Claim an existing listing if one shows up.", null],
      ["create", "Add or claim your business", "Start at business.google.com.", "name"],
      ["category", "Choose your category", "Be specific, clients search by it.", "category"],
      ["location", "Set where you work", "Address or service area.", "location"],
      ["hours", "Add your hours", "Keep them current.", "hours"],
      ["links", "Add your website and booking link", "Send clients to your Tulala page.", "website"],
      ["verify", "Verify with Google", "Usually a video or a code by mail or phone.", null],
    ],
  },
  es: {
    name: ["Nombre del negocio", "Usa el nombre con el que te conocen tus clientes."],
    category: ["Categoría principal", "Elige una principal y agrega hasta dos más."],
    locationFixed: ["Dirección", "Úsala si tus clientes van a ti."],
    locationArea: ["Área de servicio", "Úsala si viajas con tus clientes. Oculta tu dirección personal."],
    hours: ["Horario", "Que coincida con el horario en que te pueden reservar."],
    website: ["Sitio web", "Tu sitio en Tulala."],
    booking: ["Enlace de reservas", "Agrégalo como enlace de citas."],
    steps: [
      ["search", "Busca tu nombre en Google Maps", "Reclama la ficha si ya existe.", null],
      ["create", "Agrega o reclama tu negocio", "Empieza en business.google.com.", "name"],
      ["category", "Elige tu categoría", "Sé específico, así te buscan.", "category"],
      ["location", "Indica dónde trabajas", "Dirección o área de servicio.", "location"],
      ["hours", "Agrega tu horario", "Mantenlo al día.", "hours"],
      ["links", "Agrega tu sitio y enlace de reservas", "Lleva a tus clientes a tu página de Tulala.", "website"],
      ["verify", "Verifica con Google", "Suele ser un video o un código por correo o teléfono.", null],
    ],
  },
} as const;

export function buildGbpGuide(input: GbpProfileInput, lang: GbpLang): GbpGuide {
  const c = COPY[lang];
  const city = clean(input.homeCity);
  const address = clean(input.address);
  const serviceArea = input.travelsToClients === true || !address;
  const categories = suggestGbpCategories(input.tradeLabel);
  const locationValue = serviceArea ? city : address;
  const loc = serviceArea ? c.locationArea : c.locationFixed;

  const fields: GbpField[] = [
    { key: "name", label: c.name[0], hint: c.name[1], value: clean(input.displayName), alternatives: [] },
    {
      key: "category",
      label: c.category[0],
      hint: c.category[1],
      value: categories[0] ?? null,
      alternatives: categories.slice(1),
    },
    { key: "location", label: loc[0], hint: loc[1], value: locationValue, alternatives: [] },
    { key: "hours", label: c.hours[0], hint: c.hours[1], value: clean(input.hours), alternatives: [] },
    { key: "website", label: c.website[0], hint: c.website[1], value: clean(input.siteUrl), alternatives: [] },
    { key: "booking", label: c.booking[0], hint: c.booking[1], value: clean(input.bookingUrl), alternatives: [] },
  ];

  return {
    fields,
    steps: c.steps.map(([id, title, hint, fieldKey]) => ({ id, title, hint, fieldKey })),
    missing: fields.filter((f) => f.value === null).map((f) => f.key),
    claimUrl: GBP_CLAIM_URL,
  };
}
