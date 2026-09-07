/**
 * fact-keys.ts — the Brief's fact vocabulary, as versioned data.
 *
 * WHY THIS IS DATA AND NOT A DATABASE ENUM
 * `tulala_brief_facts.fact_key` is an unconstrained TEXT column on purpose. The
 * industry packs in Phase 6 exist to add fact keys, and a CHECK constraint or a
 * pg enum would make "ask nail artists one more question" a migration. So the
 * vocabulary lives here, where it can be read by tests, diffed in review, and
 * extended by a pack without touching the schema.
 *
 * The cost of that choice is that nothing stops a typo'd key reaching the
 * database. `isKnownFactKey` is the mitigation, and every writer must call it.
 *
 * WHAT A FACT KEY IS NOT
 * Not a form field, and not a column in a profile. A fact is what we believe
 * about someone; the operational tables are what the product runs on. They are
 * deliberately different shapes: `business.has_own_brand` is a real fact and
 * will never be a column anywhere, and `talent_profiles.stage_name` is a real
 * column whose fact-shaped twin carries provenance the column cannot.
 *
 * EVIDENCE WEIGHTS
 * Each key declares what it is evidence FOR and how strongly, which is the
 * input to the Phase 3 engine. Keeping the weights next to the definitions
 * rather than in the engine means a new pack ships its own evidence, and means
 * you can read the whole classifier's input in one file.
 */

import { INDUSTRY_FACT_KEYS } from "./industry-fact-keys";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FactValueType =
  | "string"
  | "number"
  | "boolean"
  | "string_list"
  /**
   * A priced list: `[{ name, price?, category?, description? }]`.
   *
   * Added for the widened intake. A menu is the one thing a restaurant's page
   * actually IS, and no scalar type can hold it — the intake read El Paisa's
   * full menu and kept two facts, because there was nowhere to put the rest.
   *
   * Deliberately NOT a generic "json" type. This file exists because
   * `fact_key` is an unconstrained TEXT column and `isKnownFactKey` is the only
   * thing between a typo and the database; a free-blob type would extend that
   * hole to values. Every field below is checked.
   */
  | "priced_items";

/**
 * Where a fact shows up in the Settings surface. Mirrors the section list in
 * the plan, so the UI is a group-by rather than a hand-maintained layout.
 */
export type FactCategory =
  | "identity"
  | "work"
  | "business"
  | "presence"
  | "operations"
  | "brand"
  | "goals"
  /**
   * Craft detail added by an industry pack. Held apart from the core categories
   * because it obeys different rules — see `industry-fact-keys.ts` — and because
   * the Settings surface shows it last, after the facts that decided anything.
   */
  | "industry";

/**
 * How strongly a fact argues that this person needs a Talent Profile, a
 * Workspace, or both.
 *
 * Signed, deliberately: some facts are evidence AGAINST. "Works alone from
 * home" is not neutral on whether she needs a workspace, and modelling it as
 * absence-of-evidence is what produces the classic failure where enough weak
 * positives outvote one decisive negative.
 *
 * Magnitudes are the plan's four bands: weak 1, moderate 2, strong 3, decisive
 * 5. Bands rather than free numbers so that "strong" means the same thing in
 * every pack, and so a reviewer can see an inflated weight.
 */
export type EvidenceWeight = {
  /** Positive = needs a Talent Profile. */
  talent?: number;
  /** Positive = needs a Workspace. Negative = actively argues against one. */
  workspace?: number;
  /**
   * True when this fact alone settles the workspace question, whatever else is
   * present. Represents the plan's "very strong business evidence": someone who
   * takes a cut of another person's booking is running a business, and no amount
   * of "but she works from home" changes that.
   */
  decisive?: boolean;
};

