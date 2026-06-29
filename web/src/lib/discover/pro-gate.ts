/**
 * Phase D — Discover Pro gate (pure decision helper).
 *
 * The single source of truth for "does this Discover inquiry need a Pro
 * subscription?". Kept pure (no I/O) so both the API route and the unit
 * test exercise the exact same branch.
 *
 * Rule (project_discover_unified.md §4.2): multi-talent send is a Pro power
 * tool; single-talent send is free for everyone (Standard tier). Compare is
 * gated the same way in the UI, but the server only enforces the inquiry
 * send — that's the money-adjacent action that actually fans out.
 *
 * `routableTalentCount` is the number of talents that will actually produce
 * an inquiry (after the discoverable / roster fan-out filter). We gate on the
 * routable count, not the raw request length: a request that lists 3 talents
 * but only 1 is routable is effectively a single-talent send and stays free.
 */

import type { ClientSubscription } from "@/lib/discover/client-subscription";
import { canUsePro } from "@/lib/discover/client-subscription";

export type ProGateDecision =
  | { allowed: true }
  | { allowed: false; reason: "pro_required" };

/**
 * Decide whether a Discover inquiry send is permitted for the caller's tier.
 * Single (or zero) routable talent → always allowed. Multi-talent → requires
 * an active Pro/Enterprise subscription.
 */
export function decideProGate(args: {
  routableTalentCount: number;
  subscription: ClientSubscription;
}): ProGateDecision {
  if (args.routableTalentCount <= 1) return { allowed: true };
  if (canUsePro(args.subscription)) return { allowed: true };
  return { allowed: false, reason: "pro_required" };
}
