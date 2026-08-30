import type { Metadata } from "next";

import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildPublicPageMetadata } from "@/lib/seo/public-metadata";
import { getPublicHostContext } from "@/lib/saas/scope";
import { MarketingContactPage } from "@/components/marketing/support/MarketingContactPage";

import { ContactInquiryForm } from "./ContactInquiryForm";

/** Host-dispatched: marketing hosts must not prerender the tenant form. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return buildPublicPageMetadata("contact", locale);
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const ctx = await getPublicHostContext();
  if (ctx.kind === "marketing") {
    const params = await searchParams;
    return <MarketingContactPage token={typeof params.t === "string" ? params.t : undefined} />;
  }

  const t = createTranslator(await getRequestLocale());

  const copy = {
    nameLabel: t("public.contact.form.nameLabel"),
    emailLabel: t("public.contact.form.emailLabel"),
    phoneLabel: t("public.contact.form.phoneLabel"),
    messageLabel: t("public.contact.form.messageLabel"),
    messagePlaceholder: t("public.contact.form.messagePlaceholder"),
    submit: t("public.contact.form.submit"),
    submitting: t("public.contact.form.submitting"),
    privacy: t("public.contact.form.privacy"),
    successTitle: t("public.contact.form.successTitle"),
    successBody: t("public.contact.form.successBody"),
    successBodyWithEmail: t("public.contact.form.successBodyWithEmail"),
    sendAnother: t("public.contact.form.sendAnother"),
  };

  return (
    <main className="w-full px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-normal tracking-wide text-foreground">
          {t("public.contact.title")}
        </h1>
        <p className="mt-6 text-muted-foreground">{t("public.contact.body")}</p>

        <ContactInquiryForm copy={copy} />
      </div>
    </main>
  );
}
