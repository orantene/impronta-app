"use server";

import { cookies, headers } from "next/headers";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { logServerError } from "@/lib/server/safe-error";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { requireSession } from "@/lib/server/action-guards";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type OnboardingActionState = { error?: string } | void;

function nextFromForm(formData: FormData | undefined): string | undefined {
  return normalizeOptionalNextPath(String(formData?.get("next") ?? ""));
}

function onboardingRolePath(nextPath: string | undefined, error: string): string {
  const params = new URLSearchParams({ error });
  if (nextPath) params.set("next", nextPath);
  return `/onboarding/role?${params.toString()}`;
}

function onboardingLoginPath(nextPath: string | undefined): string {
  const rolePath = nextPath
    ? `/onboarding/role?next=${encodeURIComponent(nextPath)}`
    : "/onboarding/role";
  return `/login?next=${encodeURIComponent(rolePath)}`;
}

function talentLocationPath(nextPath: string | undefined): string {
  if (!nextPath) return "/onboarding/talent-location";
  return `/onboarding/talent-location?next=${encodeURIComponent(nextPath)}`;
}

function parsePortalNext(
  nextPath: string | undefined,
  role: "client" | "talent",
): { tenantSlug: string | null; destination: string } | null {
  if (!nextPath) return null;
  const pathname = (nextPath.split("?")[0] ?? nextPath).split("#")[0] ?? nextPath;
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === role) {
    return { tenantSlug: null, destination: nextPath };
  }
  if (segments.length >= 2 && segments[1] === role) {
    return { tenantSlug: segments[0] ?? null, destination: nextPath };
  }
  return null;
}

async function currentOriginDomain(): Promise<string | null> {
  try {
    const hdrs = await headers();
    const host = hdrs.get("x-impronta-host-name") ?? hdrs.get("host");
    return host?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

async function ensureClientRelationshipForNext(
  userId: string,
  nextPath: string | undefined,
): Promise<string | null> {
  const parsed = parsePortalNext(nextPath, "client");
  if (!parsed) return null;
  if (!parsed.tenantSlug) return parsed.destination;

  const scope = await getTenantPortalScopeBySlug(parsed.tenantSlug);
  const admin = createServiceRoleClient();
  if (!scope || !admin) return null;

  const { data: clientProfile, error: clientError } = await admin
    .from("client_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (clientError || !clientProfile?.id) {
    if (clientError) logServerError("onboarding.clientRelationship.profile", clientError);
    return null;
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("agency_client_relationships")
    .upsert(
      {
        tenant_id: scope.tenantId,
        client_profile_id: clientProfile.id,
        source_type: "direct",
        status: "active",
        added_by: userId,
        last_interaction_at: now,
        source_workspace_id: scope.tenantId,
        origin_domain: await currentOriginDomain(),
      },
      { onConflict: "tenant_id,client_profile_id" },
    );

  if (error) {
    logServerError("onboarding.clientRelationship.upsert", error);
    return null;
  }

  revalidatePath(`/${parsed.tenantSlug}/client`, "layout");
  return parsed.destination;
}

async function ensureTalentRosterForNext(
  userId: string,
  talentProfileId: string,
  nextPath: string | undefined,
): Promise<{ destination: string | null; error?: string }> {
  const parsed = parsePortalNext(nextPath, "talent");
  if (!parsed) return { destination: null };
  if (!parsed.tenantSlug) return { destination: parsed.destination };

  const scope = await getTenantPortalScopeBySlug(parsed.tenantSlug);
  const admin = createServiceRoleClient();
  if (!scope || !admin) return { destination: null };

  const { data: existing, error: existingError } = await admin
    .from("agency_talent_roster")
    .select("id, status")
    .eq("tenant_id", scope.tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();

  if (existingError) {
    logServerError("onboarding.talentRoster.lookup", existingError);
    return { destination: null };
  }

  const originDomain = await currentOriginDomain();
  if (existing?.id) {
    const { error } = await admin
      .from("agency_talent_roster")
      .update({
        status: existing.status === "inactive" ? "pending" : existing.status,
        source_workspace_id: scope.tenantId,
        origin_domain: originDomain,
      })
      .eq("id", existing.id);

    if (error) {
      logServerError("onboarding.talentRoster.update", error);
      return { destination: null };
    }
  } else {
    const seatAvailability = await checkRosterSeatAvailability(
      admin,
      scope.tenantId,
      1,
    );
    if (!seatAvailability.ok) {
      return { destination: null, error: seatAvailability.message };
    }

    const { error } = await admin
      .from("agency_talent_roster")
      .insert({
        tenant_id: scope.tenantId,
        talent_profile_id: talentProfileId,
        source_type: "freelancer_claimed",
        status: "pending",
        agency_visibility: "roster_only",
        hub_visibility_status: "not_submitted",
        is_primary: false,
        added_by: userId,
        source_workspace_id: scope.tenantId,
        origin_domain: originDomain,
      });

    if (error) {
      logServerError("onboarding.talentRoster.insert", error);
      return { destination: null };
    }
  }

  revalidatePath(`/${parsed.tenantSlug}/talent`, "layout");
  return { destination: parsed.destination };
}

export async function chooseTalentRole(formData?: FormData): Promise<void> {
  const nextPath = nextFromForm(formData);
  const auth = await requireSession();
  if (!auth.ok) {
    if (auth.error === "Not configured.") {
      redirect(onboardingRolePath(nextPath, SUPABASE_ENV_HELP));
    }
    redirect(onboardingLoginPath(nextPath));
  }
  redirect(talentLocationPath(nextPath));
}

export async function chooseClientRole(formData?: FormData): Promise<void> {
  const nextPath = nextFromForm(formData);
  const auth = await requireSession();
  if (!auth.ok) {
    if (auth.error === "Not configured.") {
      redirect(onboardingRolePath(nextPath, SUPABASE_ENV_HELP));
    }
    redirect(onboardingLoginPath(nextPath));
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
  const workspaceDestination = await ensureClientRelationshipForNext(user.id, nextPath);
  redirect(workspaceDestination ?? "/client");
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
  const { supabase, user } = auth;
  const nextPath = nextFromForm(formData);

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

  const { data: tp } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (tp?.id) {
    await scheduleRebuildAiSearchDocument(supabase, tp.id);
  }

  revalidatePath("/", "layout");
  const rosterResult = tp?.id
    ? await ensureTalentRosterForNext(user.id, tp.id, nextPath)
    : { destination: null };
  if (rosterResult.error) {
    return { error: rosterResult.error };
  }

  if (user.email) {
    // Welcome email via the notification dispatcher (spec §12). Platform-scoped
    // (tenantId: null → Tulala brand) — a talent isn't tenant-bound at
    // onboarding. Fire-and-forget so we never block the redirect; the
    // dispatcher no-ops without RESEND_API_KEY and the stable eventId dedupes.
    const talentName = display_name;
    const talentUserId = user.id;
    void (async () => {
      try {
        const { dispatchEventNotifications } = await import(
          "@/lib/notifications/dispatcher"
        );
        await dispatchEventNotifications({
          type: "account.talent_onboarded",
          tenantId: null,
          userId: talentUserId,
          eventId: `talent-welcome:${talentUserId}`,
          payload: { talentName },
        });
      } catch (err) {
        logServerError("onboarding/talent-welcome", err);
      }
    })();
  }

  redirect(rosterResult.destination ?? "/talent");
}
