import type { Metadata } from "next";

import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildPublicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return buildPublicPageMetadata("contact", locale);
}

export default async function ContactPage() {
  const t = createTranslator(await getRequestLocale());

  return (
    <main className="w-full px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-normal tracking-wide text-foreground">
          {t("public.contact.title")}
        </h1>
        <p className="mt-6 text-muted-foreground">{t("public.contact.body")}</p>
      </div>
    </main>
  );
}
