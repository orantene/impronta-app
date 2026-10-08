/**
 * thread-draft-currency.ts - the currency a conversation's shared draft ORDER
 * opens in. It follows the thread's seller(s) (one agreed default_currency),
 * else the workspace's own default_currency. It never invents USD: when the
 * workspace default is unreadable the caller must refuse to open the draft.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { loadInquirySellersChecked } from "@/lib/inquiry/offer-currency-seller";
import { normalizeCurrencyCode, resolveOfferCurrency } from "@/lib/inquiry/offer-currency";

export async function resolveThreadDraftCurrency(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string },
): Promise<string | null> {
  const { data, error } = await admin
    .from("agencies")
    .select("default_currency")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("thread-draft-currency.workspace", error);
    return null;
  }
  const workspace = normalizeCurrencyCode((data as { default_currency?: string | null } | null)?.default_currency);
  if (!workspace) return null;
  const read = await loadInquirySellersChecked(admin, input.inquiryId);
  if (!read.ok) return null;
  return resolveOfferCurrency({
    sellerCurrencies: read.sellers.map((s) => s.defaultCurrency),
    platformCurrency: workspace,
  });
}
