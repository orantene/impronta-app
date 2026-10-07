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
 * Fail-closed variant for NEW charges: returns null on a missing client, read
 * error or missing row instead of defaulting to 'us', so a DB failure can never
 * route an MX seller's charge to the US platform.
 */
export async function loadAccountPlatformStrict(
  table: "talent_profiles" | "agencies",
  match: { column: "id" | "slug"; value: string },
  sb: SupabaseClient | null = createServiceRoleClient(),
): Promise<StripeAccountKey | null> {
  if (!sb) return null;
  const { data, error } = await sb
    .from(table)
    .select("stripe_account_platform")
    .eq(match.column, match.value)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { stripe_account_platform?: string }).stripe_account_platform === "mx" ? "mx" : "us";
}
