/**
 * talent-bank-reference.ts — a talent enters their OWN masked bank reference.
 *
 * Holder, bank name and the last 4 digits only (parseBankReference refuses anything else). The
 * talent never verifies themselves: this never sets a status to connected. Only the workspace owner
 * does that (markPayoutAccountVerified). Everything runs on the service role with the ownership
 * proven in code: the signed-in user must own the talent profile, and the account must be that
 * talent's own manual account (owner_type 'talent', owner_id = their profile).
 *
 * Changing the reference of an account the owner already verified sends it back to pending, so
 * different bank details are never live under an old verification.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import type { BankReference } from "@/lib/payments/payout-account-verification";

export type OwnManualPayoutAccount = {
  id: string;
  workspaceName: string;
  status: "pending_verification" | "connected";
  bankHolder: string | null;
  bankName: string | null;
  bankLast4: string | null;
};

type AccountRow = {
  id: string;
  tenant_id: string;
  status: string;
  provider_account_id: string | null;
  bank_holder_name: string | null;
  bank_name: string | null;
  bank_last4: string | null;
};

const COLUMNS = "id, tenant_id, status, provider_account_id, bank_holder_name, bank_name, bank_last4";

async function ownTalentProfileId(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("talent_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (error) {
    logServerError("talent-bank-reference.profile", error);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

/** The talent's own manual accounts (one per workspace), with the workspace name. Empty on failure. */
export async function loadOwnManualPayoutAccounts(admin: SupabaseClient, userId: string): Promise<OwnManualPayoutAccount[]> {
  const tp = await ownTalentProfileId(admin, userId);
  if (!tp) return [];
  const { data, error } = await admin
    .from("payout_accounts")
    .select(COLUMNS)
    .eq("owner_type", "talent")
    .eq("owner_id", tp)
    .eq("provider", "manual_bank")
    .in("status", ["pending_verification", "connected"]);
  if (error) {
    logServerError("talent-bank-reference.list", error);
    return [];
  }
  const rows = (data ?? []) as AccountRow[];
  if (rows.length === 0) return [];
  const names = await admin.from("agencies").select("id, display_name").in("id", [...new Set(rows.map((r) => r.tenant_id))]);
  const byId = new Map(((names.data ?? []) as { id: string; display_name: string | null }[]).map((a) => [a.id, a.display_name ?? ""]));
  return rows.map((r) => ({
    id: r.id,
    workspaceName: byId.get(r.tenant_id) || "Workspace",
    status: r.status === "connected" ? "connected" : "pending_verification",
    bankHolder: r.bank_holder_name,
    bankName: r.bank_name,
    bankLast4: r.bank_last4,
  }));
}

export type SaveOwnBankReferenceResult =
  | { ok: true; backToPending: boolean }
  | { ok: false; reason: "not_found" | "failed" };

export async function saveOwnBankReference(
  admin: SupabaseClient,
  input: { userId: string; accountId: string; reference: BankReference },
): Promise<SaveOwnBankReferenceResult> {
  const tp = await ownTalentProfileId(admin, input.userId);
  if (!tp) return { ok: false, reason: "not_found" };

  const { data, error } = await admin
    .from("payout_accounts")
    .select(COLUMNS)
    .eq("id", input.accountId)
    .eq("owner_type", "talent")
    .eq("owner_id", tp)
    .eq("provider", "manual_bank")
    .in("status", ["pending_verification", "connected"])
    .maybeSingle();
  if (error) {
    logServerError("talent-bank-reference.read", error);
    return { ok: false, reason: "failed" };
  }
  const row = data as AccountRow | null;
  if (!row) return { ok: false, reason: "not_found" };

  const changed =
    row.bank_holder_name !== input.reference.holder ||
    row.bank_name !== input.reference.bankName ||
    row.bank_last4 !== input.reference.last4;
  // New details under a manual verification are unverified details. A Stripe-linked account has its
  // own verification, so only a manual one goes back.
  const backToPending = changed && row.status === "connected" && !row.provider_account_id;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    bank_holder_name: input.reference.holder,
    bank_name: input.reference.bankName,
    bank_last4: input.reference.last4,
    bank_details_added_at: now,
    updated_at: now,
    ...(backToPending ? { status: "pending_verification", connected_at: null, last_verified_at: null, verified_by_profile_id: null } : {}),
  };
  const { error: upErr } = await admin.from("payout_accounts").update(patch).eq("id", row.id).eq("owner_id", tp);
  if (upErr) {
    logServerError("talent-bank-reference.update", upErr);
    return { ok: false, reason: "failed" };
  }
  return { ok: true, backToPending };
}
