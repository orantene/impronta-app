"use server";

/**
 * Talent services menu — load / save actions (S3, S20). Wave: services-menu.
 *
 * CONFIGURATION ONLY. Reads/writes talent_profiles.services_menu jsonb
 * (ServiceMenuItem[]). Does NOT charge a card or alter offer/booking math — a
 * selected service later PRE-FILLS an offer line through the existing rail.
 *
 * Authorization mirrors talent-booking-terms-actions.ts: a read/write is allowed
 * when the caller is EITHER (a) the talent (talent_profiles.user_id === session
 * user) OR (b) agency staff editing on their behalf. Backs both the talent-self
 * Settings card and the admin profile-editor drawer.
 *
 * A "use server" module exports ONLY async functions — shared types + the
 * normaliser live in @/lib/talent/services-menu-types.
 */

import { revalidatePath } from "next/cache";
import {
  normalizeServicesMenu,
  validateServicesMenu,
  type ServiceMenuItem,
} from "@/lib/talent/services-menu-types";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isStaffRole } from "@/lib/auth-flow";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type AuthResult =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
      userId: string;
      isStaff: boolean;
      defaultCurrency: string;
    }
  | { ok: false; error: string };

/** Owner (user_id match) OR staff. Returns an RLS-bound client for reads. */
async function authorizeForTalent(talentProfileId: string): Promise<AuthResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data: tp, error } = await supabase
    .from("talent_profiles")
    .select("id, user_id, default_currency")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (error || !tp) {
    if (error) logServerError("talent.servicesMenu.authorize", error);
    return { ok: false, error: "Profile not found." };
  }

  const isStaff = !!session.profile && isStaffRole(session.profile.app_role);
  const isOwner = tp.user_id === session.user.id;
  if (!isOwner && !isStaff) return { ok: false, error: "Forbidden." };

  return {
    ok: true,
    supabase,
    userId: session.user.id,
    isStaff,
    defaultCurrency: (tp.default_currency as string | null)?.toUpperCase() || "USD",
  };
}

type LoadResult = { ok: true; items: ServiceMenuItem[]; defaultCurrency: string } | { ok: false; error: string };

/** Load the talent's services menu (normalized). */
export async function loadTalentServicesMenu(talentProfileId: string): Promise<LoadResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };

    // services_menu may be unknown to the generated row type until the next
    // regen — assert the shape.
    const { data, error } = await auth.supabase
      .from("talent_profiles")
      .select("services_menu")
      .eq("id", talentProfileId)
      .returns<{ services_menu: unknown }[]>()
      .maybeSingle();

    if (error) {
      logServerError("talent.servicesMenu.load", error);
      return { ok: false, error: "Could not load services." };
    }

    return {
      ok: true,
      items: normalizeServicesMenu(data?.services_menu, auth.defaultCurrency),
      defaultCurrency: auth.defaultCurrency,
    };
  } catch (err) {
    logServerError("talent.servicesMenu.load", err);
    return { ok: false, error: "Unexpected error." };
  }
}

type UpdateResult = { ok: true; items: ServiceMenuItem[] } | { ok: false; error: string };

/**
 * Persist the talent's services menu. Normalizes + validates (S20) before the
 * service-role write (the talent may lack RLS update on every column; staff
 * writes are gated above).
 */
export async function updateTalentServicesMenu(
  talentProfileId: string,
  items: ServiceMenuItem[],
): Promise<UpdateResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const clean = normalizeServicesMenu(items, auth.defaultCurrency);
    const errors = validateServicesMenu(clean);
    if (errors.length > 0) return { ok: false, error: errors[0] };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const patch = {
      services_menu: clean,
      updated_at: new Date().toISOString(),
    } as unknown as Record<string, never>;

    const { error } = await admin.from("talent_profiles").update(patch).eq("id", talentProfileId);

    if (error) {
      logServerError("talent.servicesMenu.update", error);
      return { ok: false, error: "Failed to save services." };
    }

    revalidatePath("/talent/settings");
    revalidatePath(`/admin/talent/${talentProfileId}`);
    return { ok: true, items: clean };
  } catch (err) {
    logServerError("talent.servicesMenu.update", err);
    return { ok: false, error: "Unexpected error." };
  }
}
