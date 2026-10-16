import { getRequestLocale } from "@/i18n/request-locale";
import { MarketingShell } from "@/components/marketing/shell";
import { getMarketingSupportCopy } from "@/lib/marketing/support-copy";
import { verifyGuestResumeToken } from "@/lib/support/guest-resume-token";
import { resolveResumeLocale } from "@/lib/support/resume-locale";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { supportFrom } from "@/lib/support/support-from";
import { MarketingContactForm } from "./MarketingContactForm";
import { MarketingContactResume } from "./MarketingContactResume";

export async function MarketingContactPage({
  token,
  talentSite,
}: {
  token?: string;
  talentSite?: { source: string; host: string | null; code: string | null } | null;
}) {
  const requestLocale = await getRequestLocale();
  let locale = requestLocale;
  let resumeToken: string | null = null;
  if (token) {
    // Pure signature check only: the thread is re-bound client-side by a
    // server action, because rendering cannot set the guest cookie.
    const verified = verifyGuestResumeToken(token);
    resumeToken = token;
    if (verified.ok) {
      const admin = createServiceRoleClient();
      const res: { data?: { metadata?: { locale?: unknown } } | null } | null = admin
        ? await supportFrom(admin, "support_tickets")
            .select("metadata")
            .eq("id", verified.ticketId)
            .maybeSingle()
        : null;
      locale = resolveResumeLocale(res?.data?.metadata?.locale, requestLocale) as typeof requestLocale;
    }
  }
  const copy = getMarketingSupportCopy(locale);
  const actor = resumeToken ? await getCachedActorSession() : null;

  return (
    <MarketingShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        {resumeToken ? (
          <MarketingContactResume
            token={resumeToken}
            locale={locale === "es" ? "es" : "en"}
            signedIn={Boolean(actor?.user)}
          />
        ) : (
          <>
            <h1 className="font-display text-3xl font-normal tracking-wide">{copy.contactTitle}</h1>
            <p className="mt-4 text-[var(--plt-ink-soft)]">{copy.contactBody}</p>
            <MarketingContactForm locale={locale} talentSite={talentSite} />
          </>
        )}
      </main>
    </MarketingShell>
  );
}
