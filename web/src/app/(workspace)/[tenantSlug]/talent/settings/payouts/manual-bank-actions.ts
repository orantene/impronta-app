"use server";

/**
 * The talent's own masked bank reference for a manual payout account. Holder, bank, last 4 digits.
 * The talent never marks the account verified: the workspace owner does (admin/account).
 */

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { parseBankReference } from "@/lib/payments/payout-account-verification";
import {
  loadOwnManualPayoutAccounts,
  saveOwnBankReference,
  type OwnManualPayoutAccount,
} from "@/lib/payments/talent-bank-reference";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type LoadManualAccountsResult = { ok: true; accounts: OwnManualPayoutAccount[] } | { ok: false };

export async function loadMyManualPayoutAccounts(): Promise<LoadManualAccountsResult> {
  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!session.user || !admin) return { ok: false };
  return { ok: true, accounts: await loadOwnManualPayoutAccounts(admin, session.user.id) };
}

export type SaveMyBankReferenceResult =
  | { ok: true; backToPending: boolean }
  | { ok: false; code: "holder" | "bank" | "last4" | "not_found" | "failed" };

export async function saveMyBankReference(input: {
  accountId: string;
  holder: string;
  bankName: string;
  last4: string;
}): Promise<SaveMyBankReferenceResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "failed" };
  const parsed = parseBankReference({ holder: input.holder, bankName: input.bankName, last4: input.last4 });
  if (!parsed.ok) return { ok: false, code: parsed.reason };

  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!session.user || !admin) return { ok: false, code: "failed" };

  const result = await saveOwnBankReference(admin, { userId: session.user.id, accountId: input.accountId, reference: parsed.value });
  return result.ok ? { ok: true, backToPending: result.backToPending } : { ok: false, code: result.reason };
}
