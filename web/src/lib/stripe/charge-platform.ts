import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadAccountPlatform } from "./account-platform";
import { decideLegPlatform, normalizeStripePlatform, type LegPlatformDecision, type StripeAccountKey } from "./account-routing";

/** Release/retry guard for a held leg: its booking's charge platform vs the recipient's account platform. */
export async function decideReleasePlatform(
  row: { booking_id: string; party: "talent" | "workspace" | "channel_referral"; talent_profile_id: string | null; tenant_id: string | null },
  sb: SupabaseClient | null,
): Promise<LegPlatformDecision> {
  return decideLegPlatform({
    chargePlatform: await loadChargePlatformForBooking(row.booking_id, sb),
    recipientPlatform: await loadRecipientPlatform(row.party, row.party === "talent" ? row.talent_profile_id : row.tenant_id),
    rail: "connect_transfer",
  });
}

/**
 * Which Stripe platform TOOK THE CHARGE for a booking transaction
 * (`booking_transactions.stripe_platform`). Tolerant: any read error, missing
 * row or a not-yet-applied column yields 'us' (the behaviour before MX).
 */
export async function loadChargePlatformForTransaction(
  transactionId: string,
  sb: SupabaseClient | null = createServiceRoleClient(),
): Promise<StripeAccountKey> {
  if (!sb) return "us";
  try {
    const { data, error } = await sb
      .from("booking_transactions")
      .select("stripe_platform")
      .eq("id", transactionId)
      .maybeSingle();
    if (error || !data) return "us";
    return normalizeStripePlatform((data as { stripe_platform?: unknown }).stripe_platform);
  } catch {
    return "us";
  }
}

/** Charge platform for a booking: 'mx' if any of its transactions was charged on MX. */
export async function loadChargePlatformForBooking(
  bookingId: string,
  sb: SupabaseClient | null = createServiceRoleClient(),
): Promise<StripeAccountKey> {
  if (!sb) return "us";
  try {
    const { data, error } = await sb
      .from("booking_transactions")
      .select("stripe_platform")
      .eq("booking_id", bookingId);
    if (error || !Array.isArray(data)) return "us";
    return (data as Array<{ stripe_platform?: unknown }>).some((r) => r.stripe_platform === "mx") ? "mx" : "us";
  } catch {
    return "us";
  }
}

/**
 * The platform a NEW charge for this transaction must be created on: the seller
 * of record's connected-account platform (payout receiver -> talent/agency,
 * falling back to the source workspace). Default 'us'.
 */
export async function resolveSellerPlatformForTransaction(
  transactionId: string,
  sb: SupabaseClient | null = createServiceRoleClient(),
): Promise<StripeAccountKey> {
  try {
    return await resolveSellerPlatformUnsafe(transactionId, sb);
  } catch {
    return "us";
  }
}

async function resolveSellerPlatformUnsafe(
  transactionId: string,
  sb: SupabaseClient | null,
): Promise<StripeAccountKey> {
  if (!sb) return "us";
  const { data: txn, error } = await sb
    .from("booking_transactions")
    .select("source_tenant_id, payout_receiver_id")
    .eq("id", transactionId)
    .maybeSingle();
  if (error || !txn) return "us";
  const t = txn as { source_tenant_id?: string | null; payout_receiver_id?: string | null };
  if (t.payout_receiver_id) {
    const { data: pa } = await sb
      .from("payout_accounts")
      .select("owner_type, owner_id")
      .eq("id", t.payout_receiver_id)
      .maybeSingle();
    const p = pa as { owner_type?: string; owner_id?: string } | null;
    if (p?.owner_id && p.owner_type === "talent") {
      return loadAccountPlatform("talent_profiles", { column: "id", value: p.owner_id });
    }
    if (p?.owner_id && p.owner_type === "agency") {
      return loadAccountPlatform("agencies", { column: "id", value: p.owner_id });
    }
  }
  if (t.source_tenant_id) return loadAccountPlatform("agencies", { column: "id", value: t.source_tenant_id });
  return "us";
}

/**
 * Persist that a charge was taken on Stripe Mexico. Written ONLY for 'mx' so the
 * US path never touches a column whose migration may not be applied. Returns
 * false on failure: callers must then refuse the MX charge (fail closed).
 */
export async function recordChargePlatform(
  transactionId: string,
  key: StripeAccountKey,
  sb: SupabaseClient | null = createServiceRoleClient(),
): Promise<boolean> {
  if (key !== "mx") return true;
  if (!sb) return false;
  const { error } = await sb.from("booking_transactions").update({ stripe_platform: "mx" }).eq("id", transactionId);
  return !error;
}

export async function loadRecipientPlatform(
  party: "talent" | "workspace" | "channel_referral",
  id: string | null,
): Promise<StripeAccountKey> {
  if (!id) return "us";
  return party === "talent"
    ? loadAccountPlatform("talent_profiles", { column: "id", value: id })
    : loadAccountPlatform("agencies", { column: "id", value: id });
}
