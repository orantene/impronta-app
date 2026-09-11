/**
 * CRM segments — human-readable rules over customer rollups.
 */

export type SegmentRule =
  | { field: "visits"; op: ">=" | "<=" | "=="; value: number }
  | { field: "spend_cents"; op: ">=" | "<=" | "=="; value: number }
  | { field: "tag"; op: "has"; value: string };

export type SegmentDefinition = {
  id: string;
  name: string;
  rules: readonly SegmentRule[];
};

export function describeSegmentRule(rule: SegmentRule, locale: "en" | "es" = "en"): string {
  if (rule.field === "tag") {
    return locale === "es" ? `Tiene la etiqueta «${rule.value}»` : `Has tag “${rule.value}”`;
  }
  const label =
    rule.field === "visits"
      ? locale === "es"
        ? "Visitas"
        : "Visits"
      : locale === "es"
        ? "Gasto (centavos)"
        : "Spend (cents)";
  return `${label} ${rule.op} ${rule.value}`;
}

export function customerMatchesSegment(
  customer: { visits: number; spendCents: number; tags: readonly string[] },
  rules: readonly SegmentRule[],
): boolean {
  return rules.every((rule) => {
    if (rule.field === "tag") return customer.tags.includes(rule.value);
    const left = rule.field === "visits" ? customer.visits : customer.spendCents;
    if (rule.op === ">=") return left >= rule.value;
    if (rule.op === "<=") return left <= rule.value;
    return left === rule.value;
  });
}

/** Loyalty reads existing visits / spend_cents rollups — nothing invents a parallel counter. */
export function loyaltyTierFromRollups(input: {
  visits: number;
  spendCents: number;
}): "none" | "member" | "regular" | "vip" {
  if (input.visits >= 20 || input.spendCents >= 200_000) return "vip";
  if (input.visits >= 5 || input.spendCents >= 50_000) return "regular";
  if (input.visits >= 1 || input.spendCents > 0) return "member";
  return "none";
}
