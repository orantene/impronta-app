import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { TermsEs } from "./terms-es";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

// DRAFT PENDING LEGAL REVIEW (2026-10-01). Payment, refund, and chargeback
// wording follows the working defaults decided by Oran. Do not ship to
// production until reviewed.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "Terms", es: "Términos" }),
    description: pickLocale(locale, {
      en: `The terms that govern use of ${PLATFORM_BRAND.name}, explained like humans wrote them.`,
      es: `Los términos que rigen el uso de ${PLATFORM_BRAND.name}, explicados como los escribiría una persona.`,
    }),
    ...buildMarketingLocaleAlternates(locale, "/legal/terms"),
  };
}

export default async function TermsPage() {
  if ((await getRequestLocale()) === "es") return <TermsEs />;
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      lastUpdated="2026-10-01"
      intro={
        <p>
          By using {PLATFORM_BRAND.name}{" "}you agree to these terms. We&rsquo;ve kept them short
          and clear, no fine print tricks. If anything&rsquo;s ambiguous, the plain-language
          reading wins.
        </p>
      }
      sections={[
        {
          heading: "Your account",
          body: (
            <>
              <p>
                You&rsquo;re responsible for keeping your account credentials secure and for
                actions taken under your account. Everyone who uses {PLATFORM_BRAND.name}, talents and clients alike, must
                be 18 or older. To close your account, contact support and we will help you.
              </p>
              {/* LEGAL_REVIEW_PENDING: 18+ for talents and paying clients (owner decision 2026-10-01) */}
              <p>
                {"To be a talent, or a client who pays on Tulala, you must be 18 or older. If we learn that someone is under 18, we may close the account."}
              </p>
            </>
          ),
        },
        {
          heading: "Your content",
          body: (
            <>
              <p>
                You keep full ownership of everything you upload, people profiles, media,
                site copy, inquiries. You grant {PLATFORM_BRAND.name} a limited license to
                host, render, and distribute that content as directed by you (public roster
                site, shared network, etc.).
              </p>
            </>
          ),
        },
        {
          heading: "Acceptable use",
          body: (
            <>
              <p>Don&rsquo;t use {PLATFORM_BRAND.name} to:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Host content that violates the rights of third parties</li>
                <li>Represent or place people without their consent</li>
                <li>Target, harass, or harm individuals or organizations</li>
                <li>Attempt to disrupt or bypass the security of the platform</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Subscription & billing",
          body: (
            <>
              <p>
                Paid plans are billed monthly or annually. Annual plans are pre-paid at ten
                times the monthly rate, so twelve months cost the price of ten. You can cancel at any time; access continues until the end of the
                current period. Taxes and currency localization apply by region.
              </p>
            </>
          ),
        },
        {
          heading: "Payments",
          body: (
            <>
              {/* LEGAL_REVIEW_PENDING: talent is merchant of record (owner decision 2026-10-01) */}
              <p>
                {"The talent is the merchant of record for each card payment they receive, through their own Stripe Connect account. Chargebacks, lost disputes, and tax invoicing (for example, the CFDI in Mexico) are the talent\u2019s responsibility."}
              </p>
              <p>
                The talent or workspace is the seller. {PLATFORM_BRAND.name} provides the
                platform and the payment processing tools, using Stripe Connect. Card details
                are entered with Stripe and never touch {PLATFORM_BRAND.name}. Funds go to the
                talent or workspace once they have completed payout onboarding.
              </p>
              <p className="text-xs opacity-70">Pending legal review</p>
              <p>
                Refunds follow the refund policy the talent selected for the booking, and{" "}
                {PLATFORM_BRAND.name} processes them. Details live on the{" "}
                <Link
                  href={withLocaleHref("/legal/refunds", "en")}
                  className="underline"
                  style={{ color: "var(--plt-ink)" }}
                >
                  Refund policy
                </Link>{" "}
                page. If a customer disputes a charge with their bank, chargebacks and disputes
                are the talent&rsquo;s responsibility. If a dispute is lost,{" "}
                {PLATFORM_BRAND.name} may deduct the disputed amount and any dispute fee from
                the talent&rsquo;s future payouts.
              </p>
              <p>
                Card processing fees: every card payment carries a processing fee that the
                card networks and Stripe do not return. Depending on the talent&rsquo;s
                settings, the talent absorbs this fee or it is added to the customer&rsquo;s
                total. The full amount, including any fee, is always shown before the customer
                pays.
              </p>
              <p>
                Because processing fees are not returned, a refund is the refundable amount
                under the talent&rsquo;s refund policy minus the processing fees on that
                payment. Neither the talent nor {PLATFORM_BRAND.name} covers those fees. If the
                actual fee cannot be confirmed yet, the refund waits until it can, rather than
                being estimated.
              </p>
              <p>
                Service fee: customers pay a {PLATFORM_BRAND.name} service fee of 1.5% on top of
                the booking price. It is shown at checkout before the customer pays and is
                separate from the card processing fee described above. Commission and fees for
                talents are disclosed in the plans.
              </p>
            </>
          ),
        },
        {
          heading: "Talent responsibilities",
          body: (
            <p>
              Talents set their own prices, availability, and booking policies, and provide
              their services themselves. Licences, certifications, and other credentials shown
              on a profile are declared by the talent. {PLATFORM_BRAND.name} does not verify
              them, and talents are responsible for holding any licence their work requires.
            </p>
          ),
        },
        {
          heading: "Marketplace",
          body: (
            <p>
              {PLATFORM_BRAND.name} provides the platform that connects clients with talents
              and agencies. We are not the provider of talent services and are not a party to
              the agreement between a client and a talent.
            </p>
          ),
        },
        {
          heading: "Service availability",
          body: (
            <>
              <p>
                We target 99.9% uptime on a best-effort basis. We may perform maintenance
                with reasonable notice. Service-level agreements for enterprise customers are
                agreed separately.
              </p>
            </>
          ),
        },
        {
          heading: "Liability",
          body: (
            <>
              <p>
                {PLATFORM_BRAND.name}{" "}is provided &ldquo;as is.&rdquo; To the extent allowed by
                law, our aggregate liability is limited to fees paid in the 12 months before
                the claim. We&rsquo;re not liable for indirect or consequential damages.
              </p>
            </>
          ),
        },
        {
          heading: "Changes",
          body: (
            <p>
              We may update these terms as the product evolves. Material changes will be
              announced with at least 30 days&rsquo; notice. Continuing to use the service
              after changes means you accept the updated terms.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Questions about these terms:{" "}
              <a
                href={`mailto:legal@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={{ color: "var(--plt-ink)" }}
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
