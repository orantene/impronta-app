"use server";

// Phase 4 — canonical home for mergeGuestActivity (moved from (dashboard)/client/actions.ts).

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "@/lib/server-actions/result";

const GUEST_COOKIE = "impronta_guest";

// A.4 INTENTIONAL DIVERGENCE: convert to `ServerActionResult<T>`. `useFormState` shape for the
// client profile edit form; conversion requires updating the form action and
// every consumer. Out of scope for the initial sweep.
export type ClientProfileActionState =
  | { error?: string; success?: boolean }
  | undefined;

export type MergeGuestActivitySummary = {
  mergedSavedCount: number;
  mergedInquiryCount: number;
  mergedFavoritesCount: number;
};

/**
 * On signup/signin, merge the visitor's guest-mode state into their
 * authed account. Three independent sweeps:
 *
 *   1. **Inquiry cart** (`saved_talent` rows with `guest_session_id`)
 *      → repointed to `client_user_id` via the existing
 *      `merge_guest_session_to_client` RPC.
 *   2. **Inquiries** (any in-flight inquiries the guest started) — same
 *      RPC handles these.
 *   3. **Personal favorites** (the ♥ bookmark list). Guests hold these
 *      in localStorage only; the client passes the IDs as
 *      `guestFavoriteIds` and we upsert them into `client_favorites`.
 *      Pass an empty array (or omit) to skip.
 */
export async function mergeGuestActivity(
  guestFavoriteIds: string[] = [],
): Promise<ServerActionResult<MergeGuestActivitySummary>> {
  const auth = await requireClient();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  // — Personal favorites mirror — independent of guest-session cookie.
  let mergedFavoritesCount = 0;
  if (guestFavoriteIds.length > 0) {
    const uniqueIds = Array.from(new Set(guestFavoriteIds)).slice(0, 500);
    const { error: favError } = await supabase
      .from("client_favorites")
      .upsert(
        uniqueIds.map((talentId) => ({
          client_user_id: user.id,
          talent_profile_id: talentId,
        })),
        {
          onConflict: "client_user_id,talent_profile_id",
          ignoreDuplicates: true,
        },
      );
    if (favError) {
      logServerError("client/mergeGuestActivity/favorites", favError);
    } else {
      mergedFavoritesCount = uniqueIds.length;
    }
  }

  const cookieStore = await cookies();
  const sessionKey = cookieStore.get(GUEST_COOKIE)?.value;
  if (!sessionKey) {
    return {
      ok: true,
      data: {
        mergedSavedCount: 0,
        mergedInquiryCount: 0,
        mergedFavoritesCount,
      },
    };
  }

  const { data: guestSession } = await supabase
    .from("guest_sessions")
    .select("id")
    .eq("session_key", sessionKey)
    .maybeSingle();

  if (!guestSession?.id) {
    return {
      ok: true,
      data: {
        mergedSavedCount: 0,
        mergedInquiryCount: 0,
        mergedFavoritesCount,
      },
    };
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

  // SECURITY (guest→account claim): relink inquiries ONLY when the inquiry's
  // contact_email matches the AUTHENTICATED account's own email. Passing
  // `user.email` as p_verified_email is the shared-device defense — a different
  // person signing in (different account email) cannot inherit this guest's
  // conversations. saved_talent favorites still merge on the cookie alone. See
  // migration 20261017091500_merge_guest_inquiries_email_gated.sql.
  await supabase.rpc("merge_guest_session_to_client", {
    p_session_key: sessionKey,
    p_client_profile_id: user.id,
    p_verified_email: user.email ?? "",
  });

  revalidatePath("/client");
  revalidatePath("/client/favorites");
  revalidatePath("/directory");
  return {
    ok: true,
    data: {
      mergedSavedCount: savedCount ?? 0,
      mergedInquiryCount: inquiryCount ?? 0,
      mergedFavoritesCount,
    },
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
