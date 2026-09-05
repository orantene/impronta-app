/**
 * enforced-plan-facts.ts — the numbers /pricing is allowed to state.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The public compare table is hand-authored rows in `product_features`, and it
 * has drifted from what the product enforces three separate times that we know
 * of. On 2026-09-02 it said Free had 1 team seat (enforced 2) and Agency had
 * "Up to 8" (enforced unlimited). Those were corrected. On 2026-09-05, checking
 * a DIFFERENT set of rows, it still said:
 *
 *   People profiles · Studio      "Up to 50"   enforced 15
 *   CMS pages / posts / nav · Free  excluded   5 pages allowed
 *   CMS pages / posts / nav · Studio excluded  unlimited allowed
 *
 * The Studio column contradicted ITSELF: "Up to 15 talent profiles" in one row
 * and "Up to 50" in another, on the same page, for the same fact.
 *
 * The correction after the first round was to fix the values. That was not
 * enough, because fixing values does not stop the next author typing a new one.
 * This module is the thing that was missing: ONE derivation of every plan fact
 * a marketing surface may state, read from the modules that actually enforce
 * them, so a claim can be checked rather than trusted.
 *
 * WHAT BELONGS HERE
 * ─────────────────
 * Only facts with an ENFORCEMENT PATH. "Up to 15 profiles" belongs, because
 * `checkRosterSeatAvailability` refuses the sixteenth. "Priority support"
 * does not, because nothing in the product measures it. A derived table that
 * quietly absorbs unenforceable marketing claims would launder them into
 * looking verified, which is worse than leaving them plainly authored.
 */

import { PLAN_SEAT_CAPS, type SeatCapPlan } from "@/lib/saas/plan-seat-caps";
import { PLAN_LIMITS } from "@/lib/access/plan-limits";
import { getBuilderPlanPolicy } from "@/lib/site-admin/builder-capabilities";
import { customDomainEligible } from "@/lib/saas/workspace-public-url";
import type { PlanKey } from "@/lib/access/plan-catalog";

/** Catalog tier slug → plan key, for the slugs where the two differ. */
export const TIER_SLUG_TO_PLAN_KEY: Record<string, PlanKey> = {
  free: "free",
  website: "website",
  studio: "studio",
  agency: "agency",
  hub: "network",
};

export type EnforcedPlanFacts = {
  /** Roster profiles. null = unlimited. Enforced via agencies.talent_seat_limit. */
  rosterProfiles: number | null;
  /** Team seats. null = unlimited. Enforced at invite creation and redemption. */
  teamSeats: number | null;
  /** Operator-created public pages. null = unlimited. See isQuotaCountedPage. */
  publicPages: number | null;
  /** Can attach a custom domain. A SET, not a rank threshold. */
  customDomain: boolean;
};

export function enforcedFactsForPlan(plan: PlanKey): EnforcedPlanFacts {
  return {
    rosterProfiles:
      plan in PLAN_SEAT_CAPS ? PLAN_SEAT_CAPS[plan as SeatCapPlan] : null,
    teamSeats: PLAN_LIMITS[plan]?.max_team_seats ?? null,
    publicPages: getBuilderPlanPolicy(plan).maxPublicPages,
    customDomain: customDomainEligible(plan as never),
  };
}

/**
 * How a count is written on the pricing page. Accepts the spellings already in
 * use so the guard checks MEANING rather than punctuation — "Up to 15", "15"
 * and "Unlimited" are all legitimate ways to write a cap, and failing a build
 * over a missing "Up to" would be a guard nobody keeps.
 */
export function countMatchesClaim(
  enforced: number | null,
  claim: string | null,
): boolean {
  if (claim === null) return false;
  const text = claim.trim().toLowerCase();

  if (enforced === null) {
    return text === "unlimited" || text === "∞";
  }
  // "Up to 15", "15", "up to 15 profiles" — the first integer must match, and
  // the claim must not say unlimited for a finite cap.
  if (text === "unlimited" || text === "∞") return false;
  const first = text.match(/\d+/);
  return first !== null && Number.parseInt(first[0], 10) === enforced;
}

export type CompareRowClaim = {
  tierSlug: string;
  label: string;
  /** `value_text` when set, else null. */
  valueText: string | null;
  /** The ✓ / — column when value_text is absent. */
  included: boolean;
};

export type ClaimDrift = {
  tierSlug: string;
  label: string;
  claimed: string;
  enforced: string;
};

/**
 * Which compare-table labels map onto which enforced fact.
 *
 * Deliberately matched on the LABEL, because that is what an author types and
 * therefore what drifts. Labels not listed here are unchecked marketing copy
 * and this guard says nothing about them.
 */
const LABEL_TO_FACT: Record<string, keyof EnforcedPlanFacts> = {
  "people profiles": "rosterProfiles",
  "talent profiles": "rosterProfiles",
  seats: "teamSeats",
  "team seats": "teamSeats",
  "cms pages / posts / nav": "publicPages",
  "custom domain": "customDomain",
};

/** Every row whose stated value contradicts what the product enforces. */
export function findCompareTableDrift(rows: CompareRowClaim[]): ClaimDrift[] {
  const drift: ClaimDrift[] = [];

  for (const row of rows) {
    const fact = LABEL_TO_FACT[row.label.trim().toLowerCase()];
    if (!fact) continue;

    const plan = TIER_SLUG_TO_PLAN_KEY[row.tierSlug];
    if (!plan) continue;

    const facts = enforcedFactsForPlan(plan);

    if (fact === "customDomain") {
      if (row.included !== facts.customDomain) {
        drift.push({
          tierSlug: row.tierSlug,
          label: row.label,
          claimed: row.included ? "included" : "excluded",
          enforced: facts.customDomain ? "included" : "excluded",
        });
      }
      continue;
    }

    const enforced = facts[fact] as number | null;

    // A boolean row for a COUNT fact: "excluded" is only honest when the
    // enforced cap is zero. This is the shape that said Free gets no CMS pages
    // while the product allows five.
    if (row.valueText === null) {
      const claimsNone = !row.included;
      const reallyNone = enforced === 0;
      if (claimsNone !== reallyNone) {
        drift.push({
          tierSlug: row.tierSlug,
          label: row.label,
          claimed: row.included ? "included" : "excluded",
          enforced: enforced === null ? "unlimited" : String(enforced),
        });
      }
      continue;
    }

    if (!countMatchesClaim(enforced, row.valueText)) {
      drift.push({
        tierSlug: row.tierSlug,
        label: row.label,
        claimed: row.valueText,
        enforced: enforced === null ? "unlimited" : String(enforced),
      });
    }
  }

  return drift;
}
