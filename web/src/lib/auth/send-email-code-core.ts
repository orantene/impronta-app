/**
 * TUL-16 (a) — the testable core of `requestEmailCode` (app/auth/otp-actions.ts).
 *
 * The server action owns request plumbing (headers, Upstash, the cached
 * Supabase client). Everything that decides WHAT the visitor sees lives here,
 * behind injected deps, so a unit test can drive it with a fake Supabase
 * client. `mock.module` is unusable under tsx, hence the injection.
 *
 * Security contract (login path, `shouldCreateUser: false`):
 *   - an unknown address never becomes an account;
 *   - an unknown address gets the SAME "code sent" answer as a known one, so
 *     the sign-in box cannot be used to learn which emails are registered;
 *   - both rate-limit layers run BEFORE `signInWithOtp`, so a blocked caller
 *     costs no outbound email.
 */

import { signupNameMetadata } from "@/lib/auth/signup-name";
import {
  authEmailHasPlusTag,
  otpSendErrorKey,
} from "@/lib/auth/otp-flow";

/** `sent` drives the form's step; `email` is echoed back into the code screen. */
export type EmailCodeState =
  | { step: "sent"; email: string; resent: boolean; notice: string }
  | { step: "email"; error: string; email?: string }
  | { step: "code"; error: string; email: string }
  | undefined;

/** The slice of the Supabase client this core touches. */
export type OtpSendClient = {
  auth: {
    signInWithOtp(args: {
      email: string;
      options: { shouldCreateUser: boolean; emailRedirectTo: string; data?: Record<string, unknown> };
    }): Promise<{ error: unknown }>;
  };
};

export type SendEmailCodeDeps = {
  t: (key: string) => string;
  /** In-process floor; returns false when the window is spent. */
  consumeFloor: (key: string) => boolean;
  /** Durable cross-instance ceiling; returns false when blocked. */
  checkDurable: () => Promise<boolean>;
  getClient: () => Promise<OtpSendClient | null>;
  envHelp: string;
  emailRedirectTo: string;
  /** Stored on a NEW user (user_metadata) so the auth-email hook can still pick the language if redirect_to loses `?lang=` (TUL-814). */
  newUserData?: Record<string, unknown>;
  logError?: (scope: string, error: unknown) => void;
};

export async function sendEmailCodeCore(
  input: { email: string; ip: string; resent: boolean; shouldCreateUser: boolean; fullName?: string | null },
  deps: SendEmailCodeDeps,
): Promise<EmailCodeState> {
  const { email, ip, resent, shouldCreateUser } = input;
  // TUL-762: the name is only meaningful when this send can create the account.
  const nameData = shouldCreateUser ? signupNameMetadata(input.fullName) : undefined;
  // TUL-814 language + TUL-762 name both ride on the new user's metadata.
  const userData = deps.newUserData || nameData ? { ...deps.newUserData, ...nameData } : undefined;
  const { t } = deps;
  const fail = (error: string): EmailCodeState =>
    resent ? { step: "code", error, email } : { step: "email", error, email };

  // Both floors are consumed (no short circuit) so an IP that rotates
  // addresses still spends its IP budget on every attempt.
  const emailOk = deps.consumeFloor(`auth-otp-send:${email}`);
  const ipOk = deps.consumeFloor(`auth-otp-send-ip:${ip}`);
  if (!emailOk || !ipOk) return fail(t("public.auth.passwordless.errors.tooMany"));
  if (!(await deps.checkDurable())) {
    return fail(t("public.auth.passwordless.errors.tooMany"));
  }

  const client = await deps.getClient();
  if (!client) return fail(deps.envHelp);

  let error: unknown = null;
  try {
    ({ error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser, emailRedirectTo: deps.emailRedirectTo, ...(userData ? { data: userData } : {}) },
    }));
  } catch (thrown) {
    error = thrown;
  }

  if (error) {
    deps.logError?.("auth/requestEmailCode", error);
    const key = otpSendErrorKey(error);
    // Account enumeration: on the LOGIN path, "no such user" (Supabase answers
    // otp_disabled / signup_disabled / user_not_found) must look exactly like a
    // successful send. Only problems the visitor can act on, and that do not
    // depend on whether the account exists (bad address, rate limit), surface.
    const actionable =
      key === "public.auth.actions.invalidEmail" ||
      key === "public.auth.passwordless.errors.tooMany";
    if (shouldCreateUser || actionable) return fail(t(key));
  }

  // TUL-558: plus-tag inboxes often never get the OTP. Depends only on the
  // typed address, never on whether the account exists.
  const noticeKey = authEmailHasPlusTag(email)
    ? resent
      ? "public.auth.passwordless.plusResentNotice"
      : "public.auth.passwordless.plusSentNotice"
    : resent
      ? "public.auth.passwordless.resentNotice"
      : "public.auth.passwordless.sentNotice";

  return { step: "sent", email, resent, notice: t(noticeKey) };
}
