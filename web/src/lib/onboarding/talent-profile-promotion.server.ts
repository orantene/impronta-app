import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { planProfilePromotion, type ProfileState } from "./talent-profile-promotion";

export async function promoteTalentProfileLive(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin.from("talent_profiles").select("workflow_status, visibility").eq("id", talentProfileId).maybeSingle();
  if (error || !data) {
    logServerError("talent-profile-promotion.read", error ?? new Error("no profile"));
    return { ok: false, error: "Could not read your talent profile." };
  }
  const patch = planProfilePromotion(data as ProfileState);
  if (!patch) return { ok: true };
  const { error: upErr } = await admin.from("talent_profiles").update(patch).eq("id", talentProfileId);
  if (upErr) {
    logServerError("talent-profile-promotion.write", upErr);
    return { ok: false, error: "Could not publish your talent profile." };
  }
  return { ok: true };
}
