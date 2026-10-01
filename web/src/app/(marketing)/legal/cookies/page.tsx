import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

// DRAFT PENDING LEGAL REVIEW (2026-10-01). The table mirrors section 5 of the
// legal inventory report. Update it whenever a cookie or storage key is added.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "Cookies", es: "Cookies" }),
    description: pickLocale(locale, {
      en: `The cookies and browser storage ${PLATFORM_BRAND.name} uses, and how to control them.`,
      es: `Las cookies y el almacenamiento del navegador que usa ${PLATFORM_BRAND.name}, y cómo controlarlos.`,
    }),
    ...buildMarketingLocaleAlternates(locale, "/legal/cookies"),
  };
}

type Row = readonly [name: string, purpose: string, who: string, duration: string];

const ESSENTIAL: readonly Row[] = [
  ["sb-*-auth-token, sb-*-code-verifier", "Keeps you signed in; sign-in security", "Supabase", "Up to about 400 days"],
  ["impronta_guest", "Guest chat and saved-talent identity", "Tulala", "400 days"],
  ["impronta_impersonation, impronta_preview, impronta_edit, impronta_invite", "Staff, preview, editing, and invite functions", "Tulala", "15 minutes to 8 hours"],
  ["__stripe_mid, __stripe_sid", "Fraud prevention during payments", "Stripe", "1 year / 30 minutes"],
  ["Consent record (local storage)", "Remembers your cookie choice", "Tulala", "Until you clear it"],
];

const FUNCTIONAL: readonly Row[] = [
  ["locale, locale_auto, locale-suggest-dismissed, tulala-currency", "Language and currency", "Tulala", "Up to 400 days"],
  ["impronta.active_tenant_id, tulala.talent.active_tenant_id", "Remembers your active workspace", "Tulala", "90 to 365 days"],
  ["Browser storage for drafts", "Booking and chat drafts, form autosave, remembered sign-in email, favourites", "Tulala", "Tab session or until cleared"],
  ["Offline cache (service worker)", "Lets the app show an offline page", "Tulala", "Versioned"],
];

const OPTIONAL: readonly Row[] = [
  ["_ga, _ga_*", "Analytics: how pages are used", "Google", "2 years"],
  ["impronta_vid", "Experiment visitor id for A/B tests", "Tulala", "365 days"],
  ["Visit id (session storage)", "First-party analytics events", "Tulala", "Tab session"],
  ["_fbp, _ttp, li_*, _gcl_*", "Advertising, only if a talent or agency adds those tags to their own site", "Meta, TikTok, LinkedIn, Google", "Up to 13 months"],
];

function CookieTable({ rows }: { rows: readonly Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth: 560 }}>
        <thead>
          <tr>
            <th className="py-2 pr-3 font-semibold">Name</th>
            <th className="py-2 pr-3 font-semibold">Purpose</th>
            <th className="py-2 pr-3 font-semibold">Set by</th>
            <th className="py-2 font-semibold">Lasts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="align-top">
              <td className="py-2 pr-3 break-words">{r[0]}</td>
              <td className="py-2 pr-3">{r[1]}</td>
              <td className="py-2 pr-3">{r[2]}</td>
              <td className="py-2">{r[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookies and Storage"
      lastUpdated="2026-10-01"
      intro={
        <p>
          {PLATFORM_BRAND.name} uses cookies and similar browser storage to keep you signed
          in, remember your settings, and, only if you agree, measure how the product is
          used. This page lists what we use. See also our{" "}
          <Link href="/legal/privacy" className="underline" style={{ color: "var(--plt-ink)" }}>
            Privacy Policy
          </Link>
          .
        </p>
      }
      sections={[
        {
          heading: "Essential",
          body: (
            <>
              <p>These are needed for sign-in, security, and payments. They do not need consent.</p>
              <CookieTable rows={ESSENTIAL} />
            </>
          ),
        },
        {
          heading: "Functional",
          body: (
            <>
              <p>These remember your choices and drafts. They are not used for advertising.</p>
              <CookieTable rows={FUNCTIONAL} />
            </>
          ),
        },
        {
          heading: "Optional",
          body: (
            <>
              <p>
                Analytics and advertising cookies are optional. Analytics run only after you
                accept them, and advertising pixels stay off until you consent.
              </p>
              <CookieTable rows={OPTIONAL} />
              <p>
                Talents and agencies can add their own tags to their sites. Those are their
                choice, and the same consent choice is meant to apply to them.
              </p>
            </>
          ),
        },
        {
          heading: "Your choices",
          body: (
            <>
              <p>
                Use the &ldquo;Privacy choices&rdquo; link in the footer to accept or decline
                optional cookies at any time. We also treat a Global Privacy Control signal
                from your browser as a request to decline optional cookies. You can also
                block or delete cookies in your browser settings, though parts of the service
                may stop working.
              </p>
              <p>
                Some embedded content, such as videos, maps, and music players, can set its
                own cookies when it loads. Those are controlled by the provider.
              </p>
            </>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Questions:{" "}
              <a
                href={`mailto:privacy@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={{ color: "var(--plt-ink)" }}
              >
                privacy@{PLATFORM_BRAND.domain}
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
