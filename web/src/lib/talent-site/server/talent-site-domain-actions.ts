"use server";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { logServerError } from "@/lib/server/safe-error";
import {
  assertTalentCanConnectCustomDomain,
  requireTalentSelf,
} from "@/lib/server/talent-self-guard";
import { loadTalentSubscriptionState } from "@/lib/stripe/talent-billing";

import { loadTalentSiteDomains } from "./talent-site-domain-core";
import {
  runCheckTalentSiteDomainProvisioning,
  runConnectTalentSiteDomain,
  runRemoveTalentSiteDomain,
  runSetPrimaryTalentSiteDomain,
  runVerifyTalentSiteDomain,
  toTalentSiteDomainView,
  type TalentDomainMutationCtx,
  type TalentSiteDomainActionResult,
  type TalentSiteDomainView,
} from "./talent-site-domain-mutations";

/**
 * Talent Max-site custom domains — SERVER ACTIONS ("use server", async-only).
 *
 * Auth + plan gates live here; DB/Vercel mutation bodies live in
 * `talent-site-domain-mutations.ts` so unit tests can drive them with mocks.
 */

export type { TalentSiteDomainActionResult, TalentSiteDomainView };

async function guardTalentDomainContext(): Promise<
  | { ok: true; ctx: TalentDomainMutationCtx }
  | { ok: false; error: string }
> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return {
      ok: false,
      error:
        scope.code === "not_authenticated"
          ? "You must be signed in to manage your site domain."
          : "We could not find your talent profile.",
    };
  }
  if (!assertTalentCanConnectCustomDomain(scope.planKey)) {
    return {
      ok: false,
      error:
        "Connecting a custom domain needs Web Office. Upgrade to Web Office to use your own domain.",
    };
  }
  const subscription = await loadTalentSubscriptionState(
    scope.talentProfile.id,
    scope.session.supabase,
  );
  if (subscription?.status === "trialing") {
    return {
      ok: false,
      error: "Custom domains unlock after the Web Office trial ends.",
    };
  }
  return {
    ok: true,
    ctx: { supabase: scope.session.supabase, talentProfileId: scope.talentProfile.id },
  };
}

async function listDomains(ctx: TalentDomainMutationCtx): Promise<TalentSiteDomainView[]> {
  try {
    const rows = await loadTalentSiteDomains(ctx.supabase, ctx.talentProfileId);
    return rows.map(toTalentSiteDomainView);
  } catch (error) {
    logServerError("talentSiteDomain.list", error);
    return [];
  }
}

/** Read-only load of the talent's domains for initial panel render. */
export async function loadTalentSiteDomainsForPanel(): Promise<TalentSiteDomainActionResult> {
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error, domains: [] };
  const domains = await listDomains(guard.ctx);
  return { ok: true, message: "", domains };
}

export async function connectTalentSiteDomainAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  return runConnectTalentSiteDomain(guard.ctx, rawHostname);
}

export async function verifyTalentSiteDomainAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  return runVerifyTalentSiteDomain(guard.ctx, rawHostname);
}

export async function checkTalentSiteDomainProvisioningAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  return runCheckTalentSiteDomainProvisioning(guard.ctx, rawHostname);
}

export async function setPrimaryTalentSiteDomainAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  return runSetPrimaryTalentSiteDomain(guard.ctx, rawHostname);
}

export async function removeTalentSiteDomainAction(
  rawHostname: string,
): Promise<TalentSiteDomainActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const guard = await guardTalentDomainContext();
  if (!guard.ok) return { ok: false, error: guard.error };
  return runRemoveTalentSiteDomain(guard.ctx, rawHostname);
}
