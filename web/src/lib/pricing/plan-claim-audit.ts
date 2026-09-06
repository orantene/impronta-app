import type { PlanKey } from "@/lib/access/plan-catalog";
import {
  planGrantsCapability,
  type PlanEntitlementMap,
} from "@/lib/access/plan-capabilities";
import { CAPABILITY_KEYS } from "@/lib/access/capabilities";
import { TIER_SLUG_TO_PLAN_KEY, type CompareRowClaim } from "./enforced-plan-facts";

/**
 * plan-claim-audit.ts — does the pricing page claim what the product enforces?
 *
 * `enforced-plan-facts.ts` answers that for COUNTS (roster, seats, pages) and
 * for the custom-domain set. This answers it for CAPABILITIES, which are a
 * different store with a different failure mode.
 *
 * THE FAIL-OPEN DEFAULT IS THE WHOLE DIFFICULTY
 * ─────────────────────────────────────────────
 * `plan_capabilities` holds six rows across three capabilities. A capability
 * with NO row is GRANTED to every plan. So the table cannot be read as "what a
 * plan includes" — and neither can its absence be read as "withheld".
 *
 * That makes exactly one direction of marketing claim checkable, and it is the
 * dangerous one: **a compare-table row that says a plan does NOT get something
 * the product actually grants it.** A withheld claim is a promise to a
 * customer that upgrading buys them something. If no row withholds it, the
 * upgrade buys nothing, and the row is selling air.
 *
 * The other direction — a row claiming a plan DOES get something — is only
 * checkable when a row withholds it. Everything else is unfalsifiable from
 * this table, and this module says so rather than implying coverage.
 *
 * WHY THE MAP IS SHORT AND STAYS SHORT
 * ────────────────────────────────────
 * Compare-table labels are marketing prose ("Bulk watermark apply"); capability
 * keys are enforcement identifiers. A mapping between them is an editorial
 * claim that the two mean the same thing, and a wrong one makes the guard
 * confidently wrong — worse than no guard. So a label is mapped only where the
 * capability genuinely decides the claim, and everything else is reported as
 * UNBACKED rather than quietly skipped.
 */

/**
 * Compare-table label (lowercased) → the capability key that decides it.
 *
 * Add an entry only when denying that capability is what actually stops the
 * customer doing the thing the label names.
 */
export const LABEL_TO_CAPABILITY: Record<string, string> = {
  "custom domain": "manage_agency_domains",
  "custom domain (your-name.com)": "manage_agency_domains",
};

export type ClaimVerdict =
  /** The row agrees with what the capability layer enforces. */
  | { kind: "agrees"; tierSlug: string; label: string }
  /** The row withholds something the product grants. Selling air. */
  | {
      kind: "sells_air";
      tierSlug: string;
      label: string;
      capabilityKey: string;
      detail: string;
    }
  /** The row promises something the product withholds. Overclaim. */
  | {
      kind: "overclaims";
      tierSlug: string;
      label: string;
      capabilityKey: string;
      detail: string;
    }
  /** No capability and no enforced fact decides this label. */
  | { kind: "unbacked"; tierSlug: string; label: string };

/**
 * Classify one compare-table row against the capability layer.
 *
 * `entitlements` is the loaded `plan_capabilities` map. An EMPTY map means
 * every capability is granted (fail-open), which is a legitimate state — it is
 * what the table shipped in — and is treated as such rather than as a failure.
 */
export function classifyCapabilityClaim(
  row: CompareRowClaim,
  entitlements: PlanEntitlementMap,
): ClaimVerdict {
  const label = row.label.trim().toLowerCase();
  const capabilityKey = LABEL_TO_CAPABILITY[label];
  if (!capabilityKey) {
    return { kind: "unbacked", tierSlug: row.tierSlug, label: row.label };
  }

  const plan = TIER_SLUG_TO_PLAN_KEY[row.tierSlug];
  if (!plan) {
    return { kind: "unbacked", tierSlug: row.tierSlug, label: row.label };
  }

  const granted = planGrantsCapability(
    plan as PlanKey,
    capabilityKey,
    entitlements,
  );

  if (row.included && !granted) {
    return {
      kind: "overclaims",
      tierSlug: row.tierSlug,
      label: row.label,
      capabilityKey,
      detail: `the page offers it on ${row.tierSlug}, but plan_capabilities withholds ${capabilityKey} from ${plan}`,
    };
  }

  if (!row.included && granted) {
    return {
      kind: "sells_air",
      tierSlug: row.tierSlug,
      label: row.label,
      capabilityKey,
      detail: `the page withholds it from ${row.tierSlug}, but nothing stops ${plan} using ${capabilityKey} — no row withholds it, and a missing row means granted`,
    };
  }

  return { kind: "agrees", tierSlug: row.tierSlug, label: row.label };
}

