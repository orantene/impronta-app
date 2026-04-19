"use server";

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  LEGACY_TENANT_ID,
  submitRepresentationRequest,
  withdrawRepresentationRequest,
} from "@/lib/saas";

export type TalentRepresentationActionState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | undefined;

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Resolve the signed-in user's talent_profiles.id. Required on every action
 * so a tampered form field cannot submit a request on another talent's behalf.
 */
async function resolveOwnTalentProfileId(): Promise<string | null> {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) return null;
  const { data } = await session.supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  return data?.id ?? null;
}

export async function talentApplyToAgencyAction(
  _prev: TalentRepresentationActionState,
  formData: FormData,
): Promise<TalentRepresentationActionState> {
  const targetTenantId = formString(formData, "target_tenant_id");
  const note = formString(formData, "note");
  if (!targetTenantId) return { ok: false, error: "Pick an agency." };

  const talentProfileId = await resolveOwnTalentProfileId();
  if (!talentProfileId) {
    return { ok: false, error: "Talent profile not found." };
  }

  const result = await submitRepresentationRequest({
    talentProfileId,
    targetType: "agency",
    targetId: targetTenantId,
    note: note || null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/talent/representations");
  return { ok: true, message: "Application sent." };
}

export async function talentRequestHubVisibilityAction(
  _prev: TalentRepresentationActionState,
  formData: FormData,
): Promise<TalentRepresentationActionState> {
  const note = formString(formData, "note");

  const talentProfileId = await resolveOwnTalentProfileId();
  if (!talentProfileId) {
    return { ok: false, error: "Talent profile not found." };
  }

  const result = await submitRepresentationRequest({
    talentProfileId,
    targetType: "hub",
    // Hub requests reference the hub tenant (tenant #1 — see migration
    // 20260604100000 header). Reviewer population is derived from target_type
    // in the engine; only platform admins can review hub requests.
    targetId: LEGACY_TENANT_ID,
    note: note || null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/talent/representations");
  return { ok: true, message: "Hub visibility request sent." };
}

export async function talentWithdrawRepresentationRequestAction(
  _prev: TalentRepresentationActionState,
  formData: FormData,
): Promise<TalentRepresentationActionState> {
  const id = formString(formData, "request_id");
  if (!id) return { ok: false, error: "Missing request id." };
  const result = await withdrawRepresentationRequest(id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/talent/representations");
  return { ok: true, message: "Request withdrawn." };
}
