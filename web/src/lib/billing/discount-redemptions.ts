import "server-only";

/**
 * discount-redemptions.ts — who actually used a code.
 *
 * The `0/30` on a discount row was a dead end: it proved a code had been used
 * but not by whom, so "did the launch cohort actually redeem?" meant opening
 * Stripe and matching subscription ids by hand.
 *
 * The ledger records the SUBJECT (a workspace or a talent profile), the person,
 * the Stripe subscription, and when.
 *
 * `user_id` was dead until 20261213010000 — the RPC had no parameter for it, so
 * every row stored a null and this loader could only guess. Rows written before
 * that migration still carry no person, which is why `redeemedByName` is
 * nullable and rendered as absent rather than as an error.
 *
 * Email is still RESOLVED rather than recorded, from
 * `stripe_customers.billing_email` — the address Stripe actually bills, and so
 * the right one to show. That table is keyed by tenant and has no talent
 * equivalent, so talent redemptions resolve to null rather than borrowing an
 * unrelated address. Callers must be able to tell a stored fact from a derived
 * one.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type DiscountRedemptionRow = {
  id: string;
  redeemedAt: string;
  subjectType: "workspace" | "talent";
  /** Workspace name / talent display name, or null if the subject is gone. */
  subjectLabel: string | null;
  /** Owner email. DERIVED from the subject, never recorded at redemption. */
  email: string | null;
  /** The person who redeemed. Null for rows written before 20261213010000. */
  redeemedByName: string | null;
  stripeSubscriptionId: string | null;
};

/** Newest first. Capped: this is a drawer, not an export. */
const MAX_ROWS = 200;

export async function loadDiscountRedemptions(
  discountId: string,
): Promise<DiscountRedemptionRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("discount_redemptions")
    .select(
      "id, redeemed_at, subject_type, tenant_id, talent_profile_id, stripe_subscription_id, user_id",
    )
    .eq("discount_id", discountId)
    .order("redeemed_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error || !data) {
    if (error) logServerError("discount-redemptions.load", error);
    return [];
  }

  const rows = data as {
    id: string;
    redeemed_at: string;
    subject_type: string;
    tenant_id: string | null;
    talent_profile_id: string | null;
    stripe_subscription_id: string | null;
    user_id: string | null;
  }[];

  // Two batched lookups rather than one per row: a 200-row drawer would
  // otherwise be 200 round trips for labels nobody paged through.
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))] as string[];
  const talentIds = [...new Set(rows.map((r) => r.talent_profile_id).filter(Boolean))] as string[];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];

  const [agencies, talent, customers, people] = await Promise.all([
    tenantIds.length
      ? sb.from("agencies").select("id, display_name, slug").in("id", tenantIds)
      : Promise.resolve({ data: [], error: null }),
    talentIds.length
      ? sb.from("talent_profiles").select("id, display_name").in("id", talentIds)
      : Promise.resolve({ data: [], error: null }),
    tenantIds.length
      ? sb.from("stripe_customers").select("tenant_id, billing_email").in("tenant_id", tenantIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? sb.from("profiles").select("id, display_name").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const agencyById = new Map(
    ((agencies.data ?? []) as { id: string; display_name: string | null; slug: string | null }[]).map(
      (a) => [a.id, a],
    ),
  );
  const talentById = new Map(
    ((talent.data ?? []) as { id: string; display_name: string | null }[]).map((t) => [t.id, t]),
  );
  const emailByTenant = new Map(
    ((customers.data ?? []) as { tenant_id: string; billing_email: string | null }[]).map((c) => [
      c.tenant_id,
      c.billing_email,
    ]),
  );

  const nameByUser = new Map(
    ((people.data ?? []) as { id: string; display_name: string | null }[]).map((p) => [
      p.id,
      p.display_name,
    ]),
  );

  return rows.map((r) => {
    const isTalent = r.subject_type === "talent";
    const agency = r.tenant_id ? agencyById.get(r.tenant_id) : null;
    const person = r.talent_profile_id ? talentById.get(r.talent_profile_id) : null;
    return {
      id: r.id,
      redeemedAt: r.redeemed_at,
      subjectType: isTalent ? ("talent" as const) : ("workspace" as const),
      subjectLabel: isTalent
        ? (person?.display_name ?? null)
        : (agency?.display_name ?? agency?.slug ?? null),
      // `stripe_customers` is keyed by tenant and has no talent counterpart, so
      // a talent redemption resolves to null. Showing the wrong person's
      // address is worse than showing none.
      email: isTalent ? null : (emailByTenant.get(r.tenant_id ?? "") ?? null),
      redeemedByName: r.user_id ? (nameByUser.get(r.user_id) ?? null) : null,
      stripeSubscriptionId: r.stripe_subscription_id,
    };
  });
}
