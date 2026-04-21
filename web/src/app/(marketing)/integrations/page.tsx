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
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "Integrations — one roster, rendered anywhere",
  description: `${PLATFORM_BRAND.name} is the source of truth for your roster. Render it on a platform-hosted site, as embeddable widgets on WordPress / Webflow / Shopify, or through a public read API for bespoke frontends.`,
};

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

const DELIVERY_MODES: DeliveryMode[] = [
  {
    id: "platform",
    tag: "Mode 01 · Hosted",
    index: "01",
    title: "Full platform sites",
    headline: "Your branded roster site, end to end.",
    body: "A polished directory experience on your own domain — roster, profiles, posts, contact — rendered by Rostra and managed in the CMS. Best when the public site is part of the product.",
    bullets: [
      "Custom domain + design tokens",
      "Editorial pages, posts, navigation",
      "Structured profiles with inquiry CTA",
      "Zero build / no deploy pipeline to run",
    ],
    footnote: "Managed end-to-end by Rostra",
  },
  {
    id: "widgets",
    tag: "Mode 02 · Embedded",
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
    tag: "Mode 03 · API-driven",
    index: "03",
    title: "API-driven frontends",
    headline: "One public read API. Anywhere you need the data.",
    body: "An org-scoped JSON API for teams building bespoke frontends, partner experiences, or internal tooling on top of Rostra. Visibility rules carry through unchanged.",
    bullets: [
      "Org-scoped read access, keyed per surface",
      "Respects per-field visibility automatically",
      "JSON payloads — bring your own framework",
      "Every call audited + rate-limited",
    ],
    footnote: "Build anything on top",
  },
];

type Consumer = {
  name: string;
  surface: string;
  line: string;
  art: "wordpress" | "webflow" | "shopify" | "custom";
};

const CONSUMERS: Consumer[] = [
  {
    name: "WordPress",
    surface: "Plugin / embed",
    line: "Drop a block into any page or post — your roster renders in the theme, styled by your brand tokens.",
    art: "wordpress",
  },
  {
    name: "Webflow",
    surface: "Embed element",
    line: "Use Rostra as the roster source without rebuilding CMS collections. Publish from Rostra, render in Webflow.",
    art: "webflow",
  },
  {
    name: "Shopify",
    surface: "Theme embed",
    line: "Surface represented talent alongside product pages — useful for talent-branded merch and creator stores.",
    art: "shopify",
  },
  {
    name: "Custom / React / Astro",
    surface: "Public read API",
    line: "Consume the API from any framework. Useful for bespoke partner experiences, casting portals, and publisher sites.",
    art: "custom",
  },
];

