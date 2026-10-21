import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { canMarkVerified } from "@/lib/payments/payout-account-verification";

export type PendingPayoutAccount = {
  id: string;
  ownerType: string;
  displayName: string;
  bankHolder: string | null;
  bankName: string | null;
  bankLast4: string | null;
  canMarkVerified: boolean;
};

/** This workspace's manual accounts waiting for verification. Empty on any failure (the section hides). */
export async function loadPendingPayoutAccounts(tenantId: string): Promise<PendingPayoutAccount[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("payout_accounts")
    .select("id, owner_type, display_name, provider, status, bank_holder_name, bank_name, bank_last4")
    .eq("tenant_id", tenantId)
    .eq("status", "pending_verification")
    .eq("provider", "manual_bank")
    .order("created_at", { ascending: true });
  if (error) {
    logServerError("payout-verification.loadPending", error);
    return [];
  }
  return ((data ?? []) as Array<{
    id: string;
    owner_type: string;
    display_name: string;
    provider: string | null;
    status: string;
    bank_holder_name: string | null;
    bank_name: string | null;
    bank_last4: string | null;
  }>).map((r) => ({
    id: r.id,
    ownerType: r.owner_type,
    displayName: r.display_name,
    bankHolder: r.bank_holder_name,
    bankName: r.bank_name,
    bankLast4: r.bank_last4,
    canMarkVerified: canMarkVerified(r),
  }));
}
