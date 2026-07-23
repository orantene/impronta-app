import type { Metadata } from "next";
import Link from "next/link";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { EditorialFrame } from "@/components/marketing/editorial-image";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "About", es: "Nosotros" }),
    description: pickLocale(locale, {
      en: "Tulala is the commerce platform for talent: a branded storefront, structured bookings, and payment in the chat. What we believe, what we build, and who it\u2019s for.",
      es: "Tulala es la plataforma de comercio para el talento: una tienda con tu marca, reservas estructuradas y pago dentro del chat. En qué creemos, qué construimos y para quién es.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/about"),
  };
}

type BuildCard = {
  tag: string;
  title: string;
  body: string;
};

function getBuildCards(locale: string): BuildCard[] {
  return pickLocale(locale, {
    en: [
      {
        tag: "Storefront",
        title: "A branded storefront, built with the page builder",
        body: "Your own site, your own layout, no code required. Free on a Tulala subdomain to start; your own domain once you\u2019re on a paid plan.",
      },
      {
        tag: "Booking messenger",
        title: "Structured inquiries, priced offers, payment in the chat",
        body: "Every inquiry becomes a real conversation: a priced offer, a confirmed booking, and payment, all inside the same thread instead of scattered across apps.",
      },
      {
        tag: "Discovery network",
        title: "A shared discovery network, opt-in",
        body: "Turn on the shared directory per profile so clients browsing the network can find you too, on top of the traffic your own storefront already brings.",
      },
    ],
    es: [
      {
        tag: "Tienda",
        title: "Una tienda con tu marca, hecha con el constructor de páginas",
        body: "Tu propio sitio, tu propio diseño, sin necesidad de programar. Gratis en un subdominio de Tulala para empezar; tu propio dominio cuando subas a un plan de pago.",
      },
      {
        tag: "Mensajería de reservas",
        title: "Consultas estructuradas, ofertas con precio, pago en el chat",
        body: "Cada consulta se convierte en una conversación de verdad: una oferta con precio, una reserva confirmada y el pago, todo dentro del mismo chat en vez de repartido entre varias apps.",
      },
      {
        tag: "Red de descubrimiento",
        title: "Una red de descubrimiento compartida, opcional",
        body: "Activa el directorio compartido por perfil para que los clientes que exploran la red también te encuentren, además del tráfico que ya te trae tu propia tienda.",
      },
    ],
  });
}

type AudienceLink = {
  title: string;
  body: string;
  href: string;
};

function getAudienceLinks(locale: string): AudienceLink[] {
  return pickLocale(locale, {
    en: [
      {
        title: "Independent talent",
        body: "Solo operators and small studios claiming a real storefront and running one inbox instead of five.",
        href: "/operators",
      },
      {
        title: "Agencies & studios",
        body: "Multi-seat teams running a branded roster, a shared pipeline, and coordinators who need real access control.",
        href: "/agencies",
      },
      {
        title: "Staffing networks & hubs",
        body: "Casting, staffing, and placement operations that need a directory that actually filters and a pipeline built for volume.",
        href: "/organizations",
      },
      {
        title: "Browse the network",
        body: "See the shared discovery network for yourself: every roster that has opted in, searchable in one place.",
        href: "/directory",
      },
    ],
    es: [
      {
        title: "Talento independiente",
        body: "Operadores solos y estudios pequeños que reclaman una tienda real y llevan una sola bandeja en vez de cinco.",
        href: "/operators",
      },
      {
        title: "Agencias y estudios",
        body: "Equipos con varios usuarios que llevan un roster con su marca, un pipeline compartido y coordinadores con accesos reales.",
        href: "/agencies",
      },
      {
        title: "Redes de staffing y hubs",
        body: "Operaciones de casting, staffing y colocación que necesitan un directorio que sí filtra y un pipeline hecho para volumen.",
        href: "/organizations",
      },
      {
        title: "Explora la red",
        body: "Conoce la red de descubrimiento compartida: cada roster que decidió sumarse, en un solo lugar buscable.",
        href: "/directory",
      },
    ],
  });
}

