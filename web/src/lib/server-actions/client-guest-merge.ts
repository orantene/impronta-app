"use server";

// Phase 4 — canonical home for mergeGuestActivity (moved from (dashboard)/client/actions.ts).

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { verifyGuestCookie } from "@/lib/guest-cookie";
import { backfillCartFromClaimedInquiries } from "@/lib/inquiry/cart-selected-ids-projection";
import { claimGuestSupportTickets } from "@/lib/support/guest-claim";
import { verifiedEmailForGuestClaim } from "@/lib/support/guest-claim-email";
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
  // The cookie holds the HMAC-signed token; unwrap it to the plain id that
  // matches `guest_sessions.session_key` (null when unsigned/forged). Degrades
  // to the raw value when GUEST_COOKIE_SECRET is unset (legacy behavior).
  const sessionKey = verifyGuestCookie(cookieStore.get(GUEST_COOKIE)?.value);

  // SECURITY (guest→account claim): relink inquiries ONLY when the inquiry's
  // contact_email matches the AUTHENTICATED account's CONFIRMED email. We pass
  // p_verified_email only when auth.email_confirmed_at is set; otherwise we pass
  // '' so the RPC falls through to favorites-only (no inquiry relink). Under
  // enable_confirmations=false signup auto-confirms, so this is a no-op today —
  // but it future-proofs the gate for when confirmations get enabled, instead of
  // trusting an unconfirmed account email. See migration
  // 20261017091500_merge_guest_inquiries_email_gated.sql.
  // Copied verbatim for support ticket Sweep B (guest-claim.ts).
  let verifiedEmail = "";
  const admin = createServiceRoleClient();
  if (admin && user.email) {
    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(user.id);
    if (authErr) {
      logServerError("client/mergeGuestActivity/emailConfirm", authErr);
    } else {
      verifiedEmail =
        verifiedEmailForGuestClaim({
          email: user.email,
          emailConfirmedAt: authUser?.user?.email_confirmed_at,
        }) ?? "";
    }
  }

  let guestSessionId: string | null = null;
  if (sessionKey) {
    const { data: guestSession } = await supabase
      .from("guest_sessions")
      .select("id")
      .eq("session_key", sessionKey)
      .maybeSingle();
    guestSessionId = guestSession?.id ?? null;
  }

  try {
    await claimGuestSupportTickets({
      userId: user.id,
      guestSessionId,
      verifiedEmail: verifiedEmail || null,
    });
  } catch (err) {
    logServerError("client/mergeGuestActivity/supportClaim", err);
  }

  if (!sessionKey || !guestSessionId) {
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
      .eq("guest_session_id", guestSessionId),
    supabase
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("guest_session_id", guestSessionId)
      .is("client_user_id", null),
  ]);
  await supabase.rpc("merge_guest_session_to_client", {
    p_session_key: sessionKey,
    p_client_profile_id: user.id,
    p_verified_email: verifiedEmail,
  });

  // B5 cross-device cart durability — the email-gated RPC just relinked any
  // matching guest inquiries to this account (by contact_email), but on a NEW
  // device the guest cookie is gone, so the guest-session-keyed saved_talent
  // merge above found nothing. The relinked inquiry rows still carry the cart
  // under interpreted_query.talent.selected_ids; rebuild saved_talent from them
  // so the lineup survives the device switch. Insert-only (never removes talent
  // added on the new device); best-effort (never blocks the merge). saved_talent
  // stays authoritative — selected_ids is only the recovery source here.
  if (admin) {
    await backfillCartFromClaimedInquiries({ admin, clientUserId: user.id });
  }

  revalidatePath("/client");
  revalidatePath("/client/favorites");
  revalidatePath("/client/saved");
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
