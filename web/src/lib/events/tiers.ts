/**
 * tiers.ts — a ticket tier, and the two things about it that are easy to get
 * silently wrong.
 *
 * Pure: no Supabase import, so it gates in CI.
 *
 * 1. THE POOL KEY MUST SURVIVE A RENAME. The pool for a tier is found by
 *    `(session_tier, session.id, pool_key)`. Derive that key from the label and
 *    the first rename orphans every future session's pool and detaches the
 *    seats already sold. `poolKeyFor` is therefore used ONCE, at creation, and
 *    `tierPoolRequests` cannot see a label at all.
 *
 * 2. A TIER REQUEST MUST CARRY THE SESSION WINDOW. That rule belongs to
 *    Sessions' `tierReserveRequest`, and this module calls it rather than
 *    rebuilding it, so an unwindowed allocation cannot be constructed here
 *    either. Re-implementing the arithmetic would be a second place for the
 *    rule to be forgotten.
 */

import type { ReserveRequest } from "@/lib/capacity";
import { tierReserveRequest, type SessionWindow } from "@/lib/sessions/tier-pools";

export type SeatingMode = "standing" | "space_group";

/** The tier fields this module needs. A row of `talent_offering_variants`. */
export type Tier = {
  id: string;
  label: string;
  poolKey: string;
  amountCents: number;
  salesFrom?: string | null;
  salesUntil?: string | null;
  minPerOrder: number;
  maxPerOrder?: number | null;
  isHidden: boolean;
  seatingMode?: SeatingMode | null;
};

/**
 * The key a NEW tier gets. Called once, at creation, and never again.
 *
 * Returns null rather than a fallback when the label yields nothing usable, so
 * the caller has to ask a human for a key instead of silently minting `tier`
 * and colliding with the next unnameable tier on the same offering.
 */
export function poolKeyFor(label: string): string | null {
  const key = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  return key.length > 0 ? key : null;
}

export type SaleState =
  | { onSale: true }
  | { onSale: false; reason: "scheduled"; opensAt: string }
  | { onSale: false; reason: "ended" }
  | { onSale: false; reason: "hidden" };

/**
 * Whether a tier's sales WINDOW is open, ignoring whether it is listed.
 *
 * `hidden` is deliberately not checked here. A guest-list tier is permanently
 * unlisted and perfectly buyable through its link, so the link path asks this
 * and the public page asks `saleState`. Collapsing the two would make comps
 * unsellable — the tier would be hidden, therefore "not on sale", therefore
 * refused at the one moment it is meant to work.
 */
export function saleWindowState(tier: Tier, now: string | Date): SaleState {
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(t)) return { onSale: false, reason: "ended" };

  if (tier.salesFrom) {
    const from = Date.parse(tier.salesFrom);
    if (Number.isFinite(from) && t < from) {
      return { onSale: false, reason: "scheduled", opensAt: tier.salesFrom };
    }
  }
  if (tier.salesUntil) {
    const until = Date.parse(tier.salesUntil);
    if (Number.isFinite(until) && t >= until) return { onSale: false, reason: "ended" };
  }
  return { onSale: true };
}

/** The public page's question: on sale AND listed. */
export function saleState(tier: Tier, now: string | Date): SaleState {
  if (tier.isHidden) return { onSale: false, reason: "hidden" };
  return saleWindowState(tier, now);
}

export type QuantityCheck =
  | { ok: true; units: number }
  | { ok: false; reason: "below_min"; min: number }
  | { ok: false; reason: "above_max"; max: number }
  | { ok: false; reason: "not_a_count" };

/**
 * How many of this tier one order may take.
 *
 * Refuses rather than clamping. Clamping to the maximum silently sells someone
 * four tickets when they asked for eight and were told nothing, which is a
 * support conversation at best and a chargeback at worst.
 */
export function checkQuantity(tier: Tier, requested: number): QuantityCheck {
  if (!Number.isInteger(requested) || requested <= 0) {
    return { ok: false, reason: "not_a_count" };
  }
  if (requested < tier.minPerOrder) {
    return { ok: false, reason: "below_min", min: tier.minPerOrder };
  }
  if (tier.maxPerOrder != null && requested > tier.maxPerOrder) {
    return { ok: false, reason: "above_max", max: tier.maxPerOrder };
  }
  return { ok: true, units: requested };
}

