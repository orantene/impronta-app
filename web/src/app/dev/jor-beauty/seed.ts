/**
 * Jorg Beauty — seed data for the Maison profile mockup.
 *
 * DEV HARNESS ONLY. Nothing here is a parallel data model: every object is an
 * instance of a PRODUCTION type, shaped exactly as the real loaders return it —
 *
 *   TalentOffering[]   ← loadPublicOfferingsForProfile() (talent_offerings
 *                        + talent_offering_variants + talent_offering_addons)
 *   GalleryItem[]      ← media_assets rows resolved by the profile loader
 *   MaisonContent      ← the template's optional editorial block
 *
 * so the same page renders unchanged the day these rows exist in Supabase.
 *
 * TRUTH DISCIPLINE. Jorgelina confirmed: identity, profession, area, days,
 * notice, languages, years, speciality, style, the full price list, and the
 * courtesy russian manicure. She has NOT confirmed: phone/WhatsApp, Instagram,
 * exact address, appointment durations, payment methods, deposit, cancellation
 * or late policy, certifications, reviews, product brands. Nothing in that
 * second list is invented here:
 *   - no phone / social / address fields are populated at all,
 *   - no reviews or testimonials are seeded (the section hides itself),
 *   - DURATIONS are the one exception the brief allows — they are needed for
 *     the appointment demo, so they are seeded and marked with an asterisk in
 *     the UI ("Duración estimada. Se confirma al agendar.") and listed in
 *     docs/mockups/jor-beauty-profile-2026-09-22.md as required before publish.
 */

import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";
import type { MaisonContent } from "@/app/t/[profileCode]/_maison/maison-content";
import type { MaisonShot } from "@/app/t/[profileCode]/_maison/MaisonGallery";

const TENANT_ID = "seed-jor-beauty-tenant";
const TALENT_ID = "seed-jor-beauty-talent";
const IMG = "/mockups/jor-beauty/v2";
const PORTRAIT = "/mockups/jor-beauty/jorgelina-portrait-v2.jpg";
const LOGO = "/mockups/jor-beauty/jorg-beauty-logo.png";

export const JOR_BEAUTY_PROFILE_CODE = "TA-JORGBEAUTY";

/** The four catalogue categories (talent_offerings.category). */
export const JOR_CATEGORIES = [
  { id: "pestanas", label: "Pestañas", note: null },
  { id: "unas", label: "Uñas", note: "Todos los servicios de uñas incluyen manicura rusa de cortesía." },
  { id: "cejas", label: "Cejas", note: null },
  { id: "depilacion", label: "Depilación", note: null },
] as const;

type Seed = {
  id: string;
  title: string;
  description?: string | null;
  /**
   * English siblings. `talent_offerings` already stores `title_i18n` /
   * `description_i18n` and `offeringText(row, field, locale)` resolves them,
   * so this mirrors production rather than inventing a parallel scheme.
   */
  titleEn?: string;
  descriptionEn?: string | null;
  category: string;
  /** Major units (MXN). Converted to cents below. */
  price: number | null;
  /** Seeded estimate — REQUIRES CONFIRMATION before publish. */
  minutes: number | null;
  kind?: TalentOffering["kind"];
  featured?: boolean;
  image?: string | null;
  variants?: { label: string; labelEn?: string; price: number }[];
  addOns?: { label: string; labelEn?: string; price: number }[];
  /** "On request" services carry no public price. */
  onRequest?: boolean;
};

/** Designs Jorgelina offers on top of any nail service. */
const NAIL_ADD_ONS = [
  { label: "Ojo de gato", labelEn: "Cat eye", price: 100 },
  { label: "French", labelEn: "French", price: 100 },
  { label: "Otros efectos", labelEn: "Other effects", price: 50 },
];

