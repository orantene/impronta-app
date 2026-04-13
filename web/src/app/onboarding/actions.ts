"use server";

import { cookies } from "next/headers";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { logServerError } from "@/lib/server/safe-error";
import { requireSession } from "@/lib/server/action-guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type OnboardingActionState = { error?: string } | void;

export async function chooseTalentRole(): Promise<void> {
  const auth = await requireSession();
  if (!auth.ok) {
    if (auth.error === "Not configured.") {
      redirect(`/onboarding/role?error=${encodeURIComponent(SUPABASE_ENV_HELP)}`);
    }
    redirect("/login?next=%2Fonboarding%2Frole");
  }
  redirect("/onboarding/talent-location");
}

export async function chooseClientRole(): Promise<void> {
  const auth = await requireSession();
  if (!auth.ok) {
    if (auth.error === "Not configured.") {
      redirect(`/onboarding/role?error=${encodeURIComponent(SUPABASE_ENV_HELP)}`);
    }
    redirect("/login?next=%2Fonboarding%2Frole");
  }
  const { supabase, user } = auth;
  const { error } = await supabase.rpc("complete_client_onboarding");
  if (error) {
    logServerError("onboarding/complete_client_onboarding", error);
    redirect("/onboarding/role?error=failed");
  }
  const guestKey = (await cookies()).get("impronta_guest")?.value;
  if (guestKey) {
    await supabase.rpc("merge_guest_session_to_client", {
      p_session_key: guestKey,
      p_client_profile_id: user.id,
    });
  }
  revalidatePath("/", "layout");
  redirect("/client");
}

export async function completeTalentLocationOnboarding(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const auth = await requireSession();
  if (!auth.ok) {
    return {
      error:
        auth.error === "Not configured." ? SUPABASE_ENV_HELP : auth.error,
    };
  }
  const { supabase } = auth;

  // --- Identity fields ---
  const display_name = String(formData.get("display_name") ?? "").trim();
  const first_name = String(formData.get("first_name") ?? "").trim();
  const last_name = String(formData.get("last_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const date_of_birth = String(formData.get("date_of_birth") ?? "").trim();
  if (!display_name) return { error: "Display name is required." };
  if (!first_name) return { error: "First name is required." };
  if (!last_name) return { error: "Last name is required." };
  if (!phone) return { error: "Phone number is required." };
  if (!gender) return { error: "Gender is required." };
  if (!date_of_birth) return { error: "Date of birth is required." };

  const { data, error } = await supabase.rpc("complete_talent_onboarding_with_locations", {
    p_residence_country_iso2: null,
    p_residence_country_name_en: null,
    p_residence_country_name_es: null,
    p_residence_city_slug: null,
    p_residence_city_name_en: null,
    p_residence_city_name_es: null,
    p_residence_lat: null,
    p_residence_lng: null,
    p_display_name: display_name,
    p_first_name: first_name,
    p_last_name: last_name,
    p_phone: phone,
    p_gender: gender,
    p_date_of_birth: date_of_birth || null,
    p_nationality: null,
  });

  if (error) {
    logServerError("onboarding/complete_talent_onboarding_with_locations", error);
    return { error: "We couldn't save your profile. Please try again." };
  }
  if (!data) {
    return { error: "We couldn't finish onboarding. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect("/talent/my-profile");
}
