"use client";

import type { ReactNode } from "react";
import { CapsLabel, Icon, PrimaryButton, PrimaryCard, ReadOnlyChip, SecondaryButton, StatDot } from "../primitives";
import { COLORS, ENTITY_TYPE_META, FONTS, SITE_PAGES, TRANSITION, meetsPlan, meetsRole, useAdminShell } from "../state";
import { TierCard, TierSection } from "./BillingPage";
import { Grid, PageHeader } from "./pages-shared";


function SiteSubSection({ title, count, sub, actionLabel, onAction, children }: { title: string; count?: number; sub?: string; actionLabel?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.1 }}>{title}</h3>
        {typeof count === "number" && (
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted }}>{count}</span>
        )}
        {sub && <span style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body }}>{sub}</span>}
        {actionLabel && (
          <button type="button" onClick={onAction} style={{ marginLeft: "auto", padding: "5px 11px", borderRadius: 7, border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body }}>{actionLabel}</button>
        )}
      </div>
      {children}
    </section>
  );
}

function SiteTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: `2fr ${headers.slice(1).map(() => "1fr").join(" ")}`, padding: "8px 14px", background: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted, fontFamily: FONTS.body }}>
        {headers.map(h => <div key={h}>{h}</div>)}
      </div>
      {children}
    </div>
  );
}

