"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

const GUEST_COOKIE = "impronta_guest";

export type ClientProfileActionState =
  | { error?: string; success?: boolean }
  | undefined;

export async function mergeGuestActivity(): Promise<
  { ok: true; mergedSavedCount: number; mergedInquiryCount: number } | { ok: false; error: string }
> {
  const auth = await requireClient();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const cookieStore = await cookies();
  const sessionKey = cookieStore.get(GUEST_COOKIE)?.value;
  if (!sessionKey) return { ok: true, mergedSavedCount: 0, mergedInquiryCount: 0 };

  const { data: guestSession } = await supabase
    .from("guest_sessions")
    .select("id")
    .eq("session_key", sessionKey)
    .maybeSingle();

  if (!guestSession?.id) {
    return { ok: true, mergedSavedCount: 0, mergedInquiryCount: 0 };
  }

  const [{ count: savedCount }, { count: inquiryCount }] = await Promise.all([
    supabase
      .from("saved_talent")
      .select("talent_profile_id", { count: "exact", head: true })
      .eq("guest_session_id", guestSession.id),
    supabase
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("guest_session_id", guestSession.id)
      .is("client_user_id", null),
  ]);

  await supabase.rpc("merge_guest_session_to_client", {
    p_session_key: sessionKey,
    p_client_profile_id: user.id,
  });

  revalidatePath("/client");
  revalidatePath("/directory");
  revalidatePath("/directory");
  return {
    ok: true,
    mergedSavedCount: savedCount ?? 0,
    mergedInquiryCount: inquiryCount ?? 0,
  };
}

export async function updateClientProfile(
  _prev: ClientProfileActionState,
  formData: FormData,
): Promise<ClientProfileActionState> {
  const auth = await requireClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const display_name = String(formData.get("display_name") ?? "").trim();
  const company_name = String(formData.get("company_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const whatsapp_phone = String(formData.get("whatsapp_phone") ?? "").trim();
  const website_url = String(formData.get("website_url") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: display_name || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileError) {
    logServerError("client/updateClientProfile/profiles", profileError);
    return { error: CLIENT_ERROR.update };
  }

  const { error: clientError } = await supabase.from("client_profiles").upsert({
    user_id: user.id,
    company_name: company_name || null,
    phone: phone || null,
    whatsapp_phone: whatsapp_phone || null,
    website_url: website_url || null,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  });

  if (clientError) {
    logServerError("client/updateClientProfile/client_profiles", clientError);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/client");
  revalidatePath("/directory");
  return { success: true };
}
