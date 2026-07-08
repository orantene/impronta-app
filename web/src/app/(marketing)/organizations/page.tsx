import type { Metadata } from "next";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { FeatureGridSection } from "@/components/marketing/feature-grid-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { getRequestLocale } from "@/i18n/request-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "For staffing, casting & placement",
  description:
    "A taxonomy-driven people directory that actually works, for staffing, casting, placement, and large representation operations.",
};

type UseCase = {
  id: string;
  tag: string;
  title: string;
  body: string;
  metrics: { label: string; value: string }[];
};

function getUseCases(locale: string): UseCase[] {
  return pickLocale(locale, {
    en: [
      {
        id: "casting",
        tag: "Casting",
        title: "Casting & talent placement",
        body: "Curate the roster, expose it to clients through a filterable directory, and capture structured casting briefs that become real bookings.",
        metrics: [
          { label: "Roster capacity", value: "Unlimited" },
          { label: "Attribute filters", value: "20+" },
        ],
      },
      {
        id: "staffing",
        tag: "Staffing",
        title: "Staffing & specialized recruiters",
        body: "Whether you place performers, crew, coordinators, or domain specialists \u2014 organize people by skill, location, and availability, and surface the right match fast.",
        metrics: [
          { label: "Skill taxonomy", value: "Custom" },
          { label: "Availability", value: "Live" },
        ],
      },
      {
        id: "speakers",
        tag: "Speaker bureaus",
        title: "Speaker bureaus & content rosters",
        body: "Profiles with presenter bios, topic taxonomy, rate cards, and geography. Clients browse what they need, contact through structured intake.",
        metrics: [
          { label: "Topic tags", value: "Unlimited" },
          { label: "Rate cards", value: "Versioned" },
        ],
      },
      {
        id: "internal",
        tag: "Internal directory",
        title: "Internal directories for large firms",
        body: "A private network variant for organizations that need a rich, role-scoped directory without exposing anything publicly.",
        metrics: [
          { label: "Access", value: "Role-scoped" },
          { label: "Audit trail", value: "Full" },
        ],
      },
    ],
    es: [
      {
        id: "casting",
        tag: "Casting",
        title: "Casting y colocaci\u00f3n de talento",
        body: "Arma tu roster, mu\u00e9stralo a los clientes en un directorio con filtros y recibe briefs de casting estructurados que se vuelven reservas de verdad.",
        metrics: [
          { label: "Capacidad de roster", value: "Ilimitada" },
          { label: "Filtros por atributo", value: "20+" },
        ],
      },
      {
        id: "staffing",
        tag: "Staffing",
        title: "Staffing y reclutadores especializados",
        body: "Ya coloques performers, crew, coordinadores o especialistas \u2014 organiza a tu gente por habilidad, ubicaci\u00f3n y disponibilidad, y encuentra al indicado en segundos.",
        metrics: [
          { label: "Taxonom\u00eda de skills", value: "A medida" },
          { label: "Disponibilidad", value: "En vivo" },
        ],
      },
      {
        id: "speakers",
        tag: "Speaker bureaus",
        title: "Speaker bureaus y rosters de contenido",
        body: "Perfiles con bios de ponentes, taxonom\u00eda de temas, tarifarios y geograf\u00eda. Los clientes buscan lo que necesitan y contactan por un intake estructurado.",
        metrics: [
          { label: "Etiquetas de tema", value: "Ilimitadas" },
          { label: "Tarifarios", value: "Versionados" },
        ],
      },
      {
        id: "internal",
        tag: "Directorio interno",
        title: "Directorios internos para empresas grandes",
        body: "Una variante de red privada para organizaciones que necesitan un directorio completo y por roles, sin exponer nada al p\u00fablico.",
        metrics: [
          { label: "Acceso", value: "Por rol" },
          { label: "Bit\u00e1cora", value: "Completa" },
        ],
      },
    ],
  });
}

function getScaleFeatures(locale: string): string[] {
  return pickLocale(locale, {
    en: [
      "SSO (Google Workspace, Okta) \u2014 on request",
      "Granular role-scoped permissions",
      "API access (roadmap) for integrations",
      "White-label / private hub configuration",
      "Priority onboarding + dedicated support",
      "Data residency guidance for regulated markets",
    ],
    es: [
      "SSO (Google Workspace, Okta) \u2014 bajo solicitud",
      "Permisos granulares por rol",
      "Acceso a API (en el roadmap) para integraciones",
      "Configuraci\u00f3n white-label / hub privado",
      "Onboarding prioritario + soporte dedicado",
      "Asesor\u00eda de residencia de datos para mercados regulados",
    ],
  });
}

