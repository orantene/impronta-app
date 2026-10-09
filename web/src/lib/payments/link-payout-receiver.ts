import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { loadInquirySellersChecked } from "@/lib/inquiry/offer-currency-seller";

/**
 * The payout receiver for the money row a payment link opens.
 *
 * Why: `openPaymentLinkCheckout` inserts the `booking_transactions` row on the
 * first tap, and used to leave `payout_receiver_*` empty. The seller-currency
 * guard then reads the lane from the SOURCE TENANT (a solo workspace is on the
 * `us` lane) and refuses an MXN charge for a Mexican talent, so no solo MXN
 * talent could be charged. A talent seller names its own connected account.
 *
 * Rule (PM-approved): EXACTLY ONE active talent seller on the link's inquiry,
 * who owns EXACTLY ONE connected `payout_accounts` row in this tenant, gives
 * that account. Anything else (no inquiry, none or several sellers, no or
 * several connected accounts, any read error) is `null`: the row keeps no
 * receiver and the guard keeps refusing. A receiver is never guessed on a money
 * row. Only the account is read here: the lane and currency come from that
 * account's owner in the guard, never from the tenant default.
 */
export type LinkPayoutReceiver = {
  payoutAccountId: string;
  receiverKind: "talent";
  displayName: string;
};

export async function resolveLinkPayoutReceiver(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string | null },
): Promise<LinkPayoutReceiver | null> {
  if (!input.inquiryId) return null;
  const sellers = await loadInquirySellersChecked(admin, input.inquiryId);
  if (!sellers.ok || sellers.sellers.length !== 1) return null;
  const talentProfileId = sellers.sellers[0].talentProfileId;

  const { data, error } = await admin
    .from("payout_accounts")
    .select("id, display_name")
    .eq("tenant_id", input.tenantId)
    .eq("owner_type", "talent")
    .eq("owner_id", talentProfileId)
    .eq("status", "connected");
  if (error) {
    logServerError("link-payout-receiver.accounts", error);
    return null;
  }
  const rows = (data ?? []) as { id: string; display_name: string | null }[];
  if (rows.length !== 1) return null;
  return {
    payoutAccountId: rows[0].id,
    receiverKind: "talent",
    displayName: (rows[0].display_name ?? "").trim() || "Talent",
  };
}
