import { cookies } from "next/headers";
import Link from "next/link";
import {
  AuthCard,
  AuthDivider,
  AuthHeading,
  AuthNotice,
} from "@/components/auth/auth-ui";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import { readInviteFromCookieStore } from "@/lib/invites/cookie";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { prefersPasswordlessFirst } from "@/lib/auth/otp-flow";
import { buildRegisterHref, readRegisterIntent } from "@/lib/auth/register-intent";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { LoginForm } from "./login-form";
import { LoginGoogleButton } from "./login-google-button";

async function loadInviterAgencyName(nextPath: string | undefined): Promise<string | null> {
  if (!nextPath?.startsWith("/invite/")) return null;
  try {
    const store = await cookies();
    const payload = readInviteFromCookieStore({ get: (name) => store.get(name) });
    if (!payload) return null;
    const supabase = createPublicSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from("agency_business_identity")
      .select("public_name")
      .eq("tenant_id", payload.inviterTenantId)
      .maybeSingle();
    return (data as { public_name?: string | null } | null)?.public_name?.trim() || null;
  } catch {
    return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    next?: string;
    email?: string;
    reason?: string;
    /** P4 — `client` makes this screen passwordless-first (see below). */
    as?: string;
    role?: string;
  }>;
}) {
  const params = await searchParams;
  const { error, next, email, reason } = params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const nextPath = normalizeOptionalNextPath(next);
  // P4 — a booker who arrived from the client funnel (/register?as=client, the
  // talent-portal inquiry CTA, a client-side "sign in" link) gets the emailed
  // code first. Operators and talent keep the password form as their default:
  // /login with no intent is byte-identical to before.
  const passwordlessFirst = prefersPasswordlessFirst(readRegisterIntent(params));
  // E.5 — surface inviter context when /login was reached via /invite/[token].
  const inviterAgencyName = await loadInviterAgencyName(nextPath);

  const title = inviterAgencyName
    ? t("public.auth.login.inviteTitle").replace("{agency}", inviterAgencyName)
    : t("public.auth.login.title");
  const description = inviterAgencyName
    ? t("public.auth.login.inviteDescription").replace("{agency}", inviterAgencyName)
    : t("public.auth.login.description");

  // One copy of the sign-up line for both lanes. The client lane keeps its
  // intent on the href so /register stays passwordless-first too.
  const signUpFooter = (
    <p
      className="mt-5 text-center text-[0.8125rem]"
      style={{ color: "var(--plt-muted)" }}
    >
      {t("public.auth.login.noAccount")}{" "}
      <Link
        href={
          passwordlessFirst
            ? buildRegisterHref("client", nextPath ? { next: nextPath } : {})
            : nextPath
              ? `/register?next=${encodeURIComponent(nextPath)}`
              : "/register"
        }
        className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
        style={{ color: "var(--plt-ink-soft)" }}
      >
        {t("public.auth.login.signUp")}
      </Link>
    </p>
  );

  return (
    <div className="w-full">
      <AuthHeading
        eyebrow={t("public.auth.login.eyebrow")}
        title={title}
        description={description}
      />

      <AuthCard>
        {!error && reason === "session_expired" ? (
          <AuthNotice tone="info" align="center" className="mb-4">
            {t("public.auth.login.sessionExpired")}
          </AuthNotice>
        ) : null}

        {error ? (
          <AuthNotice tone="error" align="center" className="mb-4">
            {decodeURIComponent(error)}
          </AuthNotice>
        ) : null}

        <LoginGoogleButton
          nextPath={nextPath}
          label={t("public.auth.login.google")}
          pendingLabel={t("public.auth.googleOpening")}
          failedLabel={t("public.auth.googleFailed")}
          popupBlockedMessage={t("public.auth.googlePopupBlocked")}
          unableToStartMessage={t("public.auth.googleUnableToStart")}
        />

        <AuthDivider label={t("public.auth.or")} />

        {passwordlessFirst ? (
          <EmailCodeForm
            nextPath={nextPath}
            locale={locale}
            defaultEmail={email ? decodeURIComponent(email) : undefined}
            // Sign-IN must not mint an account for a mistyped address.
            allowCreate={false}
            passwordFallback={
              <LoginForm
                nextPath={nextPath}
                defaultEmail={email ? decodeURIComponent(email) : undefined}
                locale={locale}
              />
            }
            footer={signUpFooter}
          />
        ) : (
          <>
            <LoginForm
              nextPath={nextPath}
              defaultEmail={email ? decodeURIComponent(email) : undefined}
              locale={locale}
            />
            {signUpFooter}
          </>
        )}
      </AuthCard>
    </div>
  );
}
