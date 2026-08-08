"use server";

/**
 * P4 — server actions for the passwordless CLIENT (booker) flow.
 *
 * Two actions, both driven by `useActionState` from
 * `components/auth/email-code-form.tsx`:
 *
 *   requestEmailCode  → supabase.auth.signInWithOtp  (Supabase sends the email)
 *   submitEmailCode   → supabase.auth.verifyOtp      (session cookies + redirect)
 *
 * Nothing is invented: this is Supabase's built-in email OTP. The emailed
 * message carries BOTH a link (handled by the existing /auth/confirm and
 * /auth/callback routes) and the code (typed into the form), so a booker on
 * their phone can finish in whichever way is in front of them, and a future
 * mobile app can use the code path against the same backend.
 *
 * Code LENGTH is project config (`mailer_otp_length`), not 6 — see the B2 note
 * in lib/auth/otp-flow.ts. Never re-hardcode a digit count here.
 *
 * Conventions kept deliberately identical to the password actions
 * (`app/auth/actions.ts`): `next` is normalized, the post-auth destination goes
 * through `resolvePostAuthDestination` + `hostSafeRedirectDestination`, the page
 * locale rides on `emailRedirectTo` as `?lang=` for the auth-email hook, and
 * tenant hosts get a workspace-activity audit row.
 *
 * Scope: client intent only. Operator and talent auth are untouched.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAppUrl, normalizeNextPath, resolvePostAuthDestination } from "@/lib/auth-flow";
import { loadAccessProfile } from "@/lib/access-profile";
import { createTranslator } from "@/i18n/messages";
import { logServerError } from "@/lib/server/safe-error";
import { relinkFirstConfirmedClaim } from "@/lib/auth/guest-claim-relink";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { hostSafeRedirectDestination } from "@/lib/saas/host-safe-destination";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import {
  authOtpSendEmailKey,
  authOtpSendIpKey,
  authOtpVerifyEmailKey,
  checkAuthOtpSendByEmail,
  checkAuthOtpSendByIp,
  checkAuthOtpVerifyByEmail,
} from "@/lib/rate-limit-kv";
import {
  scheduleWorkspaceAudit,
  type WorkspaceAuditActorKind,
} from "@/lib/audit/workspace-audit";
import {
  buildOtpEmailRedirect,
  isCompleteOtpCode,
  isValidAuthEmail,
  normalizeAuthEmail,
  normalizeOtpCode,
  otpSendErrorKey,
  otpVerifyErrorKey,
} from "@/lib/auth/otp-flow";

/** `sent` drives the form's step; `email` is echoed back into the code screen. */
export type EmailCodeState =
  | { step: "sent"; email: string; resent: boolean; notice: string }
  | { step: "email"; error: string; email?: string }
  | { step: "code"; error: string; email: string }
  | undefined;

function otpT(formData: FormData) {
  const locale = String(formData.get("locale") ?? "en");
  return createTranslator(locale === "es" ? "es" : "en");
}

function otpLang(formData: FormData): "en" | "es" {
  return String(formData.get("locale") ?? "en") === "es" ? "es" : "en";
}

/**
 * Tenant id set by the proxy for tenant hosts. Auth runs before the tenant
 * scope helpers apply, so the header is the only reliable attribution here.
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

async function requestIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for") ?? "";
    return forwarded.split(",")[0]?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Abuse guard — TWO LAYERS, deliberately.
 *
 * 1. `lib/rate-limit-kv.ts` (Upstash sliding window) is the DURABLE ceiling.
 *    It is cross-instance and survives cold starts, which is what the original
 *    in-process counter could not do: being per Node/Edge instance, its budget
 *    was silently multiplied by the number of live instances. Same numbers as
 *    before — the point is that they now mean what they say.
 * 2. `lib/rate-limit.ts` (in-process counter) stays as the WITHIN-INSTANCE
 *    floor. It is free, needs no network hop, and keeps working when Upstash is
 *    unreachable — the KV limiter deliberately FAILS OPEN so an Upstash outage
 *    can never lock legitimate people out of signing in, and this floor is what
 *    covers that window.
 *
 * Budgets (per 15 min): 5 sends per address, 20 sends per IP, 10 verifies per
 * address. The KV keys normalize the address (+tag and Gmail dots collapse), so
 * `a+1@gmail.com … a+99@gmail.com` share one send budget — they all cost real
 * outbound email to one inbox.
 */
const SEND_WINDOW_MS = 15 * 60 * 1000;
const SEND_PER_EMAIL = 5;
const SEND_PER_IP = 20;
const VERIFY_PER_EMAIL = 10;

