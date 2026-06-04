"use server";

import { cookies, headers } from "next/headers";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { logServerError } from "@/lib/server/safe-error";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { requireSession } from "@/lib/server/action-guards";
import { getAppUrl, normalizeOptionalNextPath } from "@/lib/auth-flow";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { applyRegistrationPolicy } from "@/lib/saas/registration-policy";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { verifyGuestCookie } from "@/lib/guest-cookie";
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

  const outcome = await applyRegistrationPolicy(admin, {
    tenantId: scope.tenantId,
    talentProfileId,
    userId,
    originDomain: await currentOriginDomain(),
  });
  if (!outcome.ok) return { destination: null, error: outcome.error };

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
  // Unwrap the HMAC-signed cookie to the plain id (matches
  // guest_sessions.session_key); degrades to raw when no secret is set.
  const guestKey = verifyGuestCookie((await cookies()).get("impronta_guest")?.value);
  if (guestKey) {
    // Use the 3-arg EMAIL-GATED overload (matching mergeGuestActivity). The
    // 2-arg form no longer relinks inquiries post-migration 20261017091500, so
    // calling it here would silently drop a guest's in-flight conversation claim
    // on the onboarding role-selection path. Pass the authenticated account email
    // so the relink is scoped to inquiries whose contact_email matches (the
    // shared-device defense); favorites still merge on the cookie alone.
    await supabase.rpc("merge_guest_session_to_client", {
      p_session_key: guestKey,
      p_client_profile_id: user.id,
      p_verified_email: user.email ?? "",
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

/**
 * In-place talent profile completion for the marketing-site registration
 * modal. Mirrors {@link completeTalentLocationOnboarding} but NEVER redirects —
 * it returns the dashboard URL so the modal can show a success view with a
 * "Go to your dashboard" handoff (the session cookie is shared across the
 * parent domain, so the app host recognises them). Independent self-registered
 * talent from the marketing funnel have no agency next-path, so there is no
 * roster step here.
 */
export type TalentProfileInPlaceState =
  | {
      ok: true;
      dashboardUrl: string;
      /**
       * Present when the registration was scoped to a tenant (the modal carried
       * a /<slug>/talent next). Lets the success view show "you're in" (active)
       * vs "request sent — pending approval" (pending).
       */
      registration?: { status: "active" | "pending" };
    }
  | { error: string }
  | void;

export async function completeTalentProfileInPlace(
  _prev: TalentProfileInPlaceState,
  formData: FormData,
): Promise<TalentProfileInPlaceState> {
  const auth = await requireSession();
  if (!auth.ok) {
    return {
      error: auth.error === "Not configured." ? SUPABASE_ENV_HELP : auth.error,
    };
  }
  const { supabase, user } = auth;
  const nextPath = nextFromForm(formData);

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

  const { data, error } = await supabase.rpc(
    "complete_talent_onboarding_with_locations",
    {
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
    },
  );

  if (error) {
    logServerError("onboarding/completeTalentProfileInPlace", error);
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

  // Tenant Registration Engine: when the modal carries a tenant talent-portal
  // `next` (e.g. /<slug>/talent), apply that workspace's join policy now. Open
  // → active; approval/exclusive → pending. Independent marketing-funnel talent
  // (no tenant next) skip this entirely, exactly as before.
  let registration: { status: "active" | "pending" } | undefined;
  let dashboardUrl = `${getAppUrl()}/talent`;
  if (tp?.id) {
    const parsed = parsePortalNext(nextPath, "talent");
    if (parsed?.tenantSlug) {
      const scope = await getTenantPortalScopeBySlug(parsed.tenantSlug);
      const admin = createServiceRoleClient();
      if (scope && admin) {
        const outcome = await applyRegistrationPolicy(admin, {
          tenantId: scope.tenantId,
          talentProfileId: tp.id,
          userId: user.id,
          originDomain: await currentOriginDomain(),
        });
        if (!outcome.ok) return { error: outcome.error };
        registration = { status: outcome.status };
        revalidatePath(`/${parsed.tenantSlug}/talent`, "layout");
        dashboardUrl = `${getAppUrl()}${parsed.destination}`;
      }
    } else if (parsed?.destination) {
      dashboardUrl = `${getAppUrl()}${parsed.destination}`;
    }
  }

  if (user.email) {
    // Welcome email via the notification dispatcher (spec §12), matching
    // completeTalentLocationOnboarding. Platform-scoped (tenantId: null →
    // Tulala brand); fire-and-forget; stable eventId dedupes if both onboarding
    // paths ever run for the same user.
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

  return { ok: true, dashboardUrl, registration };
}

/**
 * Existing-talent "Sign in to apply" path for the tenant registration modal.
 *
 * The visitor already has a Tulala account + talent profile (shared session via
 * the parent-domain cookie). This creates / reactivates their roster row for the
 * tenant per its join policy — no new account, no profile step. Returns the
 * outcome so the modal can show "you're in" vs "request sent — pending approval".
 */
export type RequestTenantRegistrationState =
  | { ok: true; status: "active" | "pending" }
  | { ok: false; error: string };

export async function requestTenantRegistration(
  tenantSlug: string,
): Promise<RequestTenantRegistrationState> {
  const auth = await requireSession();
  if (!auth.ok) {
    return { ok: false, error: "Please sign in to apply." };
  }
  const { supabase, user } = auth;

  const { data: tp, error: tpError } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (tpError) {
    logServerError("requestTenantRegistration.profile", tpError);
    return { ok: false, error: "We couldn't read your profile. Please try again." };
  }
  if (!tp?.id) {
    return {
      ok: false,
      error: "Finish setting up your talent profile before applying.",
    };
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  const admin = createServiceRoleClient();
  if (!scope || !admin) {
    return { ok: false, error: "This workspace isn't available right now." };
  }

  const outcome = await applyRegistrationPolicy(admin, {
    tenantId: scope.tenantId,
    talentProfileId: tp.id,
    userId: user.id,
    originDomain: await currentOriginDomain(),
  });
  if (!outcome.ok) return { ok: false, error: outcome.error };

  revalidatePath(`/${tenantSlug}/talent`, "layout");
  return { ok: true, status: outcome.status };
}