const SEEDS: Seed[] = [
  // ── Uñas ────────────────────────────────────────────────────────────────
  {
    id: "gel-semipermanente",
    title: "Gel semipermanente",
    description: "Esmaltado semipermanente con acabado parejo y brillo duradero. Incluye manicura rusa.",
    category: "unas",
    price: 300,
    minutes: 90,
    featured: true,
    image: `${IMG}/g-05.jpg`,
    addOns: NAIL_ADD_ONS,
    titleEn: "Semi-permanent gel",
    descriptionEn: "Even, long-lasting gel colour with a high-gloss finish. Russian manicure included.",
  },
  {
    id: "soft-gel",
    title: "Soft Gel",
    description: "Extensiones con tips de soft gel, ligeras y naturales. Elige el largo que prefieras.",
    category: "unas",
    price: 500,
    minutes: 150,
    featured: true,
    image: `${IMG}/cat-nails.jpg`,
    variants: [
      { label: "Largo #2", labelEn: "Length #2", price: 500 },
      { label: "Largo #3", labelEn: "Length #3", price: 550 },
      { label: "Largo #4 o #5", labelEn: "Length #4 or #5", price: 600 },
    ],
    addOns: NAIL_ADD_ONS,
    titleEn: "Soft gel extensions",
    descriptionEn: "Soft gel tips: light, natural extensions. Choose the length you prefer.",
  },
  {
    id: "acrygel",
    title: "Acrygel",
    description: "Estructura firme con acabado natural, ideal para uñas que necesitan refuerzo.",
    category: "unas",
    price: 550,
    minutes: 150,
    variants: [
      { label: "Largo #2 o #3", labelEn: "Length #2 or #3", price: 550 },
      { label: "Largo #4 o #5", labelEn: "Length #4 or #5", price: 650 },
    ],
    addOns: NAIL_ADD_ONS,
    titleEn: "Acrygel",
    descriptionEn: "A firm structure with a natural finish, for nails that need reinforcement.",
  },
  {
    id: "rubber-gel",
    title: "Rubber Gel",
    description: "Refuerzo flexible sobre uña natural, con acabado suave y discreto.",
    category: "unas",
    price: 350,
    minutes: 120,
    addOns: NAIL_ADD_ONS,
    titleEn: "Rubber gel",
    descriptionEn: "Flexible reinforcement over the natural nail, soft and discreet.",
  },
  {
    id: "gel-pies",
    title: "Gel en pies",
    description: "Semipermanente en pies, con trabajo de cutícula y acabado prolijo.",
    category: "unas",
    price: 300,
    minutes: 75,
    titleEn: "Gel pedicure",
    descriptionEn: "Semi-permanent colour on toes, with cuticle work and a clean finish.",
  },
  {
    id: "reposicion-una",
    title: "Reposición de una uña",
    description: "Reparación puntual, por unidad.",
    category: "unas",
    price: 80,
    minutes: 20,
    titleEn: "Single nail repair",
    descriptionEn: "A one-off repair, priced per nail.",
  },
  {
    id: "remocion-acrilico",
    title: "Remoción de acrílico, polygel o Soft Gel",
    description: "Retiro cuidadoso sin dañar la uña natural.",
    category: "unas",
    price: 250,
    minutes: 45,
    titleEn: "Acrylic, polygel or soft gel removal",
    descriptionEn: "Careful removal that does not damage the natural nail.",
  },
  {
    id: "remocion-semi",
    title: "Remoción de semipermanente",
    category: "unas",
    price: 50,
    minutes: 20,
    titleEn: "Gel polish removal",
  },

  // ── Extensiones de pestañas ─────────────────────────────────────────────
  {
    id: "ext-clasicas",
    title: "Extensiones clásicas",
    description: "Una extensión por pestaña natural. El efecto más discreto, ideal para el día a día.",
    category: "pestanas",
    price: 700,
    minutes: 120,
    featured: true,
    image: `${IMG}/cat-lashes.jpg`,
    titleEn: "Classic lash extensions",
    descriptionEn: "One extension per natural lash. The most discreet effect, made for every day.",
  },
  {
    id: "ext-rimel",
    title: "Efecto rímel",
    description: "Densidad pareja de punta a punta, como un rímel siempre puesto.",
    category: "pestanas",
    price: 800,
    minutes: 135,
    titleEn: "Mascara effect",
    descriptionEn: "Even density from end to end, like mascara that never comes off.",
  },
  {
    id: "ext-2d",
    title: "Tecnológicas 2D",
    description: "Abanicos de dos puntas para sumar volumen sin peso.",
    category: "pestanas",
    price: 750,
    minutes: 135,
    titleEn: "2D volume fans",
    descriptionEn: "Two-point fans that add volume without weight.",
  },
  {
    id: "ext-3d",
    title: "Tecnológicas 3D",
    description: "Tres puntas por abanico: más cuerpo, mismo acabado natural.",
    category: "pestanas",
    price: 850,
    minutes: 150,
    titleEn: "3D volume fans",
    descriptionEn: "Three points per fan: more body, same natural finish.",
  },
  {
    id: "ext-4d5d",
    title: "Tecnológicas 4D o 5D",
    description: "Volumen marcado, con la línea de agua bien definida.",
    category: "pestanas",
    price: 950,
    minutes: 165,
    titleEn: "4D and 5D volume fans",
    descriptionEn: "Pronounced volume with a clearly defined lash line.",
  },
  {
    id: "ext-volumen-americano",
    title: "Volumen americano",
    description: "El efecto más intenso del menú, construido abanico por abanico.",
    category: "pestanas",
    price: 1000,
    minutes: 180,
    titleEn: "American volume",
    descriptionEn: "The boldest effect on the menu, built fan by fan.",
  },

  // ── Pestañas y cejas ────────────────────────────────────────────────────
  {
    id: "lifting",
    title: "Lifting de pestañas",
    description: "Curva desde la raíz sobre tu propia pestaña, sin extensiones.",
    category: "pestanas",
    price: 400,
    minutes: 60,
    image: `${IMG}/g-02.jpg`,
    titleEn: "Lash lift",
    descriptionEn: "A curl from the root on your own lashes, no extensions.",
  },
  {
    id: "lami-brows",
    title: "Lami Brows — laminado de cejas",
    description: "Cejas peinadas hacia arriba, con forma definida y fijada.",
    category: "cejas",
    price: 260,
    minutes: 60,
    image: `${IMG}/cat-brows.jpg`,
    titleEn: "Lami Brows — brow lamination",
    descriptionEn: "Brows brushed upward, shaped and set in place.",
  },
  {
    id: "set-lifting-lami",
    title: "Set: lifting + Lami Brows",
    description: "Lifting de pestañas y laminado de cejas en una misma cita, a precio de set: $500 en total, no $660 por separado.",
    category: "pestanas",
    price: 500,
    minutes: 105,
    kind: "package",
    featured: true,
    image: `${IMG}/g-04.jpg`,
    titleEn: "Set: lash lift + Lami Brows",
    descriptionEn: "Lash lift and brow lamination in one appointment, at a set price: $500 in total, not $660 separately.",
  },
  {
    id: "perfilado",
    title: "Perfilado de cejas",
    description: "Diseño y limpieza de la forma.",
    category: "cejas",
    price: 100,
    minutes: 20,
    titleEn: "Brow shaping",
    descriptionEn: "Shaping and clean-up of the brow line.",
  },
  {
    id: "henna-brows",
    title: "Henna Brows",
    description: "Tinte con henna que rellena huecos y marca la forma por varios días.",
    category: "cejas",
    price: 300,
    minutes: 45,
    titleEn: "Henna Brows",
    descriptionEn: "A henna tint that fills gaps and holds the shape for several days.",
  },

  // ── Depilación facial con cera ──────────────────────────────────────────
  { id: "cera-bozo", title: "Bozo", titleEn: "Upper lip", category: "depilacion", price: 100, minutes: 15 },
  { id: "cera-cejas", title: "Cejas", titleEn: "Brows", category: "depilacion", price: 100, minutes: 15 },
  {
    id: "cera-rostro",
    title: "Rostro completo",
    description: "Bozo, mentón, patillas y mejillas en una sola sesión.",
    category: "depilacion",
    price: 300,
    minutes: 45,
    image: `${IMG}/cat-wax.jpg`,
    titleEn: "Full face",
    descriptionEn: "Upper lip, chin, sideburns and cheeks in a single session.",
  },
];

