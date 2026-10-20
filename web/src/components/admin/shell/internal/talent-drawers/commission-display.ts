/**
 * Commission shown for a roster agency. The bridge does not carry a rate yet, so for a real
 * agency the rate is UNKNOWN (null) and nothing is shown: a "0%" there would be a false money
 * figure. Only a rate that is really known (prototype row, or a future bridge value) renders.
 */
export type CommissionDisplay = { kind: "unknown" } | { kind: "none" } | { kind: "rate"; pct: number };

export function commissionDisplay(rate: number | null | undefined): CommissionDisplay {
  if (rate == null || !Number.isFinite(rate)) return { kind: "unknown" };
  if (rate === 0) return { kind: "none" };
  return { kind: "rate", pct: Math.round(rate * 100) };
}
