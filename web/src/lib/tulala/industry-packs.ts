/**
 * industry-packs.ts — once we know the trade, ask what actually matters.
 *
 * This is where the intake stops feeling generic. A generic questionnaire asks a
 * massage therapist "what services do you offer" and gets "massage". A pack asks
 * which modalities, how long a session runs, whether she travels, and what her
 * training is, and gets a page a client can actually book from.
 *
 * PACKS RUN LAST, AND THAT IS THE DESIGN
 * ──────────────────────────────────────
 * Their stage sits after every core stage, so no pack question can be asked
 * before the structure and plan are settled. Two reasons, and the second is the
 * important one:
 *
 *   1. Priority. If someone gives up after six turns, those turns must have been
 *      spent on what decides the recommendation, not on shoot turnaround times.
 *   2. Matching. A pack is selected from `work.discipline` and `work.industry`,
 *      which the early stages exist to obtain. Running packs early would mean
 *      matching on facts that do not exist yet, and the fallback would be the
 *      generic questionnaire the packs are here to replace.
 *
 * MATCHING IS DELIBERATELY FUZZY AND DELIBERATELY UNAMBITIOUS
 * ───────────────────────────────────────────────────────────
 * `work.discipline` is free text, because it comes from a person describing
 * themselves and no enum survives contact with "I do brows and lashes". So packs
 * match on keyword stems, and NO PACK IS THE NORMAL OUTCOME. An unmatched
 * visitor gets the core questionnaire, which is complete on its own. Guessing a
 * pack from a weak signal would ask a wedding photographer about dietary
 * requirements, which reads as the system not having listened.
 *
 * ADDING A PACK IS A DATA CHANGE
 * ──────────────────────────────
 * Same footing as an individual question, for the same reason: measurements have
 * to be attributable to a version. A pack is a versioned bundle of questions
 * over the shared industry vocabulary, and the Agent does not read its phrasings
 * out verbatim any more than it does the core bank's.
 */

import { isKnownFactKey } from "./fact-keys";
import { INDUSTRY_PACK_LABELS, type PackLabel } from "./industry-pack-labels";
import type { Question } from "./questions";

/**
 * Bumped when the SET of packs changes, or when a pack's matching changes. A
 * pack's own questions carry their own versions, exactly like core questions.
 */
export const INDUSTRY_PACK_SET_VERSION = 1;

export type IndustryPack = {
  /** Stable forever. Logged against every pack question's events. */
  id: string;
  version: number;
  /** Shown in the "What I know" panel so the visitor sees we recognised them. */
  label: PackLabel;
  /**
   * Lowercase stems matched as substrings against the discipline, the industry
   * and the service list. Stems rather than words so "photograph" catches
   * photographer, photography and photographe; short enough to match, long
   * enough not to collide.
   */
  match: readonly string[];
  questions: readonly Question[];
};

/** The stage every pack question belongs to. Last in `STAGES`. */
const SPECIFICS = "specifics" as const;

/**
 * Build a pack question with the boilerplate filled in.
 *
 * Pack questions are never `decisive`: decisive means "the plan choice depends
 * on it", and by construction nothing in a pack can affect the plan choice. If a
 * pack question ever needed to be decisive, the fact it targets belongs in the
 * core vocabulary with an evidence weight, and the pack is the wrong place for
 * it.
 */
function packQuestion(
  id: string,
  targets: readonly string[],
  open: boolean,
  en: string,
  es: string,
): Question {
  return {
    id,
    version: 1,
    stage: SPECIFICS,
    targets,
    open,
    phrasing: { en: { text: en }, es: { text: es } },
  };
}

