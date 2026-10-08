"use server";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { isTalentWebsiteSettingsEnabled } from "@/lib/access/talent-website-settings";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { isPlatformCheckoutReady } from "@/lib/talent/online-collect-ready";
import { parseTalentChatConfig, type TalentSiteSwitches } from "@/lib/talent/site-switches";
import { loadTalentSiteSwitches, loadWorkingHoursPresence } from "@/lib/talent/site-switches-server";
import { loadPlanAllowsInstant } from "@/lib/talent/plan-instant.server";

export type SiteSwitchesSnapshot = {
  switches: TalentSiteSwitches;
  /** Talent-level readiness inputs (§1 row 4). */
  readiness: {
    hasWorkingHours: boolean;
    /** Platform checkout can charge (the gate the server enforces). */
    payoutsReady: boolean;
    /** Talent Stripe Connect payouts on. Advisory copy only (PAY-2 Option B). */
    connectPayoutsEnabled: boolean;
    /** F27: false on the free tier (request only). */
    planAllowsInstant: boolean;
  };
};

/** Switches + readiness inputs for the signed-in talent. null when unavailable. */
export async function loadSiteSwitchesAction(): Promise<SiteSwitchesSnapshot | null> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;
  if (!isTalentWebsiteSettingsEnabled(scope.talentProfile.id)) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const id = scope.talentProfile.id;
  const [switches, hours, profile, plan] = await Promise.all([
    loadTalentSiteSwitches(admin, id),
    loadWorkingHoursPresence(admin, [id]),
    admin.from("talent_profiles").select("stripe_payouts_enabled").eq("id", id).maybeSingle(),
    loadPlanAllowsInstant(admin, [id]),
  ]);
  if (profile.error) logServerError("talent.websiteSettings.connectStatus", profile.error);
  return {
    switches,
    readiness: {
      hasWorkingHours: hours.get(id) ?? false,
      payoutsReady: isPlatformCheckoutReady(),
      connectPayoutsEnabled:
        (profile.data as { stripe_payouts_enabled?: unknown } | null)?.stripe_payouts_enabled === true,
      planAllowsInstant: plan.get(id) ?? true,
    },
  };
}

/**
 * Writer for the talent_sites switches of the signed-in talent. Creates the
 * row when missing. The save-block rule (Q3) is checked by the screen with
 * validateSwitchSave before calling; this writer only stores what it is given.
 */
export async function saveSiteSwitchesAction(
  input: TalentSiteSwitches,
): Promise<{ ok: true; switches: TalentSiteSwitches } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const scope = await requireTalentSelf();
  if (!scope.ok) return { ok: false, error: "forbidden" };
  if (!isTalentWebsiteSettingsEnabled(scope.talentProfile.id)) return { ok: false, error: "disabled" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "unavailable" };
  const id = scope.talentProfile.id;
  const values = {
    accepting_bookings: input.acceptingBookings === true,
    accepting_inquiries: input.acceptingInquiries === true,
    chat_enabled: input.chatEnabled === true,
    chat_config: parseTalentChatConfig(input.chatConfig),
  };
  const { data: existing, error: readErr } = await admin
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", id)
    .maybeSingle();
  if (readErr) {
    logServerError("talent.websiteSettings.switches.read", readErr);
    return { ok: false, error: "read_failed" };
  }
  const { error } = existing
    ? await admin.from("talent_sites").update(values).eq("talent_profile_id", id)
    : await admin.from("talent_sites").insert({ talent_profile_id: id, ...values });
  if (error) {
    logServerError("talent.websiteSettings.switches.write", error);
    return { ok: false, error: "write_failed" };
  }
  return { ok: true, switches: await loadTalentSiteSwitches(admin, id) };
}
