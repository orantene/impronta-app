// Phase 3.5 — canonical workspace Website page.
// Server RSC. Matches prototype WebsitePage design.
//
// Sections: hero banner · pages card grid · posts + redirects 2-col ·
// configuration 3-col (domain / SEO / tracking).
//
// Performance section skipped — no analytics schema yet.
// Site banners (maintenance / announcement) skipped — no schema yet.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWebsiteData } from "../../_data-bridge";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  border:      "rgba(24,24,27,0.08)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surface:     "rgba(11,11,13,0.02)",
  surfaceAlt:  "rgba(11,11,13,0.025)",
  accent:      "#0F4F3E",
  accentDeep:  "#0A3830",
  accentSoft:  "rgba(15,79,62,0.08)",
  fill:        "#0F4F3E",
  fillDeep:    "#0A3830",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:   "#8A6F1A",
  amberSoft:   "rgba(138,111,26,0.10)",
  indigoDeep:  "#2B3FA3",
  indigoSoft:  "rgba(43,63,163,0.07)",
} as const;

const FONT    = '"Inter", system-ui, sans-serif';
const MONO    = '"ui-monospace", "Cascadia Code", monospace';

// ─── Tiny utilities ───────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}

// ─── Page status chip ─────────────────────────────────────────────────────────

function PageStatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    published: { bg: C.successSoft, color: C.successDeep, label: "Live" },
    draft:     { bg: C.surfaceAlt,  color: C.inkDim,     label: "Draft" },
    scheduled: { bg: C.amberSoft,   color: C.amberDeep,  label: "Scheduled" },
    archived:  { bg: C.surfaceAlt,  color: C.inkDim,     label: "Archived" },
  };
  const s = map[status] ?? { bg: C.surfaceAlt, color: C.inkDim, label: status };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase" as const,
        flexShrink: 0,
        fontFamily: FONT,
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Hero stat ────────────────────────────────────────────────────────────────

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 26,
          fontWeight: 600,
          color: "#fff",
          letterSpacing: -0.5,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.60)",
          marginTop: 4,
          fontWeight: 500,
          letterSpacing: 0.2,
          fontFamily: FONT,
        }}
      >
        {label}
        {sub && <span style={{ marginLeft: 4, opacity: 0.7 }}>· {sub}</span>}
      </div>
    </div>
  );
}

// ─── Browser-chrome page card ─────────────────────────────────────────────────