/**
 * A thumbnail for EVERY row. Leaving some rows imageless read as missing
 * pictures rather than as restraint, so each service points at the closest
 * image in the set; small repeats across a category are fine at 92px.
 */
const THUMB_BY_ID: Record<string, string> = {
  "ext-clasicas": "cat-lashes", "ext-rimel": "g-04", "ext-2d": "hero-lash",
  "ext-3d": "cat-lashes", "ext-4d5d": "g-04", "ext-volumen-americano": "hero-lash",
  lifting: "g-02", "set-lifting-lami": "cat-brows",
  "gel-semipermanente": "g-05", "soft-gel": "cat-nails", acrygel: "g-03",
  "rubber-gel": "g-01", "gel-pies": "g-06", "reposicion-una": "hero-nails",
  "remocion-acrilico": "g-03", "remocion-semi": "g-05",
  "lami-brows": "cat-brows", perfilado: "cat-brows", "henna-brows": "cat-brows",
  "cera-bozo": "cat-wax", "cera-cejas": "cat-wax", "cera-rostro": "cat-wax",
};

function toOffering(s: Seed, index: number, locale = "es"): TalentOffering {
  return {
    id: s.id,
    talentProfileId: TALENT_ID,
    ownerKind: "talent",
    tenantId: TENANT_ID,
    kind: s.kind ?? "service",
    title: locale.startsWith("en") ? (s.titleEn ?? s.title) : s.title,
    description:
      locale.startsWith("en") ? (s.descriptionEn ?? s.description ?? null) : (s.description ?? null),
    priceType: "flat_package",
    priceDisplay: s.onRequest ? "quote" : "exact",
    amountCents: s.price != null ? s.price * 100 : null,
    currency: "MXN",
    // Direct booking: she takes appointments, collects nothing up front, and is
    // paid at the studio. No deposit is invented — reserveMode "free" +
    // allowPayInPerson is exactly "reserve the slot, pay when you come".
    bookingMode: s.onRequest ? "request" : "instant",
    reserveMode: "free",
    depositPct: null,
    allowPayInPerson: true,
    requireAccountToBook: false,
    cancellationHours: null,
    freeReserveExpiresDays: null,
    durationMinutes: s.minutes,
    category: s.category,
    inventoryQty: null,
    status: "published",
    visibility: s.onRequest ? "on_request" : "public",
    moderationState: "approved",
    isFeatured: s.featured === true,
    sortOrder: index,
    attributes: {},
    imageUrls: [s.image ?? (THUMB_BY_ID[s.id] ? `${IMG}/${THUMB_BY_ID[s.id]}.jpg` : null)].filter(
      (u): u is string => Boolean(u),
    ),
    variants: (s.variants ?? []).map((v, i) => ({
      id: `${s.id}-v${i}`,
      label: locale.startsWith("en") ? (v.labelEn ?? v.label) : v.label,
      amountCents: v.price * 100,
    })),
    addOns: (s.addOns ?? []).map((a, i) => ({
      id: `${s.id}-a${i}`,
      label: locale.startsWith("en") ? (a.labelEn ?? a.label) : a.label,
      amountCents: a.price * 100,
    })),
  };
}

