import type { Metadata } from "next";

import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { contactMessagePrefill } from "@/lib/service-hub/roster-request";

import { ContactInquiryForm } from "../../contact/ContactInquiryForm";

/**
 * TUL-1844: the request form a roster or hub "Request" button opens. It lives under `/book`
 * (always reachable on a business host) because `/contact` is an owner-made CMS page there and
 * 404s when the owner never made one. Same inquiry action as /contact; `?message=` only prefills.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: true } };
}

export default async function BookRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string | string[] }>;
}) {
  const t = createTranslator(await getRequestLocale());
  const defaultMessage = contactMessagePrefill(await searchParams);
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
        <h1 className="font-display text-3xl font-normal tracking-wide text-foreground">{t("public.contact.title")}</h1>
        <p className="mt-6 text-muted-foreground">{t("public.contact.body")}</p>
        <ContactInquiryForm copy={copy} defaultMessage={defaultMessage} />
      </div>
    </main>
  );
}
