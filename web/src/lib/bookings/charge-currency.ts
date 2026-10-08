/**
 * charge-currency.ts - the currency a NEW booking_transactions row is created
 * in. A charge must be in the priced thing's currency (the booking's), never a
 * silent USD: a MXN booking with an unreadable currency used to draft a USD
 * charge. An explicit caller currency wins; otherwise the booking's own
 * currency_code is read; if neither is a valid code the caller must fail closed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

const CODE_RE = /^[A-Za-z]{3}$/;

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return CODE_RE.test(v) ? v.toUpperCase() : null;
}

export async function resolveTransactionChargeCurrency(
  sb: SupabaseClient,
  bookingId: string,
  explicit: string | null | undefined,
): Promise<string | null> {
  const given = normalize(explicit);
  if (given) return given;
  const { data, error } = await sb
    .from("agency_bookings")
    .select("currency_code")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    logServerError("charge-currency.booking", error);
    return null;
  }
  return normalize((data as { currency_code?: string | null } | null)?.currency_code);
}