export const JOR_OFFERINGS: TalentOffering[] = SEEDS.map((x, i) => toOffering(x, i, "es"));

/** The same catalogue resolved for a locale, exactly as the loader would. */
export function jorOfferings(locale: string): TalentOffering[] {
  return SEEDS.map((x, i) => toOffering(x, i, locale));
}


// ── Skills (talent_profile_taxonomy → resolvedSkills) ───────────────────────
// The trust strip reads THESE, not authored copy: "7 años" is the largest
// years_experience, "Pestañas" is the primary_role term. Terms below already
// exist in the platform taxonomy (Lash Artist / Lashista, Nail Artist, Brow…).
// `is_verified` stays false — nobody has verified her, and the page never
// claims otherwise.

function skill(
  slug: string,
  en: string,
  es: string,
  relationship: ResolvedSkill["relationship_type"],
  years: number,
  order: number,
): ResolvedSkill {
  return {
    skill_term_id: `seed-${slug}`,
    skill_slug: slug,
    skill_name_en: en,
    skill_name_es: es,
    is_generic_fallback: false,
    parent_category_id: null,
    parent_category_slug: "beauty-services",
    parent_category_name_en: "Beauty Services",
    relationship_type: relationship,
    proficiency_level: null,
    years_experience: years,
    display_order: order,
    is_verified: false,
    verified_at: null,
    verified_by_tenant_id: null,
    verification_note: null,
    created_at: "2026-09-22T00:00:00.000Z",
    booking_count: 0,
    last_booked_at: null,
  };
}

export const JOR_SKILLS: ResolvedSkill[] = [
  skill("lash-artist", "Lash Artist", "Pestañas", "primary_role", 7, 0),
  skill("nail-artist", "Nail Artist", "Uñas", "secondary_role", 7, 1),
  skill("brow-artist", "Brow Artist", "Cejas", "secondary_role", 5, 2),
];

