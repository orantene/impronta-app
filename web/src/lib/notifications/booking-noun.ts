/**
 * TUL-136: which word a guest-facing booking email uses for the thing that is
 * happening. Agency bookings are events ("Your event is tomorrow"); a booking
 * made on a talent's own site is an appointment ("Your appointment is
 * tomorrow", "Tu cita es mañana").
 *
 * The signal is the event payload. The talent-site reminder producer
 * (`notifyTalentBookingDayOfReminder`) always sets `talentBookingId` and the
 * `appointment*` fields; the agency sweep sets neither.
 *
 * TUL-259: the talent-site producer also carries `talentTradeSlugs` (the
 * talent's primary type slug, then its group, then its parent category; see
 * `loadTalentTradeSlugs`). `tradeNounForCategory` maps those REAL taxonomy
 * slugs (migrations 20260801120400, 20260801120410 and 20261231298100) to a
 * noun. Precedence: forced `bookingKind`, then trade, then booking source. An
 * unknown trade on a talent site stays "appointment".
 *
 * Pure: no I/O, safe to import from templates and the email channel.
 */

export type BookingNoun = "appointment" | "event";

/**
 * Event trades: the work happens at somebody's event, so the client booked an
 * "event". Real `taxonomy_terms.slug` values at any of the three levels
 * (talent_type, category_group, parent_category).
 *  - parents: hosts-promo (MCs, hosts), performers, music-djs (DJs, bands),
 *    photo-video-creative (photographers, videographers), event-staff,
 *    production-bts (holds the event-planning group), animals-specialty-acts
 *  - groups: event-planning, mcs-presenters, djs, bands-groups
 *  - leaf talent_type slugs: dj, photographer, videographer
 */
export const EVENT_TRADE_SLUGS: ReadonlySet<string> = new Set([
  "hosts-promo",
  "performers",
  "music-djs",
  "photo-video-creative",
  "event-staff",
  "production-bts",
  "animals-specialty-acts",
  "event-planning",
  "mcs-presenters",
  "djs",
  "bands-groups",
  "dj",
  "photographer",
  "videographer",
]);

/**
 * Service trades: one-to-one appointments (salon, beauty, lashes, nails,
 * barber, spa, massage, tutoring, coaching, medical and similar). Unknown
 * slugs also land on "appointment" on a talent site; this list exists so a
 * service term nested under an event parent wins, since the chain is read
 * most specific first.
 *  - parents: wellness-beauty, health-therapy, education-tutoring,
 *    speakers-coaches-experts, sports-fitness, professional-services,
 *    pets-animal-care, design-digital, crafts-makers
 *  - groups: beauty-services, massage-spa, wellness-experts
 *  - leaf talent_type slugs: lash-artist, nail-artist
 */
export const SERVICE_TRADE_SLUGS: ReadonlySet<string> = new Set([
  "wellness-beauty",
  "health-therapy",
  "education-tutoring",
  "speakers-coaches-experts",
  "sports-fitness",
  "professional-services",
  "pets-animal-care",
  "design-digital",
  "crafts-makers",
  "beauty-services",
  "massage-spa",
  "wellness-experts",
  "lash-artist",
  "nail-artist",
]);

/** Noun for ONE taxonomy slug, or null when the slug is not in either list. */
export function tradeNounForCategory(slug: string | null | undefined): BookingNoun | null {
  const s = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (!s) return null;
  if (SERVICE_TRADE_SLUGS.has(s)) return "appointment";
  if (EVENT_TRADE_SLUGS.has(s)) return "event";
  return null;
}

/** Noun for a slug chain ordered most specific first (type, group, parent). */
export function tradeNounForSlugs(slugs: unknown): BookingNoun | null {
  if (!Array.isArray(slugs)) return null;
  for (const s of slugs) {
    const n = tradeNounForCategory(typeof s === "string" ? s : null);
    if (n) return n;
  }
  return null;
}

export function bookingNoun(payload: Record<string, unknown> | null | undefined): BookingNoun {
  const p = payload ?? {};
  if (p.bookingKind === "event") return "event";
  if (p.bookingKind === "appointment") return "appointment";
  const byTrade = tradeNounForSlugs(p.talentTradeSlugs);
  if (byTrade) return byTrade;
  const has = (k: string) => typeof p[k] === "string" && (p[k] as string).trim() !== "";
  return has("talentBookingId") || has("appointmentStartsAt") ? "appointment" : "event";
}