const GOVERNANCE_RULES = [
  {
    title: "Org-scoped by default",
    body: "Every surface — hosted site, widget, API key — is bound to one org. Cross-org data never leaks through the same surface.",
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
];

const ACCESS_PILLARS = [
  {
    pill: "Keys",
    title: "Org-scoped, scope-limited, rotatable.",
    body: "Every surface — widget, server, partner — gets its own key with its own scope. Revoke instantly when a consumer changes.",
  },
  {
    pill: "Audit",
    title: "Every call, every surface, logged.",
    body: "The same audit trail your admin dashboard already writes to — no parallel logging system, no blind spots.",
  },
  {
    pill: "Rate & quota",
    title: "Generous by default, tunable per plan.",
    body: "Embed + API traffic is shaped by plan entitlements. No surprise throttles, no per-endpoint configs to manage.",
  },
];

export default function IntegrationsPage() {
  return (
    <>
      <SimplePageHero
        eyebrow={`${PLATFORM_BRAND.name} as infrastructure`}
        title={
          <>
            One roster.
            <br />
            <span style={{ color: "var(--plt-forest)" }}>Rendered anywhere.</span>
          </>
        }
        subtitle={`Rostra is the source of truth for your people, profiles, and representation data — then it renders that truth wherever your business actually lives. A polished platform site. An embed inside the site you already have. A public read API for the frontends you haven't built yet.`}
        primary={{ label: "Start free", href: "/get-started", intent: "get-started" }}
        secondary={{ label: "See pricing", href: "/pricing", intent: "pricing" }}
        sourcePage="integrations-hero"
      />

      <FoundationSection />
      <DeliveryModesSection />
      <RoadmapSection />
      <GovernanceSection />
      <ConsumerExamplesSection />
      <AccessSection />
      <FinalCtaSection />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function FoundationSection() {
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
            <MarketingEyebrow>The people layer</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              One canonical roster.
              <br />
              <span style={{ color: "var(--plt-forest)" }}>Every surface it touches.</span>
            </h2>
            <p
              className="mt-6 max-w-xl text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              Your people, their specs, availability, portfolio, and representation status
              live once — in {PLATFORM_BRAND.name}. Every public surface reads from that same
              source. Change a rate card, retire a placement, mark someone unavailable — it
              flows everywhere your roster is rendered, without you chasing it through five
              different systems.
            </p>
            <p
              className="mt-4 max-w-xl text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              The platform is the directory. Everything downstream is a projection of it.
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

function DeliveryModesSection() {
  return (
    <MarketingSection style={{ background: "var(--plt-bg)" }}>
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>Three delivery modes</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            Built once in {PLATFORM_BRAND.name}.
            <br />
            <span style={{ color: "var(--plt-forest)" }}>
              Rendered where your business lives.
            </span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            Pick one. Pick all three. Same roster, same visibility rules — different
            surfaces for different audiences, without a single duplicate system to
            maintain.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3 md:gap-6 lg:gap-7">
          {DELIVERY_MODES.map((mode, idx) => (
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
          NOVA.ROSTRA.APP
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
                {"<ROSTRA-ROSTER ORG=\"NOVA\" />"}
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

const ROADMAP_STAGES: RoadmapStage[] = [
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
    body: "Explicitly not in the MVP. We'll build them when the foundation underneath has proven itself.",
    bullets: [
      "Inquiry-write widgets (form \u2192 pipeline)",
      "Webhooks + language SDKs",
      "White-label widget domains + partner apps",
    ],
  },
];

function RoadmapSection() {
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
          <MarketingEyebrow>Where we are today</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            Shipping in slices,
            <br />
            <span style={{ color: "var(--plt-forest)" }}>
              not a big-bang launch.
            </span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {PLATFORM_BRAND.name} is in private beta. We build one delivery mode
            at a time so each one actually works — and we&rsquo;re honest about
            what that looks like today.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
          {ROADMAP_STAGES.map((stage) => (
            <RoadmapCard key={stage.id} stage={stage} />
          ))}
        </div>

        <p
          className="mx-auto mt-10 max-w-2xl text-center text-[0.875rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          Commercial embed + API access roll out alongside billing and custom
          domains. Want early access when the first slice ships?{" "}
          <Link
            href="/get-started"
            className="underline decoration-[var(--plt-hairline-strong)] underline-offset-[3px] transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            Tell us when you sign up
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

function GovernanceSection() {
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
            <MarketingEyebrow>Governance</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              Your data.
              <br />
              <span style={{ color: "var(--plt-forest)" }}>Your rules.</span>
            </h2>
            <p
              className="mt-5 max-w-lg text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              Representation is a consent business. The same visibility model that powers
              your hosted site carries through every embed and every API call — with
              per-surface, per-field controls when you need them.
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
              {GOVERNANCE_RULES.map((rule) => (
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

function ConsumerExamplesSection() {
  return (
    <MarketingSection style={{ background: "var(--plt-bg)" }}>
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>Stacks we work with</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            Plug into the site you already have.
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            You don&rsquo;t have to migrate your website to benefit from a structured roster.
            Keep the site your team knows — we render inside it.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {CONSUMERS.map((c) => (
            <ConsumerCard key={c.name} consumer={c} />
          ))}
        </div>

        <MarketingHairline className="mt-16" />

        <div className="mt-12 grid items-center gap-6 md:grid-cols-[1fr_auto] md:gap-10">
          <p
            className="max-w-2xl text-[0.9375rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            Running on something else? Anywhere you can drop a script tag or make an HTTP
            request, you can render your {PLATFORM_BRAND.name}{" "}roster. We&rsquo;ll help
            you figure out the shape.
          </p>
          <MarketingCta
            href="/get-started"
            variant="secondary"
            size="md"
            eventSource="integrations-consumers"
            eventIntent="get-started"
          >
            Talk to us
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

function AccessSection() {
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
          <MarketingEyebrow tone="inverse">Access & governance</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ color: "var(--plt-on-inverse)" }}
          >
            Built for representation businesses,
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
              not developer teams.
            </span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-[1.6]"
            style={{ color: "rgba(241,237,227,0.76)" }}
          >
            You shouldn&rsquo;t need a platform engineer to turn an embed on or off. Access
            lives where the rest of your workspace does — editable by the same admins who
            run the roster.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
          {ACCESS_PILLARS.map((p) => (
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
          {PLATFORM_BRAND.name}{" "}is in private beta. Widget + public API surfaces roll out
          alongside custom domains and billing — see{" "}
          <Link
            href="/how-it-works"
            className="underline decoration-[rgba(241,237,227,0.35)] underline-offset-[3px] transition-colors hover:text-[var(--plt-on-inverse)]"
          >
            how it works
          </Link>{" "}
          for the end-to-end.
        </p>
      </MarketingContainer>
    </MarketingSection>
  );
}
