import { cookies } from "next/headers";
import Link from "next/link";
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
    <div className="w-full">
      {/* Eyebrow */}
      <p
        className="plt-mono text-center text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--plt-forest)" }}
      >
        Sign in
      </p>

      {/* Title */}
      <h1
        className="plt-display mt-2 text-center text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[2rem]"
        style={{ color: "var(--plt-ink)" }}
      >
        {title}
      </h1>
      <p
        className="mx-auto mt-2 max-w-[360px] text-center text-[0.9375rem] leading-[1.5]"
        style={{ color: "var(--plt-muted)" }}
      >
        {description}
      </p>

      {/* Card */}
      <div
        className="mt-7 rounded-[28px] p-7 sm:p-9"
        style={{
          background: "var(--plt-bg-elevated)",
          border: "1px solid var(--plt-hairline-strong)",
          boxShadow:
            "0 24px 60px -28px rgba(15,23,20,0.32), 0 2px 6px -2px rgba(15,23,20,0.06)",
        }}
      >
        {error ? (
          <p
            role="alert"
            className="mb-4 rounded-xl px-3 py-2 text-center text-[0.8125rem]"
            style={{
              background: "rgba(180, 35, 24, 0.08)",
              color: "#9b1c14",
              border: "1px solid rgba(180, 35, 24, 0.18)",
            }}
          >
            {decodeURIComponent(error)}
          </p>
        ) : null}

        <LoginGoogleButton
          nextPath={nextPath}
          label={t("public.auth.login.google")}
          pendingLabel={t("public.auth.googleOpening")}
          failedLabel={t("public.auth.googleFailed")}
          popupBlockedMessage={t("public.auth.googlePopupBlocked")}
          unableToStartMessage={t("public.auth.googleUnableToStart")}
        />

        <div className="my-4 flex items-center gap-3">
          <div
            className="h-px flex-1"
            style={{ background: "var(--plt-hairline)" }}
          />
          <span
            className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.22em]"
            style={{ color: "var(--plt-muted)" }}
          >
            {t("public.auth.or")}
          </span>
          <div
            className="h-px flex-1"
            style={{ background: "var(--plt-hairline)" }}
          />
        </div>

        <LoginForm
          nextPath={nextPath}
          defaultEmail={email ? decodeURIComponent(email) : undefined}
          locale={locale}
        />
      </div>

      <p
        className="mt-5 text-center text-[0.8125rem]"
        style={{ color: "var(--plt-muted)" }}
      >
        {t("public.auth.login.noAccount")}{" "}
        <Link
          href={nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : "/register"}
          className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
          style={{ color: "var(--plt-ink-soft)" }}
        >
          {t("public.auth.login.signUp")}
        </Link>
      </p>
    </div>
  );
}
