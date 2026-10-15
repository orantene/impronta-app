import type { Metadata } from "next";
import { FeatureGridSection } from "@/components/marketing/feature-grid-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { ProductTourSection } from "@/components/marketing/product-tour-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MARKETING_PHOTOS, type MarketingPhoto } from "@/lib/marketing/photography";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "For agencies & representation",
      es: "Para agencias y representación",
    }),
    description: pickLocale(locale, {
      en: "Run a branded roster site on your own domain, manage people in a modern CMS, and convert inquiries through a real pipeline, not a spreadsheet.",
      es: "Software para agencias de talento: sitio con tu marca en tu dominio, perfiles de tu gente y solicitudes en un pipeline real, no en una hoja de cálculo.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/agencies"),
  };
}

type L = { en: string; es: string };
type Pillar = {
  id: string;
  index: string;
  eyebrow: L;
  title: L;
  body: L;
  bullets: L[];
  art: "site" | "roster" | "pipeline";
};

const PILLARS: Pillar[] = [
  {
    id: "site",
    index: "01",
    eyebrow: { en: "Branded site", es: "Sitio con tu marca" },
    title: { en: "Your identity is yours, not a template\u2019s.", es: "Tu identidad es tuya, no de una plantilla." },
    body: {
      en: "A real editorial website on your own domain, managed in a modern CMS. Navigation, pages, posts, design tokens: you own the whole surface.",
      es: "Un sitio editorial de verdad en tu propio dominio, administrado desde un CMS moderno. Navegación, páginas, publicaciones y estilos: toda la superficie es tuya.",
    },
    bullets: [
      { en: "Custom domain, SSL, DNS handled", es: "Dominio propio, SSL y DNS resueltos" },
      { en: "CMS-driven pages, posts, navigation", es: "Páginas, publicaciones y navegación desde el CMS" },
      { en: "Design system with typography + token presets", es: "Sistema de diseño con tipografías y estilos predefinidos" },
      { en: "Multi-locale (en / es, more on request)", es: "Multilingüe (inglés y español, más idiomas a pedido)" },
    ],
    art: "site",
  },
  {
    id: "roster",
    index: "02",
    eyebrow: { en: "People profiles", es: "Perfiles de personas" },
    title: { en: "The profile your roster deserves.", es: "El perfil que tu equipo merece." },
    body: {
      en: "Structured taxonomy, media pipeline, specs, availability, and portfolio, presented editorially. One URL per person, rendering everywhere.",
      es: "Categorías estructuradas, medios, medidas, disponibilidad y portafolio, presentados con estilo editorial. Una URL por persona, que se ve bien en todas partes.",
    },
    bullets: [
      { en: "Rich people profiles with locale support", es: "Perfiles completos con soporte de idiomas" },
      { en: "Editorial portfolio rendering (no builder vibes)", es: "Portafolio con presentación editorial, sin aspecto de plantilla" },
      { en: "Availability + rates + specs in structured fields", es: "Disponibilidad, tarifas y medidas en campos estructurados" },
      { en: "Share each profile as its own link", es: "Comparte cada perfil con su propio enlace" },
    ],
    art: "roster",
  },
  {
    id: "pipeline",
    index: "03",
    eyebrow: { en: "Inquiry pipeline", es: "Pipeline de solicitudes" },
    title: { en: "From inquiry to booking, not another thread.", es: "De la solicitud a la reserva, sin otro hilo de mensajes." },
    body: {
      en: "Structured intake, versioned offers, multi-party approvals, bookings that become real calendar events. Every step traceable.",
      es: "Solicitudes estructuradas, ofertas con versiones, aprobaciones entre varias partes y reservas que se vuelven eventos de calendario. Cada paso queda registrado.",
    },
    bullets: [
      { en: "Structured inquiry inbox (not chat)", es: "Bandeja de solicitudes estructurada (no un chat)" },
      { en: "Versioned offers with approval flow", es: "Ofertas con versiones y flujo de aprobación" },
      { en: "Multi-party sign-off: client, talent, ops", es: "Visto bueno de todas las partes: cliente, talento y operaciones" },
      { en: "Bookings \u2192 calendar \u2192 invoicing-ready data", es: "Reservas \u2192 calendario \u2192 datos listos para facturar" },
    ],
    art: "pipeline",
  },
];

