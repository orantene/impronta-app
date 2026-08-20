import type { Metadata } from "next";
import Link from "next/link";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingHairline,
  MarketingSection,
} from "@/components/marketing/container";
import { MarketingCta } from "@/components/marketing/cta-link";
import { EditorialFrame } from "@/components/marketing/editorial-image";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "Integrations: one roster, rendered anywhere",
      es: "Integraciones: un roster, renderizado donde sea",
    }),
    description: pickLocale(locale, {
      en: `${PLATFORM_BRAND.name} is the source of truth for your roster. Render it on a platform-hosted site, as embeddable widgets on WordPress / Webflow / Shopify, or through a public read API for bespoke frontends.`,
      es: `${PLATFORM_BRAND.name} es la fuente de verdad de tu roster. Renderízalo en un sitio hospedado por la plataforma, como widgets para embeber en WordPress / Webflow / Shopify, o vía una API pública de lectura para frontends a la medida.`,
    }),
    ...buildMarketingLocaleAlternates(locale, "/integrations"),
  };
}

type DeliveryMode = {
  id: "platform" | "widgets" | "api";
  tag: string;
  index: string;
  title: string;
  headline: string;
  body: string;
  bullets: string[];
  footnote: string;
};

function getDeliveryModes(locale: string): DeliveryMode[] {
  return pickLocale(locale, {
    en: [
      {
        id: "platform",
        tag: "Mode 01 \u00b7 Hosted",
        index: "01",
        title: "Full platform sites",
        headline: "Your branded roster site, end to end.",
        body: `A polished directory experience on your own domain (roster, profiles, posts, contact) rendered by ${PLATFORM_BRAND.name} and managed in the CMS. Best when the public site is part of the product.`,
        bullets: [
          "Custom domain + design tokens",
          "Editorial pages, posts, navigation",
          "Structured profiles with inquiry CTA",
          "Zero build / no deploy pipeline to run",
        ],
        footnote: `Managed end-to-end by ${PLATFORM_BRAND.name}`,
      },
      {
        id: "widgets",
        tag: "Mode 02 \u00b7 Embedded",
        index: "02",
        title: "Embeddable widgets",
        headline: "Drop your roster into the site you already have.",
        body: "Scripted + iframe embeds that render inside any modern CMS. Brand-themed with your design tokens, filtered to the slice you want shown, fallback-safe when scripts are blocked.",
        bullets: [
          "WordPress, Webflow, Shopify, Squarespace",
          "Roster grid, single profile, or curated shelf",
          "Inquiry form posts back into your pipeline",
          "Isolated from host-page CSS + CSP-safe",
        ],
        footnote: "Host your site where you want it",
      },
      {
        id: "api",
        tag: "Mode 03 \u00b7 API-driven",
        index: "03",
        title: "API-driven frontends",
        headline: "One public read API. Anywhere you need the data.",
        body: `An org-scoped JSON API for teams building bespoke frontends, partner experiences, or internal tooling on top of ${PLATFORM_BRAND.name}. Visibility rules carry through unchanged.`,
        bullets: [
          "Org-scoped read access, keyed per surface",
          "Respects per-field visibility automatically",
          "JSON payloads, bring your own framework",
          "Every call audited + rate-limited",
        ],
        footnote: "Build anything on top",
      },
    ],
    es: [
      {
        id: "platform",
        tag: "Modo 01 \u00b7 Hospedado",
        index: "01",
        title: "Sitios de plataforma completos",
        headline: "El sitio de tu roster con tu marca, de principio a fin.",
        body: `Una experiencia de directorio pulida en tu propio dominio (roster, perfiles, posts, contacto) renderizada por ${PLATFORM_BRAND.name} y administrada desde el CMS. Ideal cuando el sitio p\u00fablico es parte del producto.`,
        bullets: [
          "Dominio propio + tokens de dise\u00f1o",
          "P\u00e1ginas editoriales, posts y navegaci\u00f3n",
          "Perfiles estructurados con CTA de consulta",
          "Cero build, sin pipeline de deploy que mantener",
        ],
        footnote: `Administrado de extremo a extremo por ${PLATFORM_BRAND.name}`,
      },
      {
        id: "widgets",
        tag: "Modo 02 \u00b7 Embebido",
        index: "02",
        title: "Widgets para embeber",
        headline: "Mete tu roster en el sitio que ya tienes.",
        body: "Embeds por script o iframe que se renderizan dentro de cualquier CMS moderno. Con tu marca y tus tokens de dise\u00f1o, filtrados al pedazo que quieras mostrar y a prueba de fallos cuando se bloquean los scripts.",
        bullets: [
          "WordPress, Webflow, Shopify, Squarespace",
          "Grid del roster, perfil individual o selecci\u00f3n curada",
          "El formulario de consulta cae directo en tu pipeline",
          "Aislado del CSS de la p\u00e1gina y compatible con CSP",
        ],
        footnote: "Hospeda tu sitio donde quieras",
      },
      {
        id: "api",
        tag: "Modo 03 \u00b7 V\u00eda API",
        index: "03",
        title: "Frontends hechos con la API",
        headline: "Una sola API p\u00fablica de lectura. Donde necesites los datos.",
        body: `Una API JSON con alcance por organizaci\u00f3n para equipos que construyen frontends a la medida, experiencias para socios o herramientas internas sobre ${PLATFORM_BRAND.name}. Las reglas de visibilidad se respetan tal cual.`,
        bullets: [
          "Acceso de lectura por organizaci\u00f3n, con llave por superficie",
          "Respeta la visibilidad campo por campo, autom\u00e1tico",
          "Respuestas en JSON, usa el framework que quieras",
          "Cada llamada auditada y con l\u00edmite de tasa",
        ],
        footnote: "Construye lo que sea encima",
      },
    ],
  });
}

type Consumer = {
  name: string;
  surface: string;
  line: string;
  art: "wordpress" | "webflow" | "shopify" | "custom";
};

