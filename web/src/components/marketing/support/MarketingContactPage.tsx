import { getRequestLocale } from "@/i18n/request-locale";
import { MarketingShell } from "@/components/marketing/shell";
import { getMarketingSupportCopy } from "@/lib/marketing/support-copy";
import { resumeGuestThreadAction } from "@/lib/support/guest-actions";
import { MarketingContactForm } from "./MarketingContactForm";
import { MarketingContactResume } from "./MarketingContactResume";

export async function MarketingContactPage({ token }: { token?: string }) {
  const locale = await getRequestLocale();
  const copy = getMarketingSupportCopy(locale);
  let resumeTicketId: string | null = null;
  if (token) {
    const resumed = await resumeGuestThreadAction({ token });
    if (resumed.ok) resumeTicketId = resumed.ticketId;
  }

  return (
    <MarketingShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        {resumeTicketId ? <MarketingContactResume ticketId={resumeTicketId} /> : null}
        <h1 className="font-display text-3xl font-normal tracking-wide">{copy.contactTitle}</h1>
        <p className="mt-4 text-[var(--plt-ink-soft)]">{copy.contactBody}</p>
        <MarketingContactForm locale={locale} />
      </main>
    </MarketingShell>
  );
}
