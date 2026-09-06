import type { Metadata } from "next";
import Link from "next/link";
import { withLocalePath, withLocaleHref } from "@/i18n/pathnames";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";
import { buildFaqPageJsonLd, faqJsonLdToString } from "@/lib/seo/faq-json-ld";
import { buildSpanishOnlyMarketingAlternates } from "@/lib/seo/spanish-named-routes";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "@/components/marketing/container";
import { EditorialFrame } from "@/components/marketing/editorial-image";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";

/**
 * `/contratar-modelos` — Spanish-first, demand-side landing page ("contratar
 * modelos") for anyone hiring a model for a brand, campaign, or event.
 *
 * Unlike `/for/models` (supply-side: a model signing up to be listed), this
 * page speaks to the client: how a hire actually happens on the platform.
 * The directory is the real supply (~50 discoverable models today, and
 * secondarily hosts), so the page never states a count and always points to
 * `/directory` as the source of truth, with `/agencia-de-talento` as a
 * secondary path for anyone who'd rather work through an agency roster.
 *
 * FAQ is rendered visibly and mirrored into FAQPage JSON-LD from the same
 * array (pattern: `for/[category]/page.tsx`, `agencia-de-talento/page.tsx`),
 * plus a BreadcrumbList.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const title = pickLocale(locale, {
    en: "Hire models for your brand or event",
    es: "Contratar modelos para tu marca o evento",
  });
  const description = pickLocale(locale, {
    en: `Find models in the ${PLATFORM_BRAND.name} directory, send a structured request with your date and image usage, and pay inside the booking chat once you have a priced offer.`,
    es: `Encuentra modelos en el directorio de ${PLATFORM_BRAND.name}, envía una solicitud estructurada con tu fecha y uso de imágenes, y paga dentro del chat de la reserva una vez que tengas una oferta con precio.`,
  });
  return {
    title,
    description,
    // Without an explicit openGraph/twitter block the root layout's English
    // platform boilerplate wins, so this page's Spanish card (see
    // `opengraph-image.tsx`) would unfurl under an English headline about the
    // platform. WhatsApp shares are the main way a Mexican client passes a
    // hire page around, so the caption has to be in the reader's language too.
    openGraph: {
      title,
      description,
      siteName: PLATFORM_BRAND.name,
      url: `https://${PLATFORM_BRAND.domain}${withLocalePath("/contratar-modelos", locale)}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    ...buildSpanishOnlyMarketingAlternates("/contratar-modelos"),
  };
}

export default async function ContratarModelosPage() {
  const locale = await getRequestLocale();
  // Locale-aware on purpose: the JSON-LD `@id`/`url` must be the SAME URL as
  // the page's canonical, or the ES page ships FAQPage markup claiming to
  // describe the EN URL and the rich result can be dropped. Spanish is the
  // money locale for this page, so it is the one that must be right.
  const pageUrl = `https://${PLATFORM_BRAND.domain}${withLocalePath("/contratar-modelos", locale)}`;

  const t = pickLocale(locale, {
    en: {
      heroEyebrow: "Hire models",
      heroTitle: "Hire models for your brand or event",
      heroSubtitle:
        "Browse the directory, send a structured request with your date and how you'll use the images, and get back a clear, priced offer. Confirm and pay in the same chat.",
      heroPrimary: "Browse the directory",
      heroSecondary: "See talent agencies",
      howEyebrow: "How hiring works",
      howIntro:
        "No scattered DMs, no verbal quote. Everything from “who's available” to “confirmed and paid” happens in one flow, in view the whole time.",
      steps: [
        {
          title: "Browse the directory",
          body: "Search the global directory for models by look, city, and availability, independent or represented by an agency.",
        },
        {
          title: "Send a structured request",
          body: "Share your date, the type of work (campaign, event, editorial, runway), and how you plan to use the images.",
        },
        {
          title: "Get a priced offer",
          body: "The model or their agency replies with a clear proposal: what's included, usage terms, and the price.",
        },
        {
          title: "Pay in the booking chat",
          body: "Confirm and pay inside the same conversation, no separate invoice or outside payment channel to coordinate.",
        },
      ],
      howCta: "Explore the directory",
      agencyEyebrow: "Prefer an agency",
      agencyBody:
        "If you'd rather work through a roster instead of an individual model, agencies on the platform run their own talent pages under one workspace, with the same structured-request-to-priced-offer pipeline.",
      agencyCta: "See how it works for agencies",
      faqEyebrow: "Common questions",
      faq: [
        {
          q: "How do I find the right model?",
          a: "Browse the global directory and filter by look, city, and availability. Every profile is independent or an agency roster listing, clearly marked either way.",
        },
        {
          q: "What information do I need to send a request?",
          a: "Your date, the type of work, and how you plan to use the images. That's enough for the model or agency to reply with a real, priced offer.",
        },
        {
          q: "How is image usage handled?",
          a: "You state your intended usage in the request itself, so it's part of the offer the model or agency prices, not a separate negotiation after the fact.",
        },
        {
          q: "Where does the payment happen?",
          a: "Inside the same booking chat where the offer was made, once you confirm it. There's no outside invoice tool or payment link to chase down.",
        },
      ],
    },
    es: {
      heroEyebrow: "Contratar modelos",
      heroTitle: "Contrata modelos para tu marca o evento",
      heroSubtitle:
        "Explora el directorio, envía una solicitud estructurada con tu fecha y el uso que le darás a las imágenes, y recibe una oferta clara y con precio. Confirma y paga en el mismo chat.",
      heroPrimary: "Ver el directorio",
      heroSecondary: "Agencias de talento",
      howEyebrow: "Cómo funciona la contratación",
      howIntro:
        "Sin mensajes dispersos ni cotizaciones de palabra. Todo el camino, de “quién está disponible” a “confirmado y pagado”, ocurre en un solo flujo, siempre a la vista.",
      steps: [
        {
          title: "Explora el directorio",
          body: "Busca modelos en el directorio global por estilo, ciudad y disponibilidad, ya sea independientes o representados por una agencia.",
        },
        {
          title: "Envía una solicitud estructurada",
          body: "Comparte tu fecha, el tipo de trabajo (campaña, evento, editorial, pasarela) y cómo planeas usar las imágenes.",
        },
        {
          title: "Recibe una oferta con precio",
          body: "El modelo o su agencia responde con una propuesta clara: qué incluye, los términos de uso y el costo.",
        },
        {
          title: "Paga en el chat de la reserva",
          body: "Confirma y paga dentro de la misma conversación, sin factura aparte ni un canal de pago externo que coordinar.",
        },
      ],
      howCta: "Explorar el directorio",
      agencyEyebrow: "Prefieres una agencia",
      agencyBody:
        "Si prefieres trabajar con un roster en lugar de un modelo individual, las agencias de la plataforma gestionan su propio talento desde un espacio de trabajo, con el mismo pipeline de solicitud estructurada a oferta con precio.",
      agencyCta: "Ver cómo funciona para agencias",
      faqEyebrow: "Preguntas frecuentes",
      faq: [
        {
          q: "¿Cómo encuentro al modelo indicado?",
          a: "Explora el directorio global y filtra por estilo, ciudad y disponibilidad. Cada perfil indica claramente si es independiente o forma parte del roster de una agencia.",
        },
        {
          q: "¿Qué información necesito para enviar una solicitud?",
          a: "Tu fecha, el tipo de trabajo y el uso que planeas darle a las imágenes. Con eso, el modelo o la agencia puede responder con una oferta real y con precio.",
        },
        {
          q: "¿Cómo se maneja el uso de las imágenes?",
          a: "Indicas el uso previsto directamente en la solicitud, así que forma parte de la oferta que cotiza el modelo o la agencia, no una negociación aparte después.",
        },
        {
          q: "¿Dónde se hace el pago?",
          a: "Dentro del mismo chat de la reserva donde se hizo la oferta, una vez que la confirmas. No hay factura externa ni enlace de pago que perseguir.",
        },
      ],
    },
  });

  const faq = t.faq;

  const faqJsonLd = buildFaqPageJsonLd({
    pageUrl,
    items: faq,
    inLanguage: pickLocale(locale, { en: "en", es: "es" }),
  });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    {
      name: PLATFORM_BRAND.name,
      url: `https://${PLATFORM_BRAND.domain}${withLocalePath("/", locale)}`,
    },
    { name: t.heroEyebrow, url: pageUrl },
  ]);

  return (
    <>
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          // Pre-stringified: React must NOT escape JSON-LD content.
          dangerouslySetInnerHTML={{ __html: faqJsonLdToString(faqJsonLd) }}
        />
      ) : null}
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdToString(breadcrumbJsonLd) }}
        />
      ) : null}

      <SimplePageHero
        eyebrow={t.heroEyebrow}
        title={t.heroTitle}
        subtitle={t.heroSubtitle}
        sourcePage="contratar-modelos"
        primary={{ label: t.heroPrimary, href: "/directory", intent: "directory" }}
        secondary={{ label: t.heroSecondary, href: "/agencia-de-talento", intent: "agencies" }}
      />

      {/* How hiring works: directory -> structured request -> priced offer -> pay in chat. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <MarketingEyebrow>{t.howEyebrow}</MarketingEyebrow>
              <p
                className="mt-6 max-w-xl text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {t.howIntro}
              </p>
              <div className="mt-10 grid gap-8 sm:grid-cols-2">
                {t.steps.map((step, i) => (
                  <div key={step.title}>
                    <div
                      className="plt-mono text-[0.75rem] font-semibold tracking-[0.2em]"
                      style={{ color: "var(--plt-accent, #ff8332)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <h3
                      className="mt-3 text-[1.0625rem] font-semibold leading-snug"
                      style={{ color: "var(--plt-ink-strong)" }}
                    >
                      {step.title}
                    </h3>
                    <p
                      className="mt-2 text-[0.9375rem] leading-[1.65]"
                      style={{ color: "var(--plt-muted)" }}
                    >
                      {step.body}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-10">
                <Link
                  href={withLocaleHref("/directory", locale)}
                  className="inline-flex min-h-11 items-center rounded-full px-5 text-[0.9375rem] transition-colors"
                  style={{
                    border: "1px solid var(--plt-hairline-strong)",
                    color: "var(--plt-ink-strong)",
                  }}
                >
                  {t.howCta}
                </Link>
              </div>
            </div>
            <EditorialFrame photo={MARKETING_PHOTOS.modelsRunway} aspect="portrait" size="lg" />
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Secondary path: hiring through an agency roster instead of one model. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <MarketingEyebrow>{t.agencyEyebrow}</MarketingEyebrow>
          <p
            className="mt-6 max-w-2xl text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {t.agencyBody}
          </p>
          <div className="mt-8">
            <Link
              href={withLocaleHref("/agencia-de-talento", locale)}
              className="inline-flex min-h-11 items-center rounded-full px-5 text-[0.9375rem] transition-colors"
              style={{
                border: "1px solid var(--plt-hairline-strong)",
                color: "var(--plt-ink-strong)",
              }}
            >
              {t.agencyCta}
            </Link>
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Visible FAQ. Mirrored into FAQPage JSON-LD above. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <MarketingEyebrow>{t.faqEyebrow}</MarketingEyebrow>
          <dl className="mt-10 grid gap-8 md:grid-cols-2 md:gap-x-12">
            {faq.map((item) => (
              <div key={item.q}>
                <dt
                  className="text-[1.0625rem] font-semibold leading-snug"
                  style={{ color: "var(--plt-ink-strong)" }}
                >
                  {item.q}
                </dt>
                <dd
                  className="mt-2 text-[0.9375rem] leading-[1.65]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
