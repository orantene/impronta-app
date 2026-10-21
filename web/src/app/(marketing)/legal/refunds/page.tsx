import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { RefundsEs } from "./refunds-es";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

// DRAFT PENDING LEGAL REVIEW (2026-10-01). Expanded from the Terms Payments
// section. Tulala collects and pays out (TUL-43 option A); refunds follow the talent's selected
// policy; processing fees are non-refundable. Do not ship to production until
// reviewed.

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

const linkStyle = { color: "var(--plt-ink)" } as const;

export default async function RefundsPage() {
  const locale = await getRequestLocale();
  if (locale === "es") return <RefundsEs />;
  return (
    <LegalPage
      eyebrow="Legal"
      title="Refund Policy"
      lastUpdated="2026-10-01"
      intro={
        <p>
          This page explains how refunds work when a customer pays a talent through{" "}
          {PLATFORM_BRAND.name}. It expands on the Payments section of our{" "}
          <Link href={withLocaleHref("/legal/terms", locale)} className="underline" style={linkStyle}>
            Terms of Service
          </Link>
          . See also our{" "}
          <Link href={withLocaleHref("/legal/privacy", locale)} className="underline" style={linkStyle}>
            Privacy Policy
          </Link>
          .
        </p>
      }
      sections={[
        {
          heading: "Who is the seller",
          body: (
            <>
              {/* LEGAL_REVIEW_PENDING: collect-and-pay-out model (TUL-43 option A, Oran 2026-10-16); counsel review pending */}
              <p>
                {"The talent or workspace is the seller of the service. "}
                {PLATFORM_BRAND.name} collects the card payment through Stripe and pays the
                seller&rsquo;s share out, and provides the platform and the payment tools.
                Card details are entered with Stripe and never touch {PLATFORM_BRAND.name}.
              </p>
              <p className="text-xs opacity-70">Pending legal review</p>
            </>
          ),
        },
        {
          heading: "How refunds are decided",
          body: (
            <p>
              Refunds follow the refund policy the talent selected for the booking.{" "}
              {PLATFORM_BRAND.name} processes the refund once that policy says an amount is
              owed. The talent sets cancellation windows, deposits, and how much (if anything)
              comes back when a booking changes or is cancelled.
            </p>
          ),
        },
        {
          heading: "Card processing fees",
          body: (
            <>
              <p>
                Every card payment carries a processing fee that the card networks and Stripe
                do not return. Depending on the talent&rsquo;s settings, the talent absorbs
                this fee or it is added to the customer&rsquo;s total. The full amount,
                including any fee, is always shown before the customer pays. This includes the
                Tulala service fee.
              </p>
              <p>
                Card processing fees are non-refundable. Neither the talent nor{" "}
                {PLATFORM_BRAND.name} covers those fees when a refund is issued. The{" "}
                {PLATFORM_BRAND.name} service fee paid by the client is not refunded either.
              </p>
            </>
          ),
        },
        // TODO(TUL-1468): subsection 3b "Tulala service fee" (copy R3) and the customer-cancels line (R4, F5) wait for
        // the legal brief (F6) and Oran (F5). See docs/plans/fee-copy-en-es-2026-10-20.md section 5. The sentence above
        // that says the service fee is not refunded conflicts with R3 and is left as is until F6 is decided.
        {
          heading: "What you get back",
          body: (
            <p>
              A refund is the refundable amount under the talent&rsquo;s refund policy minus
              the processing fees on that payment. If the actual fee cannot be confirmed yet,
              the refund waits until it can, rather than being estimated.
            </p>
          ),
        },
        {
          heading: "Chargebacks and disputes",
          body: (
            <p>
              If a customer disputes a charge with their bank, the dispute is raised
              against {PLATFORM_BRAND.name}&rsquo;s payment account and {PLATFORM_BRAND.name}{" "}
              handles it with the card network, with the talent&rsquo;s help on evidence. If a
              dispute is lost, {PLATFORM_BRAND.name} may reverse the payout for that payment
              and may recover the dispute fee from the seller&rsquo;s future payouts.
            </p>
          ),
        },
        {
          heading: "Related policies",
          body: (
            <p>
              Booking rules and refund windows live in the talent&rsquo;s published policies.
              Platform rules that govern accounts, payments, and use of the service are in the{" "}
              <Link href={withLocaleHref("/legal/terms", locale)} className="underline" style={linkStyle}>
                Terms of Service
              </Link>
              . How we handle payment records and personal data is in the{" "}
              <Link href={withLocaleHref("/legal/privacy", locale)} className="underline" style={linkStyle}>
                Privacy Policy
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Questions about this refund policy:{" "}
              <a
                href={`mailto:legal@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
              >
                legal@{PLATFORM_BRAND.domain}
              </a>
              . For a specific booking, contact the talent first; they set the policy that
              applies.
            </p>
          ),
        },
      ]}
    />
  );
}