export default async function OrganizationsPage() {
  const locale = await getRequestLocale();
  const useCases = getUseCases(locale);
  const scaleFeatures = getScaleFeatures(locale);

  const c = pickLocale(locale, {
    en: {
      heroEyebrow: "For staffing, casting & placement",
      heroTitleA: "A directory",
      heroTitleB: "that works.",
      heroSubtitle: `Your product is the people you place. ${PLATFORM_BRAND.name} makes that product browsable, filterable, and bookable \u2014 with the role-scoped access a real team needs. Talent agencies are one example; the same infrastructure runs casting, staffing, speaker bureaus, performer rosters, and specialized placement ops.`,
      heroPrimary: "Book a walkthrough",
      heroSecondary: "See pricing",
      fitEyebrow: "Where it fits",
      fitHeadingA: "The market is bigger than",
      fitHeadingB: "talent agencies.",
      fitSubhead:
        "Any business where the core asset is people you represent benefits from the same infrastructure: identity, pipeline, directory, and network.",
      scaleEyebrow: "Scale-grade needs",
      scaleHeadingA: "Built for teams,",
      scaleHeadingB: "not just owners.",
      scaleSubhead:
        "SSO, advanced roles, API access, white-label options, and priority onboarding for operations that can\u2019t be run out of one person\u2019s phone.",
    },
    es: {
      heroEyebrow: "Para staffing, casting y colocaci\u00f3n",
      heroTitleA: "Un directorio",
      heroTitleB: "que s\u00ed funciona.",
      heroSubtitle: `Tu producto es la gente que colocas. ${PLATFORM_BRAND.name} vuelve ese producto navegable, filtrable y reservable \u2014 con los accesos por rol que un equipo de verdad necesita. Las agencias de talento son solo un ejemplo; la misma infraestructura mueve casting, staffing, speaker bureaus, rosters de performers y operaciones de colocaci\u00f3n especializadas.`,
      heroPrimary: "Agenda una demo",
      heroSecondary: "Ver precios",
      fitEyebrow: "D\u00f3nde encaja",
      fitHeadingA: "El mercado es m\u00e1s grande que",
      fitHeadingB: "las agencias de talento.",
      fitSubhead:
        "Cualquier negocio cuyo activo principal sea la gente que representa se beneficia de la misma infraestructura: identidad, pipeline, directorio y red.",
      scaleEyebrow: "Necesidades a escala",
      scaleHeadingA: "Hecho para equipos,",
      scaleHeadingB: "no solo para due\u00f1os.",
      scaleSubhead:
        "SSO, roles avanzados, acceso a API, opciones white-label y onboarding prioritario para operaciones que no se pueden llevar desde el celular de una sola persona.",
    },
  });

  return (
    <>
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
        primary={{ label: c.heroPrimary, href: "/get-started?tier=network", intent: "walkthrough" }}
        secondary={{ label: c.heroSecondary, href: "/pricing", intent: "pricing" }}
        sourcePage="organizations-hero"
      />

      <MarketingSection
        className="relative"
        style={{ background: "var(--plt-bg-raised)" }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "var(--plt-hairline)" }}
        />
        <MarketingContainer size="wide">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-xl">
              <MarketingEyebrow>{c.fitEyebrow}</MarketingEyebrow>
              <h2
                className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
                style={{ color: "var(--plt-ink)" }}
              >
                {c.fitHeadingA}
                <br className="hidden sm:block" />{" "}
                <span style={{ color: "var(--plt-forest)" }}>{c.fitHeadingB}</span>
              </h2>
            </div>
            <p
              className="max-w-sm text-[1rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.fitSubhead}
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 md:gap-6">
            {useCases.map((u) => (
              <article
                key={u.id}
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
                  {u.tag}
                </span>
                <h3
                  className="plt-display mt-3 text-[1.375rem] font-medium leading-[1.2] tracking-[-0.02em]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {u.title}
                </h3>
                <p
                  className="mt-4 text-[0.9375rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {u.body}
                </p>
                <dl
                  className="mt-6 grid grid-cols-2 gap-4 border-t pt-5"
                  style={{ borderColor: "var(--plt-hairline)" }}
                >
                  {u.metrics.map((m) => (
                    <div key={m.label}>
                      <dt
                        className="plt-mono text-[0.625rem] uppercase tracking-[0.22em]"
                        style={{ color: "var(--plt-muted)" }}
                      >
                        {m.label}
                      </dt>
                      <dd
                        className="plt-display mt-1 text-[1rem] font-medium"
                        style={{ color: "var(--plt-ink)" }}
                      >
                        {m.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <FeatureGridSection />

      <MarketingSection
        className="relative"
        style={{
          background:
            "linear-gradient(180deg, var(--plt-bg) 0%, var(--plt-bg-deep) 50%, var(--plt-bg) 100%)",
        }}
      >
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <MarketingEyebrow>{c.scaleEyebrow}</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              {c.scaleHeadingA}
              <br className="hidden sm:block" />{" "}
              <span style={{ color: "var(--plt-forest)" }}>{c.scaleHeadingB}</span>
            </h2>
            <p
              className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.scaleSubhead}
            </p>
          </div>
          <ul className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-2">
            {scaleFeatures.map((line) => (
              <li
                key={line}
                className="flex items-start gap-3 rounded-2xl px-5 py-4 text-[0.9375rem]"
                style={{
                  background: "var(--plt-bg-elevated)",
                  border: "1px solid var(--plt-hairline)",
                  color: "var(--plt-ink-soft)",
                }}
              >
                <span
                  aria-hidden
                  className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--plt-forest)" }}
                />
                {line}
              </li>
            ))}
          </ul>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
