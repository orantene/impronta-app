/**
 * payout-account-verification.ts — how a payout account leaves 'pending_verification'.
 *
 * A manually added account (manual_bank) starts pending and is ignored by the payout receiver
 * logic (it reads status = 'connected' only). Two ways out, both here:
 *
 *   1. AUTO: a Stripe Connect account with payouts enabled is linked to the same owner
 *      (talent_profiles / agencies). `syncPayoutAccountFromStripe` is called from the snapshot
 *      persisters, which run for the account.updated webhook, the capability webhook and the
 *      manual refresh.
 *   2. MANUAL: the workspace OWNER marks a manual account verified, which needs a bank reference
 *      on file (holder, bank name, last 4). `markPayoutAccountVerified` re-checks the tenant and
 *      the state in code; the caller's owner check lives in the action.
 *
 * Everything runs on the service role with explicit predicates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export type BankReference = { holder: string; bankName: string; last4: string };

export type BankReferenceCheck = { ok: true; value: BankReference } | { ok: false; reason: "holder" | "bank" | "last4" };

/** Trim, collapse spaces, cap length. A full account number can never fit the last4 slot. */
export function parseBankReference(input: { holder?: unknown; bankName?: unknown; last4?: unknown }): BankReferenceCheck {
  const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const holder = clean(input.holder, 120);
  const bankName = clean(input.bankName, 120);
  const last4 = String(input.last4 ?? "").trim();
  if (holder.length < 2) return { ok: false, reason: "holder" };
  if (bankName.length < 2) return { ok: false, reason: "bank" };
  if (!/^[0-9]{4}$/.test(last4)) return { ok: false, reason: "last4" };
  return { ok: true, value: { holder, bankName, last4 } };
}

export type PayoutAccountRow = {
  id: string;
  tenant_id: string;
  provider: string | null;
  status: string;
  bank_holder_name: string | null;
  bank_name: string | null;
  bank_last4: string | null;
};

/** True when the row can be marked verified by hand: pending, manual, and a full bank reference on file. */
export function canMarkVerified(row: Pick<PayoutAccountRow, "provider" | "status" | "bank_holder_name" | "bank_name" | "bank_last4">): boolean {
  return (
    row.provider === "manual_bank" &&
    row.status === "pending_verification" &&
    Boolean(row.bank_holder_name?.trim()) &&
    Boolean(row.bank_name?.trim()) &&
    /^[0-9]{4}$/.test(row.bank_last4 ?? "")
  );
}

const ROW_COLUMNS = "id, tenant_id, provider, status, bank_holder_name, bank_name, bank_last4";

// ── 1. Auto: Stripe Connect ──────────────────────────────────────────────────

export type StripePayoutSync = { promoted: number };

/**
 * Record the Stripe Connect account on the owner's payout account(s), and promote a PENDING one to
 * connected only when payouts are enabled. A just-created, not-yet-onboarded Stripe account links
 * (provider_account_id) but stays pending. Never demotes a connected account. Best effort for the
 * callers: they wrap it so a failure never fails a webhook or a refresh.
 */
export async function syncPayoutAccountFromStripe(
  admin: SupabaseClient,
  input: { ownerType: "talent" | "agency"; ownerId: string; stripeAccountId: string; payoutsEnabled: boolean },
): Promise<StripePayoutSync> {
  const { ownerType, ownerId, stripeAccountId, payoutsEnabled } = input;
  if (!stripeAccountId) return { promoted: 0 };

  let q = admin
    .from("payout_accounts")
    .select("id, status, provider_account_id")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .in("status", ["pending_verification", "connected"]);
  // An agency's own account lives under its own tenant.
  if (ownerType === "agency") q = q.eq("tenant_id", ownerId);
  const { data, error } = await q;
  if (error) {
    logServerError("payout-verification.stripeSync.read", error);
    return { promoted: 0 };
  }

  let promoted = 0;
  const now = new Date().toISOString();
  for (const row of (data ?? []) as { id: string; status: string; provider_account_id: string | null }[]) {
    const promote = payoutsEnabled && row.status === "pending_verification";
    if (!promote && row.provider_account_id === stripeAccountId) continue;
    const patch: Record<string, unknown> = { provider_account_id: stripeAccountId, updated_at: now };
    if (promote) {
      patch.status = "connected";
      patch.connected_at = now;
      patch.last_verified_at = now;
    }
    const { error: upErr } = await admin.from("payout_accounts").update(patch).eq("id", row.id);
    if (upErr) {
      logServerError("payout-verification.stripeSync.update", upErr);
      continue;
    }
    if (promote) promoted += 1;
  }
  return { promoted };
}

