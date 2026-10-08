/**
 * TUL-15 Stage 5b layer B: the English text for the TEST talent TAL-93900
 * (site jorg-beauty-qa), a Spanish-primary lash, nails and brows studio.
 *
 * Every entry carries the Spanish it must MATCH (one or more spellings) next to
 * the English to add. Rows are matched by their existing Spanish text (trimmed,
 * case and accent insensitive), never by position. Drafted from the repo's own
 * sources for this trade, nothing invented:
 *   - src/app/dev/jor-beauty/seed.ts: the catalogue (titles, descriptions,
 *     categories) with its own English siblings (`titleEn`, `descriptionEn`),
 *     and the eight-plus gallery labels (the photo captions).
 *   - scripts/jorgelina-content/content.ts: the approved Spanish service
 *     descriptions and the approved ticker words in English
 *     ("Classic extensions", "Lash lift", "2D to 5D volume"...).
 *   - src/lib/onboarding/essentials.ts: the trade's category and service names.
 * The approved Spanish descriptions (second spelling of a description) have no
 * approved English in the repo; the English here is a plain, same-meaning
 * rendering of the approved Spanish and is flagged DRAFT in the PR for review.
 *
 * A Spanish value that is NOT below is never invented: the dry run lists it
 * under "needs English".
 *
 * No em dashes anywhere in the English (a test enforces it). The one place the
 * seed's Spanish has an em dash (a MATCH key, not copy) is spelled with an
 * escape so this file stays dash-free.
 */

export interface Entry {
  /** Spanish spellings that identify the row. The first is the canonical one. */
  es: readonly string[];
  en: string;
}

export interface ServiceEntry {
  title: Entry;
  description?: Entry;
}

export interface TargetContent {
  /** Second lock after the profile code. */
  siteSlug: string;
  categories: readonly Entry[];
  /** media_assets: the caption shown under a gallery photo. */
  captions: readonly Entry[];
  /** talent_offerings: title_i18n and description_i18n. */
  services: readonly ServiceEntry[];
}

const DASH = String.fromCharCode(0x2014);

