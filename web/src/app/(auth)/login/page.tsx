import { cookies } from "next/headers";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import { readInviteFromCookieStore } from "@/lib/invites/cookie";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { LoginForm } from "./login-form";

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
  searchParams: Promise<{ error?: string; next?: string; email?: string }>;
}) {
  const { error, next, email } = await searchParams;
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
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
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
        {t("public.auth.login.google")}
      </GoogleAuthButton>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t("public.auth.or")}</span>
        </div>
      </div>
      <LoginForm
        nextPath={nextPath}
        defaultEmail={email ? decodeURIComponent(email) : undefined}
        locale={locale}
      />
    </div>
  );
}
