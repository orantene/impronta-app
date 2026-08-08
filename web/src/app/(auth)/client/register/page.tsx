import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { getAppUrl, normalizeOptionalNextPath } from "@/lib/auth-flow";
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
  // redirect to /<slug>/client; on the app host, /client. On the marketing
  // apex (tulala.digital) and hub hosts, `/client` is NOT an allowed path —
  // the workspace lives on the app host — so a relative default 404'd
  // ("Host not registered" class). Send those hosts to the app host
  // absolutely; the `.tulala.digital` session cookie spans both.
  const hostCtx = await getPublicHostContext();
  const defaultNext =
    hostCtx.kind === "agency" && hostCtx.tenantSlug
      ? `/${hostCtx.tenantSlug}/client`
      : hostCtx.kind === "app"
        ? "/client"
        : `${getAppUrl()}/client`;

  // Honour an explicit ?next= override only if it is a valid internal path.
  const nextPath = normalizeOptionalNextPath(next) ?? defaultNext;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">
          {t("public.auth.roleRegister.clientTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("public.auth.roleRegister.clientDescription")}
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
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

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t("public.auth.or")}</span>
        </div>
      </div>

      <RegisterForm nextPath={nextPath} locale={locale} />
    </div>
  );
}
