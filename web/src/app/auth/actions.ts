"use server";

import {
  getAppUrl,
  normalizeNextPath,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { loadAccessProfile } from "@/lib/access-profile";
import { logServerError } from "@/lib/server/safe-error";
import {
  getCachedActorSession,
  getCachedServerSupabase,
} from "@/lib/server/request-cache";
import {
  scheduleWorkspaceAudit,
  type WorkspaceAuditActorKind,
} from "@/lib/audit/workspace-audit";
import { createTranslator } from "@/i18n/messages";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hostSafeRedirectDestination } from "@/lib/saas/host-safe-destination";
import { headers } from "next/headers";

export type AuthActionState = { error?: string; message?: string } | void;

function authT(formData: FormData) {
  const locale = String(formData.get("locale") ?? "en");
  return createTranslator(locale === "es" ? "es" : "en");
}

/** Maps Supabase auth error codes to actionable user-facing messages. */
function mapSignUpError(error: unknown, t: ReturnType<typeof createTranslator>): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case "email_address_invalid":
      return t("public.auth.actions.signupEmailInvalid");
    case "email_address_not_authorized":
      return t("public.auth.actions.signupDomainBlocked");
    case "weak_password":
      return t("public.auth.actions.signupWeakPassword");
    case "over_email_send_rate_limit":
      return t("public.auth.actions.signupRateLimited");
    case "user_already_exists":
    case "email_exists":
      return t("public.auth.actions.signupExists");
    case "signup_disabled":
      return t("public.auth.actions.signupDisabled");
    default:
      return t("public.auth.actions.signupGeneric");
  }
}

/**
 * Tenant id set by the proxy for tenant hosts. Auth runs before the tenant
 * scope helpers apply, so the header is the only reliable attribution here.
 * Returns null on the platform host (tulala.digital), where we skip auditing.
 */
async function auditTenantId(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-impronta-tenant-id");
  } catch {
    return null;
  }
}

function auditActorKind(appRole: string | null | undefined): WorkspaceAuditActorKind {
  switch (appRole) {
    case "super_admin":
      return "platform";
    case "agency_staff":
      return "staff";
    case "talent":
      return "talent";
    default:
      return "client";
  }
}

/** True only for an actual rejected email/password pair (not config/validation). */
function isRejectedCredentials(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === "invalid_credentials") return true;
  const message = (error as { message?: string })?.message;
  return typeof message === "string" && message.includes("Invalid login credentials");
}

/** Unauthenticated: request Supabase to email a password reset link. */
export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const t = authT(formData);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: t("public.auth.actions.invalidEmail") };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }

  const origin = getAppUrl();
  // Carry the page locale so the auth-email hook can send EN/ES (no per-user
  // locale exists in Supabase — the page language is the only signal).
  const lang = String(formData.get("locale") ?? "en") === "es" ? "es" : "en";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/update-password")}&lang=${lang}`,
  });

  if (error) {
    logServerError("auth/requestPasswordReset", error);
    // Same message either way to avoid account enumeration.
  }

  return {
    message: t("public.auth.actions.resetSent"),
  };
}

export async function signInWithEmail(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const t = authT(formData);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: t("public.auth.actions.emailPasswordRequired") };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logServerError("auth/signInWithPassword", error);
    if (isRejectedCredentials(error)) {
      const tenantId = await auditTenantId();
      if (tenantId) {
        scheduleWorkspaceAudit({
          tenantId,
          category: "security",
          action: "auth.sign_in_failed",
          summary: "Failed sign-in attempt",
          actorUserId: null,
          actorLabel: email,
          actorKind: "guest",
        });
      }
    }
    return { error: t("public.auth.actions.signInGeneric") };
  }

  const nextPath = normalizeNextPath(String(formData.get("next") ?? "").trim());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileData = user
    ? await loadAccessProfile(supabase, user.id)
    : null;

  if (user) {
    const tenantId = await auditTenantId();
    if (tenantId) {
      scheduleWorkspaceAudit({
        tenantId,
        category: "auth",
        action: "auth.signed_in",
        summary: "Signed in with email",
        actorUserId: user.id,
        actorLabel: user.email ?? email,
        actorKind: auditActorKind(profileData?.app_role),
      });
    }
  }

  revalidatePath("/", "layout");
  // Host-safe: the post-auth destination (/admin, /client, /onboarding/role)
  // does not exist on the marketing apex or the hub, where this form is also
  // served. A relative redirect there is a hard 404.
  redirect(
    await hostSafeRedirectDestination(
      resolvePostAuthDestination(profileData, nextPath),
    ),
  );
}

export type SignInModalState = { ok: true } | { ok: false; error: string } | null;

/**
 * In-place email sign-in for the marketing login MODAL (apex host). Unlike
 * `signInWithEmail`, this does NOT redirect: the session cookie is written by
 * the server client (parent-domain scoped, so the apex + every subdomain sees
 * it), and the modal closes + `router.refresh()`es so the current page flips to
 * the signed-in header without leaving `tulala.digital`. The account menu then
 * carries the user into their workspace when they choose to.
 */