/** One leg of a cart: a tier, a quantity, and the order line it belongs to. */
export type TierLeg = {
  tier: Tier;
  units: number;
  orderLineId?: string | null;
};

/**
 * Reserve requests for a multi-tier purchase against ONE session.
 *
 * `poolIdForKey` is supplied by the caller because resolving a key to a pool id
 * is a database read and this module is pure. Passing the map in also means a
 * key with no pool shows up HERE, as a refusal, rather than becoming an
 * `undefined` poolId that fails somewhere less obvious.
 *
 * Returns null if ANY leg is unresolvable, so a partial batch cannot be built:
 * a cart that reserves the GA seats and silently drops the VIP table is worse
 * than one that refuses outright.
 */
export function tierPoolRequests(
  session: SessionWindow,
  legs: readonly TierLeg[],
  poolIdForKey: ReadonlyMap<string, string>,
): ReserveRequest[] | null {
  if (legs.length === 0) return null;
  const out: ReserveRequest[] = [];
  for (const leg of legs) {
    const poolId = poolIdForKey.get(leg.tier.poolKey);
    if (!poolId) return null;
    // Sessions' builder, not a local copy: it is what refuses to construct a
    // request without the session's window.
    const req = tierReserveRequest(session, poolId, leg.units, leg.orderLineId ?? null);
    if (!req) return null;
    out.push(req);
  }
  return out;
}

export type NewTierInput = {
  label: string;
  amountCents: number;
  admitsPerUnit?: number;
  maxPerOrder?: number | null;
  isHidden?: boolean;
};

export type NewTierRefusal =
  | { ok: false; reason: "bad_label" }
  | { ok: false; reason: "bad_amount" }
  | { ok: false; reason: "bad_admits" }
  | { ok: false; reason: "bad_max" };

/**
 * The row a new tier becomes. PURE, so the one rule that matters is testable:
 * `pool_key` is derived from the label HERE, ONCE, at creation — and never
 * recomputed on rename. A tier renamed from "GA" to "General admission" keeps
 * its pool and its sold seats (E2). The writer stores this value; nothing
 * downstream re-derives it.
 */
export function newTierRow(
  input: NewTierInput,
): ({ ok: true } & {
  label: string;
  amountCents: number;
  admitsPerUnit: number;
  poolKey: string;
  maxPerOrder: number | null;
  isHidden: boolean;
}) | NewTierRefusal {
  const label = input.label.trim();
  if (label.length < 1 || label.length > 80) return { ok: false, reason: "bad_label" };
  const poolKey = poolKeyFor(label);
  if (!poolKey) return { ok: false, reason: "bad_label" };
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) return { ok: false, reason: "bad_amount" };
  const admits = input.admitsPerUnit ?? 1;
  if (!Number.isInteger(admits) || admits < 1 || admits > 1000) return { ok: false, reason: "bad_admits" };
  const max = input.maxPerOrder ?? null;
  if (max !== null && (!Number.isInteger(max) || max < 1)) return { ok: false, reason: "bad_max" };
  return { ok: true, label, amountCents: input.amountCents, admitsPerUnit: admits, poolKey, maxPerOrder: max, isHidden: Boolean(input.isHidden) };
}

/**
 * Turn Capacity's refusal into the sentence an operator can act on.
 *
 * `upsert_capacity_pool` refuses a shrink below what is already sold with
 * SQLSTATE `CP015`, message `capacity_floor_violated`, and DETAIL = the floor
 * as an integer (#1769). The number is the only thing that tells someone what
 * to type instead, so it is the sentence. The floor is a PEAK across windows,
 * not a sum — the same function Capacity checks against, never re-derived.
 */
export function explainPoolRefusal(
  err: { code?: string | null; details?: string | null; message?: string | null } | null | undefined,
  attempted: number,
): string {
  const code = err?.code ?? "";
  if (code === "CP015") {
    const floor = Number.parseInt(String(err?.details ?? ""), 10);
    return Number.isFinite(floor)
      ? `${attempted} is below the ${floor} already sold for this night. Enter ${floor} or more.`
      : "That is below what is already sold for this night.";
  }
  if (code === "CP004") return "This pool is suspended; it takes no new seats until it is reactivated.";
  return "Could not save the seats for this night.";
}