function getConsumers(locale: string): Consumer[] {
  return pickLocale(locale, {
    en: [
      {
        name: "WordPress",
        surface: "Plugin / embed",
        line: "Drop a block into any page or post, your roster renders in the theme, styled by your brand tokens.",
        art: "wordpress",
      },
      {
        name: "Webflow",
        surface: "Embed element",
        line: `Use ${PLATFORM_BRAND.name} as the roster source without rebuilding CMS collections. Publish from ${PLATFORM_BRAND.name}, render in Webflow.`,
        art: "webflow",
      },
      {
        name: "Shopify",
        surface: "Theme embed",
        line: "Surface represented talent alongside product pages, useful for talent-branded merch and creator stores.",
        art: "shopify",
      },
      {
        name: "Custom / React / Astro",
        surface: "Public read API",
        line: "Consume the API from any framework. Useful for bespoke partner experiences, casting portals, and publisher sites.",
        art: "custom",
      },
    ],
    es: [
      {
        name: "WordPress",
        surface: "Plugin / embed",
        line: "Mete un bloque en cualquier p\u00e1gina o post, tu roster se renderiza dentro del tema, con el estilo de tus tokens de marca.",
        art: "wordpress",
      },
      {
        name: "Webflow",
        surface: "Elemento embed",
        line: `Usa ${PLATFORM_BRAND.name} como la fuente del roster sin reconstruir colecciones del CMS. Publica desde ${PLATFORM_BRAND.name}, renderiza en Webflow.`,
        art: "webflow",
      },
      {
        name: "Shopify",
        surface: "Embed en el tema",
        line: "Muestra a tu talento representado junto a las p\u00e1ginas de producto, perfecto para merch con marca propia y tiendas de creadores.",
        art: "shopify",
      },
      {
        name: "Custom / React / Astro",
        surface: "API p\u00fablica de lectura",
        line: "Consume la API desde cualquier framework. Ideal para experiencias a la medida con socios, portales de casting y sitios editoriales.",
        art: "custom",
      },
    ],
  });
}

function getGovernanceRules(locale: string) {
  return pickLocale(locale, {
    en: [
      {
        title: "Org-scoped by default",
        body: "Every surface (hosted site, widget, API key) is bound to one org. Cross-org data never leaks through the same surface.",
      },
      {
        title: "One visibility truth",
        body: "Private, org-only, public, and hub-approved flow through the same rules on every surface. No per-channel toggles to keep in sync.",
      },
      {
        title: "Per-field masks",
        body: "Hide rate cards from public embeds while keeping them on the hosted site. Mask city-level location on the API without touching the rest.",
      },
      {
        title: "Domain allow-list",
        body: "Lock widget embeds to the domains you actually ship on. Third parties copying your script see nothing useful.",
      },
    ],
    es: [
      {
        title: "Por organizaci\u00f3n, de origen",
        body: "Cada superficie (sitio hospedado, widget, llave de API) est\u00e1 atada a una sola organizaci\u00f3n. Los datos de otra organizaci\u00f3n jam\u00e1s se filtran por la misma superficie.",
      },
      {
        title: "Una sola verdad de visibilidad",
        body: "Privado, solo-organizaci\u00f3n, p\u00fablico y aprobado-en-el-hub corren con las mismas reglas en todas las superficies. Sin switches por canal que mantener sincronizados.",
      },
      {
        title: "M\u00e1scaras campo por campo",
        body: "Oculta las tarifas en los embeds p\u00fablicos y d\u00e9jalas visibles en el sitio hospedado. Enmascara la ubicaci\u00f3n a nivel ciudad en la API sin tocar lo dem\u00e1s.",
      },
      {
        title: "Lista de dominios permitidos",
        body: "Limita los embeds a los dominios donde de verdad publicas. Si un tercero copia tu script, no ve nada \u00fatil.",
      },
    ],
  });
}

function getAccessPillars(locale: string) {
  return pickLocale(locale, {
    en: [
      {
        pill: "Keys",
        title: "Org-scoped, scope-limited, rotatable.",
        body: "Every surface (widget, server, partner) gets its own key with its own scope. Revoke instantly when a consumer changes.",
      },
      {
        pill: "Audit",
        title: "Every call, every surface, logged.",
        body: "The same audit trail your admin dashboard already writes to, no parallel logging system, no blind spots.",
      },
      {
        pill: "Rate & quota",
        title: "Generous by default, tunable per plan.",
        body: "Embed + API traffic is shaped by plan entitlements. No surprise throttles, no per-endpoint configs to manage.",
      },
    ],
    es: [
      {
        pill: "Llaves",
        title: "Por organizaci\u00f3n, con alcance limitado y rotables.",
        body: "Cada superficie (widget, servidor, socio) recibe su propia llave con su propio alcance. Rev\u00f3cala al instante cuando cambie un consumidor.",
      },
      {
        pill: "Auditor\u00eda",
        title: "Cada llamada, cada superficie, registrada.",
        body: "El mismo registro de auditor\u00eda que tu panel de admin ya genera, sin un sistema de logs aparte, sin puntos ciegos.",
      },
      {
        pill: "Tasa y cuota",
        title: "Generosa de inicio, ajustable seg\u00fan el plan.",
        body: "El tr\u00e1fico de embeds y API se acomoda seg\u00fan lo que incluye tu plan. Sin frenos inesperados, sin configurar endpoint por endpoint.",
      },
    ],
  });
}

