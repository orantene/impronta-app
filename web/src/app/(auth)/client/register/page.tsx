import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import {
  AuthCard,
  AuthDivider,
  AuthHeading,
  AuthNotice,
} from "@/components/auth/auth-ui";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import { getPublicHostContext } from "@/lib/saas/scope";
import { RegisterForm } from "../../register/register-form";

/**
 * Phase 3.14 — Branded client registration entry point.
 *
 * Lives in the (auth) route group so it is reachable by unauthenticated
 * visitors. On an agency host (e.g. improntamodels.com/client/register),
 * post-auth destination is automatically scoped to /<slug>/client so the
 * new client lands in the right workspace.
 */
export default async function ClientRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  // Determine post-auth destination. On an agency host with a known slug
  // redirect to /<slug>/client; fall back to /client for app host.
  const hostCtx = await getPublicHostContext();
  const defaultNext =
    hostCtx.kind === "agency" && hostCtx.tenantSlug
      ? `/${hostCtx.tenantSlug}/client`
      : "/client";

  // Honour an explicit ?next= override only if it is a valid internal path.
  const nextPath = normalizeOptionalNextPath(next) ?? defaultNext;

  return (
    <div className="w-full">
      <AuthHeading
        eyebrow={t("public.auth.roleRegister.clientEyebrow")}
        title={t("public.auth.roleRegister.clientTitle")}
        description={t("public.auth.roleRegister.clientDescription")}
      />

      <AuthCard>
        {error ? (
          <AuthNotice tone="error" align="center" className="mb-4">
            {decodeURIComponent(error)}
          </AuthNotice>
        ) : null}

        <GoogleAuthButton
          nextPath={nextPath}
          pendingLabel={t("public.auth.googleOpening")}
          failedLabel={t("public.auth.googleFailed")}
          popupBlockedMessage={t("public.auth.googlePopupBlocked")}
          unableToStartMessage={t("public.auth.googleUnableToStart")}
        >
          {t("public.auth.register.google")}
        </GoogleAuthButton>

        <AuthDivider label={t("public.auth.or")} />

        <RegisterForm nextPath={nextPath} locale={locale} />
      </AuthCard>
    </div>
  );
}
