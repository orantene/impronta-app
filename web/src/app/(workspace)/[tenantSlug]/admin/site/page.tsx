// Phase 3 — canonical workspace Site hub page.
// Server Component — no "use client".
//
// Entry point for site & branding management. Tiles link to the existing
// legacy site-settings surfaces — they continue to work without promotion.
// The page builder (edit-chrome) is wired in Phase 3.5; for now, "Preview"
// deep-links to the public storefront.
//
// Capability gate: agency.workspace.view (viewer+).
// Manage-tier tiles gated on agency.site_admin.manage_settings (admin+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  accentBorder: "rgba(15,79,62,0.20)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Site tile ────────────────────────────────────────────────────────────────

function SiteTile({
  href,
  label,
  description,
  locked = false,
  external = false,
}: {
  href: string;
  label: string;
  description: string;
  locked?: boolean;
  external?: boolean;
}) {
  const linkProps = external
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <Link
      href={href}
      {...linkProps}
      aria-disabled={locked || undefined}
      tabIndex={locked ? -1 : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        textDecoration: "none",
        opacity: locked ? 0.45 : 1,
        pointerEvents: locked ? "none" : "auto",
        transition: "border-color 120ms",
        fontFamily: FONT,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: -0.1,
        }}
      >
        {label} {external ? "↗" : "→"}
      </span>
      <span
        style={{
          fontSize: 12,
          color: C.inkMuted,
          lineHeight: 1.45,
        }}
      >
        {description}
      </span>
      {locked && (
        <span
          style={{
            marginTop: 4,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10.5,
            fontWeight: 600,
            color: C.amber,
            letterSpacing: 0.2,
          }}
        >
          <span aria-hidden style={{ fontSize: 10 }}>🔒</span>
          Admin required
        </span>
      )}
    </Link>
  );
}

// ─── Advanced list row ─────────────────────────────────────────────────────────

function AdvancedRow({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "13px 16px",
        textDecoration: "none",
        fontFamily: FONT,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
          {description}
        </div>
      </div>
      {/* chevron */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={C.inkDim}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ flexShrink: 0 }}
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.7,
        textTransform: "uppercase" as const,
        color: C.inkDim,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceSitePage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const canManage = await userHasCapability(
    "agency.site_admin.manage_settings",
    scope.tenantId,
  );

  // Storefront URL — the agency's public subdomain
  const storefrontUrl = `https://${tenantSlug}.tulala.digital`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>

      {/* ── Header row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: C.accent,
              marginBottom: 4,
            }}
          >
            {scope.membership.display_name}
          </div>
          <h1
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 700,
              color: C.ink,
              margin: 0,
              letterSpacing: -0.5,
              lineHeight: 1.1,
            }}
          >
            Public site
          </h1>
        </div>

        <a
          href={storefrontUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 34,
            padding: "0 14px",
            borderRadius: 8,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            color: C.ink,
            fontFamily: FONT,
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: "none",
            letterSpacing: -0.1,
            flexShrink: 0,
          }}
        >
          Preview ↗
        </a>
      </div>

      {/* ── Live banner ── */}
      <div
        style={{
          background: C.accentSoft,
          border: `1px solid ${C.accentBorder}`,
          borderRadius: 12,
          padding: "13px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden style={{ fontSize: 16 }}>🌐</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
              Your storefront is live
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 1 }}>
              {storefrontUrl}
            </div>
          </div>
        </div>
        <a
          href={storefrontUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 30,
            padding: "0 12px",
            borderRadius: 7,
            background: C.accent,
            color: "#fff",
            fontFamily: FONT,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          Open
        </a>
      </div>

      {/* ── Content section ── */}
      <section>
        <SectionHead>Content</SectionHead>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          <SiteTile
            href={`/admin/site-settings/pages`}
            label="Pages"
            description="CMS pages, posts, and landing content"
          />
          <SiteTile
            href={`/admin/site-settings/navigation`}
            label="Navigation"
            description="Header links, footer links, and menus"
          />
        </div>
      </section>

      {/* ── Appearance section ── */}
      <section>
        <SectionHead>Appearance</SectionHead>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          <SiteTile
            href={`/admin/site-settings/design`}
            label="Design & theme"
            description="Colours, fonts, and layout style"
            locked={!canManage}
          />
          <SiteTile
            href={`/admin/site-settings/branding`}
            label="Branding"
            description="Logo, favicon, and brand assets"
            locked={!canManage}
          />
        </div>
      </section>

      {/* ── Discoverability section ── */}
      <section>
        <SectionHead>Discoverability</SectionHead>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          <SiteTile
            href={`/admin/site-settings/seo`}
            label="SEO"
            description="Page titles, descriptions, and social sharing"
            locked={!canManage}
          />
          <SiteTile
            href={`/admin/site-settings/identity`}
            label="Agency identity"
            description="Public name, contact info, and social links"
            locked={!canManage}
          />
        </div>
      </section>

      {/* ── Advanced section — admin only ── */}
      {canManage && (
        <section>
          <SectionHead>Advanced</SectionHead>
          <div
            style={{
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <AdvancedRow
              href={`/admin/site-settings/sections`}
              label="Section templates"
              description="Reusable page-builder section layouts"
            />
            <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />
            <AdvancedRow
              href={`/admin/site-settings/system`}
              label="System settings"
              description="Locale, redirects, and technical configuration"
            />
          </div>
        </section>
      )}

      {/* ── Page builder coming soon ── */}
      <section
        style={{
          background: C.surface,
          border: `1px dashed ${C.border}`,
          borderRadius: 12,
          padding: "20px 18px",
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: C.amberSoft,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 17,
          }}
        >
          🧩
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
            Visual page builder
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 1.5 }}>
            Drag-and-drop editing for your storefront pages — coming in Phase 3.5.
            Use the tiles above to manage content in the meantime.
          </div>
        </div>
      </section>

    </div>
  );
}
