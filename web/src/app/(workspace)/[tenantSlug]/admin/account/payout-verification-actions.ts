"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { userHasCapability } from "@/lib/access";
import { auditEvent } from "@/lib/audit/emit";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import {
  markPayoutAccountVerified,
  parseBankReference,
  saveBankReference,
} from "@/lib/payments/payout-account-verification";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Pending payout accounts: save a masked bank reference, then mark the account verified.
 *
 * OWNER ONLY. `agency.payout_account.manage` sits in OWNER_CAPS (payouts belong to the owner in the
 * role scope); `manage_billing` is deliberately NOT accepted here. The workspace comes from the slug
 * through the caller's own membership scope, never from the form, and every write re-checks that
 * the account belongs to that workspace.
 */

function back(tenantSlug: string, params: URLSearchParams): never {
  redirect(`/${tenantSlug}/admin/account?${params.toString()}#pending-payouts`);
}

async function ownerContext(formData: FormData) {
  const t = createTranslator(await getRequestLocale());
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const accountId = String(formData.get("accountId") ?? "");

  const session = await getCachedActorSession();
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!session.user || !scope) back(tenantSlug, new URLSearchParams({ perr: t("admin.account.payoutVerifyNotFound") }));
  if (!(await userHasCapability("agency.payout_account.manage", scope.tenantId))) {
    back(tenantSlug, new URLSearchParams({ perr: t("admin.account.payoutVerifyForbidden") }));
  }
  const admin = createServiceRoleClient();
  if (!admin) back(tenantSlug, new URLSearchParams({ perr: t("admin.account.payoutVerifyFailed") }));
  return { t, tenantSlug, accountId, userId: session.user.id, tenantId: scope.tenantId, admin };
}

export async function savePayoutBankReferenceAction(formData: FormData): Promise<never> {
  await requireNotImpersonating();
  const { t, tenantSlug, accountId, tenantId, userId, admin } = await ownerContext(formData);

  const parsed = parseBankReference({
    holder: formData.get("holder"),
    bankName: formData.get("bankName"),
    last4: formData.get("last4"),
  });
  if (!parsed.ok) {
    const key = parsed.reason === "holder" ? "payoutVerifyBadHolder" : parsed.reason === "bank" ? "payoutVerifyBadBank" : "payoutVerifyBadLast4";
    back(tenantSlug, new URLSearchParams({ perr: t(`admin.account.${key}`) }));
  }

  const result = await saveBankReference(admin, { tenantId, accountId, reference: parsed.value });
  if (!result.ok) {
    const key = result.reason === "not_found" || result.reason === "not_manual" ? "payoutVerifyNotFound" : "payoutVerifyFailed";
    back(tenantSlug, new URLSearchParams({ perr: t(`admin.account.${key}`) }));
  }

  auditEvent(tenantId, "billing", "billing.payout_account.bank_reference_saved", "Saved a bank reference on a payout account", {
    targetType: "payout_account",
    targetId: accountId,
    actorUserId: userId,
    metadata: { bankName: parsed.value.bankName, last4: parsed.value.last4 },
  });
  revalidatePath(`/${tenantSlug}/admin/account`);
  back(tenantSlug, new URLSearchParams({ pmsg: t("admin.account.payoutVerifySaved") }));
}

export async function markPayoutAccountVerifiedAction(formData: FormData): Promise<never> {
  await requireNotImpersonating();
  const { t, tenantSlug, accountId, tenantId, userId, admin } = await ownerContext(formData);

  const result = await markPayoutAccountVerified(admin, { tenantId, accountId, actorProfileId: userId });
  if (!result.ok) {
    const key =
      result.reason === "not_found" || result.reason === "not_manual"
        ? "payoutVerifyNotFound"
        : result.reason === "not_pending"
          ? "payoutVerifyNotPending"
          : result.reason === "no_bank_details"
            ? "payoutVerifyNoBank"
            : "payoutVerifyFailed";
    back(tenantSlug, new URLSearchParams({ perr: t(`admin.account.${key}`) }));
  }

  auditEvent(tenantId, "billing", "billing.payout_account.verified", "Marked a payout account verified", {
    targetType: "payout_account",
    targetId: accountId,
    actorUserId: userId,
    metadata: { ownerType: result.ownerType, ownerId: result.ownerId, method: "manual_owner" },
  });
  revalidatePath(`/${tenantSlug}/admin/account`);
  back(tenantSlug, new URLSearchParams({ pmsg: t("admin.account.payoutVerifyDone") }));
}