function SiteTableRow({ cells, onClick }: { cells: ReactNode[]; onClick?: () => void }) {
  const cols = `2fr ${cells.slice(1).map(() => "1fr").join(" ")}`;
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid", gridTemplateColumns: cols,
        padding: "10px 14px", alignItems: "center",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        fontSize: 13, color: COLORS.ink, fontFamily: FONTS.body,
        cursor: onClick ? "pointer" : "default",
        transition: `background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = COLORS.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {cells.map((c, i) => <div key={i}>{c}</div>)}
    </div>
  );
}

export function PageStatusChip({
  status,
}: {
  status: "published" | "draft" | "scheduled" | "archived";
}) {
  const map = {
    published: { label: "Live",      bg: COLORS.successSoft, fg: COLORS.successDeep },
    draft:     { label: "Draft",     bg: COLORS.surfaceAlt,  fg: COLORS.inkMuted },
    scheduled: { label: "Scheduled", bg: COLORS.indigoSoft,  fg: COLORS.indigoDeep },
    archived:  { label: "Archived",  bg: COLORS.surfaceAlt,  fg: COLORS.inkDim },
  } as const;
  const m = map[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: m.bg, color: m.fg, fontSize: 11, fontWeight: 600, fontFamily: FONTS.body }}>{m.label}</span>
  );
}

function SiteInfoCard({ label, value, status, sub, mono }: { label: string; value: string; status?: "ok" | "warn"; sub?: string; mono?: boolean }) {
  const dot = status === "ok" ? COLORS.successDeep : status === "warn" ? COLORS.amberDeep : null;
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "#fff", border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: COLORS.inkMuted }}>{label}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, fontFamily: mono ? "ui-monospace, monospace" : FONTS.body, overflow: "hidden", textOverflow: "ellipsis" }}>{value || "—"}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SiteTrackingCell({ label, value }: { label: string; value: string }) {
  const active = value.length > 0;
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: active ? COLORS.successSoft : "#fff", border: `1px solid ${active ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
        {active && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.successDeep }}>Active</span>}
      </div>
      <div style={{ fontSize: 12, color: active ? COLORS.successDeep : COLORS.inkDim, fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis" }}>{value || "Not configured"}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SITE (legacy)
// ════════════════════════════════════════════════════════════════════

export function SitePage() {
  const { state, setPage, openDrawer, openUpgrade, bridgeTenantIdentity, effectiveTenant } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");

  return (
    <>
      <PageHeader
        title="Public site"
        subtitle="Roster, site pages, and embeds — in one place."
        actions={
          <>
            {!canEdit && <ReadOnlyChip />}
            <SecondaryButton size="sm" onClick={() => openDrawer("seo")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="external" size={12} stroke={1.7} />
                Open subdomain
              </span>
            </SecondaryButton>
          </>
        }
      />

      {/* Setup walkthrough banner */}
      <SiteSetupBanner />

      {/* WS-27 Site management tools */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, marginBottom: 4 }}>
        <SecondaryButton size="sm" onClick={() => openDrawer("site-context-switcher")}>Switch context</SecondaryButton>
        <SecondaryButton size="sm" onClick={() => openDrawer("page-scheduler")}>Schedule pages</SecondaryButton>
      </div>

      <div style={{ height: 10 }} />

      {/* EVERY PLAN */}
      <TierSection
        tone="ink"
        label="EVERY PLAN"
        title="Your core workspace"
        subtitle="Free, Studio, Agency, Network — all plans share this."
      >
        <PrimaryCard
          title={ENTITY_TYPE_META[state.entityType].rosterLabel}
          description={
            state.entityType === "hub"
              ? "Members · listings · features."
              : "Talents · drafts · approvals."
          }
          icon={<Icon name="team" size={14} stroke={1.7} />}
          affordance={state.entityType === "hub" ? "Open network" : "Open roster"}
          onClick={() => setPage("talent")}
        />
        <PrimaryCard
          title="Directory settings"
          description="Grid · dedicated pages · 34 fields."
          icon={<Icon name="settings" size={14} stroke={1.7} />}
          affordance="Configure"
          onClick={() => openDrawer("storefront-visibility")}
        />
        <PrimaryCard
          title="Inquiries"
          description="Open · in progress · won."
          icon={<Icon name="mail" size={14} stroke={1.7} />}
          affordance="Open work"
          onClick={() => setPage("work")}
        />
        <PrimaryCard
          title="Branding"
          description="Logo · fonts · accent color"
          icon={<Icon name="palette" size={14} stroke={1.7} />}
          affordance="Edit branding"
          onClick={() => openDrawer("branding")}
        />
        <PrimaryCard
          title="Activity"
          description="Recent edits, publishes, and bookings."
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
          affordance="See activity"
          onClick={() => openDrawer("team-activity")}
        />
      </TierSection>

      {/* STUDIO */}
      <TierSection
        tone="indigo"
        label="STUDIO"
        title="Embed anywhere"
        subtitle="Drop your roster into WordPress, Webflow, Shopify, or your custom site."
      >
        <TierCard
          title="Widgets"
          description="Active embeds · views."
          icon="globe"
          requiredPlan="studio"
          currentPlan={state.plan}
          onClick={() => openDrawer("widgets")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Widgets",
              why: "Drop your live roster into any site — WordPress, Webflow, Shopify, or hand-coded.",
              requiredPlan: "studio",
              unlocks: ["Embed widget", "View tracking", "Multiple presets"],
            })
          }
        />
        <TierCard
          title="API keys"
          description="Active keys · last used."
          icon="settings"
          requiredPlan="studio"
          currentPlan={state.plan}
          onClick={() => openDrawer("api-keys")}
          onUpgrade={() =>
            openUpgrade({
              feature: "API access",
              why: "Read your roster from your own app — power talent pages, search, and pipelines.",
              requiredPlan: "studio",
              unlocks: ["Read-only API", "Webhooks", "Per-key scopes"],
            })
          }
        />
        <TierCard
          title="Custom domain & home"
          description={
            bridgeTenantIdentity?.verifiedDomain
              ? `Live at ${bridgeTenantIdentity.verifiedDomain}`
              : `Currently at ${bridgeTenantIdentity?.slug ? `${bridgeTenantIdentity.slug}.tulala.app` : effectiveTenant.domain}`
          }
          icon="globe"
          requiredPlan="studio"
          currentPlan={state.plan}
          onClick={() => openDrawer("domain")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Custom domain",
              why: "Run your storefront at your own brand's domain — not a Tulala subdomain.",
              requiredPlan: "studio",
              unlocks: ["Custom domain", "Verified email-from", "Auto SSL"],
            })
          }
          meta={bridgeTenantIdentity?.verifiedDomain ? <><StatDot tone="green" /> Verified</> : undefined}
        />
      </TierSection>

      {/* AGENCY */}
      <TierSection
        tone="amber"
        label="AGENCY"
        title="Full branded site"
        subtitle="Your site, your domain, your brand. Pages, posts, nav, theme, SEO."
      >
        <TierCard
          title="Homepage"
          description={meetsPlan(state.plan, "agency") ? "Draft pending" : "First-impression hero"}
          icon="bolt"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("homepage")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Branded homepage",
              why: "Take full control of the first thing your visitors see.",
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title="Pages"
          description={`${SITE_PAGES.filter(p=>p.status==="published").length} pages · ${SITE_PAGES.filter(p=>p.status==="draft").length} drafts`}
          icon="globe"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("pages")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Pages",
              why: "Add About, Press, FAQ, Contact — anything beyond the roster.",
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title="Posts"
          description="News, editorial, brand stories"
          icon="mail"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("posts")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Posts",
              why: "Publish news, editorial features, behind-the-scenes — keep your brand alive.",
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title="Navigation & footer"
          description="Header 5 · Footer 3 cols"
          icon="settings"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("navigation")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Custom navigation",
              why: "Define your own header and footer beyond the default roster page.",
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title="Theme & foundations"
          description="Editorial Noir"
          icon="palette"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("theme-foundations")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Theme & foundations",
              why: "Take full control of typography, color, density, and layout.",
              requiredPlan: "agency",
              unlocks: ["Theme presets", "Color tokens", "Type scale", "Density"],
            })
          }
        />
        <TierCard
          title="SEO & defaults"
          description="Meta · Sitemap · 2 redirects"
          icon="search"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("seo")}
          onUpgrade={() =>
            openUpgrade({
              feature: "SEO & defaults",
              why: "Own your meta tags, social cards, sitemap and redirect rules.",
              requiredPlan: "agency",
            })
          }
        />
      </TierSection>

      {/* NETWORK */}
      <TierSection
        tone="green"
        label="NETWORK"
        title="Multi-agency · hub"
        subtitle="Operate multiple agencies and push talent to cross-agency discovery."
        rightSlot={
          <button
            type="button"
            onClick={() => openUpgrade({
              feature: "Network plan",
              why: "Run multiple agency identities under one roof. Move roster across brands without losing history.",
              requiredPlan: "network",
            })}
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
          >
            Contact sales <Icon name="arrow-right" size={11} />
          </button>
        }
      >
        <TierCard
          title="Hub publishing"
          description="Cross-agency discovery"
          icon="globe"
          requiredPlan="network"
          currentPlan={state.plan}
          onClick={() => openDrawer("hub-distribution")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Hub publishing",
              why: "Push talent to discovery across all your agency brands at once.",
              requiredPlan: "network",
            })
          }
        />
        <TierCard
          title="Multi-agency manager"
          description="Operate multiple brands"
          icon="team"
          requiredPlan="network"
          currentPlan={state.plan}
          onClick={() => openDrawer("hub-distribution")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Multi-agency",
              why: "Run several agencies as one operation — shared talent pool, separate brand identities.",
              requiredPlan: "network",
              unlocks: ["Sub-brands", "Cross-roster pool", "Hub-level dashboards"],
            })
          }
        />
      </TierSection>
    </>
  );
}

// Site setup walkthrough banner — full-width prominent card
function SiteSetupBanner() {
  const { openDrawer } = useAdminShell();
  return (
    <div
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid rgba(15,79,62,0.22)`,
        borderRadius: 14,
        padding: 22,
        display: "flex",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 11,
          background: "rgba(15,79,62,0.16)",
          color: COLORS.accentDeep,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="sparkle" size={20} stroke={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 4 }}>
          <CapsLabel color={COLORS.accentDeep} style={{ letterSpacing: 1.6 }}>
            Site setup · the unified walkthrough
          </CapsLabel>
        </div>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: COLORS.ink,
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          Get your site live in six steps
        </h2>
        <p
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.inkMuted,
            margin: "4px 0 0",
            lineHeight: 1.55,
            maxWidth: 720,
          }}
        >
          Homepage, pages, posts, navigation, theme, SEO — every Agency card walked through with real status and one click to apply.
        </p>
      </div>
      <PrimaryButton onClick={() => openDrawer("site-setup")}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Open setup
          <Icon name="arrow-right" size={13} stroke={1.8} />
        </span>
      </PrimaryButton>
    </div>
  );
}
