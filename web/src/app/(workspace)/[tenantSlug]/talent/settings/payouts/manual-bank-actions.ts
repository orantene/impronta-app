"use server";

/**
 * The talent's own masked bank reference for a manual payout account. Holder, bank, last 4 digits.
 * The talent never marks the account verified: the workspace owner does (admin/account).
 */

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { parseBankReference } from "@/lib/payments/payout-account-verification";
import {
  addOwnManualPayoutAccount,
  loadAddablePayoutWorkspaces,
  loadOwnManualPayoutAccounts,
  resolveTenantFromOwnRoster,
  saveOwnBankReference,
  type AddablePayoutWorkspace,
  type OwnManualPayoutAccount,
} from "@/lib/payments/talent-bank-reference";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type LoadManualAccountsResult =
  | { ok: true; accounts: OwnManualPayoutAccount[]; addable: AddablePayoutWorkspace[] }
  | { ok: false };

export async function loadMyManualPayoutAccounts(): Promise<LoadManualAccountsResult> {
  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!session.user || !admin) return { ok: false };
  const [accounts, addable] = await Promise.all([
    loadOwnManualPayoutAccounts(admin, session.user.id),
    loadAddablePayoutWorkspaces(admin, session.user.id),
  ]);
  return { ok: true, accounts, addable };
}

export type AddMyManualPayoutAccountResult = { ok: true } | { ok: false; code: "not_rostered" | "failed" };

/** "Add a manual payout account" for one rostered workspace. Created pending; the owner verifies. */
export async function addMyManualPayoutAccount(input: { tenantId: string }): Promise<AddMyManualPayoutAccountResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "failed" };
  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!session.user || !admin) return { ok: false, code: "failed" };
  // The workspace is resolved server-side from the caller's own roster; input.tenantId is only a request.
  const scope = await resolveTenantFromOwnRoster(admin, { userId: session.user.id, requestedTenantId: input.tenantId });
  if (!scope.ok) return { ok: false, code: scope.reason === "not_rostered" ? "not_rostered" : "failed" };
  const r = await addOwnManualPayoutAccount(admin, { userId: session.user.id, userEmail: session.user.email, tenantId: scope.tenantId });
  if (r.ok) return { ok: true };
  return { ok: false, code: r.reason === "not_rostered" ? "not_rostered" : "failed" };
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
