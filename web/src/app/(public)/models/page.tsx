import type { Metadata } from "next";

import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildPublicLocaleAlternates } from "@/lib/seo/locale-alternates";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  return {
    title: t("public.meta.modelsTitle"),
    description: t("public.meta.modelsDescription"),
    ...buildPublicLocaleAlternates(locale, "/models"),
  };
}

export default async function ModelsPage() {
  const t = createTranslator(await getRequestLocale());

  return (
    <main className="w-full px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-normal tracking-wide text-foreground">
          {t("public.models.title")}
        </h1>
        <p className="mt-6 text-muted-foreground">{t("public.models.body")}</p>
      </div>
    </main>
  );
}
