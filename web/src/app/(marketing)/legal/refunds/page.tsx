import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";
import { RefundsEs } from "./refunds-es";

// DRAFT PENDING LEGAL REVIEW (2026-10-02). Refund wording follows the working
// defaults decided by Oran (talent merchant of record; processing fees not
// returned; talent-selected presets). Do not treat as final counsel-approved copy.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "Refunds", es: "Reembolsos" }),
    description: pickLocale(locale, {
      en: `How refunds work on ${PLATFORM_BRAND.name}: talent policies, processing fees, and chargebacks.`,
      es: `Cómo funcionan los reembolsos en ${PLATFORM_BRAND.name}: políticas del talento, comisiones de procesamiento y contracargos.`,
    }),
    ...buildMarketingLocaleAlternates(locale, "/legal/refunds"),
  };
}

export default async function RefundsPage() {
  const locale = await getRequestLocale();
  if (locale === "es") return <RefundsEs />;
  const linkStyle = { color: "var(--plt-ink)" } as const;
  return (
    <LegalPage
      eyebrow="Legal"
      title="Refund policy"
      lastUpdated="2026-10-02"
      intro={
        <p>
          This page explains how refunds work on {PLATFORM_BRAND.name}. The short version:
          the talent chooses the refund rules for each booking, {PLATFORM_BRAND.name}{" "}
          processes the refund when those rules allow it, and card processing fees are not
          returned.
        </p>
      }
      sections={[
        {
          heading: "Who sets the rules",
          body: (
            <>
              {/* LEGAL_REVIEW_PENDING: talent is merchant of record (owner decision 2026-10-01) */}
              <p>
                The talent is the merchant of record for each card payment they receive,
                through their own Stripe Connect account. They pick a refund policy for the
                booking (or offer). {PLATFORM_BRAND.name} processes refunds that follow that
                policy. Chargebacks, lost disputes, and tax invoicing remain the talent&rsquo;s
                responsibility.
              </p>
              <p className="text-xs opacity-70">Pending legal review</p>
            </>
          ),
        },
        {
          heading: "Policy presets talents can use",
          body: (
            <>
              <p>
                Talents usually choose one of these presets. Exact timing is measured from the
                booked start time unless the talent&rsquo;s booking page says otherwise.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Tiered</strong>: full refund 14+ days out; 50% between 7 and 14 days;
                  none under 7 days. Deposit is non-refundable.
                </li>
                <li>
                  <strong>Flexible</strong>: full refund up to 48 hours before; none after.
                </li>
                <li>
                  <strong>Strict</strong>: deposit non-refundable; 50% of the balance under 30
                  days; none under 7 days.
                </li>
                <li>
                  <strong>Manual</strong>: the talent or workspace decides each refund case by
                  case.
                </li>
              </ul>
              <p>
                The policy that applied when the client paid is the one that governs later
                refunds for that booking.
              </p>
            </>
          ),
        },
        {
          heading: "Processing fees",
          body: (
            <>
              <p>
                Every card payment carries a processing fee that card networks and Stripe do
                not return. Depending on the talent&rsquo;s settings, the talent absorbs this
                fee or it is added to the customer&rsquo;s total. The full amount, including
                any fee, is always shown before the customer pays.
              </p>
              <p>
                Because those fees are not returned, a refund is the refundable amount under
                the talent&rsquo;s refund policy minus the processing fees on that payment.
                Neither the talent nor {PLATFORM_BRAND.name} covers those fees. If the actual
                fee cannot be confirmed yet, the refund waits until it can, rather than being
                estimated.
              </p>
            </>
          ),
        },
        {
          heading: "How to ask for a refund",
          body: (
            <>
              <p>
                Start with the talent who took the booking (messages on their site or the
                booking confirmation). If you need platform help after that, use{" "}
                <Link href={withLocaleHref("/support", locale)} className="underline" style={linkStyle}>
                  Support
                </Link>
                .
              </p>
              <p>
                {PLATFORM_BRAND.name} does not charge customers a separate booking fee.
                Commission and fees for talents are disclosed in the plans.
              </p>
            </>
          ),
        },
        {
          heading: "Chargebacks and disputes",
          body: (
            <p>
              If a customer disputes a charge with their bank, chargebacks and disputes are
              the talent&rsquo;s responsibility. If a dispute is lost, {PLATFORM_BRAND.name}{" "}
              may deduct the disputed amount and any dispute fee from the talent&rsquo;s future
              payouts.
            </p>
          ),
        },
        {
          heading: "Related terms",
          body: (
            <p>
              Payments and marketplace language also appear in our{" "}
              <Link href={withLocaleHref("/legal/terms", locale)} className="underline" style={linkStyle}>
                Terms of Service
              </Link>
              . If this page and the Terms ever conflict on a material point, contact{" "}
              <a
                href={`mailto:legal@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
              >
                legal@{PLATFORM_BRAND.domain}
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