export type FactKeyDef = {
  key: string;
  type: FactValueType;
  category: FactCategory;
  /** Settings-surface label. Sentence case, no trailing colon. */
  label: string;
  /**
   * Allowed values for enum-ish string facts. Enforced by `validateFactValue`,
   * so a model that invents a fifth answer is rejected rather than stored.
   */
  allowed?: readonly string[];
  evidence?: EvidenceWeight;
  /**
   * True when this fact names a person or contact detail. Drives redaction:
   * these are stripped before any fact set is put in a model prompt for
   * classification, which never needs to know someone's surname.
   */
  personal?: boolean;
};

// ─── The vocabulary ───────────────────────────────────────────────────────────

/**
 * Bump when a key's MEANING changes, not when a key is added. Stored on the
 * Brief so a replayed intake can be told "these facts were recorded under an
 * older reading of the same key" rather than silently mis-scored.
 */
export const FACT_VOCABULARY_VERSION = 1;

/**
 * Every key, core plus every industry pack's.
 *
 * Merged into ONE list on purpose: `isKnownFactKey` is the only thing standing
 * between a typo and the database, so a second vocabulary that some writers
 * check and others do not would defeat it. A pack adds keys by adding them to
 * `industry-fact-keys.ts`; nothing else in the system needs to know packs exist.
 */