function PageCard({
  page,
  builderBase,
}: {
  page: {
    id: string;
    slug: string;
    title: string;
    status: string;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  builderBase: string;
}) {
  return (
    <Link
      href={builderBase}
      className="page-card"
      style={{
        textAlign: "left",
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        background: C.cardBg,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        transition: "transform 120ms, box-shadow 120ms, border-color 120ms",
      }}
    >
      {/* Faux browser chrome */}
      <div
        style={{
          height: 70,
          background: `linear-gradient(135deg, ${C.surfaceAlt} 0%, #fff 100%)`,
          borderBottom: `1px solid ${C.borderSoft}`,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF5F57" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FEBC2E" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#28C840" }} />
        </div>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 6,
            padding: "4px 8px",
            fontFamily: MONO,
            fontSize: 10.5,
            color: C.inkMuted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          /{page.slug}
        </div>
      </div>
      {/* Body */}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.1,
              lineHeight: 1.25,
              flex: 1,
              minWidth: 0,
              fontFamily: FONT,
            }}
          >
            {page.title}
          </div>
          <PageStatusChip status={page.status} />
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: C.inkMuted,
            fontFamily: FONT,
          }}
        >
          <span>{page.updatedBy ? `by ${page.updatedBy.slice(0, 12)}` : "—"}</span>
          <span>{fmtDate(page.updatedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Config status row ─────────────────────────────────────────────────────────

function ConfigStatusRow({
  label,
  status,
  value,
}: {
  label: string;
  status: "ok" | "warn";
  value: string;
}) {
  const dot = status === "ok" ? C.successDeep : C.amberDeep;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: FONT }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <span
        style={{
          color: C.inkMuted,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase" as const,
          fontSize: 10.5,
          minWidth: 60,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: C.ink,
          fontWeight: 500,
          marginLeft: "auto",
          textAlign: "right" as const,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 160,
        }}
      >
        {value}
      </span>
    </div>
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
    "agency.site_admin.branding.edit",
    scope.tenantId,
  );

  const data = await loadWebsiteData(scope.tenantId);

  const liveUrl = data.liveUrl ?? `https://${tenantSlug}.tulala.digital`;
  const builderHref = `/admin/site-settings/sections`;

  const publishedPages  = data.pages.filter((p) => p.status === "published").length;
  const draftPages      = data.pages.filter((p) => p.status === "draft").length;
  const scheduledPages  = data.pages.filter((p) => p.status === "scheduled").length;
  const publishedPosts  = data.posts.filter((p) => p.status === "published").length;
  const activeRedirects = data.redirects.filter((r) => r.active).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT }}>
      {/* CSS hover effects for page cards */}
      <style>{`
        .page-card:hover { border-color: ${C.indigoDeep} !important; box-shadow: 0 4px 14px rgba(11,11,13,0.06); transform: translateY(-1px); }
        .post-row:hover  { background: ${C.surfaceAlt} !important; }
      `}</style>

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
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
            Website
          </h1>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!canManage && (
            <span
              style={{
                fontSize: 11,
                color: C.inkMuted,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Read-only
            </span>
          )}
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
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
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
            View live
          </a>
          <Link
            href={builderHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              height: 34,
              padding: "0 14px",
              borderRadius: 8,
              background: C.accent,
              color: "#fff",
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: -0.1,
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Open page builder
          </Link>
        </div>
      </div>

      {/* ── Hero gradient banner ── */}
      <section
        style={{
          background: `linear-gradient(135deg, ${C.fill} 0%, ${C.fillDeep} 100%)`,
          borderRadius: 14,
          padding: 20,
          color: "#fff",
          fontFamily: FONT,
        }}
      >
        {/* URL row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            Live URL
          </span>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>
            {liveUrl}
          </span>
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              padding: "3px 9px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.30)",
              background: "transparent",
              color: "#fff",
              fontFamily: FONT,
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            Open ↗
          </a>
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#5BD893",
              }}
            />
            Live
          </span>
        </div>

        {/* Hero stats grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 14,
          }}
        >
          <HeroStat
            label="Pages live"
            value={publishedPages.toString()}
            sub={`${draftPages} draft`}
          />
          <HeroStat
            label="Posts"
            value={publishedPosts.toString()}
            sub={`${data.posts.length - publishedPosts} unpublished`}
          />
          <HeroStat
            label="Redirects active"
            value={activeRedirects.toString()}
            sub={`${data.redirects.length - activeRedirects} paused`}
          />
          <HeroStat
            label="Scheduled"
            value={scheduledPages.toString()}
            sub={scheduledPages > 0 ? "pending" : "none"}
          />
        </div>
      </section>

      {/* ── Pages section ── */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: FONT,
              fontSize: 18,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.2,
            }}
          >
            Pages
          </h2>
          <span style={{ fontSize: 11.5, color: C.inkMuted }}>
            {publishedPages} live · {draftPages} draft
            {scheduledPages > 0 ? ` · ${scheduledPages} scheduled` : ""}
          </span>
          {canManage && (
            <Link
              href={builderHref}
              style={{
                marginLeft: "auto",
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${C.borderSoft}`,
                background: C.cardBg,
                color: C.ink,
                fontSize: 12,
                fontWeight: 500,
                textDecoration: "none",
                fontFamily: FONT,
              }}
            >
              + New page
            </Link>
          )}
        </div>

        {data.pages.length === 0 ? (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
              color: C.inkMuted,
              fontSize: 13,
              background: C.surface,
              borderRadius: 12,
              border: `1px dashed ${C.border}`,
              fontFamily: FONT,
            }}
          >
            No pages yet.{" "}
            <Link href={builderHref} style={{ color: C.accent, fontWeight: 600 }}>
              Open the page builder
            </Link>{" "}
            to create your first page.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {data.pages.map((p) => (
              <PageCard key={p.id} page={p} builderBase={builderHref} />
            ))}
          </div>
        )}
      </section>

      {/* ── Posts + Redirects 2-col ── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: 14,
        }}
      >
        {/* Posts column */}
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            padding: 16,
            fontFamily: FONT,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              Posts{" "}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: C.inkMuted,
                  marginLeft: 4,
                }}
              >
                {data.posts.length}
              </span>
            </h3>
            {canManage && (
              <Link
                href="/admin/site-settings/pages"
                style={{
                  fontSize: 11.5,
                  color: C.indigoDeep,
                  fontWeight: 600,
                  textDecoration: "none",
                  fontFamily: FONT,
                }}
              >
                + New post
              </Link>
            )}
          </div>

          {data.posts.length === 0 ? (
            <p style={{ fontSize: 13, color: C.inkMuted, margin: 0 }}>No posts yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.posts.map((p) => (
                <Link
                  key={p.id}
                  href="/admin/site-settings/pages"
                  className="post-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 9,
                    border: `1px solid ${C.borderSoft}`,
                    background: C.cardBg,
                    textDecoration: "none",
                    transition: "background 120ms",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <PageStatusChip status={p.status} />
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.ink,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.title}
                    </div>
                    <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: MONO, marginTop: 2 }}>
                      /{p.slug}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", color: C.inkMuted, fontSize: 11, flexShrink: 0 }}>
                    {fmtDate(p.updatedAt)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Redirects column */}
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            padding: 16,
            fontFamily: FONT,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              Redirects{" "}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: C.inkMuted,
                  marginLeft: 4,
                }}
              >
                {activeRedirects}/{data.redirects.length}
              </span>
            </h3>
            {canManage && (
              <Link
                href="/admin/site-settings/system"
                style={{
                  fontSize: 11.5,
                  color: C.indigoDeep,
                  fontWeight: 600,
                  textDecoration: "none",
                  fontFamily: FONT,
                }}
              >
                + Add
              </Link>
            )}
          </div>

          {data.redirects.length === 0 ? (
            <p style={{ fontSize: 13, color: C.inkMuted, margin: 0 }}>No redirects configured.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.redirects.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: `1px solid ${C.borderSoft}`,
                    background: r.active ? C.cardBg : C.surfaceAlt,
                    opacity: r.active ? 1 : 0.65,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: C.indigoSoft,
                        color: C.indigoDeep,
                        fontFamily: MONO,
                      }}
                    >
                      {r.statusCode}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        fontWeight: 600,
                        color: r.active ? C.successDeep : C.inkDim,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {r.active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: MONO,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        color: C.ink,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flexShrink: 1,
                        minWidth: 0,
                      }}
                    >
                      {r.oldPath}
                    </span>
                    <span style={{ color: C.inkDim, flexShrink: 0 }}>→</span>
                    <span
                      style={{
                        color: C.indigoDeep,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flexShrink: 1,
                        minWidth: 0,
                      }}
                    >
                      {r.newPath}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Configuration 3-col ── */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: FONT,
              fontSize: 18,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.2,
            }}
          >
            Configuration
          </h2>
          <span style={{ fontSize: 11.5, color: C.inkMuted }}>Domain · SEO · Tracking</span>
        </div>

        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          {/* Domain column */}
          <div
            style={{
              padding: 18,
              borderRight: `1px solid ${C.borderSoft}`,
              fontFamily: FONT,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <SectionHead>Domain</SectionHead>
              {canManage && (
                <Link
                  href="/admin/site-settings/identity"
                  style={{
                    fontSize: 11,
                    color: C.indigoDeep,
                    fontWeight: 600,
                    textDecoration: "none",
                    fontFamily: FONT,
                  }}
                >
                  Manage →
                </Link>
              )}
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 18,
                fontWeight: 600,
                color: C.ink,
                letterSpacing: -0.3,
                wordBreak: "break-all",
                marginBottom: 14,
              }}
            >
              {liveUrl.replace(/^https?:\/\//, "")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <ConfigStatusRow label="Status" status="ok" value="Active" />
              <ConfigStatusRow label="SSL" status="ok" value="Valid" />
              <ConfigStatusRow
                label="Host"
                status="ok"
                value={`${tenantSlug}.tulala.digital`}
              />
            </div>
          </div>

          {/* SEO column */}
          <div
            style={{
              padding: 18,
              borderRight: `1px solid ${C.borderSoft}`,
              fontFamily: FONT,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <SectionHead>SEO defaults</SectionHead>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: C.successSoft,
                  color: C.successDeep,
                  textTransform: "uppercase" as const,
                  letterSpacing: 0.5,
                }}
              >
                Indexable
              </span>
            </div>
            {data.seoTitle ? (
              <>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.ink,
                    marginBottom: 4,
                    lineHeight: 1.3,
                  }}
                >
                  {data.seoTitle}
                </div>
                {data.seoDescription && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: C.inkMuted,
                      marginBottom: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    {data.seoDescription}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 12 }}>
                No SEO title set.{" "}
                <Link
                  href="/admin/site-settings/seo"
                  style={{ color: C.indigoDeep, fontWeight: 600 }}
                >
                  Configure SEO →
                </Link>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.inkMuted }}>Sitemap</span>
                <span style={{ color: C.successDeep, fontWeight: 600 }}>Enabled</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.inkMuted }}>Canonical</span>
                <span
                  style={{
                    fontFamily: MONO,
                    color: C.ink,
                    fontSize: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "60%",
                  }}
                >
                  {liveUrl.replace(/^https?:\/\//, "")}
                </span>
              </div>
            </div>
          </div>

          {/* Tracking column */}
          <div style={{ padding: 18, fontFamily: FONT }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <SectionHead>Tracking</SectionHead>
              {canManage && (
                <Link
                  href="/admin/site-settings/system"
                  style={{
                    fontSize: 11,
                    color: C.indigoDeep,
                    fontWeight: 600,
                    textDecoration: "none",
                    fontFamily: FONT,
                  }}
                >
                  Configure →
                </Link>
              )}
            </div>
            {/* Tracking chips — placeholder since no schema yet */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["GA4", "Plausible", "Meta Pixel", "GTM", "Hotjar", "LinkedIn"].map(
                (label) => (
                  <span
                    key={label}
                    title="Not configured"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: C.surfaceAlt,
                      border: `1px solid ${C.borderSoft}`,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: C.inkDim,
                      fontFamily: FONT,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: C.inkDim,
                      }}
                    />
                    {label}
                  </span>
                ),
              )}
            </div>
            <p
              style={{
                fontSize: 11,
                color: C.inkDim,
                marginTop: 12,
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              Tracking integration configuration coming soon.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
