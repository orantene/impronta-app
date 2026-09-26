/**
 * One score for the free website. Every surface that unlocks or shows progress
 * for the free website must read this — never the agency checklist percent.
 *
 * Profession-aware requirement sets follow product spec §4.2. Optional slices
 * for a mode never lower the number (they are omitted from the sum).
 * Unlock threshold is always 100% of the mode's required weight.
 */

export type WebsiteSliceKey = "who" | "photos" | "offer" | "intro" | "when" | "where";

/** How the talent works — drives which slices are required (§4.2). */
export type WebsiteWorkingMode = "bookings" | "inquiries" | "quotes";

export type WebsiteEligibilityInput = {
  hasNameAndWork: boolean | null;
  photoCount: number | null;
  bookableCount: number | null;
  hasIntro: boolean | null;
  hasAvailability: boolean | null;
  hasPlace: boolean | null;
  /** Defaults to bookings (beauty / trainer style). */
  workingMode?: WebsiteWorkingMode | null;
};

export type WebsiteSlice = {
  key: WebsiteSliceKey;
  weight: number;
  /** null when the fact is not loaded. */
  done: boolean | null;
  earned: number;
  /** False when the mode treats this slice as a suggestion only. */
  required: boolean;
};

type ModeRule = {
  photoMin: number;
  offerMin: number;
  requireOffer: boolean;
  requireWhen: boolean;
  requireWhere: boolean;
  /** Relative weights among required slices; renormalized to 100. */
  weights: Partial<Record<WebsiteSliceKey, number>>;
};

const MODE_RULES: Record<WebsiteWorkingMode, ModeRule> = {
  // Bookings: profile · where · 3 services · availability · 6 work photos · intro
  bookings: {
    photoMin: 6,
    offerMin: 3,
    requireOffer: true,
    requireWhen: true,
    requireWhere: true,
    weights: { who: 20, photos: 30, offer: 28, intro: 10, when: 6, where: 6 },
  },
  // Inquiries (model/singer-like): services optional; city + photos + intro + contact
  inquiries: {
    photoMin: 6,
    offerMin: 0,
    requireOffer: false,
    requireWhen: false,
    requireWhere: true,
    weights: { who: 25, photos: 40, intro: 20, where: 15 },
  },
  // Quotes (chef-like): 2 services (no price gate here) · 2 photos · area · intro
  quotes: {
    photoMin: 2,
    offerMin: 2,
    requireOffer: true,
    requireWhen: false,
    requireWhere: true,
    weights: { who: 22, photos: 25, offer: 28, intro: 15, where: 10 },
  },
};

/** Keyword → mode. Unknown labels stay on bookings (safest unlock bar). */
export function inferWebsiteWorkingMode(
  primaryTypeLabel: string | null | undefined,
): WebsiteWorkingMode {
  const label = (primaryTypeLabel ?? "").toLowerCase();
  if (!label) return "bookings";
  if (
    /\b(model|modelo|actor|actress|influencer|singer|cantante|dj|musician|músico|musico|dancer|bailar)\b/.test(
      label,
    )
  ) {
    return "inquiries";
  }
  if (/\b(chef|cook|cocin|cater|private chef|chef privado)\b/.test(label)) {
    return "quotes";
  }
  return "bookings";
}

function renormalize(weights: Partial<Record<WebsiteSliceKey, number>>): Record<WebsiteSliceKey, number> {
  const keys = Object.keys(weights) as WebsiteSliceKey[];
  const sum = keys.reduce((n, k) => n + (weights[k] ?? 0), 0) || 1;
  const out = { who: 0, photos: 0, offer: 0, intro: 0, when: 0, where: 0 };
  for (const k of keys) {
    out[k] = Math.round(((weights[k] ?? 0) / sum) * 100);
  }
  // Fix rounding so required weights always sum to 100.
  const requiredSum = keys.reduce((n, k) => n + out[k], 0);
  if (requiredSum !== 100 && keys.length > 0) {
    out[keys[0]] += 100 - requiredSum;
  }
  return out;
}

function sliceDone(
  key: WebsiteSliceKey,
  input: WebsiteEligibilityInput,
  rule: ModeRule,
): boolean | null {
  switch (key) {
    case "who":
      return input.hasNameAndWork;
    case "photos":
      return input.photoCount == null ? null : input.photoCount >= rule.photoMin;
    case "offer":
      if (!rule.requireOffer) return true;
      return input.bookableCount == null ? null : input.bookableCount >= rule.offerMin;
    case "intro":
      return input.hasIntro;
    case "when":
      if (!rule.requireWhen) return true;
      return input.hasAvailability;
    case "where":
      if (!rule.requireWhere) return true;
      return input.hasPlace;
  }
}

export function getWebsiteEligibility(input: WebsiteEligibilityInput): {
  percent: number | null;
  slices: WebsiteSlice[];
  unlocked: boolean;
  workingMode: WebsiteWorkingMode;
} {
  const workingMode = input.workingMode ?? "bookings";
  const rule = MODE_RULES[workingMode];
  const weights = renormalize(rule.weights);
  const order: WebsiteSliceKey[] = ["who", "photos", "offer", "intro", "when", "where"];

  const slices: WebsiteSlice[] = order.map((key) => {
    const required = (rule.weights[key] ?? 0) > 0;
    const weight = required ? weights[key] : 0;
    const done = required ? sliceDone(key, input, rule) : true;
    return {
      key,
      weight,
      done,
      earned: done ? weight : 0,
      required,
    };
  });

  const required = slices.filter((s) => s.required);
  const known = required.every((s) => s.done != null);
  const percent = known ? required.reduce((n, s) => n + s.earned, 0) : null;
  return { percent, slices, unlocked: percent === 100, workingMode };
}
