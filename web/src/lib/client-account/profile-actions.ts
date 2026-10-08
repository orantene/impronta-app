"use server";

/**
 * Settings tab save (TUL-62). Writes ONLY the signed-in client's own rows:
 * `profiles.display_name` and `client_profiles` (phone, preferred_locale,
 * marketing_opt_in). Staff and talent sessions are refused.
 */

import { revalidatePath } from "next/cache";

import { normalizeAccountSettings, type AccountSettingsInput } from "@/lib/client-account/area-pure";
import { accountSurfaceEnabledForRequest } from "@/lib/client-account/tenant.server";
import { marketingConsentPatch } from "@/lib/client-account/consent-pure";
import { isClientAccountEligible } from "@/lib/client-account/pure";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function saveAccountSettings(input: Partial<AccountSettingsInput>): Promise<{ ok: boolean }> {
  if (!(await accountSurfaceEnabledForRequest())) return { ok: false };
  const clean = normalizeAccountSettings(input);
  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!clean || !session.user || !admin) return { ok: false };
  if (!isClientAccountEligible(session.profile?.app_role ?? null)) return { ok: false };
  const userId = session.user.id;
  const now = new Date().toISOString();
  if (clean.name) {
    const { error } = await admin.from("profiles").update({ display_name: clean.name }).eq("id", userId);
    if (error) {
      logServerError("clientAccount.settings.name", error);
      return { ok: false };
    }
  }
  // The consent stamp moves only when the choice changes.
  const { data: prior, error: priorErr } = await admin
    .from("client_profiles")
    .select("marketing_opt_in")
    .eq("user_id", userId)
    .maybeSingle();
  if (priorErr) {
    logServerError("clientAccount.settings.prior", priorErr);
    return { ok: false };
  }
  const { error } = await admin.from("client_profiles").upsert(
    {
      user_id: userId,
      phone: clean.phone || null,
      preferred_locale: clean.locale,
      marketing_opt_in: clean.marketingOptIn,
      ...marketingConsentPatch({ previous: (prior as { marketing_opt_in?: boolean | null } | null)?.marketing_opt_in, next: clean.marketingOptIn, nowIso: now }),
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    logServerError("clientAccount.settings.profile", error);
    return { ok: false };
  }
  revalidatePath("/account");
  return { ok: true };
}
