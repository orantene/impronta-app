// Phase 3 — workspace Production page.
// Card-grid layout matching prototype's ProductionPage() structure.
// Casting · Crew & shoot day · Rights & safety · Account lifecycle.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  white:      "#ffffff",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.07)",
  indigo:     "#3B5E9E",
  indigoSoft: "rgba(59,94,158,0.07)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(212,160,23,0.07)",
  coral:      "#B04A22",
  coralSoft:  "rgba(176,74,34,0.07)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  tone,
  label,
  title,
  description,
  children,
}: {
  tone: string;
  label: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span
          style={{
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            color: tone,
            textTransform: "uppercase" as const,
          }}
        >
          {label}
        </span>
        <h2
          style={{
            fontFamily: FONT,
            fontSize: 16,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.2,
          }}
        >
          {title}
        </h2>
      </div>
      <p
        style={{
          fontFamily: FONT,
          fontSize: 12,
          color: C.inkMuted,
          marginBottom: 12,
          lineHeight: 1.4,
        }}
      >
        {description}
      </p>
      {children}
    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  description,
  href,
}: {
  icon: string;
  title: string;
  description: string;
  href?: string;
}) {
  return (
    <a
      href={href ?? "#"}
      aria-disabled={!href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "16px 18px",
        background: C.white,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        textDecoration: "none",
        cursor: href ? "pointer" : "default",
        opacity: href ? 1 : 0.6,
        transition: "border-color 0.12s, box-shadow 0.12s",
      }}
      onMouseEnter={
        href
          ? (e) => {
              e.currentTarget.style.borderColor = "rgba(15,79,62,0.25)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(11,11,13,0.06)";
            }
          : undefined
      }
      onMouseLeave={
        href
          ? (e) => {
              e.currentTarget.style.borderColor = "rgba(24,24,27,0.06)";
              e.currentTarget.style.boxShadow = "none";
            }
          : undefined
      }
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 13.5,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.1,
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          {title}
          {!href && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "1px 6px",
                borderRadius: 999,
                background: "rgba(11,11,13,0.05)",
                color: "rgba(11,11,13,0.35)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.3,
                textTransform: "uppercase" as const,
                fontFamily: FONT,
              }}
            >
              Soon
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 12,
            color: C.inkMuted,
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          {description}
        </div>
      </div>
    </a>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceProductionPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <p
          style={{
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 600,
            color: C.inkMuted,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          Workspace
        </p>
        <h1
          style={{
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.4,
            margin: 0,
          }}
        >
          Production
        </h1>
        <p
          style={{
            fontFamily: FONT,
            fontSize: 12.5,
            color: C.inkMuted,
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          Casting, crew, shoot day, rights &amp; safety.
        </p>
      </div>

      {/* ── 01 Casting ── */}
      <Section
        tone={C.coral}
        label="01"
        title="Casting"
        description="Open or closed casting flows and round-by-round callbacks."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          <FeatureCard icon="🎭" title="Casting flow" description="Configure open/closed casting and rounds." />
          <FeatureCard icon="📞" title="Callback tracker" description="Per-round talent status with feedback." />
          <FeatureCard icon="🔍" title="Discovery feed" description="Trending talent and editorial picks." />
          <FeatureCard icon="📅" title="Availability search" description="Find talent for a date range and location." />
        </div>
      </Section>

      {/* ── 02 Crew & shoot day ── */}
      <Section
        tone={C.accent}
        label="02"
        title="Crew & shoot day"
        description="Multi-discipline bookings, call sheets, and live on-set check-in."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <FeatureCard icon="🎬" title="Crew booking" description="Book talent, photographer, HMU, studio." />
          <FeatureCard icon="🗓" title="Production timeline" description="Call-sheet order of events." />
          <FeatureCard icon="📋" title="Call sheet" description="Live production roster with status." />
          <FeatureCard icon="✅" title="On-set check-in" description="Mark talent and crew as arrived." />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          <FeatureCard icon="📍" title="Locations" description="Studios, venues, and outdoor locations." />
          <FeatureCard icon="📝" title="Brief builder" description="Author shot lists and creative briefs." />
          <FeatureCard icon="🖼" title="Brand assets" description="Logos, fonts, and reusable assets." />
        </div>
      </Section>

      {/* ── 03 Rights & safety ── */}
      <Section
        tone={C.amber}
        label="03"
        title="Rights & safety"
        description="Image-rights tracking, incident reporting, and dispute resolution."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          <FeatureCard icon="📜" title="Usage tracker" description="Monitor licence expiry per booking." />
          <FeatureCard icon="🔄" title="Relicence" description="Extend or expand usage rights." />
          <FeatureCard icon="⚠️" title="Incident reports" description="On-set safety and conduct reports." />
          <FeatureCard icon="⚖️" title="Disputes" description="Filed → Mediation → Decision." />
        </div>
      </Section>

      {/* ── 04 Account lifecycle ── */}
      <Section
        tone={C.indigo}
        label="04"
        title="Account lifecycle"
        description="Workspace ownership and minor-account guardian setup."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          <FeatureCard icon="🔑" title="Ownership transfer" description="Transfer workspace to a new owner." />
          <FeatureCard icon="👶" title="Minor account" description="Attach guardian co-pilot for under-18 talent." />
          <FeatureCard icon="✍️" title="Approval flow" description="Multi-stage sign-off for sensitive items." />
        </div>
      </Section>

    </div>
  );
}