export default async function IntegrationsPage() {
  const locale = await getRequestLocale();
  const hero = pickLocale(locale, {
    en: {
      eyebrow: `${PLATFORM_BRAND.name} as infrastructure`,
      titleA: "One roster.",
      titleB: "Rendered anywhere.",
      subtitle: `${PLATFORM_BRAND.name} is the source of truth for your people, profiles, and representation data, then it renders that truth wherever your business actually lives. A polished platform site. An embed inside the site you already have. A public read API for the frontends you haven\u2019t built yet.`,
      primaryLabel: "Start free",
      secondaryLabel: "See pricing",
    },
    es: {
      eyebrow: `${PLATFORM_BRAND.name} como infraestructura`,
      titleA: "Un roster.",
      titleB: "Renderizado donde sea.",
      subtitle: `${PLATFORM_BRAND.name} es la fuente de verdad de tu gente, sus perfiles y los datos de representaci\u00f3n, y luego renderiza esa verdad donde tu negocio de verdad vive. Un sitio de plataforma pulido. Un embed dentro del sitio que ya tienes. Una API p\u00fablica de lectura para los frontends que a\u00fan no construyes.`,
      primaryLabel: "Empieza gratis",
      secondaryLabel: "Ver precios",
    },
  });
  return (
    <>
      <SimplePageHero
        eyebrow={hero.eyebrow}
        title={
          <>
            {hero.titleA}
            <br />
            <span style={{ color: "var(--plt-forest)" }}>{hero.titleB}</span>
          </>
        }
        subtitle={hero.subtitle}
        primary={{ label: hero.primaryLabel, href: "/get-started", intent: "get-started" }}
        secondary={{ label: hero.secondaryLabel, href: "/pricing", intent: "pricing" }}
        sourcePage="integrations-hero"
      />

      <FoundationSection locale={locale} />
      <DeliveryModesSection locale={locale} />
      <SurfacesLifestyleBand locale={locale} />
      <RoadmapSection locale={locale} />
      <GovernanceSection locale={locale} />
      <ConsumerExamplesSection locale={locale} />
      <AccessSection locale={locale} />
      <FinalCtaSection />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function SurfacesLifestyleBand({ locale }: { locale: string }) {
  const c = pickLocale(locale, {
    en: {
      eyebrow: "One roster · many surfaces",
      caption: "The same data, rendered where your team already works.",
    },
    es: {
      eyebrow: "Un roster · muchas superficies",
      caption: "Los mismos datos, renderizados donde tu equipo ya trabaja.",
    },
  });
  return (
    <MarketingSection spacing="tight" style={{ background: "var(--plt-bg)" }}>
      <MarketingContainer size="wide">
        <EditorialFrame
          photo={MARKETING_PHOTOS.systems}
          aspect="wide"
          size="lg"
          tone="forest"
          eyebrow={c.eyebrow}
          caption={c.caption}
        />
      </MarketingContainer>
    </MarketingSection>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function FoundationSection({ locale }: { locale: string }) {
  const c = pickLocale(locale, {
    en: {
      eyebrow: "The people layer",
      titleA: "One canonical roster.",
      titleB: "Every surface it touches.",
      bodyA: `Your people, their specs, availability, portfolio, and representation status live once, in ${PLATFORM_BRAND.name}. Every public surface reads from that same source. Change a rate card, retire a placement, mark someone unavailable, it flows everywhere your roster is rendered, without you chasing it through five different systems.`,
      bodyB: "The platform is the directory. Everything downstream is a projection of it.",
    },
    es: {
      eyebrow: "La capa de gente",
      titleA: "Un roster can\u00f3nico.",
      titleB: "Cada superficie que toca.",
      bodyA: `Tu gente, sus medidas, su disponibilidad, su portafolio y su estatus de representaci\u00f3n viven una sola vez, en ${PLATFORM_BRAND.name}. Cada superficie p\u00fablica lee de esa misma fuente. Cambia una tarifa, cierra una colocaci\u00f3n, marca a alguien como no disponible, fluye a todos lados donde se renderiza tu roster, sin que andes persigu\u00e9ndolo por cinco sistemas distintos.`,
      bodyB: "La plataforma es el directorio. Todo lo dem\u00e1s es una proyecci\u00f3n de eso.",
    },
  });
  return (
    <MarketingSection style={{ background: "var(--plt-bg-raised)" }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--plt-hairline)" }}
      />
      <MarketingContainer size="wide">
        <div className="grid items-start gap-10 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)] md:gap-16">
          <div>
            <MarketingEyebrow>{c.eyebrow}</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              {c.titleA}
              <br />
              <span style={{ color: "var(--plt-forest)" }}>{c.titleB}</span>
            </h2>
            <p
              className="mt-6 max-w-xl text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.bodyA}
            </p>
            <p
              className="mt-4 max-w-xl text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.bodyB}
            </p>
          </div>

          <FoundationDiagram />
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function FoundationDiagram() {
  return (
    <div
      className="relative overflow-hidden rounded-[28px] p-7 sm:p-9"
      style={{
        background:
          "linear-gradient(160deg, #0f1714 0%, #1f4a3a 55%, #2e6b52 100%)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow:
          "0 40px 80px -40px rgba(15,23,20,0.5), 0 14px 32px -18px rgba(31,74,58,0.35)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 24% 20%, rgba(255,253,248,0.22), transparent 55%), radial-gradient(circle at 78% 78%, rgba(46,107,82,0.35), transparent 50%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-6">
        <CoreSourceBlock />
        <DiagramBranches />
        <SurfaceChipRow />
      </div>
    </div>
  );
}

function CoreSourceBlock() {
  return (
    <div
      className="relative flex w-full max-w-sm flex-col items-center gap-3 overflow-hidden rounded-2xl px-5 py-5"
      style={{
        background: "rgba(241,237,227,0.96)",
        boxShadow:
          "0 30px 60px -30px rgba(15,23,20,0.5), 0 1px 0 rgba(255,255,255,0.4) inset",
      }}
    >
      <span
        className="plt-mono text-[0.625rem] tracking-[0.24em]"
        style={{ color: "var(--plt-forest)" }}
      >
        CANONICAL ROSTER
      </span>
      <div
        className="plt-display text-[1.125rem] font-medium leading-[1.15] tracking-[-0.02em]"
        style={{ color: "var(--plt-ink)" }}
      >
        One source of truth
      </div>
      <div className="grid w-full grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-square rounded-md"
            style={{
              background:
                i === 0
                  ? "linear-gradient(170deg, #1f4a3a, #2e6b52)"
                  : i === 1
                  ? "linear-gradient(170deg, #2c332f, #5c6561)"
                  : i === 2
                  ? "linear-gradient(170deg, #143226, #1f4a3a)"
                  : "linear-gradient(170deg, #1a2e26, #3a5b4e)",
            }}
          />
        ))}
      </div>
      <dl className="mt-1 grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-[0.6875rem]">
        {[
          ["Profiles", "142"],
          ["Visibility rules", "Org-scoped"],
          ["Surfaces", "3"],
          ["Publish cadence", "Live"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="plt-mono tracking-[0.08em]" style={{ color: "var(--plt-muted)" }}>
              {k.toUpperCase()}
            </dt>
            <dd className="font-medium" style={{ color: "var(--plt-ink)" }}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DiagramBranches() {
  return (
    <svg
      aria-hidden
      className="h-16 w-full max-w-sm"
      viewBox="0 0 320 60"
      fill="none"
      preserveAspectRatio="none"
    >
      <path
        d="M160 0 L160 20 L48 40 L48 60"
        stroke="rgba(241,237,227,0.35)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M160 20 L160 60"
        stroke="rgba(241,237,227,0.35)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M160 0 L160 20 L272 40 L272 60"
        stroke="rgba(241,237,227,0.35)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="160" cy="20" r="3" fill="rgba(241,237,227,0.85)" />
    </svg>
  );
}

function SurfaceChipRow() {
  const CHIPS: { label: string; sub: string }[] = [
    { label: "Platform site", sub: "Hosted" },
    { label: "Embeds", sub: "WordPress · Webflow · Shopify" },
    { label: "API", sub: "JSON / bespoke" },
  ];
  return (
    <div className="grid w-full grid-cols-3 gap-2.5">
      {CHIPS.map((c) => (
        <div
          key={c.label}
          className="flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-center"
          style={{
            background: "rgba(241,237,227,0.08)",
            border: "1px solid rgba(241,237,227,0.14)",
          }}
        >
          <span
            className="text-[0.75rem] font-medium"
            style={{ color: "rgba(241,237,227,0.95)" }}
          >
            {c.label}
          </span>
          <span
            className="plt-mono text-[0.5625rem] tracking-[0.12em]"
            style={{ color: "rgba(241,237,227,0.55)" }}
          >
            {c.sub}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function DeliveryModesSection({ locale }: { locale: string }) {
  const modes = getDeliveryModes(locale);
  const c = pickLocale(locale, {
    en: {
      eyebrow: "Three delivery modes",
      titleA: `Built once in ${PLATFORM_BRAND.name}.`,
      titleB: "Rendered where your business lives.",
      subhead:
        "Pick one. Pick all three. Same roster, same visibility rules, different surfaces for different audiences, without a single duplicate system to maintain.",
    },
    es: {
      eyebrow: "Tres formas de entregarlo",
      titleA: `Construido una vez en ${PLATFORM_BRAND.name}.`,
      titleB: "Renderizado donde vive tu negocio.",
      subhead:
        "Elige una. Elige las tres. El mismo roster, las mismas reglas de visibilidad, distintas superficies para distintas audiencias, sin un solo sistema duplicado que mantener.",
    },
  });
  return (
    <MarketingSection style={{ background: "var(--plt-bg)" }}>
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>{c.eyebrow}</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {c.titleA}
            <br />
            <span style={{ color: "var(--plt-forest)" }}>
              {c.titleB}
            </span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            {c.subhead}
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3 md:gap-6 lg:gap-7">
          {modes.map((mode, idx) => (
            <DeliveryModeCard key={mode.id} mode={mode} elevated={idx === 1} />
          ))}
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function DeliveryModeCard({
  mode,
  elevated,
}: {
  mode: DeliveryMode;
  elevated: boolean;
}) {
  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-[28px]"
      style={{
        background: elevated ? "var(--plt-bg-elevated)" : "var(--plt-bg-raised)",
        border: `1px solid ${
          elevated ? "var(--plt-hairline-strong)" : "var(--plt-hairline)"
        }`,
        boxShadow: elevated
          ? "0 28px 56px -28px rgba(15,23,20,0.22)"
          : "inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
    >
      <ModeArt id={mode.id} />

      <div className="flex flex-1 flex-col gap-4 p-7 sm:p-8">
        <div className="flex items-center justify-between">
          <span
            className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.24em]"
            style={{ color: "var(--plt-forest)" }}
          >
            {mode.tag}
          </span>
          <span
            className="plt-mono text-[0.6875rem] tracking-[0.24em]"
            style={{ color: "var(--plt-muted-soft)" }}
          >
            {mode.index}
          </span>
        </div>

        <div>
          <h3
            className="plt-display text-[1.375rem] font-medium leading-[1.2] tracking-[-0.02em] sm:text-[1.5rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {mode.headline}
          </h3>
          <p
            className="mt-3 text-[0.9375rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            {mode.body}
          </p>
        </div>

        <ul className="mt-1 space-y-2.5">
          {mode.bullets.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2.5 text-[0.875rem] leading-[1.5]"
              style={{ color: "var(--plt-ink-soft)" }}
            >
              <SmallCheck />
              {b}
            </li>
          ))}
        </ul>

        <div
          className="mt-auto flex items-center gap-2.5 border-t pt-4 text-[0.75rem]"
          style={{
            borderColor: "var(--plt-hairline)",
            color: "var(--plt-muted)",
          }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--plt-forest)" }}
          />
          {mode.footnote}
        </div>
      </div>
    </article>
  );
}

function SmallCheck() {
  return (
    <span
      aria-hidden
      className="mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{
        background: "rgba(46,107,82,0.14)",
        color: "var(--plt-forest)",
      }}
    >
      <svg width="9" height="9" viewBox="0 0 11 11" fill="none">
        <path
          d="M2 5.8l2.4 2.4L9 3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ModeArt({ id }: { id: DeliveryMode["id"] }) {
  return (
    <div
      className="relative aspect-[16/10] overflow-hidden"
      style={{
        background:
          id === "platform"
            ? "linear-gradient(140deg, #0f1714 0%, #1f4a3a 45%, #2e6b52 100%)"
            : id === "widgets"
            ? "linear-gradient(160deg, #143226 0%, #1f4a3a 55%, #6f8f80 100%)"
            : "linear-gradient(180deg, #0a1411 0%, #1f4a3a 50%, #2e6b52 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{
          backgroundImage:
            "radial-gradient(circle at 24% 22%, rgba(255,253,248,0.22), transparent 55%), radial-gradient(circle at 78% 78%, rgba(46,107,82,0.32), transparent 55%)",
        }}
      />
      <div className="relative h-full w-full p-5 sm:p-6">
        {id === "platform" ? (
          <PlatformArt />
        ) : id === "widgets" ? (
          <WidgetsArt />
        ) : (
          <ApiArt />
        )}
      </div>
    </div>
  );
}

function PlatformArt() {
  return (
    <div
      className="h-full w-full overflow-hidden rounded-xl"
      style={{
        background: "rgba(241,237,227,0.96)",
        boxShadow:
          "0 20px 40px -24px rgba(15,23,20,0.5), 0 1px 0 rgba(255,255,255,0.4) inset",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: "var(--plt-hairline)" }}
      >
        <span
          className="plt-mono text-[0.5625rem] tracking-[0.18em]"
          style={{ color: "var(--plt-muted)" }}
        >
          NOVA.TULALA.DIGITAL
        </span>
        <div className="flex gap-3">
          {["Roster", "Work", "Contact"].map((n) => (
            <span
              key={n}
              className="text-[0.5625rem]"
              style={{ color: "var(--plt-muted-soft)" }}
            >
              {n}
            </span>
          ))}
        </div>
      </div>
      <div className="px-4 pt-3">
        <span
          className="plt-mono text-[0.5rem] tracking-[0.2em]"
          style={{ color: "var(--plt-forest)" }}
        >
          ROSTER · SS26
        </span>
        <div
          className="plt-display mt-1.5 text-[0.9375rem] font-medium leading-[1.1] tracking-[-0.02em]"
          style={{ color: "var(--plt-ink)" }}
        >
          Represented,
          <br />
          rendered editorially.
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-sm"
              style={{
                background:
                  i === 0
                    ? "linear-gradient(170deg, #1f4a3a, #2e6b52)"
                    : i === 1
                    ? "linear-gradient(170deg, #2c332f, #5c6561)"
                    : i === 2
                    ? "linear-gradient(170deg, #143226, #1f4a3a)"
                    : "linear-gradient(170deg, #1a2e26, #3a5b4e)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WidgetsArt() {
  return (
    <div className="relative h-full w-full">
      <div
        className="absolute inset-0 rounded-xl"
        style={{
          background: "rgba(241,237,227,0.95)",
          boxShadow:
            "0 20px 40px -24px rgba(15,23,20,0.5), 0 1px 0 rgba(255,255,255,0.4) inset",
        }}
      />
      <div className="relative flex h-full flex-col">
        <div
          className="flex items-center gap-1.5 border-b px-3.5 py-2"
          style={{ borderColor: "var(--plt-hairline)" }}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "rgba(15,23,20,0.14)" }}
          />
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "rgba(15,23,20,0.14)" }}
          />
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "rgba(15,23,20,0.14)" }}
          />
          <span
            className="ml-auto plt-mono text-[0.5625rem] tracking-[0.14em]"
            style={{ color: "var(--plt-muted)" }}
          >
            YOURSITE.COM / TALENT
          </span>
        </div>
        <div className="flex-1 px-3.5 pt-3">
          <div
            className="h-1.5 w-[60%] rounded-full"
            style={{ background: "rgba(15,23,20,0.1)" }}
          />
          <div
            className="mt-1.5 h-1.5 w-[80%] rounded-full"
            style={{ background: "rgba(15,23,20,0.08)" }}
          />

          <div
            className="mt-3 rounded-md border"
            style={{
              borderColor: "var(--plt-forest)",
              background: "rgba(46,107,82,0.05)",
              borderStyle: "dashed",
            }}
          >
            <div
              className="flex items-center justify-between px-2.5 py-1.5"
              style={{
                borderBottom: "1px dashed var(--plt-forest)",
              }}
            >
              <span
                className="plt-mono text-[0.5rem] font-medium tracking-[0.18em]"
                style={{ color: "var(--plt-forest)" }}
              >
                {"<TULALA-ROSTER ORG=\"NOVA\" />"}
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[0.5rem]"
                style={{
                  background: "var(--plt-forest)",
                  color: "var(--plt-forest-on)",
                }}
              >
                LIVE
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 p-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="aspect-[3/4] rounded-sm"
                  style={{
                    background:
                      i === 0
                        ? "linear-gradient(170deg, #1f4a3a, #2e6b52)"
                        : i === 1
                        ? "linear-gradient(170deg, #143226, #1f4a3a)"
                        : "linear-gradient(170deg, #2c332f, #5c6561)",
                  }}
                />
              ))}
            </div>
          </div>

          <div
            className="mt-2 h-1.5 w-[40%] rounded-full"
            style={{ background: "rgba(15,23,20,0.08)" }}
          />
        </div>
      </div>
    </div>
  );
}

function ApiArt() {
  return (
    <div
      className="h-full w-full overflow-hidden rounded-xl"
      style={{
        background: "rgba(10,20,17,0.85)",
        border: "1px solid rgba(241,237,227,0.12)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "rgba(241,237,227,0.14)" }}
      >
        <span
          className="plt-mono text-[0.5625rem] tracking-[0.18em]"
          style={{ color: "rgba(241,237,227,0.55)" }}
        >
          GET /v1/roster
        </span>
        <span
          className="inline-flex items-center gap-1 plt-mono text-[0.5rem] font-medium tracking-[0.14em]"
          style={{ color: "rgba(126,216,160,0.95)" }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "rgba(126,216,160,0.95)" }}
          />
          200 OK
        </span>
      </div>
      <pre
        className="plt-mono m-0 px-4 py-3 text-[0.625rem] leading-[1.6]"
        style={{ color: "rgba(241,237,227,0.88)", whiteSpace: "pre" }}
      >
        {`{
  "org": "nova",
  "profiles": [
    {
      "code": "sofia-m",
      "name": "Sofia M.",
      "specs": { "height": "178cm" },
      "available_from": "2026-05-02",
      "visibility": "public"
    },
    …
  ]
}`}
      </pre>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

type RoadmapStage = {
  id: "live" | "next" | "later";
  status: string;
  title: string;
  body: string;
  bullets: string[];
};

function getRoadmapStages(locale: string): RoadmapStage[] {
  return pickLocale(locale, {
    en: [
      {
        id: "live",
        status: "Live",
        title: "Full platform sites",
        body: "Hosted roster site on a free subdomain, custom domain on paid plans. What every signup gets today.",
        bullets: [
          "Hosted roster + canonical profiles",
          "Inquiry inbox + booking pipeline",
          "Shared hub discovery (opt-in)",
        ],
      },
      {
        id: "next",
        status: "Next",
        title: "Embeds + public read API",
        body: "The first slice of off-platform delivery. Starts with a single-profile embed and an org-scoped read API; widens from there.",
        bullets: [
          "Single-profile embed (WordPress, Webflow, Shopify)",
          "Org-scoped read-only JSON API",
          "Admin-managed keys with domain allow-list",
        ],
      },
      {
        id: "later",
        status: "Later",
        title: "Deferred by design",
        body: "Explicitly not in the MVP. We\u2019ll build them when the foundation underneath has proven itself.",
        bullets: [
          "Inquiry-write widgets (form \u2192 pipeline)",
          "Webhooks + language SDKs",
          "White-label widget domains + partner apps",
        ],
      },
    ],
    es: [
      {
        id: "live",
        status: "En vivo",
        title: "Sitios de plataforma completos",
        body: "Sitio de roster hospedado en un subdominio gratis, dominio propio en los planes de paga. Lo que recibe hoy cualquiera que se registra.",
        bullets: [
          "Roster hospedado + perfiles can\u00f3nicos",
          "Buz\u00f3n de consultas + pipeline de reservas",
          "Descubrimiento en el hub compartido (opcional)",
        ],
      },
      {
        id: "next",
        status: "Sigue",
        title: "Embeds + API p\u00fablica de lectura",
        body: "El primer pedazo de la entrega fuera de la plataforma. Empieza con un embed de perfil individual y una API de lectura por organizaci\u00f3n; de ah\u00ed se ampl\u00eda.",
        bullets: [
          "Embed de perfil individual (WordPress, Webflow, Shopify)",
          "API JSON de solo lectura, por organizaci\u00f3n",
          "Llaves administradas por el admin con lista de dominios",
        ],
      },
      {
        id: "later",
        status: "Despu\u00e9s",
        title: "Pospuesto a prop\u00f3sito",
        body: "A prop\u00f3sito fuera del MVP. Los construiremos cuando los cimientos de abajo se hayan ganado su lugar.",
        bullets: [
          "Widgets que escriben consultas (formulario \u2192 pipeline)",
          "Webhooks + SDKs por lenguaje",
          "Dominios white-label para widgets + apps de socios",
        ],
      },
    ],
  });
}

function RoadmapSection({ locale }: { locale: string }) {
  const stages = getRoadmapStages(locale);
  const c = pickLocale(locale, {
    en: {
      eyebrow: "Where we are today",
      titleA: "Shipping in slices,",
      titleB: "not a big-bang launch.",
      subhead: `${PLATFORM_BRAND.name} is in private beta. We build one delivery mode at a time so each one actually works, and we\u2019re honest about what that looks like today.`,
      footPrefix:
        "Commercial embed + API access roll out alongside billing and custom domains. Want early access when the first slice ships?",
      footLink: "Tell us when you sign up",
    },
    es: {
      eyebrow: "D\u00f3nde estamos hoy",
      titleA: "Lanzamos por partes,",
      titleB: "no en un gran golpe.",
      subhead: `${PLATFORM_BRAND.name} est\u00e1 en beta privada. Construimos una forma de entrega a la vez para que cada una de verdad funcione, y somos honestos sobre c\u00f3mo se ve eso hoy.`,
      footPrefix:
        "El acceso comercial a embeds y API llega junto con la facturaci\u00f3n y los dominios propios. \u00bfQuieres acceso anticipado cuando salga el primer pedazo?",
      footLink: "D\u00ednos cuando te registres",
    },
  });
  return (
    <MarketingSection
      id="roadmap"
      className="relative"
      style={{ background: "var(--plt-bg)" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--plt-hairline)" }}
      />
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>{c.eyebrow}</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {c.titleA}
            <br />
            <span style={{ color: "var(--plt-forest)" }}>
              {c.titleB}
            </span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {c.subhead}
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
          {stages.map((stage) => (
            <RoadmapCard key={stage.id} stage={stage} />
          ))}
        </div>

        <p
          className="mx-auto mt-10 max-w-2xl text-center text-[0.875rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {c.footPrefix}{" "}
          <Link
            href="/get-started"
            className="underline decoration-[var(--plt-hairline-strong)] underline-offset-[3px] transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {c.footLink}
          </Link>
          .
        </p>
      </MarketingContainer>
    </MarketingSection>
  );
}

function RoadmapCard({ stage }: { stage: RoadmapStage }) {
  const isLive = stage.id === "live";
  const isNext = stage.id === "next";
  const accent = isLive
    ? "var(--plt-forest)"
    : isNext
    ? "var(--plt-forest)"
    : "var(--plt-muted-soft)";
  const statusBg = isLive
    ? "rgba(46,107,82,0.14)"
    : isNext
    ? "rgba(46,107,82,0.08)"
    : "rgba(15,23,20,0.06)";
  const statusFg = isLive
    ? "var(--plt-forest)"
    : isNext
    ? "var(--plt-forest)"
    : "var(--plt-muted)";
  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-[28px] p-7 sm:p-8"
      style={{
        background: "var(--plt-bg-raised)",
        border: `1px solid ${isLive ? "var(--plt-hairline-strong)" : "var(--plt-hairline)"}`,
        boxShadow: isLive
          ? "0 28px 56px -28px rgba(15,23,20,0.22)"
          : "inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left"
        style={{ background: accent, opacity: isLive ? 1 : isNext ? 0.6 : 0.25 }}
      />

      <span
        className="plt-mono inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.22em]"
        style={{ background: statusBg, color: statusFg }}
      >
        {isLive ? (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--plt-forest)" }}
          />
        ) : null}
        {stage.status}
      </span>

      <h3
        className="plt-display mt-4 text-[1.375rem] font-medium leading-[1.2] tracking-[-0.02em] sm:text-[1.5rem]"
        style={{ color: "var(--plt-ink)" }}
      >
        {stage.title}
      </h3>

      <p
        className="mt-3 text-[0.9375rem] leading-[1.55]"
        style={{ color: "var(--plt-muted)" }}
      >
        {stage.body}
      </p>

      <ul className="mt-5 space-y-2.5">
        {stage.bullets.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2.5 text-[0.875rem] leading-[1.5]"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            <span
              aria-hidden
              className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: accent }}
            />
            {b}
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function GovernanceSection({ locale }: { locale: string }) {
  const rules = getGovernanceRules(locale);
  const c = pickLocale(locale, {
    en: {
      eyebrow: "Governance",
      titleA: "Your data.",
      titleB: "Your rules.",
      subhead:
        "Representation is a consent business. The same visibility model that powers your hosted site carries through every embed and every API call, with per-surface, per-field controls when you need them.",
    },
    es: {
      eyebrow: "Gobierno de datos",
      titleA: "Tus datos.",
      titleB: "Tus reglas.",
      subhead:
        "La representaci\u00f3n es un negocio de consentimiento. El mismo modelo de visibilidad que mueve tu sitio hospedado se respeta en cada embed y cada llamada a la API, con controles por superficie y por campo cuando los necesites.",
    },
  });
  return (
    <MarketingSection style={{ background: "var(--plt-bg-raised)" }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--plt-hairline)" }}
      />
      <MarketingContainer size="wide">
        <div className="grid gap-12 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)] md:gap-16">
          <div>
            <MarketingEyebrow>{c.eyebrow}</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              {c.titleA}
              <br />
              <span style={{ color: "var(--plt-forest)" }}>{c.titleB}</span>
            </h2>
            <p
              className="mt-5 max-w-lg text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.subhead}
            </p>
          </div>

          <div
            className="relative overflow-hidden rounded-[28px]"
            style={{
              background: "var(--plt-bg)",
              border: "1px solid var(--plt-hairline)",
            }}
          >
            <ul className="divide-y" style={{ borderColor: "var(--plt-hairline)" }}>
              {rules.map((rule) => (
                <li
                  key={rule.title}
                  className="flex flex-col gap-1.5 px-6 py-5 sm:flex-row sm:items-baseline sm:gap-6 sm:px-7 sm:py-6"
                  style={{ borderColor: "var(--plt-hairline)" }}
                >
                  <span
                    className="plt-mono text-[0.75rem] font-medium uppercase tracking-[0.22em] sm:w-52 sm:shrink-0"
                    style={{ color: "var(--plt-forest)" }}
                  >
                    {rule.title}
                  </span>
                  <span
                    className="text-[0.9375rem] leading-[1.55]"
                    style={{ color: "var(--plt-ink-soft)" }}
                  >
                    {rule.body}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function ConsumerExamplesSection({ locale }: { locale: string }) {
  const consumers = getConsumers(locale);
  const c = pickLocale(locale, {
    en: {
      eyebrow: "Stacks we work with",
      heading: "Plug into the site you already have.",
      subhead:
        "You don\u2019t have to migrate your website to benefit from a structured roster. Keep the site your team knows, we render inside it.",
      footPrefix:
        "Running on something else? Anywhere you can drop a script tag or make an HTTP request, you can render your",
      footSuffix: "roster. We\u2019ll help you figure out the shape.",
      cta: "Talk to us",
    },
    es: {
      eyebrow: "Stacks con los que trabajamos",
      heading: "Con\u00e9ctalo al sitio que ya tienes.",
      subhead:
        "No tienes que migrar tu sitio web para aprovechar un roster estructurado. Qu\u00e9date con el sitio que tu equipo ya conoce, nosotros renderizamos dentro de \u00e9l.",
      footPrefix:
        "\u00bfCorres en algo m\u00e1s? Donde puedas meter una etiqueta de script o hacer una petici\u00f3n HTTP, puedes renderizar tu roster de",
      footSuffix: ". Te ayudamos a darle forma.",
      cta: "Hablemos",
    },
  });
  return (
    <MarketingSection style={{ background: "var(--plt-bg)" }}>
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>{c.eyebrow}</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {c.heading}
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            {c.subhead}
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {consumers.map((consumer) => (
            <ConsumerCard key={consumer.name} consumer={consumer} />
          ))}
        </div>

        <MarketingHairline className="mt-16" />

        <div className="mt-12 grid items-center gap-6 md:grid-cols-[1fr_auto] md:gap-10">
          <p
            className="max-w-2xl text-[0.9375rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            {c.footPrefix} {PLATFORM_BRAND.name}{c.footSuffix}
          </p>
          <MarketingCta
            href="/get-started"
            variant="secondary"
            size="md"
            eventSource="integrations-consumers"
            eventIntent="get-started"
          >
            {c.cta}
          </MarketingCta>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function ConsumerCard({ consumer }: { consumer: Consumer }) {
  return (
    <div
      className="flex flex-col gap-4 rounded-[24px] p-6"
      style={{
        background: "var(--plt-bg-raised)",
        border: "1px solid var(--plt-hairline)",
      }}
    >
      <div
        className="relative flex h-20 items-center justify-center overflow-hidden rounded-2xl"
        style={{
          background: "var(--plt-bg-deep)",
          border: "1px solid var(--plt-hairline)",
        }}
      >
        <ConsumerGlyph kind={consumer.art} />
      </div>

      <div>
        <h3
          className="plt-display text-[1.0625rem] font-medium tracking-[-0.01em]"
          style={{ color: "var(--plt-ink)" }}
        >
          {consumer.name}
        </h3>
        <span
          className="plt-mono mt-1 block text-[0.625rem] font-medium uppercase tracking-[0.2em]"
          style={{ color: "var(--plt-forest)" }}
        >
          {consumer.surface}
        </span>
      </div>

      <p
        className="text-[0.875rem] leading-[1.55]"
        style={{ color: "var(--plt-muted)" }}
      >
        {consumer.line}
      </p>
    </div>
  );
}

function ConsumerGlyph({ kind }: { kind: Consumer["art"] }) {
  if (kind === "wordpress") {
    return (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
        <circle
          cx="16"
          cy="16"
          r="13"
          stroke="var(--plt-ink-soft)"
          strokeWidth="1.4"
        />
        <path
          d="M11.5 10L15.5 22L17.5 16L21 22L24 10"
          stroke="var(--plt-forest)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 10L12 22" stroke="var(--plt-ink-soft)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "webflow") {
    return (
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
        <path
          d="M5 10L11 24L17 12L23 24L29 10"
          stroke="var(--plt-forest)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11 24L14 17L17 24"
          stroke="var(--plt-ink-soft)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "shopify") {
    return (
      <svg width="28" height="32" viewBox="0 0 28 32" fill="none" aria-hidden>
        <path
          d="M6 6C6 6 10 4 14 4C18 4 22 7 22 11C22 13 20.5 14 19 14C17.5 14 16 13 16 11C16 9.5 17 8.5 18 8.5"
          stroke="var(--plt-forest)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 10L6 6L22 8L24 28L6 28L4 10Z"
          stroke="var(--plt-ink-soft)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
      <path
        d="M12 8L4 17L12 26"
        stroke="var(--plt-forest)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 8L30 17L22 26"
        stroke="var(--plt-forest)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 5L15 29"
        stroke="var(--plt-ink-soft)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function AccessSection({ locale }: { locale: string }) {
  const pillars = getAccessPillars(locale);
  const c = pickLocale(locale, {
    en: {
      eyebrow: "Access & governance",
      titleA: "Built for representation businesses,",
      titleB: "not developer teams.",
      subhead:
        "You shouldn\u2019t need a platform engineer to turn an embed on or off. Access lives where the rest of your workspace does, editable by the same admins who run the roster.",
      footPrefix:
        "is in private beta. Widget + public API surfaces roll out alongside custom domains and billing, see",
      footLink: "how it works",
      footSuffix: "for the end-to-end.",
    },
    es: {
      eyebrow: "Acceso y gobierno",
      titleA: "Hecho para negocios de representaci\u00f3n,",
      titleB: "no para equipos de desarrollo.",
      subhead:
        "No deber\u00edas necesitar a un ingeniero de plataforma para prender o apagar un embed. El acceso vive donde vive el resto de tu workspace, editable por los mismos admins que llevan el roster.",
      footPrefix:
        "est\u00e1 en beta privada. Las superficies de widgets y API p\u00fablica salen junto con los dominios propios y la facturaci\u00f3n, mira",
      footLink: "c\u00f3mo funciona",
      footSuffix: "para verlo de principio a fin.",
    },
  });
  return (
    <MarketingSection
      className="relative overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, #1f4a3a 0%, #143226 55%, #0a1d16 100%)",
        color: "var(--plt-on-inverse)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -left-24 top-[-20%] h-[32rem] w-[32rem] rounded-full opacity-45 blur-[130px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(94,161,129,0.35), rgba(20,50,38,0))",
        }}
      />
      <MarketingContainer size="wide" className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow tone="inverse">{c.eyebrow}</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ color: "var(--plt-on-inverse)" }}
          >
            {c.titleA}
            <br />
            <span
              style={{
                background:
                  "linear-gradient(110deg, #e4f0e7 0%, #b9d9c7 45%, #5c8b76 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {c.titleB}
            </span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-[1.6]"
            style={{ color: "rgba(241,237,227,0.76)" }}
          >
            {c.subhead}
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
          {pillars.map((p) => (
            <article
              key={p.pill}
              className="rounded-[24px] p-6 sm:p-7"
              style={{
                background: "rgba(241,237,227,0.06)",
                border: "1px solid rgba(241,237,227,0.16)",
                backdropFilter: "blur(6px)",
              }}
            >
              <span
                className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.24em]"
                style={{ color: "rgba(185,217,199,0.9)" }}
              >
                {p.pill}
              </span>
              <h3
                className="plt-display mt-3 text-[1.1875rem] font-medium leading-[1.2] tracking-[-0.02em] sm:text-[1.3125rem]"
                style={{ color: "var(--plt-on-inverse)" }}
              >
                {p.title}
              </h3>
              <p
                className="mt-3 text-[0.9375rem] leading-[1.55]"
                style={{ color: "rgba(241,237,227,0.72)" }}
              >
                {p.body}
              </p>
            </article>
          ))}
        </div>

        <p
          className="mx-auto mt-12 max-w-2xl text-center text-[0.8125rem]"
          style={{ color: "rgba(241,237,227,0.55)" }}
        >
          {PLATFORM_BRAND.name}{" "}{c.footPrefix}{" "}
          <Link
            href="/how-it-works"
            className="underline decoration-[rgba(241,237,227,0.35)] underline-offset-[3px] transition-colors hover:text-[var(--plt-on-inverse)]"
          >
            {c.footLink}
          </Link>{" "}
          {c.footSuffix}
        </p>
      </MarketingContainer>
    </MarketingSection>
  );
}