export type ClaimAudit = {
  /** Rows a capability actually decides, and which agree with it. */
  agrees: ClaimVerdict[];
  /** Rows that contradict the capability layer, in either direction. */
  contradictions: ClaimVerdict[];
  /** Rows nothing in the codebase decides. NOT a pass — an unknown. */
  unbacked: ClaimVerdict[];
};

/**
 * Audit every row, keeping the three outcomes SEPARATE.
 *
 * The separation is the point. An earlier version of the sibling numeric guard
 * printed "134 rows checked, none contradict enforcement" while it evaluated
 * roughly twenty of them and skipped the rest — a true sentence that read as
 * full coverage. A count of rows looked at is not a count of rows checked, and
 * conflating them is how a claim nobody verified comes to look verified.
 */
export function auditCapabilityClaims(
  rows: CompareRowClaim[],
  entitlements: PlanEntitlementMap,
): ClaimAudit {
  const audit: ClaimAudit = { agrees: [], contradictions: [], unbacked: [] };
  for (const row of rows) {
    const verdict = classifyCapabilityClaim(row, entitlements);
    if (verdict.kind === "agrees") audit.agrees.push(verdict);
    else if (verdict.kind === "unbacked") audit.unbacked.push(verdict);
    else audit.contradictions.push(verdict);
  }
  return audit;
}

/**
 * Features the product does not have, and must therefore never appear on the
 * pricing page in any form.
 *
 * WHY THIS IS A DENY-LIST AND NOT A DERIVATION
 * ---------------------------------------------
 * The honest guard would be "every row names a capability key, and every key is
 * in the registry". `product_features` rows cannot do that: a row carries a
 * prose LABEL ("Bulk watermark apply"), not a key, so there is nothing to look
 * up. Until a row carries a capability key, that derivation is unavailable, and
 * writing one anyway would produce a guard that passes by construction.
 *
 * So this is the narrow thing that IS checkable: a short list of features known
 * not to exist, matched against row labels AND values. It catches the exact
 * regression that put "SSO ... unlock at checkout" in front of a paying
 * customer, and it claims nothing beyond that.
 *
 * Remove an entry only once the feature is BUILT.
 */
export const UNBUILT_FEATURE_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: /\bSSO\b|\bSAML\b|\bOkta\b/i, why: "no SSO implementation exists" },
  { pattern: /\bAPI access\b|\bexport API\b/i, why: "there is no public API surface" },
];

export type UnbuiltClaim = {
  tierSlug: string;
  label: string;
  text: string;
  why: string;
};

/**
 * Rows naming a feature that does not exist, in the label OR the value tier.
 *
 * Both are read because the claim that reached production was in a VALUE
 * ("API access"), not a label. A guard reading only labels would have passed
 * straight over it.
 */
export function findUnbuiltClaims(rows: CompareRowClaim[]): UnbuiltClaim[] {
  const found: UnbuiltClaim[] = [];
  for (const row of rows) {
    for (const candidate of [row.label, row.valueText ?? ""]) {
      if (!candidate) continue;
      for (const { pattern, why } of UNBUILT_FEATURE_PATTERNS) {
        if (pattern.test(candidate)) {
          found.push({ tierSlug: row.tierSlug, label: row.label, text: candidate, why });
        }
      }
    }
  }
  return found;
}

/**
 * Every capability key named in the label map must exist in the registry.
 *
 * A mapping onto a key that does not exist would resolve fail-open forever and
 * the guard would pass while checking nothing — the exact shape this module was
 * written to stop, reproduced inside the module itself.
 */
export function unknownMappedCapabilities(): string[] {
  const known = new Set<string>(CAPABILITY_KEYS);
  return [...new Set(Object.values(LABEL_TO_CAPABILITY))].filter(
    (key) => !known.has(key),
  );
}