export default async function AboutPage() {
  const locale = await getRequestLocale();
  const buildCards = getBuildCards(locale);
  const audienceLinks = getAudienceLinks(locale);

  const c = pickLocale(locale, {
    en: {
      heroEyebrow: "About",
      heroTitleA: "Software for",
      heroTitleB: "talent businesses.",
      heroSubtitle:
        "Tulala is the commerce platform for talent: a branded storefront, a structured booking pipeline, and a shared discovery network, in one place.",
      heroPrimary: "Start free",
      heroSecondary: "See how it works",
      believeEyebrow: "What we believe",
      believeLead:
        "A lot of talent businesses still run on DMs and screenshots: an inquiry buried in Instagram, a price quoted in a text thread, a deposit sent to a personal account. It works, until it doesn\u2019t scale, until a message gets lost, until nobody remembers what was agreed.",
      believeBody:
        "We believe independent talent, agencies, and staffing networks deserve the same real business infrastructure any other commerce business gets: a storefront that\u2019s actually theirs, a booking pipeline that turns an inquiry into a priced offer, and payment that happens in the same thread instead of a separate app.",
      visionLine1: "Your Talent.",
      visionLine2: "Your Business.",
      visionLine3: "Your Digital World.",
      buildEyebrow: "What we build",
      buildHeadingA: "The three pieces of",
      buildHeadingB: "a real talent business.",
      forEyebrow: "Who it\u2019s for",
      forHeadingA: "Independent talent.",
      forHeadingB: "Agencies. Staffing networks.",
      talkEyebrow: "Talk to us",
      talkHeading: "One inbox. No ticket queue.",
      talkBody:
        "Questions about the product, your account, or partnering with Tulala? Email us. We reply the same day, there\u2019s no separate contact form, this is it.",
      talkCta: "Email hello@" + PLATFORM_BRAND.domain,
    },
    es: {
      heroEyebrow: "Nosotros",
      heroTitleA: "Software para",
      heroTitleB: "negocios de talento.",
      heroSubtitle:
        "Tulala es la plataforma de comercio para el talento: una tienda con tu marca, un pipeline de reservas estructurado y una red de descubrimiento compartida, todo en un solo lugar.",
      heroPrimary: "Empieza gratis",
      heroSecondary: "Mira cómo funciona",
      believeEyebrow: "En qué creemos",
      believeLead:
        "Muchos negocios de talento todavía funcionan a base de DMs y capturas de pantalla: una consulta perdida en Instagram, un precio cotizado en un chat, un anticipo enviado a una cuenta personal. Funciona, hasta que deja de escalar, hasta que se pierde un mensaje, hasta que nadie recuerda qué se acordó.",
      believeBody:
        "Creemos que el talento independiente, las agencias y las redes de staffing merecen la misma infraestructura de negocio real que tiene cualquier otro comercio: una tienda que de verdad es suya, un pipeline de reservas que convierte una consulta en una oferta con precio, y un pago que sucede en el mismo chat, no en otra app aparte.",
      visionLine1: "Tu Talento.",
      visionLine2: "Tu Negocio.",
      visionLine3: "Tu Mundo Digital.",
      buildEyebrow: "Qué construimos",
      buildHeadingA: "Las tres piezas de",
      buildHeadingB: "un negocio de talento real.",
      forEyebrow: "Para quién es",
      forHeadingA: "Talento independiente.",
      forHeadingB: "Agencias. Redes de staffing.",
      talkEyebrow: "Habla con nosotros",
      talkHeading: "Un solo buzón. Sin fila de tickets.",
      talkBody:
        "¿Dudas sobre el producto, tu cuenta o cómo asociarte con Tulala? Escríbenos. Respondemos el mismo día, no hay un formulario de contacto aparte, esta es la vía.",
      talkCta: "Escribir a hello@" + PLATFORM_BRAND.domain,
    },
  });

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `https://${PLATFORM_BRAND.domain}/` },
    { name: c.heroEyebrow, url: `https://${PLATFORM_BRAND.domain}/about` },
  ]);

  const mailHref = `mailto:hello@${PLATFORM_BRAND.domain}`;

  return (
    <>
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdToString(breadcrumbJsonLd) }}
        />
      ) : null}

      <SimplePageHero
        eyebrow={c.heroEyebrow}
        title={
          <>
            {c.heroTitleA}
            <br />
            <span style={{ color: "var(--plt-forest)" }}>{c.heroTitleB}</span>
          </>
        }
        subtitle={c.heroSubtitle}
        primary={{ label: c.heroPrimary, href: "/get-started", intent: "get-started" }}
        secondary={{ label: c.heroSecondary, href: "/how-it-works", intent: "how-it-works" }}
        sourcePage="about-hero"
      />

      {/* What we believe — the emotional anchor. This is the one place the
          vision line is *stated* at display scale; FinalCtaSection repeats it
          as a small closing signature on every marketing page, so /about
          bookends it. Keep the two strings identical to copy.ts `cta.vision`. */}
      <MarketingSection className="relative" style={{ background: "var(--plt-bg-raised)" }}>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "var(--plt-hairline)" }}
        />
        <MarketingContainer size="wide">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <MarketingEyebrow>{c.believeEyebrow}</MarketingEyebrow>
              <p
                className="mt-6 text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
                style={{ color: "var(--plt-ink-soft)" }}
              >
                {c.believeLead}
              </p>
              <p
                className="mt-5 text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {c.believeBody}
              </p>

              <p className="plt-display mt-10 text-[2rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-[2.5rem]">
                <span style={{ color: "var(--plt-ink)" }}>
                  {c.visionLine1} {c.visionLine2}
                </span>
                <br />
                <span style={{ color: "var(--plt-forest)" }}>{c.visionLine3}</span>
              </p>
            </div>

            <EditorialFrame
              photo={MARKETING_PHOTOS.audienceTalent}
              aspect="landscape"
              size="lg"
            />
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* What we build — the actual product surfaces, factually described. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <MarketingEyebrow>{c.buildEyebrow}</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              {c.buildHeadingA}
              <br className="hidden sm:block" />{" "}
              <span style={{ color: "var(--plt-forest)" }}>{c.buildHeadingB}</span>
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3 md:gap-6">
            {buildCards.map((card) => (
              <article
                key={card.tag}
                className="group relative overflow-hidden rounded-[28px] p-7 transition-all duration-300 hover:-translate-y-0.5 sm:p-8"
                style={{
                  background: "var(--plt-bg)",
                  border: "1px solid var(--plt-hairline)",
                  boxShadow: "0 1px 2px rgba(15,23,20,0.04)",
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--plt-forest) 0%, var(--plt-forest-bright) 100%)",
                  }}
                />
                <span
                  className="plt-mono text-[0.6875rem] uppercase tracking-[0.22em]"
                  style={{ color: "var(--plt-forest)" }}
                >
                  {card.tag}
                </span>
                <h3
                  className="plt-display mt-3 text-[1.375rem] font-medium leading-[1.2] tracking-[-0.02em]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {card.title}
                </h3>
                <p
                  className="mt-4 text-[0.9375rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Who it's for — links out to the real audience pages. */}
      <MarketingSection className="relative" style={{ background: "var(--plt-bg-raised)" }}>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "var(--plt-hairline)" }}
        />
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <MarketingEyebrow>{c.forEyebrow}</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              {c.forHeadingA}
              <br className="hidden sm:block" />{" "}
              <span style={{ color: "var(--plt-forest)" }}>{c.forHeadingB}</span>
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 sm:gap-6">
            {audienceLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col rounded-[22px] p-6 transition-colors duration-200 sm:p-7"
                style={{
                  background: "var(--plt-bg-elevated)",
                  border: "1px solid var(--plt-hairline)",
                }}
              >
                <span
                  className="text-[1.1875rem] font-semibold leading-snug"
                  style={{ color: "var(--plt-ink-strong)" }}
                >
                  {link.title}
                </span>
                <span
                  className="mt-2 text-[0.9375rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {link.body}
                </span>
              </Link>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Talk to us — the real contact surface. Deliberately no separate
          /contact page: this email is it. */}
      <MarketingSection spacing="tight">
        <MarketingContainer size="default">
          <div
            className="rounded-[28px] p-8 text-center sm:p-12"
            style={{
              background: "var(--plt-bg-elevated)",
              border: "1px solid var(--plt-hairline)",
            }}
          >
            <MarketingEyebrow>{c.talkEyebrow}</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[1.75rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[2.25rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              {c.talkHeading}
            </h2>
            <p
              className="mx-auto mt-4 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.talkBody}
            </p>
            <a
              href={mailHref}
              className="mt-8 inline-flex h-14 items-center justify-center rounded-full border px-7 text-[0.9375rem] font-medium leading-none transition-colors duration-200 hover:border-[var(--plt-ink)]"
              style={{
                borderColor: "var(--plt-hairline-strong)",
                background: "var(--plt-bg-raised)",
                color: "var(--plt-ink)",
              }}
            >
              {c.talkCta}
            </a>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