export default async function AgenciesPage() {
  const locale = await getRequestLocale();
  return (
    <>
      <SimplePageHero
        eyebrow={pickLocale(locale, { en: "For agencies & representation", es: "Para agencias y representación" })}
        title={
          <>
            {pickLocale(locale, { en: "Your agency,", es: "Tu agencia," })}
            <br />
            <span style={{ color: "var(--plt-forest)" }}>
              {pickLocale(locale, { en: "rebuilt for 2026.", es: "renovada para 2026." })}
            </span>
          </>
        }
        subtitle={pickLocale(locale, {
          en: `Representation businesses run on people, not software, until the software gets in the way. ${PLATFORM_BRAND.name} gives you the real infrastructure: a branded site, structured profiles, a real inquiry pipeline, and permissions to scale past a single phone.`,
          es: `Las agencias de representación funcionan con personas, no con software, hasta que la falta de software estorba. ${PLATFORM_BRAND.name} te da la infraestructura real: un sitio con tu marca, perfiles estructurados, un pipeline de solicitudes y permisos para crecer más allá de un solo teléfono.`,
        })}
        primary={{ label: pickLocale(locale, { en: "Start 14-day trial", es: "Empieza tu prueba de 14 días" }), href: "/get-started?tier=agency", intent: "trial" }}
        secondary={{ label: pickLocale(locale, { en: "See pricing", es: "Ver precios" }), href: "/pricing", intent: "pricing" }}
        sourcePage="agencies-hero"
      />

      {PILLARS.map((pillar, i) => (
        <MarketingSection
          key={pillar.id}
          id={pillar.id}
          className="relative"
          style={{
            background:
              i % 2 === 0 ? "var(--plt-bg)" : "var(--plt-bg-raised)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "var(--plt-hairline)" }}
          />
          <MarketingContainer size="wide">
            <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
              <div className={i % 2 === 0 ? "order-1" : "md:order-2"}>
                <div className="flex items-baseline gap-4">
                  <span
                    aria-hidden
                    className="plt-mono text-[0.75rem] tracking-[0.28em]"
                    style={{ color: "var(--plt-forest)" }}
                  >
                    {pillar.index}
                  </span>
                  <MarketingEyebrow>{pickLocale(locale, pillar.eyebrow)}</MarketingEyebrow>
                </div>
                <h2
                  className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.5rem]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {pickLocale(locale, pillar.title)}
                </h2>
                <p
                  className="mt-5 max-w-lg text-[1.0625rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {pickLocale(locale, pillar.body)}
                </p>
                <ul className="mt-8 space-y-3">
                  {pillar.bullets.map((b) => (
                    <li
                      key={b.en}
                      className="flex items-start gap-3 text-[0.9375rem] leading-[1.55]"
                      style={{ color: "var(--plt-ink-soft)" }}
                    >
                      <span
                        className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--plt-forest)" }}
                        aria-hidden
                      />
                      {pickLocale(locale, b)}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={i % 2 === 0 ? "order-2" : "md:order-1"}>
                <PillarArt variant={pillar.art} locale={locale} />
              </div>
            </div>
          </MarketingContainer>
        </MarketingSection>
      ))}

      <FeatureGridSection />
      <ProductTourSection />
      <FinalCtaSection />
    </>
  );
}

function PillarArt({ variant, locale }: { variant: "site" | "roster" | "pipeline"; locale: string }) {
  if (variant === "site") {
    return (
      <PhotoPillarArt
        photo={MARKETING_PHOTOS.agencyBuilder}
        eyebrow={pickLocale(locale, { en: "Workspace live", es: "Tu espacio, en vivo" })}
        title={pickLocale(locale, { en: "Website, inquiries, roster.", es: "Sitio, solicitudes y equipo." })}
        statA={{ label: pickLocale(locale, { en: "Domain", es: "Dominio" }), value: pickLocale(locale, { en: "Custom", es: "Propio" }) }}
        statB={{ label: pickLocale(locale, { en: "Setup", es: "Configuración" }), value: pickLocale(locale, { en: "Fast", es: "Rápida" }) }}
      />
    );
  }
  if (variant === "roster") {
    return (
      <PhotoPillarArt
        photo={MARKETING_PHOTOS.heroServices}
        eyebrow={pickLocale(locale, { en: "People as product", es: "Las personas, tu producto" })}
        title={pickLocale(locale, { en: "Profiles clients want to click.", es: "Perfiles en los que tus clientes quieren hacer clic." })}
        statA={{ label: pickLocale(locale, { en: "Profiles", es: "Perfiles" }), value: pickLocale(locale, { en: "Rich", es: "Completos" }) }}
        statB={{ label: pickLocale(locale, { en: "Media", es: "Medios" }), value: "Premium" }}
      />
    );
  }
  return (
    <PhotoPillarArt
      photo={MARKETING_PHOTOS.hubDiscovery}
      eyebrow="Pipeline"
      title={pickLocale(locale, { en: "Every request gets a home.", es: "Cada solicitud tiene su lugar." })}
      statA={{ label: pickLocale(locale, { en: "Inbox", es: "Bandeja" }), value: pickLocale(locale, { en: "Structured", es: "Estructurada" }) }}
      statB={{ label: pickLocale(locale, { en: "Source", es: "Origen" }), value: pickLocale(locale, { en: "Tracked", es: "Rastreado" }) }}
    />
  );
}

function PhotoPillarArt({
  photo,
  eyebrow,
  title,
  statA,
  statB,
}: {
  photo: MarketingPhoto;
  eyebrow: string;
  title: string;
  statA: { label: string; value: string };
  statB: { label: string; value: string };
}) {
  return (
    <figure
      className="relative min-h-[24rem] overflow-hidden rounded-[28px]"
      style={{
        background: "var(--plt-bg-deep)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow:
          "0 40px 80px -42px rgba(15,23,20,0.45), 0 14px 32px -24px rgba(31,74,58,0.3)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url()}
        alt={photo.alt}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(15,23,20,0.04) 10%, rgba(15,23,20,0.58) 100%)" }}
      />
      <figcaption className="absolute inset-x-5 bottom-5 sm:inset-x-6 sm:bottom-6">
        <span
          className="plt-mono text-[0.6875rem] font-medium uppercase"
          style={{ color: "rgba(241,237,227,0.72)" }}
        >
          {eyebrow}
        </span>
        <h3
          className="plt-display mt-2 max-w-[24rem] text-[1.85rem] font-semibold leading-[1.06]"
          style={{ color: "var(--plt-on-inverse)" }}
        >
          {title}
        </h3>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          {[statA, statB].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[16px] px-4 py-3 backdrop-blur-md"
              style={{
                background: "rgba(241,237,227,0.12)",
                border: "1px solid rgba(241,237,227,0.16)",
                color: "var(--plt-on-inverse)",
              }}
            >
              <dt className="plt-mono text-[0.625rem] uppercase" style={{ color: "rgba(241,237,227,0.62)" }}>
                {stat.label}
              </dt>
              <dd className="mt-1 text-[0.9375rem] font-semibold">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}