export const INDUSTRY_PACKS: readonly IndustryPack[] = [
  // ── Massage and bodywork ───────────────────────────────────────────────────
  {
    id: "massage",
    version: 1,
    label: INDUSTRY_PACK_LABELS.massage,
    // Stems, not words: "masaj" catches masaje, masajista and masajes, whereas
    // "masaje" catches none of the inflected forms people actually type.
    match: ["massag", "masaj", "bodywork", "physio", "fisio", "osteopat", "reiki"],
    questions: [
      packQuestion(
        "massage.modalities",
        ["industry.specialties"],
        true,
        "Which kinds of massage do you actually do? Deep tissue, Swedish, prenatal, sports, lymphatic, that sort of thing.",
        "¿Qué tipos de masaje haces en realidad? Tejido profundo, sueco, prenatal, deportivo, linfático, ese tipo de cosas.",
      ),
      packQuestion(
        "massage.session_length",
        ["industry.session_length_minutes", "industry.price_from"],
        false,
        "How long is a standard session, and what does it start at?",
        "¿Cuánto dura una sesión estándar y desde cuánto empieza?",
      ),
      packQuestion(
        "massage.mobile",
        ["industry.works_mobile", "industry.travel_radius_km"],
        false,
        "Do clients come to you, or do you go to them? If you travel, how far?",
        "¿Los clientes van contigo o tú vas con ellos? Si viajas, ¿hasta dónde?",
      ),
      packQuestion(
        "massage.certifications",
        ["industry.certifications"],
        true,
        "What training do you have? Clients look for it, so it is worth naming.",
        "¿Qué formación tienes? Los clientes la buscan, vale la pena mencionarla.",
      ),
      packQuestion(
        "massage.availability",
        ["industry.availability_note"],
        true,
        "When do you generally work? Rough shape is fine, you can set real hours later.",
        "¿Cuándo trabajas normalmente? Una idea general basta, luego puedes definir horarios reales.",
      ),
    ],
  },

  // ── Beauty: nails, hair, makeup, brows ─────────────────────────────────────
  {
    id: "beauty",
    version: 1,
    label: INDUSTRY_PACK_LABELS.beauty,
    match: [
      "nail",
      "uñas",
      "manicur",
      "pedicur",
      "hair",
      "peluquer",
      "cabello",
      "barber",
      "makeup",
      "maquilla",
      "brow",
      "ceja",
      "lash",
      "pestañ",
      "estetic",
      "esthetic",
      "facial",
      "wax",
      "depilaci",
    ],
    questions: [
      packQuestion(
        "beauty.services",
        ["industry.specialties"],
        true,
        "What do you actually offer? Gel, acrylic, extensions, colour, bridal, whatever applies.",
        "¿Qué ofreces exactamente? Gel, acrílico, extensiones, color, novias, lo que aplique.",
      ),
      packQuestion(
        "beauty.appointment",
        ["industry.session_length_minutes", "industry.price_from"],
        false,
        "How long does a typical appointment take, and what is your starting price?",
        "¿Cuánto dura una cita típica y cuál es tu precio inicial?",
      ),
      packQuestion(
        "beauty.mobile",
        ["industry.works_mobile", "industry.travel_radius_km"],
        false,
        "Do people come to you, or do you go to them?",
        "¿La gente va contigo o tú vas con ellos?",
      ),
      packQuestion(
        "beauty.certifications",
        ["industry.certifications"],
        true,
        "Any training or brand certifications worth showing?",
        "¿Alguna formación o certificación de marca que valga mostrar?",
      ),
    ],
  },

  // ── Private chef and catering ──────────────────────────────────────────────
  {
    id: "chef",
    version: 1,
    label: INDUSTRY_PACK_LABELS.chef,
    match: ["chef", "cocin", "culinar", "caterer", "catering", "baker", "pastel", "reposter"],
    questions: [
      packQuestion(
        "chef.cuisine",
        ["industry.specialties"],
        true,
        "What kind of food do you cook? Be specific, it is the first thing anyone wants to know.",
        "¿Qué tipo de comida cocinas? Sé específico, es lo primero que cualquiera quiere saber.",
      ),
      packQuestion(
        "chef.group_size",
        ["industry.group_size_max", "industry.price_from"],
        false,
        "What size groups do you cook for, and what does a booking start at per person?",
        "¿Para qué tamaño de grupos cocinas y desde cuánto empieza por persona?",
      ),
      packQuestion(
        "chef.dietary",
        ["industry.dietary_capabilities"],
        true,
        "Which dietary requirements can you genuinely handle? Vegan, gluten free, allergies, kosher, halal.",
        "¿Qué requisitos dietéticos puedes cubrir de verdad? Vegano, sin gluten, alergias, kosher, halal.",
      ),
      packQuestion(
        "chef.event_types",
        ["industry.event_types"],
        true,
        "What sort of occasions? Dinner parties, villa stays, weddings, corporate?",
        "¿Qué tipo de ocasiones? Cenas, estancias en villas, bodas, corporativo?",
      ),
      packQuestion(
        "chef.travel",
        ["industry.works_mobile", "industry.travel_radius_km"],
        false,
        "Do you cook at the client's place, and how far do you travel for a booking?",
        "¿Cocinas en casa del cliente y hasta dónde viajas por un servicio?",
      ),
    ],
  },

  // ── Modelling ──────────────────────────────────────────────────────────────
  {
    id: "model",
    version: 1,
    label: INDUSTRY_PACK_LABELS.model,
    match: ["model", "modelo", "modelaje", "mannequin", "runway", "pasarela"],
    questions: [
      packQuestion(
        "model.categories",
        ["industry.specialties"],
        true,
        "What kind of work do you do? Editorial, commercial, runway, fitness, promotional?",
        "¿Qué tipo de trabajo haces? Editorial, comercial, pasarela, fitness, promocional?",
      ),
      // Physical attributes are asked ONCE, together, and only in this pack. The
      // grouping is deliberate: five separate questions about someone's body
      // reads as an interrogation, whereas one question naming why it is needed
      // reads as the industry-standard digitals card that it is.
      packQuestion(
        "model.stats",
        [
          "industry.height_cm",
          "industry.measurements",
          "industry.hair_color",
          "industry.eye_color",
        ],
        true,
        "Casting directors filter on stats, so: height, measurements, hair and eyes. Only what you are comfortable publishing.",
        "Los directores de casting filtran por medidas, así que: altura, medidas, cabello y ojos. Solo lo que te sientas cómoda publicando.",
      ),
      packQuestion(
        "model.markets",
        ["industry.markets"],
        true,
        "Which cities or markets do you work in?",
        "¿En qué ciudades o mercados trabajas?",
      ),
      packQuestion(
        "model.rates",
        ["industry.price_from", "industry.licensing_included"],
        false,
        "What does a day rate start at, and does it include usage rights?",
        "¿Desde cuánto empieza una tarifa por día e incluye derechos de uso?",
      ),
    ],
  },

  // ── Music and performance ──────────────────────────────────────────────────
  {
    id: "music",
    version: 1,
    label: INDUSTRY_PACK_LABELS.music,
    match: [
      "sing",
      "cant",
      "vocal",
      "music",
      "músic",
      "musico",
      "band",
      "banda",
      "guitar",
      "pian",
      "dj",
      "saxo",
      "violin",
    ],
    questions: [
      packQuestion(
        "music.genre",
        ["industry.specialties"],
        true,
        "What do you play, and what genres? Say it the way you would to a venue.",
        "¿Qué tocas y en qué géneros? Dilo como se lo dirías a un local.",
      ),
      packQuestion(
        "music.format",
        ["industry.performs_with_group", "industry.session_length_minutes"],
        false,
        "Solo, or with others? And how long is a typical set?",
        "¿Solo o con otros? ¿Y cuánto dura un set típico?",
      ),
      packQuestion(
        "music.equipment",
        ["industry.equipment_provided"],
        false,
        "Do you bring your own sound, or does the venue provide it?",
        "¿Llevas tu propio sonido o lo pone el local?",
      ),
      packQuestion(
        "music.venues",
        ["industry.event_types", "industry.price_from"],
        true,
        "What kinds of events do you play, and what does a booking start at?",
        "¿En qué tipo de eventos tocas y desde cuánto empieza una contratación?",
      ),
    ],
  },

  // ── Photography and video ──────────────────────────────────────────────────
  {
    id: "photo",
    version: 1,
    label: INDUSTRY_PACK_LABELS.photo,
    match: [
      "photograph",
      "fotograf",
      "foto",
      "videograph",
      "videograf",
      "video",
      "filmmak",
      "cinemat",
    ],
    questions: [
      packQuestion(
        "photo.specialties",
        ["industry.specialties"],
        true,
        "What do you shoot? Weddings, portraits, product, real estate, events?",
        "¿Qué fotografías? Bodas, retratos, producto, inmuebles, eventos?",
      ),
      packQuestion(
        "photo.deliverables",
        ["industry.deliverables", "industry.turnaround_days"],
        true,
        "What does a client actually receive, and how long does it take?",
        "¿Qué recibe el cliente exactamente y cuánto tarda?",
      ),
      packQuestion(
        "photo.packages",
        ["industry.price_from", "industry.licensing_included"],
        false,
        "What does a shoot start at, and are usage rights included?",
        "¿Desde cuánto empieza una sesión y se incluyen derechos de uso?",
      ),
      packQuestion(
        "photo.travel",
        ["industry.works_mobile", "industry.travel_radius_km"],
        false,
        "Do you travel for shoots, and how far?",
        "¿Viajas para sesiones y hasta dónde?",
      ),
    ],
  },
] as const;

