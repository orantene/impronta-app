import { redirect } from "next/navigation";
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
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{t("public.auth.update.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("public.auth.update.description")}
        </p>
      </div>
      <UpdatePasswordForm locale={locale} />
    </div>
  );
}
