import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${PLATFORM_BRAND.name} collects, stores, and protects data — in plain language.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      lastUpdated="2026-04-01"
      intro={
        <p>
          {PLATFORM_BRAND.name} is a platform for roster-based businesses — coordinators,
          agencies, staffing, casting, and placement organizations. This policy explains the
          data we collect, why we collect it, how we store it, and the controls you have. We
          write these pages in plain language on purpose.
        </p>
      }
      sections={[
        {
          heading: "What we collect",
          body: (
            <>
              <p>
                <strong>Account data</strong> — the name, email, and organization details
                you give us to create an account.
              </p>
              <p>
                <strong>Content you add</strong> — people profiles, media, inquiries, and
                site configuration. This is yours; we store and render it on your behalf.
              </p>
              <p>
                <strong>Usage analytics</strong> — aggregate events (page views, CTA clicks,
                inquiry funnel steps) that help us improve the product. You can opt out via
                the consent banner.
              </p>
            </>
          ),
        },
        {
          heading: "How we use it",
          body: (
            <>
              <p>
                To operate the service (rendering your site, delivering inquiries, sending
                transactional email), to improve the product (in aggregate), and to comply
                with legal obligations. We do not sell personal data.
              </p>
            </>
          ),
        },
        {
          heading: "The shared network hub",
          body: (
            <>
              <p>
                Shared discovery is opt-in per organization and per profile. Nothing is
                discoverable in the network unless you toggle it on. You can revoke at any
                time; revocation is immediate.
              </p>
            </>
          ),
        },
        {
          heading: "Data retention & export",
          body: (
            <>
              <p>
                Account and content data is retained while your account is active. Full
                export is available on every paid plan (CSV + JSON; API access on Network).
                Account deletion removes your content within 30 days; backups age out within
                90 days.
              </p>
            </>
          ),
        },
        {
          heading: "Security",
          body: (
            <>
              <p>
                Data in transit is encrypted with TLS 1.2+. Data at rest uses
                industry-standard encryption. Access is role-scoped and audit-logged. We
                follow OWASP top-ten mitigations and run regular security reviews.
              </p>
            </>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Privacy questions:{" "}
              <a
                href={`mailto:privacy@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={{ color: "var(--plt-ink)" }}
              >
                privacy@{PLATFORM_BRAND.domain}
              </a>
              . Data subject requests are handled within 30 days.
            </p>
          ),
        },
      ]}
    />
  );
}
