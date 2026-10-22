"use server";

/**
 * admin-tier-service-fee.ts (TUL-1366): Platform Admin sets the Tulala service
 * fee % per plan / membership level, next to where plan prices are edited
 * (Commerce > Catalog > tier drawer).
 *
 *   - platform admin only (no workspace or talent path); the table has RLS and
 *     no policy, and only this service-role action writes it;
 *   - validated server-side to 0-20% (whole hundredths of a percent);
 *   - only workspace and talent plans carry a fee, never the client ladder;
 *   - every change is audited (who, when, before, after);
 *   - the new value affects checkouts quoted from now on. Orders already priced
 *     carry their frozen fee (orders.service_fee_by_party) and never move.
 */

import { z } from "zod";
import { revalidateCommerceSurfaces } from "@/lib/pricing/revalidate-commerce";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { recordCommerceAudit, COMMERCE_AUDIT } from "@/lib/billing/commerce-audit";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { serviceFeePercentToBps } from "@/lib/billing/pass-through-rate";
import { readTierForFee, readTierServiceFees, writeTierServiceFee } from "@/lib/billing/tier-service-fee";

type Gate = { ok: true; userId: string } | { ok: false; error: string };

async function requirePlatformAdmin(): Promise<Gate> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) return { ok: false, error: "Platform admin access required." };
  return { ok: true, userId: session.user.id };
}

const inputSchema = z.object({ tierId: pgUuidSchema(), feePercent: z.number() }).strict();

export type UpdateTierServiceFeeResult = { ok: true; feeBps: number } | { ok: false; error: string };

export async function updateTierServiceFee(raw: { tierId: string; feePercent: number }): Promise<UpdateTierServiceFeeResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate;

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const feeBps = serviceFeePercentToBps(parsed.data.feePercent);
  if (feeBps === null) {
    return { ok: false, error: "The service fee must be between 0% and 20% (up to two decimals)." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-tier-service-fee.service-role", null);
    return { ok: false, error: "Could not save. Try again." };
  }
  const tier = await readTierForFee(admin, parsed.data.tierId);
  if (!tier) return { ok: false, error: "Plan not found, or the service fee setting is not available yet." };
  if (tier.family !== "workspace" && tier.family !== "talent") {
    return { ok: false, error: "Only workspace and talent plans carry a service fee." };
  }
  if (!(await writeTierServiceFee(admin, tier.id, feeBps))) {
    logServerError("admin-tier-service-fee.write", null);
    return { ok: false, error: "Could not save. Try again." };
  }

  await recordCommerceAudit({
    action: COMMERCE_AUDIT.TIER_SERVICE_FEE_UPDATED,
    actorId: gate.userId,
    targetType: "product_tiers",
    targetId: tier.id,
    // Changes what customers are charged on every future checkout.
    severity: "warn",
    before: { service_fee_bps: tier.serviceFeeBps },
    after: { service_fee_bps: feeBps },
    context: { tier_slug: tier.slug, family: tier.family },
  });
  revalidateCommerceSurfaces();
  return { ok: true, feeBps };
}

/** Read-only: { tierId: bps } for the tier drawers. Platform admin only. */
export async function loadTierServiceFees(): Promise<Record<string, number>> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return {};
  const admin = createServiceRoleClient();
  return admin ? readTierServiceFees(admin) : {};
}