export async function signInWithEmailModal(
  _prev: SignInModalState,
  formData: FormData,
): Promise<SignInModalState> {
  const t = authT(formData);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: t("public.auth.actions.emailPasswordRequired") };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { ok: false, error: SUPABASE_ENV_HELP };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logServerError("auth/signInWithEmailModal", error);
    if (isRejectedCredentials(error)) {
      const tenantId = await auditTenantId();
      if (tenantId) {
        scheduleWorkspaceAudit({
          tenantId,
          category: "security",
          action: "auth.sign_in_failed",
          summary: "Failed sign-in attempt",
          actorUserId: null,
          actorLabel: email,
          actorKind: "guest",
        });
      }
    }
    return { ok: false, error: t("public.auth.actions.signInGeneric") };
  }

  if (data.user) {
    const tenantId = await auditTenantId();
    if (tenantId) {
      scheduleWorkspaceAudit({
        tenantId,
        category: "auth",
        action: "auth.signed_in",
        summary: "Signed in with email",
        actorUserId: data.user.id,
        actorLabel: data.user.email ?? email,
      });
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signUpWithEmail(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const t = authT(formData);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: t("public.auth.actions.emailPasswordRequired") };
  }
  if (password.length < 8) {
    return { error: t("public.auth.actions.passwordTooShort") };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }
  const origin = getAppUrl();
  const nextPath = normalizeNextPath(String(formData.get("next") ?? "").trim());
  // Talent-register flow: the modal passes next=/onboarding/talent-location.
  // Tagging signup_intent in user metadata lets the handle_new_user trigger
  // create the profile with app_role='talent' immediately, avoiding a brief
  // window where a talent is misidentified as a client.
  const signupIntent = nextPath.startsWith("/onboarding/talent") ? "talent" : undefined;
  // Carry the page locale so the auth-email hook sends the confirm email in EN/ES.
  const lang = String(formData.get("locale") ?? "en") === "es" ? "es" : "en";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}&lang=${lang}`,
      data: signupIntent ? { signup_intent: signupIntent } : undefined,
    },
  });
  if (error) {
    logServerError("auth/signUpWithEmail", error);
    return { error: mapSignUpError(error, t) };
  }

  if (data.user) {
    const tenantId = await auditTenantId();
    if (tenantId) {
      scheduleWorkspaceAudit({
        tenantId,
        category: "auth",
        action: "auth.signed_up",
        summary: "Created an account",
        actorUserId: data.user.id,
        actorLabel: data.user.email ?? email,
        actorKind: signupIntent === "talent" ? "talent" : "client",
      });
    }
  }

  if (!data.session) {
    return {
      message: t("public.auth.actions.signupConfirmation"),
    };
  }

  revalidatePath("/", "layout");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileData = user
    ? await loadAccessProfile(supabase, user.id)
    : null;
  // Host-safe: the post-auth destination (/admin, /client, /onboarding/role)
  // does not exist on the marketing apex or the hub, where this form is also
  // served. A relative redirect there is a hard 404.
  redirect(
    await hostSafeRedirectDestination(
      resolvePostAuthDestination(profileData, nextPath),
    ),
  );
}

/**
 * In-place talent signup for the marketing-site registration modal.
 *
 * Unlike {@link signUpWithEmail}, this NEVER redirects — it returns a
 * structured state so the modal can advance to its profile step (or show a
 * confirmation view) without a navigation. It is invoked from a marketing
 * page, so the server-action POST targets the current (allowed) marketing
 * path; the auth cookie it sets is scoped to the shared parent domain
 * (see lib/supabase/cookie-domain.ts), making the resulting session usable on
 * the app host afterward.
 */
export type TalentSignupInPlaceState =
  | { ok: true }
  | { error: string }
  | { needsConfirmation: string }
  | void;

export async function signUpTalentInPlace(
  _prev: TalentSignupInPlaceState,
  formData: FormData,
): Promise<TalentSignupInPlaceState> {
  const t = authT(formData);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: t("public.auth.actions.emailPasswordRequired") };
  }
  if (password.length < 8) {
    return { error: t("public.auth.actions.passwordTooShort") };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }
  const origin = getAppUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // If email confirmation is on, the link lands on the app host and
      // resumes at the profile step.
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
        "/onboarding/talent-location",
      )}`,
      data: { signup_intent: "talent" },
    },
  });
  if (error) {
    logServerError("auth/signUpTalentInPlace", error);
    return { error: mapSignUpError(error, t) };
  }

  if (data.user) {
    const tenantId = await auditTenantId();
    if (tenantId) {
      scheduleWorkspaceAudit({
        tenantId,
        category: "auth",
        action: "auth.signed_up",
        summary: "Created an account",
        actorUserId: data.user.id,
        actorLabel: data.user.email ?? email,
        actorKind: "talent",
      });
    }
  }

  if (!data.session) {
    // Email-confirmation mode: no session yet, so the in-place profile step
    // can't run. Surface the "check your inbox" copy and stop here.
    return { needsConfirmation: t("public.auth.actions.signupConfirmation") };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await getCachedServerSupabase();
  if (supabase) {
    // Resolve the actor BEFORE the session is destroyed. The request-cached
    // session still reflects the signed-in user at this point.
    const tenantId = await auditTenantId();
    let actorUserId: string | null = null;
    let actorLabel: string | null = null;
    let actorKind: WorkspaceAuditActorKind | undefined;
    if (tenantId) {
      try {
        const { user, profile } = await getCachedActorSession();
        if (user) {
          actorUserId = user.id;
          actorLabel = user.email ?? null;
          actorKind = auditActorKind(profile?.app_role);
        }
      } catch {
        // Actor unresolvable — log the sign-out without attribution.
      }
    }
    const { error } = await supabase.auth.signOut();
    if (tenantId && !error) {
      scheduleWorkspaceAudit({
        tenantId,
        category: "auth",
        action: "auth.signed_out",
        summary: "Signed out",
        actorUserId,
        actorLabel,
        actorKind,
      });
    }
  }
  revalidatePath("/", "layout");
  redirect("/");
}