// ── Curated results ────────────────────────────────────────────────────────
// Eight shots, each tied to the service it shows, in controlled ratios. These
// are AI reference images for the prototype, NOT photographs of Jorgelina's
// client work — the gallery says so under the grid.

export const JOR_GALLERY: MaisonShot[] = [
  { id: "g1", url: `${IMG}/g-04.jpg`, label: "Volumen americano" },
  { id: "g2", url: `${IMG}/g-03.jpg`, label: "Manicura rusa + gel" },
  // `studio.jpg` came back as a brow-shaping shot, not the still life it was
  // prompted for — so it is captioned for what it actually SHOWS.
  { id: "g3", url: `${IMG}/studio.jpg`, label: "Perfilado de cejas", wide: true },
  { id: "g4", url: `${IMG}/g-02.jpg`, label: "Lifting de pestañas" },
  { id: "g5", url: `${IMG}/g-01.jpg`, label: "Rubber gel" },
  { id: "g6", url: `${IMG}/cat-brows.jpg`, label: "Lami Brows" },
  { id: "g7", url: `${IMG}/g-05.jpg`, label: "Ojo de gato" },
  { id: "g8", url: `${IMG}/g-07.jpg`, label: "Soft Gel con french" },
  { id: "g9", url: `${IMG}/g-08.jpg`, label: "Henna Brows" },
  { id: "g10", url: `${IMG}/g-09.jpg`, label: "Depilación facial" },
  { id: "g11", url: `${IMG}/g-06.jpg`, label: "Gel en pies" },
];

/**
 * The profile's own media rows (`media_assets` → `galleryItems`). The template
 * derives an uncaptioned gallery from THESE when no curated block is set, so
 * the fallback path is real and not theoretical.
 */
export type SeedGalleryItem = { id: string; url: string; width: number; height: number };
export const JOR_MEDIA: SeedGalleryItem[] = JOR_GALLERY.map((g) => ({
  id: g.id,
  url: g.url,
  width: 1024,
  height: ["g-04.jpg", "g-01.jpg", "g-06.jpg", "g-09.jpg"].some((n) => g.url.endsWith(n)) ? 1536 : 1024,
}));

// ── Profile copy (approved by Jorgelina) ───────────────────────────────────

export const JOR_BIO = [
  "Soy Jorgelina, creadora de Jorg Beauty. Mi amor por la cosmética y la estética comenzó mucho antes de dedicarme profesionalmente a este mundo. Durante tres años estudié Ingeniería, pero con el tiempo entendí que mi verdadera pasión estaba en crear, cuidar los detalles y ayudar a otras personas a sentirse más lindas y seguras.",
  "Hace siete años decidí seguir esa vocación y comenzar mi camino como profesional de la belleza. Hoy me especializo especialmente en pestañas, además de ofrecer servicios de uñas, cejas y depilación facial.",
  "Mi trabajo se caracteriza por una atención amable y personalizada, la delicadeza, la flexibilidad y el interés por mantenerme al día con nuevos efectos y tendencias. Cada cita es un momento dedicado a la clienta, sus gustos y el resultado que desea conseguir.",
].join("\n\n");

