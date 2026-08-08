import { AuthCard, AuthHeading, AuthNotice } from "@/components/auth/auth-ui";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; email?: string }>;
}) {
  const { notice, email } = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  return (
    <div className="w-full">
      <AuthHeading
        eyebrow={t("public.auth.forgot.eyebrow")}
        title={t("public.auth.forgot.title")}
        description={t("public.auth.forgot.description")}
      />

      <AuthCard>
        {notice === "expired" ? (
          <AuthNotice tone="info" align="center" className="mb-4">
            {t("public.auth.forgot.expired")}
          </AuthNotice>
        ) : null}

        <ForgotPasswordForm
          defaultEmail={email ? decodeURIComponent(email) : undefined}
          locale={locale}
        />
      </AuthCard>
    </div>
  );
}
