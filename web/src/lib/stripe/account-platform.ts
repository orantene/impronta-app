import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { StripeAccountKey } from "./client";

/**
 * Which Stripe platform owns a seller's connected account. Tolerant by design:
 * any read error (including the `stripe_account_platform` column not being
 * applied yet) yields 'us', which is what every pre-existing account is.
 */
export async function loadAccountPlatform(
  table: "talent_profiles" | "agencies",
  match: { column: "id" | "slug"; value: string },
): Promise<StripeAccountKey> {
  const admin = createServiceRoleClient();
  if (!admin) return "us";
  const { data, error } = await admin
    .from(table)
    .select("stripe_account_platform")
    .eq(match.column, match.value)
    .maybeSingle();
  if (error || !data) return "us";
  return (data as { stripe_account_platform?: string }).stripe_account_platform === "mx" ? "mx" : "us";
}

/**
 * Fail-closed variant for NEW charges: returns null on a missing client or a
 * read ERROR (error set or thrown), so a DB failure can never route an MX
 * seller's charge to the US platform. A MISSING ROW (no error, no data) is not
 * a failure: it yields 'us'. No country source is readable for a seller whose
 * row does not exist (payout_accounts has no country column, and the seller
 * row itself is what is missing), so 'us' is the pre-MX default; an existing
 * row carries stripe_account_platform explicitly.
 */
export async function loadAccountPlatformStrict(
  table: "talent_profiles" | "agencies",
  match: { column: "id" | "slug"; value: string },
  sb: SupabaseClient | null = createServiceRoleClient(),
): Promise<StripeAccountKey | null> {
  if (!sb) return null;
  let res;
  try {
    res = await sb.from(table).select("stripe_account_platform").eq(match.column, match.value).maybeSingle();
  } catch {
    return null;
  }
  const { data, error } = res;
  if (error) return null;
  if (!data) return "us";
  return (data as { stripe_account_platform?: string }).stripe_account_platform === "mx" ? "mx" : "us";
}
