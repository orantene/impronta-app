import { withLocaleHref } from "@/i18n/pathnames";
import type { Metadata } from "next";
import Link from "next/link";
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
 * `/agencia-de-talento` — Spanish-first landing page for our best keyword
 * ("agencia de talento", 100-1K/mo, LOW competition in Mexico per Keyword
 * Planner). The ES copy is the primary rendering and carries the quality
 * bar; the EN variant (via `pickLocale`) reframes the same page as "a talent
 * agency, reimagined" rather than a literal translation.
 *
 * The page speaks to both sides of the same platform: the demand side
 * (anyone who wants to hire) is pointed at the global directory
 * (`/directory`); the supply side (agencies representing talent) is pointed
 * at `/agencies`. Neither section duplicates those pages, it explains how
 * the two connect.
 *
 * FAQ is rendered visibly and mirrored into FAQPage JSON-LD from the same
 * array (pattern: `for/[category]/page.tsx`), plus a BreadcrumbList.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "A talent agency, reimagined",
      es: "Agencia de talento que trabaja como plataforma",
    }),
    description: pickLocale(locale, {
      en: `Hire from the ${PLATFORM_BRAND.name} global directory, or run your agency roster on your own domain with structured inquiries, priced offers, and payment inside the chat.`,
      es: `Contrata desde el directorio global de ${PLATFORM_BRAND.name}, o gestiona el roster de tu agencia en tu propio dominio con solicitudes estructuradas, ofertas con precio y pago dentro del chat.`,
    }),
    ...buildSpanishOnlyMarketingAlternates("/agencia-de-talento"),
  };
}

