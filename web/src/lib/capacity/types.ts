/**
 * types.ts — the capacity engine's shapes (Sell the Room 0.2).
 *
 * A pool is "N units of a subject". An allocation is "k units of that pool over
 * a window, held until expiry or committed by an order line". Money never
 * appears here: a pool knows units, never prices.
 *
 * Pure types only. Nothing in this directory's pure half imports Supabase, so
 * it runs in every test lane (see reference_server_only_import_breaks_test_lanes).
 */

export type CapacitySubjectKind =
  | "offering"
  | "space"
  | "space_group"
  | "session_tier"
  | "person";

export type CapacityAllocationState = "hold" | "committed" | "released";

export type CapacityPool = {
  id: string;
  tenantId: string;
  subjectKind: CapacitySubjectKind;
  subjectId: string;
  poolKey: string;
  parentPoolId: string | null;
  /** Ancestor chain, root-first, including self. Maintained by the database. */
  poolPath: string[];
  unitsTotal: number;
  overbookUnits: number;
  holdTtlSeconds: number;
  unitLabel: string | null;
  isActive: boolean;
};

export type CapacityAllocation = {
  id: string;
  poolId: string;
  /** Copy of the pool's path at insert time. This is what charges ancestors. */
  poolPath: string[];
  orderLineId: string | null;
  /** null on both ends means timeless stock. */
  startsAt: string | null;
  endsAt: string | null;
  units: number;
  state: CapacityAllocationState;
  expiresAt: string | null;
};

/** A window with null on both ends means "timeless", and overlaps everything. */
export type CapacityWindow = {
  startsAt: string | null;
  endsAt: string | null;
};

/**
 * Refusal reasons returned by reserve_capacity / reserve_capacity_batch.
 * These strings are a CONTRACT: Orders, Front Door and Menu branch on them.
 */
export type CapacityRefusalReason =
  | "sold_out"
  | "ancestor_full"
  | "pool_not_found"
  | "pool_inactive"
  | "invalid_units"
  | "invalid_window"
  | "invalid_ttl"
  | "empty_batch";

export type ReserveResult =
  | { ok: true; allocationId: string; expiresAt: string; units: number }
  | { ok: false; reason: CapacityRefusalReason; blockingPoolId: string | null };

export type ReserveBatchResult =
  | { ok: true; allocationIds: string[]; expiresAt: string | null }
  | { ok: false; reason: CapacityRefusalReason; failedPoolId: string | null };

export type CommitResult =
  | { ok: true; committed: number }
  | { ok: false; reason: "expired" | "missing" | "released"; allocationId: string | null };

export type ReleaseResult = { ok: true; released: number; alreadyReleased: number };