export const FACT_KEYS: readonly FactKeyDef[] = [
  // ── Identity ───────────────────────────────────────────────────────────────
  {
    key: "person.name",
    type: "string",
    category: "identity",
    label: "Your name",
    personal: true,
  },
  {
    key: "person.professional_name",
    type: "string",
    category: "identity",
    label: "Professional or stage name",
    personal: true,
    // A name you work under is a name clients look for. That is the whole
    // definition of Talent.
    evidence: { talent: 3 },
  },
  {
    key: "person.city",
    type: "string",
    category: "identity",
    label: "Where you work",
  },
  {
    key: "person.country",
    type: "string",
    category: "identity",
    label: "Country",
  },
  {
    key: "person.is_adult",
    type: "boolean",
    category: "identity",
    label: "18 or older",
  },
  {
    key: "person.languages",
    type: "string_list",
    category: "identity",
    label: "Languages you work in",
  },

  // ── Work ───────────────────────────────────────────────────────────────────
  {
    key: "work.discipline",
    type: "string",
    category: "work",
    label: "What you do",
    evidence: { talent: 2 },
  },
  {
    key: "work.industry",
    type: "string",
    category: "work",
    label: "Industry",
  },
  {
    key: "work.services",
    type: "string_list",
    category: "work",
    label: "Services you offer",
  },
  {
    key: "work.years_experience",
    type: "number",
    category: "work",
    label: "Years doing this",
  },
  {
    key: "work.performs_service_personally",
    type: "boolean",
    category: "work",
    label: "You personally do the work",
    evidence: { talent: 3 },
  },
  {
    key: "work.booked_by_name",
    type: "boolean",
    category: "work",
    label: "Clients ask for you by name",
    // The sharpest talent signal there is: if the client wants THIS person, the
    // person is the product.
    evidence: { talent: 5 },
  },
  {
    key: "work.portfolio_is_own_work",
    type: "boolean",
    category: "work",
    label: "The portfolio is your own work",
    evidence: { talent: 2 },
  },

  // ── Business shape ─────────────────────────────────────────────────────────
  {
    key: "business.exists",
    type: "boolean",
    category: "business",
    label: "You run a business",
    evidence: { workspace: 3 },
  },
  {
    key: "business.name",
    type: "string",
    category: "business",
    label: "Business name",
    // A name that is not the person's own name is a brand to run, not a person
    // to showcase.
    evidence: { workspace: 3 },
  },
  {
    key: "business.description",
    type: "string",
    category: "business",
    label: "What the business is",
    // No evidence weight: free prose is what the extractor reads to PRODUCE
    // scored facts, and double-counting it here would let one paragraph vote
    // twice. It is stored because it is the single richest thing anyone says
    // about themselves, and the builders need it verbatim.
  },
  {
    key: "business.works_from",
    type: "string",
    category: "business",
    label: "Where the work happens",
    allowed: ["home", "own_premises", "someone_elses_premises", "client_location", "mobile"],
    // Not scored here: the answer only means something in combination, and the
    // engine reads it directly. "Home" plus staff is still a business.
  },
  {
    key: "business.has_staff",
    type: "boolean",
    category: "business",
    label: "Other people work with you",
    evidence: { workspace: 5, decisive: true },
  },
  {
    key: "business.staff_count",
    type: "number",
    category: "business",
    // "In total", not "as well as you". The engine turns this straight into a
    // seat count, and off-by-one here is the difference between Free and
    // Studio, so the label has to be unambiguous to whoever asks the question.
    label: "How many people in total, including you",
  },
  {
    key: "business.other_workers_arrangement",
    type: "string",
    category: "business",
    label: "How the money works with them",
    allowed: ["commission_split", "rent_chair", "salary", "unclear"],
    // The third of the four operating questions, and the one that separates a
    // roster from a staff rota. Not scored as a weight: the answer is not
    // "more or less business", it is WHICH KIND, so the engine reads it
    // directly when it picks the workspace shape and the plan floor.
  },
  {
    key: "business.represents_others",
    type: "boolean",
    category: "business",
    label: "You book work for other people",
    // The roster question. This is what separates a Workspace that needs seats
    // from one that only needs a website.
    evidence: { workspace: 5, decisive: true },
  },
  {
    key: "business.takes_commission",
    type: "boolean",
    category: "business",
    label: "You take a cut of their work",
    // Taking a percentage of someone else's booking is the single most
    // unambiguous "this is a business" fact in the entire intake.
    evidence: { workspace: 5, decisive: true },
  },
  {
    key: "business.clients_choose_provider",
    type: "boolean",
    category: "business",
    label: "Clients pick who they see",
    // Decides workspace_type: naming the provider means a roster is public.
    evidence: { workspace: 2 },
  },
  {
    key: "business.works_alone",
    type: "boolean",
    category: "business",
    label: "You work alone",
    // Evidence AGAINST a workspace, not merely absence of evidence for one.
    evidence: { workspace: -3, talent: 2 },
  },
  {
    key: "business.employed_by_other",
    type: "boolean",
    category: "business",
    label: "You are employed somewhere",
    // Law 5: being employed never disqualifies someone from being Talent. It
    // does argue they do not need their own workspace, because the premises are
    // not theirs.
    evidence: { workspace: -2, talent: 1 },
  },

  // ── Existing presence ──────────────────────────────────────────────────────
  {
    key: "presence.website_url",
    type: "string",
    category: "presence",
    label: "Website",
    evidence: { workspace: 2 },
  },
  {
    key: "presence.owns_domain",
    type: "boolean",
    category: "presence",
    label: "You own a domain",
    evidence: { workspace: 2 },
  },
  {
    key: "presence.instagram_handle",
    type: "string",
    category: "presence",
    label: "Instagram",
  },
  {
    key: "presence.business_social_separate",
    type: "boolean",
    category: "presence",
    label: "The business has its own accounts",
    // Bothering to keep a separate account is someone treating the brand as a
    // thing that exists apart from them.
    evidence: { workspace: 3 },
  },
  {
    key: "presence.has_logo",
    type: "boolean",
    category: "presence",
    label: "You have a logo",
    evidence: { workspace: 2 },
  },

  // ── What the widened intake keeps ──────────────────────────────────────────
  //
  // Every one of these was READ from El Paisa's menu page and thrown away,
  // because the vocabulary had nowhere to put it. The intake said "2 things
  // understood" of a complete menu. No evidence weights: none of this decides
  // what KIND of workspace someone is, it is what their site is made of.
  {
    key: "business.hours",
    type: "string_list",
    category: "business",
    label: "Opening hours",
  },
  {
    key: "presence.facebook_url",
    type: "string",
    category: "presence",
    label: "Facebook page",
  },
  {
    key: "presence.whatsapp",
    type: "string",
    category: "presence",
    label: "WhatsApp number",
  },
  {
    key: "brand.logo_url",
    type: "string",
    category: "brand",
    label: "Logo",
  },
  {
    // Hexes, unlabelled. Roles are guessed by luminance downstream and a colour
    // that fails contrast is demoted rather than refused, so this must NOT
    // validate contrast — that mapping belongs to the brand-brief contract and
    // duplicating it here would let a brief bounce on a colour the mapper would
    // have accepted.
    key: "brand.palette",
    type: "string_list",
    category: "brand",
    label: "Brand colours",
  },
  {
    key: "menu.categories",
    type: "string_list",
    category: "business",
    label: "Menu sections",
  },
  {
    key: "menu.items",
    type: "priced_items",
    category: "business",
    label: "Menu items",
  },

  // ── Operations ─────────────────────────────────────────────────────────────
  {
    key: "operations.takes_bookings",
    type: "boolean",
    category: "operations",
    label: "You take bookings",
  },
  {
    key: "operations.booking_method",
    type: "string",
    category: "operations",
    label: "How people book you now",
  },
  {
    key: "operations.business_receives_bookings",
    type: "boolean",
    category: "operations",
    label: "The business gets booked, not just you",
    evidence: { workspace: 5, decisive: true },
  },
  {
    key: "operations.takes_payments",
    type: "boolean",
    category: "operations",
    label: "You take payments",
  },

  // ── Brand ──────────────────────────────────────────────────────────────────
  {
    key: "brand.audience",
    type: "string",
    category: "brand",
    label: "Who you work with",
  },
  {
    key: "brand.tone",
    type: "string",
    category: "brand",
    label: "How you want to come across",
  },
  {
    key: "brand.differentiator",
    type: "string",
    category: "brand",
    label: "What makes you different",
  },
  {
    key: "brand.price_position",
    type: "string",
    category: "brand",
    label: "Where you sit on price",
    allowed: ["budget", "mid", "premium", "luxury"],
  },

  // ── Goals ──────────────────────────────────────────────────────────────────
  {
    key: "goals.primary",
    type: "string",
    category: "goals",
    label: "What you want most",
  },
  {
    key: "goals.wants_website",
    type: "boolean",
    category: "goals",
    label: "You want a website",
    evidence: { workspace: 2 },
  },
  {
    key: "goals.wants_to_grow_team",
    type: "boolean",
    category: "goals",
    label: "You plan to bring people on",
    // Intent, not fact: a plan to hire is a reason to record an upgrade trigger,
    // not a reason to sell seats today.
    evidence: { workspace: 1 },
  },
  {
    key: "goals.focus_on_business",
    type: "boolean",
    category: "goals",
    label: "You mainly run the business now",
    // Post-signup signal for the Strategist: keep the Workspace, quiet the
    // Talent Profile. No evidence weight — it does not change what they need
    // at intake, only what they want to emphasise after they have it.
  },
  {
    key: "goals.talent_still_active",
    type: "boolean",
    category: "goals",
    label: "Your Talent Profile should stay active",
  },
  // ── Industry packs ─────────────────────────────────────────────────────────
  ...INDUSTRY_FACT_KEYS,
] as const;