export const JOR_MAISON_CONTENT: MaisonContent = {
  wordmarkImageUrl: LOGO,
  wordmarkImageRatio: 548 / 180,

  heroKicker: "Playa del Carmen Centro",
  heroTitle: "Tu mirada,",
  heroTitleAccent: "tu estilo.",
  heroLead:
    "Pestañas, uñas y cejas con un acabado elegante y atención personalizada, en un estudio privado en Playa del Carmen Centro.",
  heroImageUrl: `${IMG}/hero-lash.jpg`,
  heroInsetUrl: `${IMG}/hero-nails.jpg`,
  // heroFacts intentionally unset — derived from JOR_SKILLS so it moves with her profile.

  marquee: ["Pestañas", "Uñas", "Cejas", "Depilación"],

  artist: {
    greeting: "Hola, soy Jorgelina",
    paragraphs: [
      "Estudié Ingeniería durante tres años hasta que entendí que mi verdadera vocación estaba en la estética: crear, cuidar los detalles y ayudar a otras personas a sentirse más lindas y seguras.",
      "Hace siete años seguí esa vocación. Hoy me especializo en pestañas, y también trabajo uñas, cejas y depilación facial. Cada cita es un rato dedicado a vos, a tus gustos y al resultado que querés conseguir.",
    ],
    moreLabel: "Leer la historia completa",
    more: [
      "Mi trabajo se caracteriza por una atención amable y personalizada, la delicadeza, la flexibilidad y el interés por mantenerme al día con nuevos efectos y tendencias.",
    ],
  },

  menuCategories: JOR_CATEGORIES.map((c) => ({ id: c.id, label: c.label, note: c.note })),
  menuNote: "Todos los precios en pesos mexicanos (MXN). Se paga en el estudio.",

  gallery: JOR_GALLERY,
  galleryNote:
    "Imágenes de referencia del estilo de trabajo, generadas para este prototipo. No son fotografías de clientas de Jorg Beauty.",

  visiting: {
    map: {
      imageUrl: "/mockups/jor-beauty/area-map.jpg",
      caption: "Playa del Carmen Centro",
      attribution: "Zona aproximada · mapa © OpenStreetMap. La dirección exacta se comparte al confirmar la cita.",
    },
    facts: [
      { icon: "place", label: "Zona", value: "Playa del Carmen Centro, Quintana Roo" },
      { icon: "studio", label: "Estudio", value: "Estudio privado. La ubicación completa se comparte al confirmar la cita." },
      { icon: "days", label: "Días", value: "Lunes a sábado" },
      { icon: "heart", label: "Citas", value: "Únicamente con cita previa" },
      { icon: "clock", label: "Anticipación", value: "Se recomienda reservar con 24 horas; también podés consultar por disponibilidad de último momento." },
      { icon: "languages", label: "Idiomas", value: "Español · Inglés básico" },
    ],
  },

  // NOT CONFIRMED by Jorgelina — shown so the contact row can be judged, with
  // every link inert (`demo: true`). Swap in her real handles and drop the
  // flag and they go live untouched.
  contact: {
    whatsapp: "5219841234567",
    instagram: "jorgbeauty",
    tiktok: "jorgbeauty",
    email: "hola@jorgbeauty.mx",
    demo: true,
    note: "Ejemplo: falta confirmar el WhatsApp, el correo y las cuentas de Jorgelina. Los enlaces están desactivados hasta entonces.",
  },

  faqIntro: "Lo que suelen preguntarme antes de reservar.",
  faq: [
    {
      q: "¿Cómo reservo una cita?",
      a: "Desde esta misma página, en cuatro pasos:",
      steps: [
        { title: "Elegí tu servicio", detail: "Del menú, con su largo y sus diseños." },
        { title: "Mirá los horarios", detail: "Días y horas reales, de lunes a sábado." },
        { title: "Dejá tus datos", detail: "Nombre y un contacto para confirmarte." },
        { title: "Recibí la dirección", detail: "Te comparto el estudio al confirmar." },
      ],
    },
    {
      q: "¿Dónde atendés?",
      a: "En un estudio privado en Playa del Carmen Centro. La dirección completa se comparte al confirmar la cita.",
    },
    { q: "¿Necesito reservar?", a: "Sí. La atención es únicamente con cita previa." },
    {
      q: "¿Con cuánta anticipación conviene reservar?",
      a: "Idealmente con 24 horas. Si necesitás algo de último momento, consultá igual: a veces hay lugar.",
    },
    {
      q: "¿La manicura rusa tiene costo adicional?",
      a: "No. Está incluida como cortesía en los servicios de uñas.",
    },
  ],

  closing: {
    title: "Nos vemos",
    titleAccent: "en el estudio.",
    body: "Elegí tu servicio y encontrá un horario que te quede bien.",
  },
};


/**
 * The English profile. A TRANSLATION of the copy Jorgelina approved in
 * Spanish — nothing here says anything her Spanish page does not. Playa del
 * Carmen is a tourist town and she lists "Inglés básico", so an English
 * visitor is a real audience, not a hypothetical one.
 *
 * NEEDS HER SIGN-OFF before publishing: she may want warmer or plainer
 * wording than a literal rendering gives, and it is her voice.
 */
