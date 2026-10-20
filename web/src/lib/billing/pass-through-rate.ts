/**
 * TUL-1366: the Tulala service fee rate (basis points) a given seller's
 * checkout uses. 1.5% customer-only is the platform default; the rate is
 * configurable per plan and per workspace so it can grow to 3-5% later.
 *
 * Resolution, most specific first, each level IGNORED unless it is a whole
 * number of bps in [0, 1000] (an explicit 0 is a real override, a waived fee):
 *   1. workspace override  (workspace_commission_overrides.pass_through_take_bps)
 *   2. plan tier           (platform_commission_config.plan_tier_pass_through_bps[plan])
 *   3. platform            (platform_commission_config.pass_through_take_bps)
 *   4. built in default    (150)
 *
 * The commission engine (frozen snapshot) and the checkout collect BOTH call
 * {@link loadSellerPassThroughBps}, so the quote, the charge and the snapshot
 * cannot disagree. Any read problem falls back to the next level, never to an
 * invented rate. An offer or link already sent keeps the fee it was sent with:
 * the snapshot / the Checkout session amount is frozen when it is created.
 */
import { CLIENT_SERVICE_FEE_BPS } from "./fee-config";

export const MAX_PASS_THROUGH_BPS = 1000;

function valid(bps: unknown): bps is number {
  return typeof bps === "number" && Number.isInteger(bps) && bps >= 0 && bps <= MAX_PASS_THROUGH_BPS;
}

export function effectivePassThroughBps(input: {
  platformBps?: number | null;
  planBps?: number | null;
  tenantBps?: number | null;
}): number {
  if (valid(input.tenantBps)) return input.tenantBps;
  if (valid(input.planBps)) return input.planBps;
  if (valid(input.platformBps)) return input.platformBps;
  return CLIENT_SERVICE_FEE_BPS;
}

type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The effective rate for one workspace seller. Talent selling independently
 * has no workspace or plan row, so it gets the platform rate. Non-fatal: every
 * failed read drops to the next level.
 */
export async function loadSellerPassThroughBps(
  admin: Reader,
  input: {
    platformBps?: number | null;
    planTierBps?: Record<string, number> | null;
    tenantId?: string | null;
    plan?: string | null;
  },
): Promise<number> {
  let tenantBps: number | null = null;
  let plan = input.plan ?? null;
  if (input.tenantId) {
    try {
      const { data } = await admin
        .from("workspace_commission_overrides")
        .select("pass_through_take_bps")
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      const v = (data as { pass_through_take_bps?: unknown } | null)?.pass_through_take_bps;
      tenantBps = typeof v === "number" ? v : null;
    } catch {
      tenantBps = null;
    }
    if (!plan) {
      try {
        const { data } = await admin.from("agencies").select("plan_tier").eq("id", input.tenantId).maybeSingle();
        plan = (data as { plan_tier?: string | null } | null)?.plan_tier ?? null;
      } catch {
        plan = null;
      }
    }
  }
  const planBps = plan && input.planTierBps ? (input.planTierBps[plan] ?? null) : null;
  return effectivePassThroughBps({ platformBps: input.platformBps, planBps, tenantBps });
}
