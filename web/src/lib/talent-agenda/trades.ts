/**
 * TRADE_PROFILES — one settings row per trade. Screens branch on kind only.
 */

export type TradeKind = "slot" | "event" | "project";

export interface TradeProfile {
  key: string;
  kind: TradeKind;
  length: {
    mode: "fixed" | "window" | "estimate" | "none";
    typicalMin?: [number, number];
  };
  neededFirst: string[];
  timeAround: {
    bufferMin: number;
    travelDefaultMin?: number;
    prepBlocks?: boolean;
    deliveryDates?: boolean;
  };
  money: {
    pattern:
      | "pay_at_appointment"
      | "deposit_long"
      | "quote_deposit_balance"
      | "per_session"
      | "fixed_per_job"
      | "quote_milestone";
    depositPct?: number;
  };
  words: {
    noun: [string, string];
    nounPlural: [string, string];
    newLabel: [string, string];
    person: [string, string];
  };
  grid: { startMin: number; endMin: number };
  talentTypeSlugs: string[];
  notSupported: string[];
}

export const TRADE_PROFILES: Record<string, TradeProfile> = {
  beauty: {
    key: "beauty",
    kind: "slot",
    length: { mode: "fixed", typicalMin: [60, 135] },
    neededFirst: ["none"],
    timeAround: { bufferMin: 15 },
    money: { pattern: "pay_at_appointment" },
    words: {
      noun: ["appointment", "cita"],
      nounPlural: ["appointments", "citas"],
      newLabel: ["New appointment", "Nueva cita"],
      person: ["client", "cliente"],
    },
    grid: { startMin: 10 * 60, endMin: 19 * 60 },
    talentTypeSlugs: ["beauty", "nail-tech", "lash-tech", "brow-artist", "makeup"],
    notSupported: ["session packages", "weekly series"],
  },
  barber: {
    key: "barber",
    kind: "slot",
    length: { mode: "fixed", typicalMin: [45, 45] },
    neededFirst: ["none"],
    timeAround: { bufferMin: 5 },
    money: { pattern: "pay_at_appointment" },
    words: {
      noun: ["appointment", "cita"],
      nounPlural: ["appointments", "citas"],
      newLabel: ["New appointment", "Nueva cita"],
      person: ["client", "cliente"],
    },
    grid: { startMin: 9 * 60, endMin: 19 * 60 },
    talentTypeSlugs: ["barber", "hairdresser", "hair"],
    notSupported: ["session packages"],
  },
  massage: {
    key: "massage",
    kind: "slot",
    length: { mode: "fixed", typicalMin: [60, 90] },
    neededFirst: ["intake_form"],
    timeAround: { bufferMin: 20 },
    money: { pattern: "pay_at_appointment" },
    words: {
      noun: ["session", "sesión"],
      nounPlural: ["sessions", "sesiones"],
      newLabel: ["New session", "Nueva sesión"],
      person: ["client", "cliente"],
    },
    grid: { startMin: 9 * 60, endMin: 20 * 60 },
    talentTypeSlugs: ["massage", "masseuse", "bodywork"],
    notSupported: ["couples massage", "session packages"],
  },
  trainer: {
    key: "trainer",
    kind: "slot",
    length: { mode: "fixed", typicalMin: [60, 60] },
    neededFirst: ["assessment"],
    timeAround: { bufferMin: 10 },
    money: { pattern: "per_session" },
    words: {
      noun: ["session", "sesión"],
      nounPlural: ["sessions", "sesiones"],
      newLabel: ["New session", "Nueva sesión"],
      person: ["client", "cliente"],
    },
    grid: { startMin: 6 * 60, endMin: 21 * 60 },
    talentTypeSlugs: ["trainer", "fitness", "coach"],
    notSupported: ["class packs", "group classes"],
  },
  photo: {
    key: "photo",
    kind: "slot",
    length: { mode: "fixed", typicalMin: [90, 180] },
    neededFirst: ["shot_list"],
    timeAround: { bufferMin: 30, travelDefaultMin: 20, deliveryDates: true },
    money: { pattern: "deposit_long", depositPct: 30 },
    words: {
      noun: ["shoot", "sesión"],
      nounPlural: ["shoots", "sesiones"],
      newLabel: ["New shoot", "Nueva sesión"],
      person: ["client", "cliente"],
    },
    grid: { startMin: 8 * 60, endMin: 20 * 60 },
    talentTypeSlugs: ["photographer", "photo", "videographer"],
    notSupported: ["milestone payments"],
  },
  tutor: {
    key: "tutor",
    kind: "slot",
    length: { mode: "fixed", typicalMin: [60, 90] },
    neededFirst: ["subject_level"],
    timeAround: { bufferMin: 10 },
    money: { pattern: "per_session" },
    words: {
      noun: ["class", "clase"],
      nounPlural: ["classes", "clases"],
      newLabel: ["New class", "Nueva clase"],
      person: ["student", "estudiante"],
    },
    grid: { startMin: 9 * 60, endMin: 21 * 60 },
    talentTypeSlugs: ["tutor", "teacher", "instructor"],
    notSupported: ["class packs", "fixed weekly slots"],
  },
  clean: {
    key: "clean",
    kind: "slot",
    length: { mode: "estimate", typicalMin: [120, 240] },
    neededFirst: ["address_access"],
    timeAround: { bufferMin: 0, travelDefaultMin: 30 },
    money: { pattern: "fixed_per_job" },
    words: {
      noun: ["cleaning", "limpieza"],
      nounPlural: ["cleanings", "limpiezas"],
      newLabel: ["New cleaning", "Nueva limpieza"],
      person: ["client", "cliente"],
    },
    grid: { startMin: 8 * 60, endMin: 18 * 60 },
    talentTypeSlugs: ["cleaner", "cleaning", "housekeeping"],
    notSupported: ["weekly repeat"],
  },
  chef: {
    key: "chef",
    kind: "event",
    length: { mode: "window", typicalMin: [180, 360] },
    neededFirst: ["event_details"],
    timeAround: { bufferMin: 0, travelDefaultMin: 30, prepBlocks: true },
    money: { pattern: "quote_deposit_balance", depositPct: 40 },
    words: {
      noun: ["event", "evento"],
      nounPlural: ["events", "eventos"],
      newLabel: ["New event quote", "Nueva cotización"],
      person: ["host", "anfitrión"],
    },
    grid: { startMin: 10 * 60, endMin: 23 * 60 },
    talentTypeSlugs: ["chef", "private-chef", "cook"],
    notSupported: ["milestone payments"],
  },
  dancer: {
    key: "dancer",
    kind: "event",
    length: { mode: "window", typicalMin: [60, 240] },
    neededFirst: ["event_details"],
    timeAround: { bufferMin: 30, travelDefaultMin: 40 },
    money: { pattern: "quote_deposit_balance", depositPct: 50 },
    words: {
      noun: ["gig", "show"],
      nounPlural: ["gigs", "shows"],
      newLabel: ["New gig quote", "Nueva cotización"],
      person: ["client", "cliente"],
    },
    grid: { startMin: 12 * 60, endMin: 26 * 60 },
    talentTypeSlugs: ["dancer", "performer", "artist"],
    notSupported: ["time tracking"],
  },
  design: {
    key: "design",
    kind: "project",
    length: { mode: "none" },
    neededFirst: ["scope"],
    timeAround: { bufferMin: 0, deliveryDates: true },
    money: { pattern: "quote_milestone", depositPct: 50 },
    words: {
      noun: ["project", "proyecto"],
      nounPlural: ["projects", "proyectos"],
      newLabel: ["New project quote", "Nueva cotización"],
      person: ["client", "cliente"],
    },
    grid: { startMin: 9 * 60, endMin: 19 * 60 },
    talentTypeSlugs: ["designer", "design", "brand", "graphic"],
    notSupported: ["milestone payments", "time tracking"],
  },
};

const SLUG_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [key, profile] of Object.entries(TRADE_PROFILES)) {
    for (const slug of profile.talentTypeSlugs) {
      m.set(slug.toLowerCase(), key);
    }
    m.set(key, key);
  }
  return m;
})();

/** Resolve a taxonomy slug to a profile. Unknown → beauty-like slot defaults. */
export function resolveTradeProfile(talentTypeSlug: string | null | undefined): TradeProfile {
  if (!talentTypeSlug) return TRADE_PROFILES.beauty!;
  const key = SLUG_INDEX.get(talentTypeSlug.trim().toLowerCase());
  return (key ? TRADE_PROFILES[key] : null) ?? TRADE_PROFILES.beauty!;
}

export function allTradeTypeSlugs(): string[] {
  return [...SLUG_INDEX.keys()];
}
