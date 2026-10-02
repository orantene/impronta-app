"use server";

import { redirect } from "next/navigation";

import { createTranslator } from "@/i18n/messages";
import { normalizeNextPath } from "@/lib/auth-flow";
import { isAgeAndTermsConfirmed } from "@/lib/legal/acceptances.core";
import { recordSignupAcceptance } from "@/lib/legal/acceptances";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { hostSafeRedirectDestination } from "@/lib/saas/host-safe-destination";

export type AcceptTermsState = { error: string } | undefined;

/**
 * Legal 2.2, Google sign-up: the one-time step a brand-new Google account sees
 * before its first destination. Validates the checkbox server side, records
 * the two signup acceptances, then continues to `next`.
 */
export async function acceptSignupTermsAction(
  _prev: AcceptTermsState,
  formData: FormData,
): Promise<AcceptTermsState> {
  const t = createTranslator(String(formData.get("locale") ?? "en") === "es" ? "es" : "en");
  if (!isAgeAndTermsConfirmed(formData.get("age_terms"))) {
    return { error: t("public.auth.actions.ageTermsRequired") };
  }
  const session = await getCachedActorSession();
  if (!session.user) redirect("/login");
  await recordSignupAcceptance(session.user.id);
  const next = normalizeNextPath(String(formData.get("next") ?? "").trim());
  redirect(await hostSafeRedirectDestination(next));
}
