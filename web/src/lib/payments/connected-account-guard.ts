/**
 * TUL-483: stop a sale whose seller's connected account does not exist on the
 * platform key that would take the charge. Three TAL-93900 sales earlier paid
 * fine, then their payout legs failed with "No such destination" because the
 * stored account id belongs to another platform or mode, while the profile
 * still said "enabled / payouts on". Only Stripe can say the account is real.
 *
 * READ ONLY. The Stripe client is injected and only `accounts.retrieve` is
 * called; nothing is created, updated or moved. Fails CLOSED on an unknown
 * error (never charge on a guess) but treats the "no such account" family as a
 * clear, user-safe refusal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const CONNECTED_ACCOUNT_MISSING = "connected_account_missing" as const;
export const CONNECTED_ACCOUNT_UNREADABLE = "connected_account_unreadable" as const;

export type ConnectedAccountCheck =
  | { ok: true; skipped?: "no_account" }
  | { ok: false; code: typeof CONNECTED_ACCOUNT_MISSING | typeof CONNECTED_ACCOUNT_UNREADABLE; message: string };

export type AccountRetriever = (accountId: string) => Promise<{ id: string; payouts_enabled?: boolean | null; charges_enabled?: boolean | null }>;

const MISSING_MESSAGE = "Payments for this seller are not available right now.";

function isNoSuchAccount(err: unknown): boolean {
  const e = err as { code?: unknown; statusCode?: unknown; message?: unknown } | null;
  const message = typeof e?.message === "string" ? e.message : "";
  return e?.code === "resource_missing" || /no such (destination|account)/i.test(message) || e?.statusCode === 404;
}

export async function checkConnectedAccountExists(
  retrieve: AccountRetriever | null,
  accountId: string | null | undefined,
): Promise<ConnectedAccountCheck> {
  const id = (accountId ?? "").trim();
  // A seller with no connected account is the existing "no receiver" path, not this guard's call.
  if (!id) return { ok: true, skipped: "no_account" };
  if (!retrieve) return { ok: false, code: CONNECTED_ACCOUNT_UNREADABLE, message: MISSING_MESSAGE };
  try {
    const acct = await retrieve(id);
    if (!acct || acct.id !== id) return { ok: false, code: CONNECTED_ACCOUNT_MISSING, message: MISSING_MESSAGE };
    return { ok: true };
  } catch (err) {
    if (isNoSuchAccount(err)) return { ok: false, code: CONNECTED_ACCOUNT_MISSING, message: MISSING_MESSAGE };
    return { ok: false, code: CONNECTED_ACCOUNT_UNREADABLE, message: MISSING_MESSAGE };
  }
}

/**
 * The checkout-side call: the transaction's payout receiver's connected account
 * must exist on the platform taking the charge. No receiver is the existing
 * no-receiver lane and passes. A DB read error fails closed.
 */
export async function checkTransactionConnectedAccount(
  sb: SupabaseClient | null,
  retrieve: AccountRetriever | null,
  transactionId: string,
): Promise<ConnectedAccountCheck> {
  if (!sb) return { ok: false, code: CONNECTED_ACCOUNT_UNREADABLE, message: MISSING_MESSAGE };
  const { data: txn, error } = await sb.from("booking_transactions").select("payout_receiver_id").eq("id", transactionId).maybeSingle();
  if (error) return { ok: false, code: CONNECTED_ACCOUNT_UNREADABLE, message: MISSING_MESSAGE };
  const receiverId = (txn as { payout_receiver_id?: string | null } | null)?.payout_receiver_id;
  if (!receiverId) return { ok: true, skipped: "no_account" };
  const { data: pa, error: paErr } = await sb.from("payout_accounts").select("provider_account_id").eq("id", receiverId).maybeSingle();
  if (paErr) return { ok: false, code: CONNECTED_ACCOUNT_UNREADABLE, message: MISSING_MESSAGE };
  return checkConnectedAccountExists(retrieve, (pa as { provider_account_id?: string | null } | null)?.provider_account_id);
}