export const CONTENT: TargetContent = {
  siteSlug: "jorg-beauty-qa",

  categories: [
    { es: ["Pestañas", "Extensiones de pestañas"], en: "Lashes" },
    { es: ["Uñas"], en: "Nails" },
    { es: ["Cejas"], en: "Brows" },
    { es: ["Depilación", "Depilación facial"], en: "Waxing" },
  ],

  // Photo captions: the seed's gallery labels, plus the service names a caption
  // commonly repeats.
  captions: [
    { es: ["Extensiones clásicas"], en: "Classic extensions" },
    { es: ["Lifting de pestañas"], en: "Lash lift" },
    { es: ["Volumen americano"], en: "American volume" },
    { es: ["Efecto rímel"], en: "Mascara effect" },
    { es: ["Manicura rusa + gel", "Manicura rusa y gel"], en: "Russian manicure + gel" },
    { es: ["Perfilado de cejas", "Perfilado"], en: "Brow shaping" },
    { es: ["Rubber gel"], en: "Rubber gel" },
    { es: ["Lami Brows"], en: "Lami Brows" },
    { es: ["Ojo de gato"], en: "Cat eye" },
    { es: ["Soft Gel con french"], en: "Soft gel with French tips" },
    { es: ["Henna Brows"], en: "Henna Brows" },
    { es: ["Depilación facial"], en: "Facial waxing" },
    { es: ["Gel en pies"], en: "Gel pedicure" },
  ],

  services: [
    // ---- Lashes
    {
      title: { es: ["Extensiones clásicas"], en: "Classic extensions" },
      description: {
        es: [
          "Una extensión por pestaña natural. Resultado natural, como rímel suave.",
          "Una extensión por pestaña natural. El efecto más discreto, ideal para el día a día.",
        ],
        en: "One extension per natural lash. A natural result, like soft mascara.",
      },
    },
    {
      title: { es: ["Efecto rímel"], en: "Mascara effect" },
      description: {
        es: [
          "Clásicas con mapeo que imita el rímel: más definición sin volumen.",
          "Densidad pareja de punta a punta, como un rímel siempre puesto.",
        ],
        en: "Classic lashes with a map that mimics mascara: more definition without volume.",
      },
    },
    {
      title: { es: ["Tecnológicas 2D"], en: "2D volume" },
      description: {
        es: [
          "Abanicos ligeros de 2 extensiones. Más densidad, se ven naturales.",
          "Abanicos de dos puntas para sumar volumen sin peso.",
        ],
        en: "Light fans of 2 extensions. More density, and they look natural.",
      },
    },
    {
      title: { es: ["Tecnológicas 3D"], en: "3D volume" },
      description: {
        es: ["Abanicos de 3. Mirada más llena para el día a día.", "Tres puntas por abanico: más cuerpo, mismo acabado natural."],
        en: "Fans of 3. A fuller look for every day.",
      },
    },
    {
      title: { es: ["Tecnológicas 4D o 5D"], en: "4D or 5D volume" },
      description: {
        es: ["Abanicos de 4 o 5. Volumen marcado, ideal para eventos.", "Volumen marcado, con la línea de agua bien definida."],
        en: "Fans of 4 or 5. Pronounced volume, ideal for events.",
      },
    },
    {
      title: { es: ["Volumen americano"], en: "American volume" },
      description: {
        es: ["Máximo volumen y oscuridad, efecto glam.", "El efecto más intenso del menú, construido abanico por abanico."],
        en: "Maximum volume and depth, a glam effect.",
      },
    },
    {
      title: { es: ["Lifting de pestañas"], en: "Lash lift" },
      description: {
        es: [
          "Curva y eleva tus pestañas naturales, dura 6 a 8 semanas.",
          "Curva desde la raíz sobre tu propia pestaña, sin extensiones.",
        ],
        en: "Curls and lifts your natural lashes. Lasts 6 to 8 weeks.",
      },
    },
    {
      title: { es: ["Set lifting + Lami Brows", "Set: lifting + Lami Brows"], en: "Lash lift + Lami Brows set" },
      description: {
        es: ["Lifting de pestañas y laminado de cejas en una sola cita."],
        en: "Lash lift and brow lamination in a single appointment.",
      },
    },

    // ---- Brows
    {
      title: { es: ["Lami Brows", `Lami Brows ${DASH} laminado de cejas`], en: "Lami Brows" },
      description: {
        es: ["Cejas peinadas y con forma por 6 semanas.", "Cejas peinadas hacia arriba, con forma definida y fijada."],
        en: "Brushed-up, shaped brows that hold for 6 weeks.",
      },
    },
    {
      title: { es: ["Perfilado", "Perfilado de cejas"], en: "Brow shaping" },
      description: {
        es: ["Forma limpia con pinza.", "Diseño y limpieza de la forma."],
        en: "A clean shape, tweezed.",
      },
    },
    {
      title: { es: ["Henna Brows"], en: "Henna Brows" },
      description: {
        es: [
          "Color y relleno que dura hasta 2 semanas en piel.",
          "Tinte con henna que rellena huecos y marca la forma por varios días.",
        ],
        en: "Colour and fill that lasts up to 2 weeks on the skin.",
      },
    },

    // ---- Nails (the brand names Soft Gel, Acrygel and Rubber Gel stay as they are)
    {
      title: { es: ["Gel semipermanente"], en: "Semi-permanent gel" },
      description: {
        es: ["Esmaltado semipermanente con acabado parejo y brillo duradero. Incluye manicura rusa."],
        en: "Even, long-lasting gel colour with a high-gloss finish. Russian manicure included.",
      },
    },
    {
      title: { es: ["Soft Gel"], en: "Soft Gel" },
      description: {
        es: ["Extensiones con tips de soft gel, ligeras y naturales. Elige el largo que prefieras."],
        en: "Soft gel tip extensions: light and natural. Choose the length you prefer.",
      },
    },
    {
      title: { es: ["Acrygel"], en: "Acrygel" },
      description: {
        es: ["Estructura firme con acabado natural, ideal para uñas que necesitan refuerzo."],
        en: "A firm structure with a natural finish, for nails that need reinforcement.",
      },
    },
    {
      title: { es: ["Rubber Gel"], en: "Rubber Gel" },
      description: {
        es: ["Refuerzo flexible sobre uña natural, con acabado suave y discreto."],
        en: "Flexible reinforcement over the natural nail, soft and discreet.",
      },
    },
    {
      title: { es: ["Gel en pies"], en: "Gel pedicure" },
      description: {
        es: ["Semipermanente en pies, con trabajo de cutícula y acabado prolijo."],
        en: "Semi-permanent colour on toes, with cuticle work and a clean finish.",
      },
    },
    {
      title: { es: ["Reposición de una uña"], en: "Single nail repair" },
      description: { es: ["Reparación puntual, por unidad."], en: "A one-off repair, priced per nail." },
    },
    {
      title: { es: ["Remoción de acrílico, polygel o Soft Gel"], en: "Acrylic, polygel or Soft Gel removal" },
      description: { es: ["Retiro cuidadoso sin dañar la uña natural."], en: "Careful removal that does not damage the natural nail." },
    },
    { title: { es: ["Remoción de semipermanente"], en: "Gel polish removal" } },

    // ---- Waxing
    { title: { es: ["Bozo"], en: "Upper lip" } },
    { title: { es: ["Cejas"], en: "Brows" } },
    {
      title: { es: ["Rostro completo"], en: "Full face" },
      description: {
        es: ["Bozo, mentón, patillas y mejillas en una sola sesión."],
        en: "Upper lip, chin, sideburns and cheeks in a single session.",
      },
    },
  ],
};

/** Every English string, for the no-em-dash test. */
export function allEnglish(c: TargetContent = CONTENT): string[] {
  return [
    ...c.categories.map((e) => e.en),
    ...c.captions.map((e) => e.en),
    ...c.services.flatMap((s) => [s.title.en, ...(s.description ? [s.description.en] : [])]),
  ];
}
