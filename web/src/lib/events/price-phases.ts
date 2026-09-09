/**
 * Events depth helpers — price phases share one admission pool; lanes; caps.
 */

export type PricePhase = {
  id: string;
  label: string;
  amountCents: number;
  /** Shared pool id — phases never invent a second capacity. */
  poolId: string;
  salesFrom: string | null;
  salesUntil: string | null;
};

export function activePhase(
  phases: readonly PricePhase[],
  nowIso: string,
): PricePhase | null {
  const now = Date.parse(nowIso);
  for (const phase of phases) {
    const from = phase.salesFrom ? Date.parse(phase.salesFrom) : -Infinity;
    const until = phase.salesUntil ? Date.parse(phase.salesUntil) : Infinity;
    if (now >= from && now <= until) return phase;
  }
  return null;
}

export function phasesShareOnePool(phases: readonly PricePhase[]): boolean {
  if (phases.length === 0) return true;
  const pool = phases[0]!.poolId;
  return phases.every((p) => p.poolId === pool);
}
