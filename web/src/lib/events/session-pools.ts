import "server-only";

import { logServerError } from "@/lib/server/safe-error";

/**
 * The slice of a Supabase client the peak read needs. `capacity_pool_committed_peak`
 * is EXECUTE for `service_role` only (both environments carry
 * `proacl={postgres,service_role}`), so the client handed here must be the
 * service-role one; a user-scoped client answers 42501 on every pool and Event
 * Day shows "—" for Sold (D-147). The caller has already passed the staff
 * check and scopes the pools to its tenant before asking.
 */
export type PeakClient = {
  rpc: (fn: "capacity_pool_committed_peak", args: { p_pool_id: string }) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type SessionPoolRow = {
  poolKey: string;
  tierLabel: string;
  /** Null when this night has no pool for the tier: unsellable for the night, and said so. */
  poolId: string | null;
  unitsTotal: number | null;
  overbookUnits: number | null;
  isActive: boolean | null;
  /** Capacity's floor: the PEAK of committed units across windows. Null when unreadable. */
  committedPeak: number | null;
};

export type SessionPoolVariant = { label: string; pool_key: string | null; sort_order?: number | null };
export type SessionPoolPool = {
  id: string;
  pool_key: string;
  units_total: number | string;
  overbook_units: number | string;
  is_active: boolean;
};

/** One pool's committed peak through the service-role client; null (and logged) when unreadable. */
export async function readCommittedPeak(admin: PeakClient, poolId: string): Promise<number | null> {
  const { data, error } = await admin.rpc("capacity_pool_committed_peak", { p_pool_id: poolId });
  if (error) {
    logServerError("events.sessionPools/peak", error);
    return null;
  }
  const n = typeof data === "number" ? data : Number(data);
  return Number.isFinite(n) ? n : null;
}

/**
 * Seats per tier for ONE night, with what is already sold.
 *
 * "Sold" is `capacity_pool_committed_peak(pool_id)` — the same function the
 * shrink refusal checks against — never a sum over allocations. A sum would
 * show 10 sold where the engine accepts 6, and the operator would be told
 * they cannot do what the engine then allows.
 *
 * `variants` and `pools` are the caller's tenant-scoped reads; `admin` is the
 * service-role client the peak function requires.
 */
export async function buildSessionPoolRows(
  admin: PeakClient,
  variants: readonly SessionPoolVariant[],
  pools: readonly SessionPoolPool[],
): Promise<SessionPoolRow[]> {
  const poolByKey = new Map(pools.map((p) => [p.pool_key, p]));
  const rows: SessionPoolRow[] = [];
  for (const v of variants) {
    if (typeof v.pool_key !== "string" || !v.pool_key) continue;
    const pool = poolByKey.get(v.pool_key) ?? null;
    const peak = pool ? await readCommittedPeak(admin, pool.id) : null;
    rows.push({
      poolKey: v.pool_key,
      tierLabel: v.label,
      poolId: pool ? pool.id : null,
      unitsTotal: pool ? Number(pool.units_total) : null,
      overbookUnits: pool ? Number(pool.overbook_units) : null,
      isActive: pool ? Boolean(pool.is_active) : null,
      committedPeak: peak,
    });
  }
  return rows;
}