// ─── Lookup ───────────────────────────────────────────────────────────────────

const BY_KEY: ReadonlyMap<string, FactKeyDef> = new Map(
  FACT_KEYS.map((d) => [d.key, d]),
);

export function factKeyDef(key: string): FactKeyDef | null {
  return BY_KEY.get(key) ?? null;
}

export function isKnownFactKey(key: string): boolean {
  return BY_KEY.has(key);
}

/**
 * The label to show a human for a fact key.
 *
 * Falls back to the raw key rather than throwing, so a fact stored under an old
 * vocabulary version still renders. A restored snapshot from before a key was
 * renamed must not blank out the review screen.
 */
export function factLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function factKeysInCategory(category: FactCategory): FactKeyDef[] {
  return FACT_KEYS.filter((d) => d.category === category);
}

/** Keys that carry a name or contact detail, stripped before any model prompt. */
export function personalFactKeys(): string[] {
  return FACT_KEYS.filter((d) => d.personal).map((d) => d.key);
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type FactValueError = { ok: false; error: string };
export type FactValueOk = { ok: true; value: unknown };

/**
 * Validate a value against its key's declared type and allowed set.
 *
 * Every write goes through this, including AI extraction. Structured output
 * from a model is well-FORMED, not correct: it will happily return
 * `staff_count: "three"`, or an `allowed` value it invented. Rejecting at the
 * boundary is cheaper than discovering it in the engine, where a string where a
 * number belongs silently scores zero.
 */
export function validateFactValue(
  key: string,
  value: unknown,
): FactValueOk | FactValueError {
  const def = factKeyDef(key);
  if (!def) return { ok: false, error: `Unknown fact key: ${key}` };

  if (value === null || value === undefined) {
    return { ok: false, error: `${key}: value is required` };
  }

  switch (def.type) {
    case "string": {
      if (typeof value !== "string") {
        return { ok: false, error: `${key}: expected a string` };
      }
      const trimmed = value.trim();
      if (!trimmed) return { ok: false, error: `${key}: value is empty` };
      if (def.allowed && !def.allowed.includes(trimmed)) {
        return {
          ok: false,
          error: `${key}: "${trimmed}" is not one of ${def.allowed.join(", ")}`,
        };
      }
      return { ok: true, value: trimmed };
    }
    case "number": {
      // Reject the string "3" rather than coercing it. A model that returns a
      // number as text is a model whose output we should not be guessing at.
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, error: `${key}: expected a finite number` };
      }
      if (value < 0) return { ok: false, error: `${key}: must not be negative` };
      return { ok: true, value };
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return { ok: false, error: `${key}: expected true or false` };
      }
      return { ok: true, value };
    }
    case "priced_items": {
      // Accepts a real array OR a JSON-encoded one. The extraction schema is
      // `strict: true` with `value: { type: "string" }`, so a model physically
      // cannot return an array through it — the only way a structured fact
      // crosses that boundary is encoded. Decoding here rather than at the call
      // site means every writer gets the same validation afterwards.
      let decoded: unknown = value;
      if (typeof decoded === "string") {
        try {
          decoded = JSON.parse(decoded);
        } catch {
          return { ok: false, error: `${key}: expected a list of items or JSON for one` };
        }
      }
      if (!Array.isArray(decoded)) {
        return { ok: false, error: `${key}: expected a list of items` };
      }
      const items: Array<Record<string, unknown>> = [];
      for (const raw of decoded) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          return { ok: false, error: `${key}: every item must be an object` };
        }
        const row = raw as Record<string, unknown>;
        const name = typeof row.name === "string" ? row.name.trim() : "";
        if (!name) return { ok: false, error: `${key}: every item needs a name` };
        const item: Record<string, unknown> = { name };
        // Price stays a NUMBER and is never coerced from text, for the same
        // reason `number` refuses "3": a model that returns "12.50 MXN" has not
        // parsed a price, and guessing which part is the amount is how a menu
        // ships with wrong prices on it.
        if (row.price !== undefined && row.price !== null) {
          if (typeof row.price !== "number" || !Number.isFinite(row.price) || row.price < 0) {
            return { ok: false, error: `${key}: "${name}" has a price that is not a positive number` };
          }
          item.price = row.price;
        }
        for (const field of ["category", "description", "currency"] as const) {
          const v = row[field];
          if (typeof v === "string" && v.trim()) item[field] = v.trim();
        }
        items.push(item);
      }
      return { ok: true, value: items };
    }
    case "string_list": {
      if (!Array.isArray(value)) {
        return { ok: false, error: `${key}: expected a list` };
      }
      const cleaned = value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean);
      if (cleaned.length !== value.length) {
        return { ok: false, error: `${key}: every item must be a non-empty string` };
      }
      return { ok: true, value: cleaned };
    }
  }
}
