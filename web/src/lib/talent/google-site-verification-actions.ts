"use server";

import { revalidatePath } from "next/cache";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { parseGoogleSiteVerificationInput } from "@/lib/talent/google-site-verification";

export type SaveGoogleSiteVerificationResult =
  | { ok: true; token: string | null }
  | { ok: false; error: string };

/** Save (or clear, with empty input) the signed-in talent's Search Console token. */
export async function saveGoogleSiteVerificationAction(input: string): Promise<SaveGoogleSiteVerificationResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const scope = await requireTalentSelf();
  if (!scope.ok) return { ok: false, error: "forbidden" };
  const parsed = parseGoogleSiteVerificationInput(input);
  if (!parsed.ok) return parsed;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "unavailable" };

  const id = scope.talentProfile.id;
  const { data: existing, error: readErr } = await admin
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", id)
    .maybeSingle();
  if (readErr) {
    logServerError("talent.googleSiteVerification.read", readErr);
    return { ok: false, error: "read_failed" };
  }
  const { error } = existing
    ? await admin.from("talent_sites").update({ google_site_verification: parsed.token }).eq("talent_profile_id", id)
    : await admin.from("talent_sites").insert({
        talent_profile_id: id,
        google_site_verification: parsed.token,
        accepting_bookings: true,
        accepting_inquiries: true,
        chat_enabled: true,
      });
  if (error) {
    logServerError("talent.googleSiteVerification.write", error);
    return { ok: false, error: "write_failed" };
  }
  revalidatePath("/talent/get-found");
  return { ok: true, token: parsed.token };
}