// ─── Matching ─────────────────────────────────────────────────────────────────

/**
 * The pack for a visitor, or null when nothing matches confidently.
 *
 * Null is a normal, frequent, correct answer. The core questionnaire stands on
 * its own, and a wrong pack is worse than no pack: it asks a barber about
 * dietary requirements, which tells them nobody was listening.
 *
 * The signals are checked in confidence order. Discipline is what the person
 * said they DO, so it wins; industry is broader and often a category word;
 * services are last because they are a list and a single incidental entry
 * ("I also do makeup") should not override a stated discipline.
 */
export function packForFacts(signals: {
  discipline?: string | null;
  industry?: string | null;
  services?: readonly string[] | null;
}): IndustryPack | null {
  const discipline = normalize(signals.discipline);
  const industry = normalize(signals.industry);
  const services = (signals.services ?? []).map(normalize).filter(Boolean);

  for (const source of [discipline, industry]) {
    if (!source) continue;
    const found = INDUSTRY_PACKS.find((pack) => pack.match.some((s) => source.includes(s)));
    if (found) return found;
  }

  for (const service of services) {
    const found = INDUSTRY_PACKS.find((pack) => pack.match.some((s) => service.includes(s)));
    if (found) return found;
  }

  return null;
}

export function packById(id: string): IndustryPack | null {
  return INDUSTRY_PACKS.find((p) => p.id === id) ?? null;
}

/** Every pack question, for the selection pass and for coverage assertions. */
export function allPackQuestions(): Question[] {
  return INDUSTRY_PACKS.flatMap((p) => [...p.questions]);
}

/** Pack question targets that are not in the vocabulary. Must always be empty. */
export function unknownPackTargets(): string[] {
  return Array.from(
    new Set(allPackQuestions().flatMap((q) => q.targets).filter((k) => !isKnownFactKey(k))),
  );
}

/**
 * Accents stripped and lowercased, so "fotografía" and "fotografia" match one
 * stem. Someone typing their own trade will not type it the way a stem list
 * expects, and demanding they do is how the pack never fires.
 */
function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
