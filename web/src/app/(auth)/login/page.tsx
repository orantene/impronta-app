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
  searchParams: Promise<{ error?: string; next?: string; email?: string; reason?: string }>;
}) {
  const { error, next, email, reason } = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const nextPath = normalizeOptionalNextPath(next);
  // E.5 — surface inviter context when /login was reached via /invite/[token].
  const inviterAgencyName = await loadInviterAgencyName(nextPath);

  const title = inviterAgencyName
    ? t("public.auth.login.inviteTitle").replace("{agency}", inviterAgencyName)
    : t("public.auth.login.title");
  const description = inviterAgencyName
    ? t("public.auth.login.inviteDescription").replace("{agency}", inviterAgencyName)
    : t("public.auth.login.description");

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

        <LoginForm
          nextPath={nextPath}
          defaultEmail={email ? decodeURIComponent(email) : undefined}
          locale={locale}
        />

        <p
          className="mt-5 text-center text-[0.8125rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {t("public.auth.login.noAccount")}{" "}
          <Link
            href={
              nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : "/register"
            }
            className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {t("public.auth.login.signUp")}
          </Link>
        </p>
      </AuthCard>
    </div>
  );
}
