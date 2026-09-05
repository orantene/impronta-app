/**
 * signup-preset.ts — which industry a new workspace is, decided at signup.
 *
 * WHY THIS EXISTS, AND IT IS THE SAME LESSON AS LAST TIME
 * ──────────────────────────────────────────────────────
 * F2a shipped sixteen presets. F2c shipped the write path. F2c's settings
 * screen shipped the manual control. And then production said:
 *
 *     select count(*) filter (where settings ? 'industry_preset') from agencies
 *     -> 0 of 13
 *
 * **Nothing has ever set it.** Every workspace resolves to "custom", so the
 * chat still speaks in the agency voice, the header verb never appears, the
 * words are the shipped defaults, and the Directory Director's taxonomy seeding
 * has no derivation input. The engine has a door now, and nobody walks through
 * it, because signup never asks.
 *
 * That is the engine-with-no-door lesson one level up: I checked that the read
 * path worked and that a human COULD set the value, and never asked whether
 * anything DOES.
 *
 * WHAT THIS DERIVES FROM
 * ──────────────────────
 * The same two inputs `signup-design-pick.ts` already uses and signup already
 * stores: the audience answer, and the keywords in the business description.
 * No new question, no new field, no change to the funnel — the signal has been
 * collected since 20260711183427 and stored somewhere nothing could read it.
 *
 * FAILS TOWARD "custom", WHICH KEEPS SHIPPED BEHAVIOUR. A description that
 * matches nothing gets no industry rather than a guessed one, and "custom"
 * supplies no voice and no verb (see `resolveWords` and the F2b read path). A
 * wrong industry renames a live storefront's nouns; an absent one changes
 * nothing. Those are not symmetric, so this guesses only when it is confident.
 */

import type { IndustryPresetId } from "./presets";

/**
 * Keyword to preset. First match wins, so more specific rows sit above broader
 * ones — and the ordering is load-bearing for the same reason it is in
 * `signup-design-pick.ts`: "barber shop" contains "shop".
 */
const KEYWORD_PRESETS: ReadonlyArray<{
  readonly words: readonly string[];
  readonly presetId: IndustryPresetId;
}> = [
  // Salon and spa BEFORE shop, for "barber shop".
  {
    words: [
      "salon", "barber", "barbershop", "barberia", "barbería",
      "peluqueria", "peluquería", "nails", "beauty", "estetica", "estética",
    ],
    presetId: "salon_barber",
  },
  { words: ["spa", "wellness", "massage", "masaje", "sauna"], presetId: "spa_wellness" },
  {
    words: ["clinic", "clinica", "clínica", "dental", "dentist", "doctor", "medical"],
    presetId: "clinic",
  },
  // Bar and club BEFORE restaurant: "cocktail bar" is a bar, not a diner.
  { words: ["bar", "club", "nightclub", "cantina", "pub"], presetId: "bar_club" },
  { words: ["beach", "playa", "cabana", "cabaña"], presetId: "beach_club" },
  {
    words: ["restaurant", "restaurante", "cafe", "café", "bistro", "kitchen", "cocina", "taqueria", "taquería", "dining"],
    presetId: "restaurant",
  },
  { words: ["gym", "yoga", "pilates", "fitness", "studio", "estudio", "crossfit"], presetId: "studio_gym" },
  { words: ["padel", "tennis", "tenis", "court", "cancha", "bowling", "futbol", "fútbol"], presetId: "sports_venue" },
  { words: ["tour", "tours", "excursion", "excursión", "diving", "buceo", "snorkel"], presetId: "tours_activities" },
  { words: ["theatre", "theater", "teatro", "cinema", "cine"], presetId: "theatre_cinema" },
  { words: ["coworking", "cowork"], presetId: "coworking" },
  { words: ["rental", "rentals", "renta", "rent", "bikes", "bicis", "boats", "lanchas"], presetId: "rentals" },
  { words: ["print", "printing", "imprenta", "workshop", "taller"], presetId: "workshop_print" },
  { words: ["venue", "banquet", "salon de eventos", "events space"], presetId: "venue_for_hire" },
  { words: ["agency", "agencia", "casting", "roster", "talent"], presetId: "agency" },
];

/** Same normalisation as `signup-design-pick`, so the two read alike. */
function normalizeHaystack(description: string): string {
  return ` ${description.toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, " ")} `;
}

function hasWord(haystack: string, word: string): boolean {
  return haystack.includes(` ${word} `);
}

/**
 * The industry a new workspace should start as.
 *
 * Pure. No I/O. Returns "custom" whenever it is not confident, because "custom"
 * is the value that changes nothing: an absent industry keeps every shipped
 * default, and a wrong one renames a live storefront's nouns.
 */
export function pickSignupPreset(input: {
  audience?: string | null;
  businessDescription?: string | null;
}): IndustryPresetId {
  // Both inputs come from a database row, so neither is trusted to be a
  // string. A non-string here would THROW inside signup, and signup failing is
  // a worse outcome than a missing industry by a wide margin.
  const description =
    typeof input.businessDescription === "string" ? input.businessDescription.trim() : "";
  if (description.length > 0) {
    const haystack = normalizeHaystack(description);
    for (const row of KEYWORD_PRESETS) {
      if (row.words.some((word) => hasWord(haystack, word))) return row.presetId;
    }
  }

  // No keyword hit. The audience answer alone is only strong enough for one
  // case: an agency says what it is by choosing that word. "business" and
  // "operator" cover a dozen industries between them and guessing from them
  // would be exactly the wrong-industry risk this function exists to avoid.
  const audience =
    typeof input.audience === "string" ? input.audience.trim().toLowerCase() : "";
  if (audience === "agency") return "agency";
  return "custom";
}
