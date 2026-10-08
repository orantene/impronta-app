/**
 * thread-draft-currency.ts - the currency a conversation's shared draft ORDER
 * opens in. It follows the thread's seller(s) (one agreed default_currency),
 * then the solo owner-talent, then the workspace's own default_currency. It never invents USD: when the
 * workspace default is unreadable the caller must refuse to open the draft.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNewOfferCurrency } from "@/lib/inquiry/offer-currency-seller";

export async function resolveThreadDraftCurrency(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string },
): Promise<string | null> {
  // Same resolver as a new offer (TUL-313): sellers, solo owner-talent,
  // workspace default, else null. The caller refuses; USD is never a guess.
  return resolveNewOfferCurrency(admin, {
    inquiryId: input.inquiryId,
    tenantId: input.tenantId,
    followSeller: true,
  });
}