export default async function AgenciaDeTalentoPage() {
  const locale = await getRequestLocale();
  const pageUrl = `https://${PLATFORM_BRAND.domain}/agencia-de-talento`;

  const t = pickLocale(locale, {
    en: {
      heroEyebrow: "Talent agency",
      heroTitle: "A talent agency, reimagined",
      heroSubtitle:
        "For anyone hiring, a global directory with structured requests and clear pricing. For anyone representing talent, a roster with its own site and a real pipeline from first message to payment.",
      heroPrimary: "Browse the directory",
      heroSecondary: "See the agency page",
      hireEyebrow: "For anyone hiring",
      hireIntro:
        "Hiring talent shouldn't mean a scattered thread of DMs and a verbal price. On Tulala, the whole path from “who's available” to “confirmed and paid” runs through one flow.",
      hireSteps: [
        {
          title: "Global directory",
          body: "Search by craft, city, and availability across every independent talent and agency roster on the platform.",
        },
        {
          title: "Structured inquiry",
          body: "Send the date, location, budget, and details in one form, not a string of back-and-forth messages.",
        },
        {
          title: "Priced offer",
          body: "The talent or agency replies with a clear proposal: what's included and what it costs.",
        },
        {
          title: "Payment in the chat",
          body: "Confirm and pay inside the same conversation, without leaving the platform or coordinating a separate payment.",
        },
      ],
      hireCta: "Explore the global directory",
      agencyEyebrow: "For agencies",
      agencyBody:
        "If you represent talent, your agency doesn't need to run on WhatsApp threads and a shared spreadsheet. Publish your roster on your own domain, under your own brand, and manage every inquiry through a real pipeline: from first message to priced offer to a confirmed, paid booking.",
      agencyBullets: [
        "A roster site on your own domain",
        "A real pipeline for every inquiry, not a spreadsheet",
      ],
      agencyCta: "See how it works for agencies",
      faqEyebrow: "Common questions",
      faq: [
        {
          q: "What is a talent agency on Tulala?",
          a: "A workspace where an agency runs its roster, publishes a site on its own domain, and answers inquiries from a real pipeline instead of a spreadsheet or a chat app.",
        },
        {
          q: "Do I need an agency to be listed?",
          a: "No. The global directory lists independent talent and agency rosters side by side; every profile shows how it is represented.",
        },
        {
          q: "How does a hire actually happen?",
          a: "Find talent in the global directory, send a structured inquiry with your date, location, and budget, and the talent or agency replies with a priced offer.",
        },
        {
          q: "Where does the payment happen?",
          a: "Inside the same booking chat, once the offer is confirmed. There is no separate invoice tool or outside payment channel to coordinate.",
        },
      ],
    },
    es: {
      heroEyebrow: "Agencia de talento",
      heroTitle: "La agencia de talento que trabaja como plataforma",
      heroSubtitle:
        "Para quien busca contratar, un directorio global con solicitudes estructuradas y precios claros. Para quien representa talento, un roster con sitio propio y un pipeline real, del primer mensaje al pago.",
      heroPrimary: "Ver el directorio",
      heroSecondary: "Para agencias",
      hireEyebrow: "Para quien contrata",
      hireIntro:
        "Contratar talento no debería significar un hilo de mensajes disperso y un precio dicho de palabra. En Tulala, todo el camino desde “quién está disponible” hasta “confirmado y pagado” ocurre en un solo flujo.",
      hireSteps: [
        {
          title: "Directorio global",
          body: "Busca por oficio, ciudad y disponibilidad entre todo el talento independiente y los rosters de agencia de la plataforma.",
        },
        {
          title: "Solicitud estructurada",
          body: "Envía la fecha, el lugar, el presupuesto y los detalles en un solo formulario, no en una cadena de mensajes.",
        },
        {
          title: "Oferta con precio",
          body: "El talento o la agencia responde con una propuesta clara: qué incluye y cuánto cuesta.",
        },
        {
          title: "Pago en el chat",
          body: "Confirma y paga dentro de la misma conversación, sin salir de la plataforma ni coordinar el pago por otro canal.",
        },
      ],
      hireCta: "Explorar el directorio global",
      agencyEyebrow: "Para agencias",
      agencyBody:
        "Si representas talento, tu agencia no necesita depender de hilos de WhatsApp y una hoja de cálculo compartida. Publica tu roster en tu propio dominio, con tu propia marca, y gestiona cada consulta desde un pipeline real: del primer mensaje a la oferta con precio, hasta una reserva confirmada y pagada.",
      agencyBullets: [
        "Un sitio de roster en tu propio dominio",
        "Un pipeline real para cada consulta, no una hoja de cálculo",
      ],
      agencyCta: "Ver cómo funciona para agencias",
      faqEyebrow: "Preguntas frecuentes",
      faq: [
        {
          q: "¿Qué es una agencia de talento en Tulala?",
          a: "Un espacio de trabajo donde la agencia gestiona su roster, publica su sitio en su propio dominio y responde cada consulta desde un pipeline real, no desde una hoja de cálculo o un chat suelto.",
        },
        {
          q: "¿Necesito una agencia para aparecer en el directorio?",
          a: "No. El directorio global incluye talento independiente y rosters de agencia por igual; cada perfil indica cómo está representado.",
        },
        {
          q: "¿Cómo se concreta una contratación?",
          a: "Encuentras el talento en el directorio global, envías una solicitud estructurada con fecha, lugar y presupuesto, y el talento o la agencia responde con una oferta con precio.",
        },
        {
          q: "¿Dónde se hace el pago?",
          a: "Dentro del mismo chat de la reserva, una vez confirmada la oferta. No hay una herramienta de facturación aparte ni un canal externo que coordinar.",
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
    { name: PLATFORM_BRAND.name, url: `https://${PLATFORM_BRAND.domain}/` },
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
        sourcePage="agencia-de-talento"
        primary={{ label: t.heroPrimary, href: "/directory", intent: "directory" }}
        secondary={{ label: t.heroSecondary, href: "/agencies", intent: "agencies" }}
      />

      {/* For anyone hiring: directory -> structured inquiry -> priced offer -> pay in chat. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <MarketingEyebrow>{t.hireEyebrow}</MarketingEyebrow>
          <p
            className="mt-6 max-w-2xl text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {t.hireIntro}
          </p>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 md:gap-10">
            {t.hireSteps.map((step, i) => (
              <div key={step.title}>
                <div
                  className="plt-mono text-[0.75rem] font-semibold tracking-[0.2em]"
                  style={{ color: "var(--plt-accent, #2e6b52)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3
                  className="mt-3 text-[1.125rem] font-semibold leading-snug"
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
              {t.hireCta}
            </Link>
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* For agencies: own-domain roster + a real pipeline, not a spreadsheet. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <MarketingEyebrow>{t.agencyEyebrow}</MarketingEyebrow>
              <p
                className="mt-6 text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {t.agencyBody}
              </p>
              <ul className="mt-6 space-y-2">
                {t.agencyBullets.map((b) => (
                  <li
                    key={b}
                    className="text-[0.9375rem] leading-[1.6]"
                    style={{ color: "var(--plt-ink-strong)" }}
                  >
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href={withLocaleHref("/agencies", locale)}
                  className="inline-flex min-h-11 items-center rounded-full px-5 text-[0.9375rem] transition-colors"
                  style={{
                    border: "1px solid var(--plt-hairline-strong)",
                    color: "var(--plt-ink-strong)",
                  }}
                >
                  {t.agencyCta}
                </Link>
              </div>
            </div>
            <EditorialFrame photo={MARKETING_PHOTOS.agency} aspect="landscape" size="lg" />
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