export const JOR_MAISON_CONTENT_EN: MaisonContent = {
  ...JOR_MAISON_CONTENT,
  heroKicker: "Playa del Carmen Centro",
  heroTitle: "Your eyes,",
  heroTitleAccent: "your style.",
  heroLead:
    "Lashes, nails and brows finished with care and unhurried, personal attention, in a private studio in Playa del Carmen Centro.",
  marquee: ["Lashes", "Nails", "Brows", "Waxing"],

  artist: {
    greeting: "Hi, I'm Jorgelina",
    paragraphs: [
      "I studied engineering for three years, until I understood that what I really wanted was in beauty: making things, caring about the details, and helping other people feel prettier and more sure of themselves.",
      "Seven years ago I followed that. Today I specialise in lashes, and I also do nails, brows and facial waxing. Every appointment is time set aside for you, for what you like, and for the result you want.",
    ],
    moreLabel: "Read the whole story",
    more: [
      "My work is defined by kind, personal attention, a delicate hand, flexibility, and keeping up with new effects and trends.",
    ],
  },

  menuCategories: [
    { id: "pestanas", label: "Lashes", note: null },
    { id: "unas", label: "Nails", note: "Every nail service includes a complimentary Russian manicure." },
    { id: "cejas", label: "Brows", note: null },
    { id: "depilacion", label: "Waxing", note: null },
  ],
  menuNote: "All prices in Mexican pesos (MXN). Paid at the studio.",

  gallery: JOR_GALLERY.map((g) => ({
    ...g,
    label: {
      "Volumen americano": "American volume",
      "Manicura rusa + gel": "Russian manicure + gel",
      "Perfilado de cejas": "Brow shaping",
      "Lifting de pestañas": "Lash lift",
      "Rubber gel": "Rubber gel",
      "Lami Brows": "Lami Brows",
      "Ojo de gato": "Cat eye",
      "Soft Gel con french": "Soft gel with french",
      "Henna Brows": "Henna Brows",
      "Depilación facial": "Facial waxing",
      "Gel en pies": "Gel pedicure",
    }[g.label] ?? g.label,
  })),
  galleryNote:
    "Reference images of the style of work, generated for this prototype. They are not photographs of Jorg Beauty clients.",

  visiting: {
    map: {
      imageUrl: "/mockups/jor-beauty/area-map.jpg",
      caption: "Playa del Carmen Centro",
      attribution:
        "Approximate area · map © OpenStreetMap. The exact address is shared once your appointment is confirmed.",
    },
    facts: [
      { icon: "place", label: "Area", value: "Playa del Carmen Centro, Quintana Roo" },
      { icon: "studio", label: "Studio", value: "A private studio. The full location is shared once your appointment is confirmed." },
      { icon: "days", label: "Days", value: "Monday to Saturday" },
      { icon: "heart", label: "Appointments", value: "By appointment only" },
      { icon: "clock", label: "Notice", value: "24 hours is ideal; you can also ask about last-minute availability." },
      { icon: "languages", label: "Languages", value: "Spanish · basic English" },
    ],
  },

  contact: {
    ...(JOR_MAISON_CONTENT.contact ?? {}),
    note: "Example: her WhatsApp, email and accounts still need confirming. The links are disabled until then.",
  },

  faqIntro: "The things people usually ask me before booking.",
  faq: [
    {
      q: "How do I book an appointment?",
      a: "From this page, in four steps:",
      steps: [
        { title: "Pick your service", detail: "From the menu, with its length and designs." },
        { title: "Check the times", detail: "Real days and hours, Monday to Saturday." },
        { title: "Leave your details", detail: "A name and a way to confirm with you." },
        { title: "Get the address", detail: "I share the studio when I confirm." },
      ],
    },
    { q: "Where do you work from?", a: "A private studio in Playa del Carmen Centro. The full address is shared once your appointment is confirmed." },
    { q: "Do I need to book?", a: "Yes. I work by appointment only." },
    { q: "How far ahead should I book?", a: "Ideally 24 hours. If you need something last minute, ask anyway — there is sometimes room." },
    { q: "Does the Russian manicure cost extra?", a: "No. It is included with every nail service." },
  ],

  closing: {
    title: "See you",
    titleAccent: "at the studio.",
    body: "Pick your service and find a time that suits you.",
  },
};

/** The profile content for a locale. */
export function jorContent(locale: string): MaisonContent {
  return locale.startsWith("en") ? JOR_MAISON_CONTENT_EN : JOR_MAISON_CONTENT;
}

export const JOR_PORTRAIT_URL = PORTRAIT;
