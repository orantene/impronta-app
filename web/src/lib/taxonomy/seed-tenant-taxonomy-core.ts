/**
 * Which taxonomy terms a new tenant starts with — PURE CORE.
 *
 * THE BUG THIS EXISTS TO FIX
 * A missing row in `agency_taxonomy_settings` means ENABLED. Nothing seeds that
 * table at tenant creation, so every new agency starts with the ENTIRE catalog
 * switched on: 1,050 active terms and 532 selectable as a primary role. A
 * restaurant signing up today inherits the full modelling taxonomy. Measured on
 * live data, 11 of 13 tenants sit in exactly that state; only Impronta has ever
 * been curated by hand (572 of 901 enabled).
 *
 * That collides with the standing bar that settings must not overwhelm — a
 * barber must never need to open the advanced panel — and it is about to get
 * worse, because six business tenants are being created.
 *
 * THE RULE
 * Seed the tenant's own vertical and nothing else. The catalog has 19 real
 * verticals (the level-1 terms carrying `parent_category_field_groups`
 * mappings), each 16 to 56 terms. A chef agency then sees ~33 terms with ~28
 * selectable roles instead of 1,050 and 532, and every term it sees is
 * relevant.
 *
 * WHY A FULL ROW SET AND NOT A SPARSE ONE
 * Because absence means enabled, "seed less" is not available: a partial write
 * silently leaves the rest of the catalog switched on, which is the bug. Every
 * active term gets a row, disabled outside the vertical. That is ~1,000 rows
 * per tenant — the same volume the existing backfill already writes, with
 * different values.
 *
 * WHY LEVEL 3 FOR allow_as_primary
 * Roles live at level 3. Levels 1 and 2 are categories and must never be
 * offered as somebody's primary role — that is what produces 532 choices.
 *
 * WHY custom_label_i18n STAYS NULL
 * NULL means "use the platform label". `agency_taxonomy_settings` currently has
 * it non-null on 100% of rows in every tenant, which makes "has this agency
 * actually renamed anything?" unanswerable from the data. Not repeating that.
 *
 * NULL VERTICAL IS A REAL ANSWER
 * Some businesses have no vertical in this catalog — a laundry, an immigration
 * office, a jeweller. They seed with everything disabled: an honest empty
 * picker plus a working "request a term" path beats showing a chef list in an
 * immigration office.
 */

/** The 19 level-1 terms that carry field-group mappings — the real verticals. */
export const TAXONOMY_VERTICAL_SLUGS = [
  "animals-specialty-acts",
  "chefs-culinary",
  "event-staff",
  "home-technical-services",
  "hospitality-property",
  "hosts-promo",
  "influencers-creators",
  "kids-family-services",
  "models",
  "music-djs",
  "performers",
  "photo-video-creative",
  "production-bts",
  "security-protection",
  "speakers-coaches-experts",
  "sports-fitness",
  "transportation",
  "travel-concierge",
  "wellness-beauty",
] as const;

export type TaxonomyVerticalSlug = (typeof TAXONOMY_VERTICAL_SLUGS)[number];

export function isTaxonomyVerticalSlug(v: unknown): v is TaxonomyVerticalSlug {
  return (
    typeof v === "string" &&
    (TAXONOMY_VERTICAL_SLUGS as readonly string[]).includes(v)
  );
}

/** Minimal term shape the seeding decision needs. */
export type SeedTermRow = {
  id: string;
  parent_id: string | null;
  level: number | null;
  slug: string | null;
};

/** One row destined for `agency_taxonomy_settings`. */
export type SeededTaxonomySetting = {
  taxonomy_term_id: string;
  is_enabled: boolean;
  show_in_registration: boolean;
  allow_as_primary: boolean;
  /** NULL means "use the platform label" — never a copy of it. */
  custom_label_i18n: null;
};

/** Max hops when walking a term up to its level-1 root. Bounds a cycle. */
const MAX_ANCESTOR_DEPTH = 6;

/**
 * Every descendant of `rootId`, inclusive. Iterative, so a deep or cyclic
 * branch cannot blow the stack; `seen` also makes a cycle terminate.
 */
export function collectSubtreeIds(
  rootId: string,
  terms: readonly SeedTermRow[],
): Set<string> {
  const childrenOf = new Map<string, SeedTermRow[]>();
  for (const t of terms) {
    if (!t.parent_id) continue;
    const list = childrenOf.get(t.parent_id);
    if (list) list.push(t);
    else childrenOf.set(t.parent_id, [t]);
  }

  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenOf.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      stack.push(child.id);
    }
  }
  return seen;
}

/**
 * Build the complete row set for one tenant.
 *
 * `verticalSlug === null` disables everything — the honest-empty-picker case.
 * An unknown slug THROWS rather than falling back to null: a typo in the signup
 * path must fail loudly, because an empty picker looks identical whether it was
 * intended or was a misspelling.
 */
export function buildTenantTaxonomySeed(input: {
  terms: readonly SeedTermRow[];
  verticalSlug: string | null;
}): SeededTaxonomySetting[] {
  const { terms, verticalSlug } = input;

  if (verticalSlug !== null && !isTaxonomyVerticalSlug(verticalSlug)) {
    throw new Error(
      `[seed-tenant-taxonomy] unknown vertical "${verticalSlug}". ` +
        `Expected null or one of: ${TAXONOMY_VERTICAL_SLUGS.join(", ")}`,
    );
  }

  let enabledIds: Set<string>;
  if (verticalSlug === null) {
    enabledIds = new Set();
  } else {
    const root = terms.find((t) => t.slug === verticalSlug && t.level === 1);
    if (!root) {
      throw new Error(
        `[seed-tenant-taxonomy] vertical "${verticalSlug}" is a known slug but ` +
          `no active level-1 term matches it. The catalog and this list have drifted.`,
      );
    }
    enabledIds = collectSubtreeIds(root.id, terms);
  }

  return terms.map((t) => {
    const enabled = enabledIds.has(t.id);
    return {
      taxonomy_term_id: t.id,
      is_enabled: enabled,
      show_in_registration: enabled,
      // Roles are level 3 only. Categories must never be a primary role.
      allow_as_primary: enabled && t.level === 3,
      custom_label_i18n: null,
    };
  });
}

/** Ancestor walk used by callers that need a term's vertical. Bounded. */
export function resolveVerticalRoot(
  termId: string,
  terms: readonly SeedTermRow[],
): SeedTermRow | null {
  const byId = new Map(terms.map((t) => [t.id, t]));
  let current = byId.get(termId);
  let hops = 0;
  while (current && hops < MAX_ANCESTOR_DEPTH) {
    if (current.level === 1 || current.parent_id == null) return current;
    current = byId.get(current.parent_id);
    hops += 1;
  }
  return null;
}
