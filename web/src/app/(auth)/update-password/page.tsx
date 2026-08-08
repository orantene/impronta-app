import { redirect } from "next/navigation";
import { AuthCard, AuthHeading } from "@/components/auth/auth-ui";
import { UpdatePasswordForm } from "./update-password-form";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export default async function UpdatePasswordPage() {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    redirect("/login?error=config");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/forgot-password?notice=expired");
  }

  return (
    <div className="w-full">
      <AuthHeading
        eyebrow={t("public.auth.update.eyebrow")}
        title={t("public.auth.update.title")}
        description={t("public.auth.update.description")}
      />
      <AuthCard>
        <UpdatePasswordForm locale={locale} />
      </AuthCard>
    </div>
  );
}
