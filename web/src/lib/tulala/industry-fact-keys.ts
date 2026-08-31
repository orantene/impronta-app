/**
 * industry-fact-keys.ts — the vocabulary the industry packs add.
 *
 * Its own module for two reasons. The obvious one is length: `fact-keys.ts` is
 * already near the file ceiling and every pack adds keys forever. The real one
 * is that these keys obey DIFFERENT RULES from the core vocabulary, and mixing
 * them would blur those rules.
 *
 * RULE 1 — NO EVIDENCE WEIGHTS. NOT ONE.
 * ─────────────────────────────────────
 * Core facts vote on what someone needs. Industry facts must not, and the
 * absence is load-bearing rather than an oversight.
 *
 * Packs run AFTER the structure and plan decision, so anything they collected
 * could only arrive too late to inform it. Worse, weighting them would corrupt
 * it: "I do deep tissue and Swedish" is two services, and a pack that scored
 * service breadth as business evidence would recommend a workspace to every
 * thorough sole trader. Detail about the craft is not evidence about the shape
 * of the operation, and the engine stays honest by never seeing it.
 *
 * RULE 2 — SHARED WHERE THE MEANING IS SHARED.
 * ────────────────────────────────────────────
 * A massage session, a DJ set and a photo shoot all have a length, and they are
 * ONE key. The temptation is `massage.session_length`, `singer.set_length`,
 * `photo.shoot_length`, and it is a trap: the Brief becomes unreadable, the
 * Settings surface shows three rows meaning one thing, and every consumer needs
 * a switch on industry to find a duration. Packs differ in which keys they ask
 * for and how they word the question, not in what a duration is.
 *
 * RULE 3 — PHYSICAL ATTRIBUTES ARE PERSONAL.
 * ──────────────────────────────────────────
 * Height, measurements, hair and eye colour are legitimately required in
 * modelling and nowhere else. They are marked `personal`, which strips them from
 * every classification prompt, and they are only ever ASKED by the pack that
 * needs them. The same data-minimisation argument the plan makes about date of
 * birth applies here and for the same reason.
 */

import type { FactKeyDef } from "./fact-keys";

export const INDUSTRY_FACT_KEYS: readonly FactKeyDef[] = [
  // ── Shape of the offering ──────────────────────────────────────────────────
  {
    key: "industry.specialties",
    type: "string_list",
    category: "industry",
    // Every pack's core question, worded differently by each: modalities for a
    // therapist, cuisines for a chef, genres for a musician, specialties for a
    // photographer. One key because they are one thing — the named kinds of work
    // this person does — and because the directory filters on it.
    label: "What kinds specifically",
  },
  {
    key: "industry.session_length_minutes",
    type: "number",
    category: "industry",
    label: "How long a typical booking runs",
  },
  {
    key: "industry.price_from",
    type: "number",
    category: "industry",
    // A floor, not a price list. Asking for a full menu in a conversation
    // produces either a refusal or a fabrication, and the starting price is what
    // a client actually wants to know before enquiring.
    label: "Starting price",
  },
  {
    key: "industry.deliverables",
    type: "string_list",
    category: "industry",
    label: "What the client ends up with",
  },
  {
    key: "industry.turnaround_days",
    type: "number",
    category: "industry",
    label: "Days to deliver",
  },
  {
    key: "industry.licensing_included",
    type: "boolean",
    category: "industry",
    label: "Usage rights included",
  },

  // ── Where the work happens ─────────────────────────────────────────────────
  {
    key: "industry.works_mobile",
    type: "boolean",
    category: "industry",
    // Distinct from `business.works_from`, which asks where the operation is
    // BASED. This asks whether the work travels, and the two are independent: a
    // therapist with her own studio may also visit hotels.
    label: "You travel to the client",
  },
  {
    key: "industry.travel_radius_km",
    type: "number",
    category: "industry",
    label: "How far you will travel",
  },
  {
    key: "industry.markets",
    type: "string_list",
    category: "industry",
    // Cities or regions someone works in, which is a different question from a
    // travel radius: a model is signed in Mexico City and Milan, not within
    // 40km of anywhere.
    label: "Cities or markets you work in",
  },

  // ── Credentials and equipment ──────────────────────────────────────────────
  {
    key: "industry.certifications",
    type: "string_list",
    category: "industry",
    label: "Training and certifications",
  },
  {
    key: "industry.equipment_provided",
    type: "boolean",
    category: "industry",
    label: "You bring your own equipment",
  },

  // ── Events and groups ──────────────────────────────────────────────────────
  {
    key: "industry.event_types",
    type: "string_list",
    category: "industry",
    label: "Kinds of event you work",
  },
  {
    key: "industry.group_size_max",
    type: "number",
    category: "industry",
    label: "Largest group you cater for",
  },
  {
    key: "industry.performs_with_group",
    type: "boolean",
    category: "industry",
    // Explicitly NOT evidence of a roster, and this is the one place that
    // distinction is easy to get wrong. A singer who performs with a band is
    // not running an agency: the band is not her roster, she does not seat them,
    // and she takes no cut of their bookings. Rule 1 is what keeps this from
    // quietly upselling every working musician.
    label: "You perform with others",
  },
  {
    key: "industry.dietary_capabilities",
    type: "string_list",
    category: "industry",
    label: "Dietary requirements you cover",
  },

  // ── Physical attributes: modelling only, and personal ───────────────────────
  {
    key: "industry.height_cm",
    type: "number",
    category: "industry",
    label: "Height",
    personal: true,
  },
  {
    key: "industry.measurements",
    type: "string",
    category: "industry",
    label: "Measurements",
    personal: true,
  },
  {
    key: "industry.hair_color",
    type: "string",
    category: "industry",
    label: "Hair",
    personal: true,
  },
  {
    key: "industry.eye_color",
    type: "string",
    category: "industry",
    label: "Eyes",
    personal: true,
  },

  // ── Availability ───────────────────────────────────────────────────────────
  {
    key: "industry.availability_note",
    type: "string",
    category: "industry",
    // Free prose rather than a structured schedule. A real availability pattern
    // belongs in the booking calendar, which is a product surface with its own
    // editor; extracting one from conversation would produce a confident,
    // wrong-shaped schedule that somebody then has to find and correct.
    label: "When you generally work",
  },
] as const;
