import type { Metadata } from "next";
import Link from "next/link";
import { withLocaleHref, withLocalePath } from "@/i18n/pathnames";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { CASE_STUDY_PHOTOS, MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";
import { buildFaqPageJsonLd, faqJsonLdToString } from "@/lib/seo/faq-json-ld";
import { buildSpanishOnlyMarketingAlternates } from "@/lib/seo/spanish-named-routes";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { EditorialFrame } from "@/components/marketing/editorial-image";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";

/**
 * `/sitios-web` — Spanish-first SEO sibling of `/websites`, exactly the
 * relationship `/agencia-de-talento` has with `/agencies`. The Riviera Maya
 * market searches in Spanish ("pagina web para restaurante", "sitios web"),
 * so the ES rendering is the primary one and carries the quality bar; the EN
 * rendering via `pickLocale` reframes rather than literally translating.
 *
 * The reader is the talent who owns a place: a chef with a parrilla, a DJ who
 * runs a bar, a dancer with a studio. Not a separate species of customer.
 *
 * FAQ is rendered visibly and mirrored into FAQPage JSON-LD from the same
 * array (pattern: `agencia-de-talento/page.tsx`), plus a BreadcrumbList.
 *
 * HONESTY GUARDRAILS (same as `/websites`): reservation REQUESTS into an
 * inbox, never a reservation system with time slots or capacity; no online
 * ordering; no talent roster on this tier; no Studio/Agency prices here.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const title = pickLocale(locale, {
    en: "Websites for restaurants, cafes and studios",
    es: "Páginas web para restaurantes, cafés y estudios",
  });
  const description = pickLocale(locale, {
    en: `A website on your own domain for $12 a month, in English and Spanish, with reservation requests in your inbox, deposits taken online, and the ability to book talent from the same ${PLATFORM_BRAND.name} account.`,
    es: `Una página web en tu propio dominio por 12 USD al mes, en español e inglés, con solicitudes de reserva en tu bandeja, anticipos cobrados en línea y la posibilidad de contratar talento desde la misma cuenta de ${PLATFORM_BRAND.name}.`,
  });
  return {
    title,
    description,
    // Explicit OG block: without it the root layout's English platform
    // boilerplate wins and the Spanish page unfurls in English on WhatsApp,
    // which is how these links actually travel in this market.
    openGraph: {
      title,
      description,
      siteName: PLATFORM_BRAND.name,
      url: `https://${PLATFORM_BRAND.domain}${withLocalePath("/sitios-web", locale)}`,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
    // This route is locale PINNED to Spanish, so it serves Spanish at both
    // `/sitios-web` and `/es/sitios-web`. The generic helper was advertising an
    // `en` alternate at `/sitios-web`, promising search engines an English
    // document at a URL that has never served one. Its two siblings
    // (/agencia-de-talento, /contratar-modelos) already use the honest helper.
    ...buildSpanishOnlyMarketingAlternates("/sitios-web"),
  };
}

export default async function SitiosWebPage() {
  const locale = await getRequestLocale();
  const L = (href: string) => withLocaleHref(href, locale);
  // Locale-aware on purpose: the JSON-LD `@id`/`url` must be the SAME URL as
  // the page's canonical, or the ES page ships FAQPage markup describing the
  // EN URL and the rich result can be dropped.
  const pageUrl = `https://${PLATFORM_BRAND.domain}${withLocalePath("/sitios-web", locale)}`;

  const t = pickLocale(locale, {
    en: {
      heroEyebrow: "Websites",
      heroTitle: "A website that speaks both languages of your customers.",
      heroSubtitle:
        "For the restaurant, the cafe, the beach club, the salon, the studio. Your own domain, English and Spanish, reservation requests landing in your inbox, deposits taken online. $12 a month.",
      heroPrimary: "Start free",
      heroSecondary: "See the Website plan",
      stepsEyebrow: "How it works",
      stepsIntro:
        "A website should do more than sit there. This one takes the request, takes the deposit, and, when Friday needs music, books the act.",
      steps: [
        {
          title: "Publish the pages",
          body: "Menu, hours, map, photos, story. Written once, published in English and Spanish on your own domain.",
        },
        {
          title: "Take the request",
          body: "Reservation requests arrive in a shared inbox, and a click-to-chat button moves the conversation to WhatsApp where you already answer.",
        },
        {
          title: "Take the deposit",
          body: "For the nights worth holding, New Year's, a private room, a tasting menu, the site collects the deposit before the date.",
        },
        {
          title: "Book the talent",
          body: "The same account searches the platform directory, sends a structured request, and pays the confirmed offer in the same chat.",
        },
      ],
      stepsCta: "See the Website plan",
      storyEyebrow: "El Paisa Parrilla",
      storyTitle: "You run the kitchen. The website runs itself.",
      storyBody:
        "El Paisa is an Argentine parrilla. Its menu, hours, map and photos live on its own domain, in Spanish for the neighbourhood and in English for the people walking over from the hotels. Reservation requests land in one inbox instead of five chats. For New Year's dinner the site collects a deposit up front. And the tango duo that plays on Fridays was booked from the same account that publishes the menu.",
      pricingEyebrow: "The price",
      pricingBody:
        "$12 a month for the Website plan: your own domain, English and Spanish, forms with a shared inbox, WhatsApp click-to-chat, SEO tools, a media library, and payments. There is no talent roster on this plan, and you do not need one to book talent. A free tier gives you three pages on a tulala address while you decide.",
      pricingCta: "Compare every plan",
      faqEyebrow: "Common questions",
      faq: [
        {
          q: "What does the $12 Website plan include?",
          a: "A website on your own domain in English and Spanish, forms with a shared inbox, WhatsApp click-to-chat, SEO tools, a media library, and payments so you can take deposits. It does not include a talent roster.",
        },
        {
          q: "Can my customers reserve a table?",
          a: "They can send a reservation request from your site, which arrives in your inbox as a real message you answer. It is a request inbox, not a table system with time slots or capacity.",
        },
        {
          q: "Can I sell food online through the site?",
          a: "No. There is no online ordering or shopping cart. What the site does take is deposits and payments for the bookings you confirm.",
        },
        {
          q: "How does a venue book a band or a DJ here?",
          a: "From the same account. Search the platform directory by craft, city and date, send a structured request, and pay the priced offer inside the booking chat once you confirm it.",
        },
        {
          q: "Is there a free option?",
          a: "Yes. The free tier gives you three pages on a tulala address. Moving to your own domain, both languages and payments is what the $12 plan adds.",
        },
      ],
      closingLine: "Sell what you do, not what you ship.",
    },
    es: {
      heroEyebrow: "Páginas web",
      heroTitle: "Una página que habla los dos idiomas de tus clientes.",
      heroSubtitle:
        "Para el restaurante, el café, el beach club, el salón, el estudio. Tu propio dominio, español e inglés, solicitudes de reserva que llegan a tu bandeja y anticipos cobrados en línea. 12 USD al mes.",
      heroPrimary: "Empieza gratis",
      heroSecondary: "Ver el plan Página web",
      stepsEyebrow: "Cómo funciona",
      stepsIntro:
        "Una página web debería hacer más que estar ahí. Esta recibe la solicitud, cobra el anticipo y, cuando el viernes pide música, contrata el acto.",
      steps: [
        {
          title: "Publica las páginas",
          body: "Menú, horarios, mapa, fotos, historia. Se escriben una vez y se publican en español e inglés en tu propio dominio.",
        },
        {
          title: "Recibe la solicitud",
          body: "Las solicitudes de reserva llegan a una bandeja compartida, y un botón de chat lleva la conversación a WhatsApp, donde ya respondes.",
        },
        {
          title: "Cobra el anticipo",
          body: "Para las noches que vale la pena apartar, Año Nuevo, un privado, un menú de degustación, la página cobra el anticipo antes de la fecha.",
        },
        {
          title: "Contrata el talento",
          body: "La misma cuenta busca en el directorio de la plataforma, envía una solicitud estructurada y paga la oferta confirmada en el mismo chat.",
        },
      ],
      stepsCta: "Ver el plan Página web",
      storyEyebrow: "El Paisa Parrilla",
      storyTitle: "Tú llevas la cocina. La página se lleva sola.",
      storyBody:
        "El Paisa es una parrilla argentina. Su menú, sus horarios, su mapa y sus fotos viven en su propio dominio, en español para el barrio y en inglés para quienes bajan de los hoteles. Las solicitudes de reserva llegan a una sola bandeja, no a cinco chats. Para la cena de Año Nuevo la página cobra el anticipo por adelantado. Y el dúo de tango que toca los viernes se contrató desde la misma cuenta que publica el menú.",
      pricingEyebrow: "El precio",
      pricingBody:
        "12 USD al mes por el plan Página web: tu propio dominio, español e inglés, formularios con bandeja compartida, WhatsApp a un toque, herramientas de SEO, biblioteca de medios y pagos para cobrar anticipos. Este plan no incluye roster de talento, y no necesitas uno para contratar talento. El plan gratuito te da tres páginas en una dirección de tulala mientras decides.",
      pricingCta: "Comparar todos los planes",
      faqEyebrow: "Preguntas frecuentes",
      faq: [
        {
          q: "¿Qué incluye el plan Página web de 12 USD?",
          a: "Una página web en tu propio dominio en español e inglés, formularios con bandeja compartida, WhatsApp a un toque, herramientas de SEO, biblioteca de medios y pagos para cobrar anticipos. No incluye roster de talento.",
        },
        {
          q: "¿Mis clientes pueden reservar mesa?",
          a: "Pueden enviar una solicitud de reserva desde tu página, y llega a tu bandeja como un mensaje real que tú respondes. Es una bandeja de solicitudes, no un sistema de mesas con horarios ni cupo.",
        },
        {
          q: "¿Puedo vender comida en línea desde la página?",
          a: "No. No hay pedidos en línea ni carrito de compras. Lo que sí cobra la página son anticipos y pagos de las reservas que tú confirmas.",
        },
        {
          q: "¿Cómo contrata un lugar a una banda o a un DJ aquí?",
          a: "Desde la misma cuenta. Busca en el directorio de la plataforma por oficio, ciudad y fecha, envía una solicitud estructurada y paga la oferta con precio dentro del chat de la reserva cuando la confirmes.",
        },
        {
          q: "¿Hay una opción gratuita?",
          a: "Sí. El plan gratuito te da tres páginas en una dirección de tulala. El plan de 12 USD agrega tu propio dominio, los dos idiomas y los pagos.",
        },
      ],
      closingLine: "Vende lo que haces, no lo que envías.",
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
        sourcePage="sitios-web"
        primary={{ label: t.heroPrimary, href: L("/get-started"), intent: "website-start" }}
        secondary={{ label: t.heroSecondary, href: L("/websites"), intent: "websites" }}
      />

      {/* Publish -> request -> deposit -> book the talent. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <MarketingEyebrow>{t.stepsEyebrow}</MarketingEyebrow>
              <p
                className="mt-6 max-w-xl text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {t.stepsIntro}
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
                  href={L("/websites")}
                  className="inline-flex min-h-11 items-center rounded-full px-5 text-[0.9375rem] transition-colors"
                  style={{
                    border: "1px solid var(--plt-hairline-strong)",
                    color: "var(--plt-ink-strong)",
                  }}
                >
                  {t.stepsCta}
                </Link>
              </div>
            </div>
            <EditorialFrame photo={MARKETING_PHOTOS.hostsRestaurant} aspect="portrait" size="lg" />
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Anchor story. */}
      <MarketingSection style={{ background: "var(--plt-bg-raised)" }}>
        <MarketingContainer size="wide">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <EditorialFrame photo={CASE_STUDY_PHOTOS.chefs} aspect="landscape" size="lg" />
            <div>
              <MarketingEyebrow>{t.storyEyebrow}</MarketingEyebrow>
              <h2
                className="plt-display mt-5 text-[2rem] font-medium leading-[1.06] tracking-[-0.02em] sm:text-[2.35rem]"
                style={{ color: "var(--plt-ink)" }}
              >
                {t.storyTitle}
              </h2>
              <p
                className="mt-6 text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {t.storyBody}
              </p>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Price. Only the Website plan and the free tier: rest lives on /pricing. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <MarketingEyebrow>{t.pricingEyebrow}</MarketingEyebrow>
          <p
            className="mt-6 max-w-2xl text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {t.pricingBody}
          </p>
          <div className="mt-8">
            <Link
              href={L("/pricing")}
              className="inline-flex min-h-11 items-center rounded-full px-5 text-[0.9375rem] transition-colors"
              style={{
                border: "1px solid var(--plt-hairline-strong)",
                color: "var(--plt-ink-strong)",
              }}
            >
              {t.pricingCta}
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
          <p
            className="plt-display mt-12 text-[1.5rem] leading-[1.2] tracking-[-0.01em] sm:text-[1.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {t.closingLine}
          </p>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
