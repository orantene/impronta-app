import { ForgotPasswordForm } from "./forgot-password-form";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; email?: string }>;
}) {
  const { notice, email } = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{t("public.auth.forgot.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("public.auth.forgot.description")}
        </p>
      </div>
      {notice === "expired" ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-foreground">
          {t("public.auth.forgot.expired")}
        </p>
      ) : null}
      <ForgotPasswordForm
        defaultEmail={email ? decodeURIComponent(email) : undefined}
        locale={locale}
      />
    </div>
  );
}
