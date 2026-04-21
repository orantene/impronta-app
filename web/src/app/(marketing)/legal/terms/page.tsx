import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "Terms",
  description: `The terms that govern use of ${PLATFORM_BRAND.name}, explained like humans wrote them.`,
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      lastUpdated="2026-04-01"
      intro={
        <p>
          By using {PLATFORM_BRAND.name} you agree to these terms. We&rsquo;ve kept them short
          and clear — no fine print tricks. If anything&rsquo;s ambiguous, the plain-language
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
                actions taken under your account. You must be 18+ to sign up. You can close
                your account at any time.
              </p>
            </>
          ),
        },
        {
          heading: "Your content",
          body: (
            <>
              <p>
                You keep full ownership of everything you upload — people profiles, media,
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
                Paid plans are billed monthly or annually. Annual plans are pre-paid and
                save 20%. You can cancel at any time; access continues until the end of the
                current period. Taxes and currency localization apply by region.
              </p>
            </>
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
                {PLATFORM_BRAND.name} is provided &ldquo;as is.&rdquo; To the extent allowed by
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