export async function requestEmailCode(
  _prev: EmailCodeState,
  formData: FormData,
): Promise<EmailCodeState> {
  const t = otpT(formData);
  const email = normalizeAuthEmail(formData.get("email"));
  const resent = String(formData.get("resend") ?? "") === "1";

  if (!email || !isValidAuthEmail(email)) {
    return { step: "email", error: t("public.auth.actions.invalidEmail"), email };
  }

  const ip = await requestIp();
  const tooMany = () =>
    resent
      ? ({ step: "code", error: t("public.auth.passwordless.errors.tooMany"), email } as const)
      : ({ step: "email", error: t("public.auth.passwordless.errors.tooMany"), email } as const);

  // Layer 2 — free in-process floor first, so a hot loop never even reaches the
  // network hop.
  if (
    !tryConsumeRateLimit(`auth-otp-send:${email}`, SEND_PER_EMAIL, SEND_WINDOW_MS) ||
    !tryConsumeRateLimit(`auth-otp-send-ip:${ip}`, SEND_PER_IP, SEND_WINDOW_MS)
  ) {
    return tooMany();
  }

  // Layer 1 — durable cross-instance ceiling. Checked BEFORE signInWithOtp so a
  // blocked caller costs no outbound email. Fails open on Upstash trouble.
  const [sendByEmail, sendByIp] = await Promise.all([
    checkAuthOtpSendByEmail(authOtpSendEmailKey(email)),
    checkAuthOtpSendByIp(authOtpSendIpKey(ip)),
  ]);
  if (!sendByEmail.ok || !sendByIp.ok) {
    return tooMany();
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { step: "email", error: SUPABASE_ENV_HELP, email };
  }

  const nextPath = normalizeNextPath(String(formData.get("next") ?? "").trim());
  // `create=0` is the LOGIN path: an unknown address must not silently become a
  // brand-new empty account just because someone typed it into the sign-in box.
  const shouldCreateUser = String(formData.get("create") ?? "1") !== "0";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser,
      emailRedirectTo: buildOtpEmailRedirect({
        origin: getAppUrl(),
        nextPath,
        lang: otpLang(formData),
      }),
    },
  });

  if (error) {
    logServerError("auth/requestEmailCode", error);
    const key = otpSendErrorKey(error);
    // Account enumeration: on the LOGIN path a "no such user" (otp_disabled)
    // answer would confirm which addresses exist. Same treatment as
    // requestPasswordReset — advance to the code screen either way and let the
    // (absent) code fail there, with a create-account link in reach. Real
    // problems the visitor can act on (bad address, rate limit) still surface.
    const enumerationSafe =
      !shouldCreateUser && key === "public.auth.actions.signupDisabled";
    if (!enumerationSafe) {
      return resent
        ? { step: "code", error: t(key), email }
        : { step: "email", error: t(key), email };
    }
  }

  return {
    step: "sent",
    email,
    resent,
    notice: resent
      ? t("public.auth.passwordless.resentNotice")
      : t("public.auth.passwordless.sentNotice"),
  };
}

export async function submitEmailCode(
  _prev: EmailCodeState,
  formData: FormData,
): Promise<EmailCodeState> {
  const t = otpT(formData);
  const email = normalizeAuthEmail(formData.get("email"));
  const code = normalizeOtpCode(formData.get("code"));

  if (!email || !isValidAuthEmail(email)) {
    return { step: "email", error: t("public.auth.actions.invalidEmail"), email };
  }
  if (!isCompleteOtpCode(code)) {
    return {
      step: "code",
      error: t("public.auth.passwordless.errors.codeRequired"),
      email,
    };
  }

  // Brute-force ceiling on guessing the emailed code: in-process floor first,
  // then the durable cross-instance window (checked before verifyOtp).
  if (!tryConsumeRateLimit(`auth-otp-verify:${email}`, VERIFY_PER_EMAIL, SEND_WINDOW_MS)) {
    return { step: "code", error: t("public.auth.passwordless.errors.tooMany"), email };
  }
  const verifyByEmail = await checkAuthOtpVerifyByEmail(authOtpVerifyEmailKey(email));
  if (!verifyByEmail.ok) {
    return { step: "code", error: t("public.auth.passwordless.errors.tooMany"), email };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { step: "code", error: SUPABASE_ENV_HELP, email };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    // "email" covers both the signup and magiclink OTPs Supabase issues for
    // signInWithOtp, so one call handles a new booker and a returning one.
    type: "email",
  });
  if (error) {
    logServerError("auth/submitEmailCode", error);
    const tenantId = await auditTenantId();
    if (tenantId) {
      scheduleWorkspaceAudit({
        tenantId,
        category: "security",
        action: "auth.sign_in_failed",
        summary: "Failed email-code sign-in attempt",
        actorUserId: null,
        actorLabel: email,
        actorKind: "guest",
      });
    }
    return { step: "code", error: t(otpVerifyErrorKey(error)), email };
  }

  const user = data.user;
  if (user) {
    // First-confirm-wins guest-chat claim relink — the same mechanism the
    // emailed-link route runs, so a booker who types the code keeps the
    // conversation they started as a guest. Best-effort + non-fatal.
    await relinkFirstConfirmedClaim(user.id);
  }

  const profileData = user ? await loadAccessProfile(supabase, user.id) : null;

  if (user) {
    const tenantId = await auditTenantId();
    if (tenantId) {
      scheduleWorkspaceAudit({
        tenantId,
        category: "auth",
        action: "auth.signed_in",
        summary: "Signed in with an emailed code",
        actorUserId: user.id,
        actorLabel: user.email ?? email,
        actorKind: auditActorKind(profileData?.app_role),
      });
    }
  }

  const nextPath = normalizeNextPath(String(formData.get("next") ?? "").trim());
  revalidatePath("/", "layout");
  // Host-safe: /client and /onboarding/* do not exist on the marketing apex or
  // the hub, where this form is also served. A relative redirect there is a 404.
  redirect(
    await hostSafeRedirectDestination(
      resolvePostAuthDestination(profileData, nextPath),
    ),
  );
}