// ── 2. Manual: bank reference and "Mark verified" ───────────────────────────

export type SaveBankReferenceResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_manual" | "invalid" | "failed" };

/** Store the masked bank reference on a manual account of THIS workspace. */
export async function saveBankReference(
  admin: SupabaseClient,
  input: { tenantId: string; accountId: string; reference: BankReference },
): Promise<SaveBankReferenceResult> {
  const { data, error } = await admin
    .from("payout_accounts")
    .select(ROW_COLUMNS)
    .eq("id", input.accountId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("payout-verification.bank.read", error);
    return { ok: false, reason: "failed" };
  }
  const row = data as PayoutAccountRow | null;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.provider !== "manual_bank") return { ok: false, reason: "not_manual" };

  const { error: upErr } = await admin
    .from("payout_accounts")
    .update({
      bank_holder_name: input.reference.holder,
      bank_name: input.reference.bankName,
      bank_last4: input.reference.last4,
      bank_details_added_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.accountId)
    .eq("tenant_id", input.tenantId);
  if (upErr) {
    logServerError("payout-verification.bank.update", upErr);
    return { ok: false, reason: "failed" };
  }
  return { ok: true };
}

export type MarkVerifiedResult =
  | { ok: true; ownerType: string; ownerId: string }
  | { ok: false; reason: "not_found" | "not_pending" | "not_manual" | "no_bank_details" | "failed" };

/**
 * Promote a pending manual account to connected. The tenant is part of every predicate (the account
 * must belong to the owner's workspace), the state is re-read, and the bank reference must be on
 * file. The compare-and-set on status makes a double click a no-op.
 */
export async function markPayoutAccountVerified(
  admin: SupabaseClient,
  input: { tenantId: string; accountId: string; actorProfileId: string },
): Promise<MarkVerifiedResult> {
  const { data, error } = await admin
    .from("payout_accounts")
    .select(`${ROW_COLUMNS}, owner_type, owner_id`)
    .eq("id", input.accountId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("payout-verification.mark.read", error);
    return { ok: false, reason: "failed" };
  }
  const row = data as (PayoutAccountRow & { owner_type: string; owner_id: string }) | null;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.provider !== "manual_bank") return { ok: false, reason: "not_manual" };
  if (row.status !== "pending_verification") return { ok: false, reason: "not_pending" };
  if (!canMarkVerified(row)) return { ok: false, reason: "no_bank_details" };

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await admin
    .from("payout_accounts")
    .update({
      status: "connected",
      connected_at: now,
      last_verified_at: now,
      verified_by_profile_id: input.actorProfileId,
      updated_at: now,
    })
    .eq("id", input.accountId)
    .eq("tenant_id", input.tenantId)
    .eq("status", "pending_verification")
    .select("id");
  if (upErr) {
    logServerError("payout-verification.mark.update", upErr);
    return { ok: false, reason: "failed" };
  }
  if (!updated || updated.length === 0) return { ok: false, reason: "not_pending" };
  return { ok: true, ownerType: row.owner_type, ownerId: row.owner_id };
}

// ── 3. Read side: what the owner sees ───────────────────────────────────────

export type PayoutAccountState = "connected" | "pending_verification" | "none";

/** The workspace's own (agency) account state, for the payouts card. Connected wins over pending. */
export function summarizeAgencyAccountState(rows: ReadonlyArray<{ status: string; disconnected_at?: string | null }>): PayoutAccountState {
  const live = rows.filter((r) => !r.disconnected_at);
  if (live.some((r) => r.status === "connected" || r.status === "enabled")) return "connected";
  if (live.some((r) => r.status === "pending_verification")) return "pending_verification";
  return "none";
}
