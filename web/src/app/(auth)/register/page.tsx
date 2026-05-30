import { cookies } from "next/headers";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import {
  buildWorkspaceOnboardingPath,
  WORKSPACE_SIGNUP_INTENT,
} from "@/lib/saas/workspace-signup";
import { loadWorkspaceLeadEmail } from "@/lib/saas/workspace-signup-lead.server";
import { readInviteFromCookieStore } from "@/lib/invites/cookie";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { RegisterForm } from "./register-form";

async function loadInviterAgencyName(): Promise<string | null> {
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

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    intent?: string;
    lead?: string;
    next?: string;
  }>;
}) {
  const { error, intent, lead, next } = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const workspaceLeadId = typeof lead === "string" && lead ? lead : null;
  const workspaceIntent = intent === WORKSPACE_SIGNUP_INTENT && workspaceLeadId;
  const nextPath = workspaceIntent
    ? buildWorkspaceOnboardingPath(workspaceLeadId)
    : normalizeOptionalNextPath(next);

  // Pre-fill the email the operator already typed in the get-started funnel
  // so the email/password path doesn't make them retype it. Resolved
  // server-side from the lead id (never passed through the URL — it's PII).
  // Null on any miss; the field just renders empty, never blocks signup.
  const leadEmail =
    workspaceIntent && workspaceLeadId
      ? await loadWorkspaceLeadEmail(workspaceLeadId)
      : null;

  // E.5 — Surface inviter context when the visitor came from /invite/[token].
  const isInviteFlow = !workspaceIntent && nextPath?.startsWith("/invite/");
  const inviterAgencyName = isInviteFlow ? await loadInviterAgencyName() : null;

  const title = workspaceIntent
    ? t("public.auth.register.operatorTitle")
    : inviterAgencyName
      ? t("public.auth.register.inviteTitle").replace("{agency}", inviterAgencyName)
      : t("public.auth.register.title");
  const description = workspaceIntent
    ? t("public.auth.register.operatorDescription")
    : inviterAgencyName
      ? t("public.auth.register.inviteDescription").replace("{agency}", inviterAgencyName)
      : t("public.auth.register.description");
  const googleLabel = workspaceIntent
    ? t("public.auth.register.googleContinue")
    : t("public.auth.register.google");
  const emailLabel = workspaceIntent
    ? t("public.auth.register.operatorSubmit")
    : inviterAgencyName
      ? t("public.auth.register.inviteSubmit")
      : t("public.auth.register.emailSubmit");

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
        {googleLabel}
      </GoogleAuthButton>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t("public.auth.or")}</span>
        </div>
      </div>
      <RegisterForm
        nextPath={nextPath}
        submitLabel={emailLabel}
        locale={locale}
        defaultEmail={leadEmail ?? undefined}
      />
    </div>
  );
}
