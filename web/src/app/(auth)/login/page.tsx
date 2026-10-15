import type { Metadata, ResolvingMetadata } from "next";
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
import { withLocaleHref } from "@/i18n/pathnames";
import { getSiteUrl, isTalentSignupNext, normalizeOptionalNextPath } from "@/lib/auth-flow";
import { readInviteFromCookieStore } from "@/lib/invites/cookie";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { prefersPasswordlessFirst } from "@/lib/auth/otp-flow";
import { buildRegisterHref, readRegisterIntent } from "@/lib/auth/register-intent";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { resolveShowCardLocaleToggle } from "@/lib/auth/card-locale-toggle.server";
import { AuthCardLocaleToggle } from "@/components/auth/auth-card-locale-toggle";
import { getPublicHostContext } from "@/lib/saas/scope";
import { getOnboardingFlags } from "@/lib/settings/onboarding-flags";
import { legacySignupRedirect } from "@/lib/onboarding/legacy-signup-redirect";
import { legacyFlowLang } from "@/lib/onboarding/legacy-signup-redirect.server";
import { LoginForm } from "./login-form";
import { isAppleAuthProviderEnabled } from "@/lib/auth/apple-provider-flag";
import { LoginAppleButton } from "./login-apple-button";
import { LoginGoogleButton } from "./login-google-button";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

/**
 * The tab reads "Iniciar sesión · Tulala" / "Log in · Tulala" in the request
 * language. A whitelabel agency title set by the auth layout (TUL-64) wins.
 */
export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const inherited = (await parent).title?.absolute;
  if (inherited && inherited !== `${PLATFORM_BRAND.name} · ${PLATFORM_BRAND.tagline}`) return {};
  const t = createTranslator(await getRequestLocale());
  return { title: t("public.auth.login.title") };
}

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
  const showCardToggle = await resolveShowCardLocaleToggle();
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
  // A1-2 (TUL-518): subtitle must not promise Apple while AUTH_APPLE_PROVIDER_ENABLED is off.
  const appleSignInEnabled = isAppleAuthProviderEnabled();
  const description = inviterAgencyName
    ? t("public.auth.login.inviteDescription").replace("{agency}", inviterAgencyName)
    : t(
        appleSignInEnabled
          ? "public.auth.login.description"
          : "public.auth.login.descriptionNoApple",
      );

  // TUL-117: a pro's "create account" goes to the guided /start flow. Client
  // links, invites and anything with a non-talent `next` keep /register.
  const proStartUrl = passwordlessFirst
    ? null
    : legacySignupRedirect({
        flagOn: (await getOnboardingFlags()).onboarding_module_enabled,
        surface: "register",
        siteUrl: getSiteUrl(),
        lang: await legacyFlowLang(),
        hostKind: (await getPublicHostContext()).kind,
        intent: readRegisterIntent(params),
        next: nextPath ?? null,
        nextIsTalentSignup: nextPath ? isTalentSignupNext(nextPath) : false,
      });

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
          proStartUrl
            ? proStartUrl
            : withLocaleHref(
                passwordlessFirst
                  ? buildRegisterHref("client", nextPath ? { next: nextPath } : {})
                  : nextPath
                    ? `/register?next=${encodeURIComponent(nextPath)}`
                    : "/register",
                locale,
              )
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
        {showCardToggle ? (
          <AuthCardLocaleToggle locale={locale} label={t("public.auth.language")} />
        ) : null}
        {!error && reason === "session_expired" ? (
          <AuthNotice tone="info" align="center" className="mb-4">
            {t("public.auth.login.sessionExpired")}
          </AuthNotice>
        ) : null}

        {error ? (
          <AuthNotice tone="error" align="center" className="mb-4">
            {error === "auth"
              ? t("public.auth.login.linkExpired")
              : decodeURIComponent(error)}
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

        {/*
         * TUL-65: Apple next to Google (App Store Guideline 4.8). Render only
         * when AUTH_APPLE_PROVIDER_ENABLED is on — set after Supabase Apple
         * provider config (Services ID, Team ID, Key ID, private key).
         */}
        {appleSignInEnabled ? (
          <div className="mt-3">
            <LoginAppleButton
              nextPath={nextPath}
              label={t("public.auth.login.apple")}
              pendingLabel={t("public.auth.appleOpening")}
              failedLabel={t("public.auth.appleFailed")}
              popupBlockedMessage={t("public.auth.applePopupBlocked")}
              unableToStartMessage={t("public.auth.appleUnableToStart")}
            />
          </div>
        ) : null}

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
          // TUL-16 (a): password first, but a passwordless account (magic
          // link or Google) can always ask for an emailed code from here.
          <EmailCodeForm
            nextPath={nextPath}
            locale={locale}
            defaultEmail={email ? decodeURIComponent(email) : undefined}
            allowCreate={false}
            startWithPassword
            passwordFallback={
              <LoginForm
                nextPath={nextPath}
                defaultEmail={email ? decodeURIComponent(email) : undefined}
                locale={locale}
              />
            }
            footer={signUpFooter}
          />
        )}
      </AuthCard>
    </div>
  );
}
