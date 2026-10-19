/**
 * Guard for the public quote action (#4030 review). The action uses the service role, so it may
 * only quote what a guest can already see and buy: published AND approved AND public (D-10,
 * `isGuestSellableOffering`). on_request, agency_only, draft, pending, rejected: no number at all.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isGuestSellableOffering } from "@/lib/offerings/guest-sellable";
import { logServerError } from "@/lib/server/safe-error";

export const MAX_QUOTE_ADDONS = 20;

/** null = refuse (too many). Otherwise the de-duplicated ids. */
export function sanitizeQuoteAddOnIds(ids: readonly string[] | undefined): string[] | null {
  const list = ids ?? [];
  if (list.length > MAX_QUOTE_ADDONS) return null;
  return [...new Set(list)];
}

export async function offeringIsQuotable(admin: SupabaseClient, offeringId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("talent_offerings")
    .select("status, moderation_state, visibility")
    .eq("id", offeringId)
    .maybeSingle();
  if (error) {
    logServerError("orders.quoteBookingCollect/gate", error);
    return false;
  }
  return isGuestSellableOffering(data as { status?: unknown; moderation_state?: unknown; visibility?: unknown } | null);
}
