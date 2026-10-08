"use server";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { isTalentWebsiteSettingsEnabled } from "@/lib/access/talent-website-settings";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { findShellTel, normaliseE164, withPublicCallNumber } from "@/lib/talent-site/public-call-number";

/** The public call number the signed-in talent opted in with. null = not set. */
export async function loadCallNumberAction(): Promise<{ number: string | null } | null> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;
  if (!isTalentWebsiteSettingsEnabled(scope.talentProfile.id)) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("social_links")
    .eq("id", scope.talentProfile.id)
    .maybeSingle();
  if (error) {
    logServerError("talent.websiteSettings.callNumber.read", error);
    return null;
  }
  return { number: findShellTel((data as { social_links?: unknown } | null)?.social_links) };
}

/**
 * Set or clear the public call number. Blank clears it. A value that is not a
 * valid international number is refused (never guessed). Only the tel shell
 * entry of social_links changes; the private phone is never read or written.
 */
export async function saveCallNumberAction(
  input: string,
): Promise<{ ok: true; number: string | null } | { ok: false; error: "forbidden" | "disabled" | "unavailable" | "invalid_number" | "write_failed" }> {
  if (!(await assertNotImpersonating()).ok) return { ok: false, error: "forbidden" };
  const scope = await requireTalentSelf();
  if (!scope.ok) return { ok: false, error: "forbidden" };
  if (!isTalentWebsiteSettingsEnabled(scope.talentProfile.id)) return { ok: false, error: "disabled" };
  const raw = typeof input === "string" ? input.trim() : "";
  const e164 = raw ? normaliseE164(raw) : null;
  if (raw && !e164) return { ok: false, error: "invalid_number" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "unavailable" };
  const id = scope.talentProfile.id;
  const { data, error: readErr } = await admin.from("talent_profiles").select("social_links").eq("id", id).maybeSingle();
  if (readErr || !data) {
    logServerError("talent.websiteSettings.callNumber.read", readErr);
    return { ok: false, error: "write_failed" };
  }
  const next = withPublicCallNumber((data as { social_links?: unknown }).social_links, e164);
  const { error } = await admin.from("talent_profiles").update({ social_links: next }).eq("id", id);
  if (error) {
    logServerError("talent.websiteSettings.callNumber.write", error);
    return { ok: false, error: "write_failed" };
  }
  return { ok: true, number: e164 };
}
