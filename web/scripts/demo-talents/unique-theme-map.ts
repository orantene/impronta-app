/**
 * TUL-38 curated unique-theme demo map.
 *
 * One showcase demo per theme. Slice 1 = first five (seeded by
 * unique-theme-seed.mts). Spanish primary, English secondary. Imagery slots
 * resolve from platform lifestyle stock only (no Unsplash).
 */

import type { StockRole } from "../../src/lib/media/platform-stock";

export type LocalePair = { es: string; en: string };

export type StockSlot = {
  /** Slot key used in the apply report (e.g. hero, gallery-0). */
  key: string;
  role: StockRole;
  /** Required for --apply; dry-run reports a gap when missing. */
  required: boolean;
};

export type PackService = {
  name: LocalePair;
  description: LocalePair;
};

export type UniqueThemeContentPack = {
  id: string;
  defaultLocale: "es";
  supportedLocales: readonly ["es", "en"];
  trade: LocalePair;
  city: LocalePair;
  tagline: LocalePair;
  bio: LocalePair;
  hero: { eyebrow: LocalePair; heading: LocalePair; lede: LocalePair };
  services: readonly PackService[];
  /** Lifestyle stock lookup: type first, then family, then universal `custom`. */
  stock: {
    businessType: string | null;
    family: string;
    slots: readonly StockSlot[];
  };
};

export type UniqueThemeDemo = {
  theme: string;
  profileCode: string;
  email: string;
  siteSlug: string;
  displayName: string;
  /** 1 = this PR; later numbers are planned only. */
  slice: number;
  pack: UniqueThemeContentPack;
};

const slots = (...rows: Array<[string, StockRole, boolean?]>): StockSlot[] =>
  rows.map(([key, role, required = true]) => ({ key, role, required }));

/** Slice 1 allow-list (also the default --only set). */
export const SLICE1_CODES: readonly string[] = [
  "TAL-93020",
  "TAL-93011",
  "TAL-93030",
  "TAL-93001",
  "TAL-93009",
];

/** Absolute refuse, even if somehow listed. */
export const FORBIDDEN_CODES: readonly string[] = [
  "TAL-93938", // Jorgelina, REAL
  "TAL-93900", // QA twin — PM writes only, never this script
  "TAL-93901",
  "TAL-93939",
];

