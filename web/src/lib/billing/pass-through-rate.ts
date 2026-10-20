/**
 * TUL-1366: the Tulala service fee rate (basis points) a given seller's
 * checkout uses. 1.5% customer-only is the default; Platform Admin sets the %
 * PER PLAN / MEMBERSHIP LEVEL (product_tiers.service_fee_bps, 0-20%), and every
 * checkout reads the fee of the seller's CURRENT plan at quote time and freezes
 * it on the order.
 *
 * Resolution, most specific first, each level IGNORED unless it is a whole
 * number of bps in [0, 2000] (an explicit 0 is a real value, a waived fee):
 *   1. the order's frozen snapshot   (orders.service_fee_by_party[partyId])
 *   2. the seller's current plan     (RPC map plan_service_fee_bps[planKey])
 *   3. platform                      (platform_commission_config.pass_through_take_bps)
 *   4. built in default              (150)
 *
 * The commission engine (frozen booking snapshot) and the checkout collect BOTH
 * call {@link loadSellerPassThroughBps}, so the quote, the charge and the
 * snapshot cannot disagree, and a later fee change never moves a past or open
 * order: once an order carries its snapshot, level 1 wins forever. Any read
 * problem falls to the next level, never to an invented rate.
 */
import { CLIENT_SERVICE_FEE_BPS } from "./fee-config";

export const MAX_SERVICE_FEE_BPS = 2000;

function valid(bps: unknown): bps is number {
  return typeof bps === "number" && Number.isInteger(bps) && bps >= 0 && bps <= MAX_SERVICE_FEE_BPS;
}

export function effectivePassThroughBps(input: {
  frozenBps?: number | null;
  planBps?: number | null;
  platformBps?: number | null;
}): number {
  if (valid(input.frozenBps)) return input.frozenBps;
  if (valid(input.planBps)) return input.planBps;
  if (valid(input.platformBps)) return input.platformBps;
  return CLIENT_SERVICE_FEE_BPS;
}

/** `agencies.plan_tier` spellings -> the runtime workspace plan key. */
export function normalizeWorkspacePlanKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw === "hub" || raw === "hub-network" || raw === "hub_network") return "network";
  return raw;
}

/** Percent (as typed by an admin, e.g. 1.5) -> whole bps, or null when outside 0-20% / not a number. */
export function serviceFeePercentToBps(percent: unknown): number | null {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
  const bps = Math.round(percent * 100);
  return valid(bps) && Math.abs(bps - percent * 100) < 1e-6 ? bps : null;
}

type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PassThroughSeller =
  | { kind: "workspace"; partyId: string; plan?: string | null }
  | { kind: "talent"; partyId: string; plan?: string | null };

/**
 * The effective rate for one seller. Non-fatal: every failed read drops to the
 * next level.
 */
export async function loadSellerPassThroughBps(
  admin: Reader,
  input: {
    platformBps?: number | null;
    /** plan_service_fee_bps from the processing-mode RPC, keyed by runtime plan key. */
    planFeeBps?: Record<string, number> | null;
    /** orders.service_fee_by_party, when the order already carries its snapshot. */
    frozenByParty?: Record<string, number> | null;
    seller: PassThroughSeller;
  },
): Promise<number> {
  const frozen = input.frozenByParty?.[input.seller.partyId] ?? null;
  if (valid(frozen)) return frozen;

  let plan = input.seller.plan ?? null;
  if (!plan) {
    try {
      if (input.seller.kind === "workspace") {
        const { data } = await admin.from("agencies").select("plan_tier").eq("id", input.seller.partyId).maybeSingle();
        plan = (data as { plan_tier?: string | null } | null)?.plan_tier ?? null;
      } else {
        const { data } = await admin
          .from("talent_profiles")
          .select("talent_plan_key")
          .eq("id", input.seller.partyId)
          .maybeSingle();
        plan = (data as { talent_plan_key?: string | null } | null)?.talent_plan_key ?? null;
      }
    } catch {
      plan = null;
    }
  }
  const key = input.seller.kind === "workspace" ? normalizeWorkspacePlanKey(plan) : plan;
  const planBps = key && input.planFeeBps ? (input.planFeeBps[key] ?? null) : null;
  return effectivePassThroughBps({ platformBps: input.platformBps, planBps });
}
