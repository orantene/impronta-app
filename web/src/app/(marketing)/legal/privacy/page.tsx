import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { PrivacyEs } from "./privacy-es";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

// DRAFT PENDING LEGAL REVIEW (2026-10-01). Copy is written against the code
// facts in the legal inventory report and the working defaults decided by
// Oran. Do not ship to production until reviewed. Retention periods are the
// owner decisions of 2026-10-01 (src/lib/legal/retention-config.ts). Do not claim self-serve
// deletion or CSV export here: neither exists yet.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "Privacy", es: "Privacidad" }),
    description: pickLocale(locale, {
      en: `How ${PLATFORM_BRAND.name} collects, stores, and protects data, in plain language.`,
      es: `Cómo ${PLATFORM_BRAND.name} recopila, guarda y protege los datos, explicado en lenguaje claro.`,
    }),
    ...buildMarketingLocaleAlternates(locale, "/legal/privacy"),
  };
}

const linkStyle = { color: "var(--plt-ink)" } as const;

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="underline"
      style={linkStyle}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

export default async function PrivacyPage() {
  const locale = await getRequestLocale();
  if (locale === "es") return <PrivacyEs />;
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      lastUpdated="2026-10-01"
      intro={
        <p>
          {PLATFORM_BRAND.name} is a platform where talents, agencies, and other
          roster-based businesses run their profile, website, inquiries, bookings, and
          payments. This policy explains what data we collect, why, who else handles it,
          how long we keep it, and what you can ask us to do. We write these pages in plain
          language on purpose. {PLATFORM_BRAND.name} is for adults only (18 and over).
        </p>
      }
      sections={[
        {
          heading: "Who we are and our role",
          body: (
            <>
              <p>
                {PLATFORM_BRAND.legalName} operates {PLATFORM_BRAND.name}. For the accounts,
                directory, reviews, payments, security, and product analytics that we run
                ourselves, we decide why and how data is used (we are the controller).
              </p>
              <p>
                Talents and agencies run their own sites and client relationships on{" "}
                {PLATFORM_BRAND.name}. For the inquiries, messages, bookings, and client
                details they receive through their pages, they decide how the data is used,
                and we process it for them to deliver the service. If you are a client of a
                talent or agency, they are your first contact for questions about that data.
              </p>
            </>
          ),
        },
        {
          heading: "What we collect",
          body: (
            <>
              <p>
                <strong>Account and identity data</strong>: name, display name, email, phone,
                and organization details you give us. Some profile fields, such as date of
                birth, are optional and have their own visibility setting.
              </p>
              <p>
                <strong>Profile and site content</strong>: bio, services, prices, availability,
                city-level location, photos, video, reviews, and site configuration. Content
                you publish is public.
              </p>
              <p>
                <strong>Inquiries, messages, and bookings</strong>: the contact details,
                message text, attachments, offers, and booking records that clients, talents,
                and agencies exchange.
              </p>
              <p>
                <strong>Payment records</strong>: Stripe references, amounts, payouts, refunds,
                and disputes. Card numbers go straight to Stripe and never touch our servers.
                Identity and bank checks for payouts are held by Stripe.
              </p>
              <p>
                <strong>Usage and device data</strong>: IP address, browser type, page views,
                and performance data. Analytics cookies are used only if you accept them (see{" "}
                <Link href={withLocaleHref("/legal/cookies", locale)} className="underline" style={linkStyle}>
                  Cookies
                </Link>
                ).
              </p>
              <p>
                <strong>Security, audit, and error logs</strong>, and, for AI features, the
                text you submit to them. For AI search we keep the query text.
              </p>
              <p>
                <strong>Marketing preferences</strong>: whether you subscribed to or
                unsubscribed from our emails.
              </p>
              <p>
                We do not collect guardian information, government ID numbers, or home
                addresses as part of the service.
              </p>
            </>
          ),
        },
        {
          heading: "How we use it",
          body: (
            <p>
              To run the service (render your site, deliver inquiries and messages, take and
              pay out payments, send transactional email), to keep the platform secure and
              prevent fraud and abuse, to improve the product, to show talents in our
              directory and marketing where they have chosen to be discoverable, and to meet
              legal obligations. We do not sell personal data.
            </p>
          ),
        },
        {
          heading: "Providers that handle data for us",
          body: (
            <>
              <p>We use these providers. Each receives only what it needs to do its job.</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <Ext href="https://vercel.com/legal/privacy-policy">Vercel</Ext>: hosting and
                  delivery, plus cookieless page-view and performance measurement.
                </li>
                <li>
                  <Ext href="https://supabase.com/privacy">Supabase</Ext>: database, sign-in,
                  file storage, and realtime messaging.
                </li>
                <li>
                  <Ext href="https://stripe.com/privacy">Stripe</Ext>: card payments, payouts,
                  and subscription billing. Stripe is also an independent controller for its
                  own identity verification and fraud checks.
                </li>
                <li>
                  <Ext href="https://resend.com/legal/privacy-policy">Resend</Ext>: sending
                  email.
                </li>
                <li>
                  <Ext href="https://policies.google.com/privacy">Google</Ext>: Analytics (only
                  after you accept analytics cookies) and Google Maps (maps, places, and directions).
                </li>
                <li>
                  <Ext href="https://sentry.io/privacy/">Sentry</Ext>: error and performance
                  monitoring.
                </li>
                <li>
                  <Ext href="https://www.anthropic.com/legal/privacy">Anthropic</Ext> and{" "}
                  <Ext href="https://openai.com/policies/privacy-policy">OpenAI</Ext>: optional
                  AI features (see AI features below).
                </li>
                <li>
                  <Ext href="https://upstash.com/trust/privacy.pdf">Upstash</Ext>: rate
                  limiting, using hashed identifiers.
                </li>
                <li>
                  Embedded media from services such as YouTube, Vimeo, Spotify, SoundCloud,
                  Calendly, Instagram, and TikTok, when a page you visit includes them. These
                  services may receive your IP address and set their own cookies.
                </li>
              </ul>
              <p>
                Talents and agencies may add their own analytics or advertising tags to their
                sites. Those are their choice and they are responsible for them.
              </p>
            </>
          ),
        },
        {
          heading: "Cookies",
          id: "cookies",
          body: (
            <p>
              We use essential cookies to keep you signed in and the service working,
              functional ones to remember language and currency, and optional ones for
              analytics only if you consent. The full list, and how to change your choice with
              the &ldquo;Privacy choices&rdquo; link, is on the{" "}
              <Link href={withLocaleHref("/legal/cookies", locale)} className="underline" style={linkStyle}>
                Cookies page
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "Payments",
          body: (
            <>
              <p>
                Card payments are processed by Stripe. The talent or workspace that provides
                the service is the seller and merchant for the payment; {PLATFORM_BRAND.name}{" "}
                provides the platform and the payment processing tools, and fees are
                deducted as described in the plans. Card details are entered with Stripe and
                never touch {PLATFORM_BRAND.name}. We keep the payment records described
                above for accounting, tax, and dispute purposes.
              </p>
              <p className="text-xs opacity-70">Pending legal review</p>
            </>
          ),
        },
        {
          heading: "AI features",
          body: (
            <p>
              Optional features such as drafting bios, translation, transcription, search, and
              support chat send the text you submit to Anthropic or OpenAI to produce a
              result. Some workspaces use their own API keys. Profile text may also be
              converted into search embeddings. If you do not want your text processed this
              way, do not use those features.
            </p>
          ),
        },
        {
          heading: "The shared network hub",
          body: (
            <p>
              Shared discovery is opt-in per organization and per profile. Nothing is
              discoverable in the network unless you turn it on, and you can turn it off at
              any time.
            </p>
          ),
        },
        {
          heading: "How long we keep data",
          body: (
            <>
              {/* LEGAL_REVIEW_PENDING: retention periods (owner decision 2026-10-01), see src/lib/legal/retention-config.ts */}
              <p>
                {"We keep data only as long as needed. These are the periods:"}
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  {"Messages and bookings: 3 years after the last activity"}
                </li>
                <li>
                  {"Deleted accounts: purged 30 days after the 14-day grace period"}
                </li>
                <li>
                  {"Security and error logs: 90 days"}
                </li>
              </ul>
              <p>
                Backups are held by our database provider and age out on its schedule. Data we
                must keep by law may be kept longer.
              </p>
            </>
          ),
        },
        {
          heading: "Your rights",
          body: (
            <p>
              You can ask for a copy of your data, to correct it, or to have it deleted. You
              can edit most profile details yourself. For access, export, correction, or
              deletion requests, email{" "}
              <a
                href={`mailto:privacy@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
              >
                privacy@{PLATFORM_BRAND.domain}
              </a>
              . We may need to confirm who you are first, and we respond within one month. We
              may keep records we are legally required to keep. You can unsubscribe from
              marketing email at any time using the link in the email.
            </p>
          ),
        },
        {
          heading: "Security",
          body: (
            <p>
              Data in transit is encrypted with TLS. Access is role-scoped and sensitive
              actions are logged. No system is perfectly secure. To report a security issue,
              email{" "}
              <a
                href={`mailto:security@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
              >
                security@{PLATFORM_BRAND.domain}
              </a>
              .
            </p>
          ),
        },
        {
          heading: "Adults only",
          body: (
            <p>
              {PLATFORM_BRAND.name} is for people aged 18 and over, both talents and clients.
              We do not knowingly collect data from anyone under 18. If you think we have,
              email us and we will remove it.
            </p>
          ),
        },
        {
          heading: "International transfers",
          body: (
            <p>
              Our providers operate in several countries, including the United States, so
              your data may be processed outside the country where you live. We rely on our
              providers&rsquo; contractual safeguards for those transfers.
            </p>
          ),
        },
        {
          heading: "Changes",
          body: (
            <p>
              We may update this policy as the product changes. The date at the top shows the
              latest version, and we will give notice of material changes.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Privacy questions and requests:{" "}
              <a
                href={`mailto:privacy@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
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