export const UNIQUE_THEME_DEMOS: readonly UniqueThemeDemo[] = [
  {
    theme: "maison-v2",
    profileCode: "TAL-93020",
    email: "demo-alba-unas@impronta.test",
    siteSlug: "alba-nail-artist",
    displayName: "Alba",
    slice: 1,
    pack: {
      id: "pack-maison-v2-alba",
      defaultLocale: "es",
      supportedLocales: ["es", "en"],
      trade: { es: "Uñas y pestañas", en: "Nails and lashes" },
      city: { es: "Mérida", en: "Mérida" },
      tagline: {
        es: "Uñas y pestañas con cita en Mérida",
        en: "Nails and lashes by appointment in Mérida",
      },
      bio: {
        es: "Empecé haciendo uñas a mis amigas en la prepa. Nueve años después sigo con la misma obsesión: que salgas sintiéndote tú, pero mejor. Trabajo sola, con cita, y solo con productos que yo misma uso.",
        en: "I started doing nails for friends in school. Nine years later I still care about the same thing: you leave feeling like yourself, only better. I work alone, by appointment, and only with products I use myself.",
      },
      hero: {
        eyebrow: { es: "Estudio privado", en: "Private studio" },
        heading: { es: "Uñas y pestañas pensadas para ti", en: "Nails and lashes shaped around you" },
        lede: {
          es: "Citas tranquilas en Mérida. Elige el efecto; yo cuido el detalle.",
          en: "Calm appointments in Mérida. You choose the look; I handle the detail.",
        },
      },
      services: [
        {
          name: { es: "Manicura rusa con gel", en: "Russian gel manicure" },
          description: {
            es: "Cutícula en seco, rubber base y el color que elijas.",
            en: "Dry cuticle work, rubber base, and the colour you choose.",
          },
        },
        {
          name: { es: "Extensiones de volumen", en: "Volume lash extensions" },
          description: {
            es: "Abanicos hechos a mano con mapeo para tu ojo.",
            en: "Hand-made fans mapped to the shape of your eye.",
          },
        },
      ],
      stock: {
        businessType: "nail-salon",
        family: "beauty",
        slots: slots(["hero", "hero"], ["portrait", "portrait"], ["gallery-0", "gallery"], ["gallery-1", "gallery"], ["detail", "detail", false]),
      },
    },
  },
  {
    theme: "folio",
    profileCode: "TAL-93011",
    email: "demo-mateo-ferrer@impronta.test",
    siteSlug: "mateo-ferrer",
    displayName: "Mateo Ferrer",
    slice: 1,
    pack: {
      id: "pack-folio-mateo",
      defaultLocale: "es",
      supportedLocales: ["es", "en"],
      trade: { es: "Modelo de moda", en: "Fashion model" },
      city: { es: "Ciudad de México", en: "Mexico City" },
      tagline: {
        es: "Modelo de moda editorial y pasarela en CDMX",
        en: "Editorial and runway fashion model in Mexico City",
      },
      bio: {
        es: "Modelo para editorial, pasarela y campañas. Trabajo en estudio y en locación en Ciudad de México.",
        en: "I work editorial, runway, and campaigns. Studio and on-location in Mexico City.",
      },
      hero: {
        eyebrow: { es: "Portafolio", en: "Portfolio" },
        heading: { es: "Editorial, pasarela y campaña", en: "Editorial, runway, and campaign" },
        lede: {
          es: "Disponible en CDMX para estudio y locación.",
          en: "Available in Mexico City for studio and location work.",
        },
      },
      services: [
        {
          name: { es: "Día de editorial", en: "Editorial day" },
          description: {
            es: "Jornada completa en estudio o locación.",
            en: "Full day in studio or on location.",
          },
        },
        {
          name: { es: "Campaña o pasarela", en: "Campaign or runway" },
          description: {
            es: "Tarifa según uso, medios y duración.",
            en: "Rate depends on usage, media, and length.",
          },
        },
      ],
      stock: {
        // No solo-model business type; universal pack only.
        businessType: null,
        family: "custom",
        slots: slots(["hero", "hero"], ["portrait", "portrait"], ["gallery-0", "gallery"], ["gallery-1", "gallery"], ["gallery-2", "gallery", false]),
      },
    },
  },
  {
    theme: "gridline",
    profileCode: "TAL-93030",
    email: "demo-alex-trevino@impronta.test",
    siteSlug: "alex-trevino",
    displayName: "Alex Treviño",
    slice: 1,
    pack: {
      id: "pack-gridline-alex",
      defaultLocale: "es",
      supportedLocales: ["es", "en"],
      trade: { es: "Electricista", en: "Electrician" },
      city: { es: "Monterrey", en: "Monterrey" },
      tagline: {
        es: "Electricista residencial y comercial en Monterrey",
        en: "Residential and commercial electrician in Monterrey",
      },
      bio: {
        es: "Instalo, reparo y certifico trabajo eléctrico en casa y en local. Llego con herramientas, te explico el plan y dejo el área limpia.",
        en: "I install, repair, and certify electrical work at home and in shops. I bring the tools, explain the plan, and leave the area clean.",
      },
      hero: {
        eyebrow: { es: "Servicio a domicilio", en: "On-site service" },
        heading: { es: "Electricidad clara, sin sorpresas", en: "Clear electrical work, no surprises" },
        lede: {
          es: "Diagnóstico, instalación y mantenimiento en Monterrey.",
          en: "Diagnostics, installs, and maintenance in Monterrey.",
        },
      },
      services: [
        {
          name: { es: "Visita de diagnóstico", en: "Diagnostic visit" },
          description: {
            es: "Revisión en sitio y presupuesto el mismo día.",
            en: "On-site review and a same-day quote.",
          },
        },
        {
          name: { es: "Instalación o reparación", en: "Install or repair" },
          description: {
            es: "Trabajo residencial o comercial con materiales acordados.",
            en: "Residential or commercial work with agreed materials.",
          },
        },
      ],
      stock: {
        businessType: "handyman",
        family: "professional",
        slots: slots(["hero", "hero"], ["wide", "wide", false], ["gallery-0", "gallery"], ["detail", "detail", false]),
      },
    },
  },
  {
    theme: "solace",
    profileCode: "TAL-93001",
    email: "demo-valeria-baile@impronta.test",
    siteSlug: "valeria-baila",
    displayName: "Valeria Ortiz",
    slice: 1,
    pack: {
      id: "pack-solace-valeria",
      defaultLocale: "es",
      supportedLocales: ["es", "en"],
      trade: { es: "Instructora de baile", en: "Dance instructor" },
      city: { es: "Ciudad de México", en: "Mexico City" },
      tagline: {
        es: "Salsa y bachata · clases y shows en CDMX",
        en: "Salsa and bachata · lessons and shows in Mexico City",
      },
      bio: {
        es: "Bailo salsa y bachata desde niña y hoy enseño en Ciudad de México. Doy clases privadas para una persona o en pareja, en tu casa o en estudio, y preparo coreografías de primer baile para bodas.",
        en: "I have danced salsa and bachata since childhood and now teach in Mexico City. Private lessons for one person or a couple, at home or in studio, plus first-dance choreography for weddings.",
      },
      hero: {
        eyebrow: { es: "Clases y shows", en: "Lessons and shows" },
        heading: { es: "Salsa y bachata con ritmo", en: "Salsa and bachata with feel" },
        lede: {
          es: "Empezamos por la conexión; los pasos llegan solos.",
          en: "We start with connection; the steps follow.",
        },
      },
      services: [
        {
          name: { es: "Clase privada de salsa o bachata", en: "Private salsa or bachata lesson" },
          description: {
            es: "Una hora, para una persona o pareja, en tu casa o en estudio.",
            en: "One hour, for one person or a couple, at home or in studio.",
          },
        },
        {
          name: { es: "Coreografía de primer baile", en: "First-dance choreography" },
          description: {
            es: "Tres ensayos para crear y practicar su baile de boda.",
            en: "Three rehearsals to build and practise your wedding dance.",
          },
        },
      ],
      stock: {
        businessType: "dance-studio",
        family: "fitness",
        slots: slots(["hero", "hero"], ["portrait", "portrait"], ["gallery-0", "gallery"], ["gallery-1", "gallery", false]),
      },
    },
  },
  {
    theme: "frame",
    profileCode: "TAL-93009",
    email: "demo-tomas-foto@impronta.test",
    siteSlug: "tomas-retratos",
    displayName: "Tomás Aguilar",
    slice: 1,
    pack: {
      id: "pack-frame-tomas",
      defaultLocale: "es",
      supportedLocales: ["es", "en"],
      trade: { es: "Fotógrafo de retrato", en: "Portrait photographer" },
      city: { es: "Oaxaca", en: "Oaxaca" },
      tagline: {
        es: "Fotografía de retrato en Oaxaca",
        en: "Portrait photography in Oaxaca",
      },
      bio: {
        es: "Hago retratos con luz natural en la calle y en estudio: personales, de pareja y para marca personal.",
        en: "I make portraits with natural light on the street and in studio: personal, couple, and personal-brand sessions.",
      },
      hero: {
        eyebrow: { es: "Retrato", en: "Portrait" },
        heading: { es: "Luz natural en Oaxaca", en: "Natural light in Oaxaca" },
        lede: {
          es: "Sesiones tranquilas, en la calle o en estudio.",
          en: "Calm sessions, on the street or in studio.",
        },
      },
      services: [
        {
          name: { es: "Sesión de retrato", en: "Portrait session" },
          description: {
            es: "Una hora, 20 fotos editadas.",
            en: "One hour, 20 edited photos.",
          },
        },
        {
          name: { es: "Retrato para marca personal", en: "Personal-brand portraits" },
          description: {
            es: "Dos locaciones, 40 fotos editadas.",
            en: "Two locations, 40 edited photos.",
          },
        },
      ],
      stock: {
        businessType: "portrait-photographer",
        family: "craft",
        slots: slots(["hero", "hero"], ["portrait", "portrait"], ["gallery-0", "gallery"], ["gallery-1", "gallery"], ["detail", "detail", false]),
      },
    },
  },
  // Slice 2 (planned only — not in SLICE1_CODES)
  {
    theme: "mono",
    profileCode: "TAL-93010",
    email: "demo-pablo-entrena@impronta.test",
    siteSlug: "pablo-entrena",
    displayName: "Pablo Serrano",
    slice: 2,
    pack: {
      id: "pack-mono-pablo",
      defaultLocale: "es",
      supportedLocales: ["es", "en"],
      trade: { es: "Entrenador personal", en: "Personal trainer" },
      city: { es: "Puerto Vallarta", en: "Puerto Vallarta" },
      tagline: {
        es: "Entrenador personal en Puerto Vallarta",
        en: "Personal trainer in Puerto Vallarta",
      },
      bio: {
        es: "Entreno fuerza y acondicionamiento en tu casa, en el parque o en la playa. Armamos un plan según tu nivel.",
        en: "I coach strength and conditioning at your home, in the park, or on the beach. We build a plan around your level.",
      },
      hero: {
        eyebrow: { es: "Fuerza y acondicionamiento", en: "Strength and conditioning" },
        heading: { es: "Entrena donde estés", en: "Train where you are" },
        lede: {
          es: "Sesiones en casa, parque o playa en Puerto Vallarta.",
          en: "Sessions at home, park, or beach in Puerto Vallarta.",
        },
      },
      services: [
        {
          name: { es: "Sesión de entrenamiento", en: "Training session" },
          description: {
            es: "Una hora, a domicilio o al aire libre.",
            en: "One hour, at home or outdoors.",
          },
        },
      ],
      stock: {
        businessType: "personal-trainer",
        family: "fitness",
        slots: slots(["hero", "hero"], ["portrait", "portrait"], ["gallery-0", "gallery", false]),
      },
    },
  },
];

export function demosForSlice(slice: number): UniqueThemeDemo[] {
  return UNIQUE_THEME_DEMOS.filter((d) => d.slice === slice);
}

export function demoByCode(code: string): UniqueThemeDemo | undefined {
  return UNIQUE_THEME_DEMOS.find((d) => d.profileCode === code);
}

/** Themes already claimed by a curated showcase demo (any slice). */
export function claimedThemes(): string[] {
  return [...new Set(UNIQUE_THEME_DEMOS.map((d) => d.theme))];
}
