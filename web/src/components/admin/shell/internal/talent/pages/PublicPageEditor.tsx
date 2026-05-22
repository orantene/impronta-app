"use client";

import { useState, type ReactNode } from "react";
import { workspacePathUrl } from "@/lib/saas/workspace-public-url";
import { GalleryFxCard } from "../../modern-features";
import { COLORS, FONTS, MY_AGENCIES, MY_TALENT_PROFILE, RADIUS, TALENT_PAGE_TEMPLATES, TALENT_PROFILES_BY_ID, buildFreshTalentProfile, useAdminShell, type TalentSubscriptionTier } from "../../state";



// ════════════════════════════════════════════════════════════════════
// My Pages — talent presence hub (WS-8.2; renamed from "Public page").
//   Block 1 · "Your Tulala page"  — the personal /t/<code> page editor.
//   Block 2 · "Where you appear" — every Tulala workspace the talent is on.
// ════════════════════════════════════════════════════════════════════

/** Section eyebrow label — uppercase, heads each hub block. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONTS.body, marginBottom: 10 }}
      className="text-admin-ink-dim"
    >
      {children}
    </div>
  );
}

/** One workspace the talent's profile appears on — normalised from the
 *  bridge (`agency_talent_roster`) or the standalone fixture. */
type WorkspaceAppearance = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isPrimary: boolean;
  visibility: string;
  planTier: string;
};

function workspaceKindLabel(planTier: string): string {
  return planTier === "free" ? "Free workspace" : "Agency";
}

function visibilityLabel(visibility: string): string {
  switch (visibility) {
    case "featured":     return "Featured on their site";
    case "site_visible": return "Shown on their public site";
    default:             return "On their roster";
  }
}

function rosterStatusLabel(status: string): string {
  switch (status) {
    case "exclusive":     return "Exclusive";
    case "non-exclusive": return "Non-exclusive";
    case "pending":       return "Pending";
    case "ended":         return "Ended";
    case "active":        return "Active";
    default:              return status || "Active";
  }
}

/** One card in the "Where you appear" list. Presentation only —
 *  relationship management (exclusivity, leaving) lives on Agencies. */
function WorkspaceAppearanceCard({
  workspace,
  onManage,
}: {
  workspace: WorkspaceAppearance;
  onManage: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.lg,
        padding: "14px 16px",
      }}
    >
      {/* Workspace avatar — initial */}
      <div
        style={{ width: 38, height: 38, borderRadius: RADIUS.md, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, fontFamily: FONTS.body, flexShrink: 0 }}
        className="bg-admin-accent-soft text-admin-accent"
      >
        {workspace.name.charAt(0).toUpperCase()}
      </div>

      {/* Identity */}
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body }} className="text-admin-ink">
            {workspace.name}
          </span>
          {workspace.isPrimary && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 6px", borderRadius: 999, fontFamily: FONTS.body }} className="bg-admin-accent-soft text-admin-accent">
              Primary
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, fontFamily: FONTS.body, marginTop: 2 }} className="text-admin-ink-muted">
          {workspaceKindLabel(workspace.planTier)} · {rosterStatusLabel(workspace.status)} · {visibilityLabel(workspace.visibility)}
        </div>
      </div>

      {/* Actions — presentation only; "Manage" deep-links to Agencies */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <a
          href={workspacePathUrl(workspace.slug)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "transparent", color: COLORS.ink,
            border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm,
            padding: "5px 11px", fontSize: 11.5, fontWeight: 600,
            fontFamily: FONTS.body, textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          View live page ↗
        </a>
        <button
          type="button"
          onClick={onManage}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: COLORS.inkMuted, fontSize: 11.5, fontWeight: 600,
            fontFamily: FONTS.body, whiteSpace: "nowrap", padding: "5px 4px",
          }}
        >
          Manage →
        </button>
      </div>
    </div>
  );
}

export function PublicPageEditor() {
  const { openDrawer, setTalentPage, bridgeTalentSelfProfile, bridgeTalentAgencies } = useAdminShell();
  // Prefer the real bridge profile so a freshly-provisioned talent sees
  // their own canonical /t/<profile_code> URL, not Marta's. Standalone
  // prototype mode (no bridge) keeps the demo MY_TALENT_PROFILE.
  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  const profile = bridgeTalentSelfProfile && !TALENT_PROFILES_BY_ID[selfTalentId]
    ? buildFreshTalentProfile(bridgeTalentSelfProfile)
    : MY_TALENT_PROFILE;
  // The canonical share URL — /t/<profile_code> when the bridge has a
  // real talent profile, otherwise the demo slug derived from the name.
  const publicSlug = bridgeTalentSelfProfile?.profileCode
    ?? profile.name.toLowerCase().replace(/\s+/g, "-");
  const [preview, setPreview] = useState(false);

  const tier: TalentSubscriptionTier = profile.subscription?.tier ?? "free";
  const isPro = tier === "pro" || tier === "max";
  const isMax = tier === "max";

  // Every Tulala workspace the talent's profile appears on. Agencies,
  // friends' free studios, and a self-owned workspace all land in
  // agency_talent_roster, so one source covers the whole list.
  const workspaces: WorkspaceAppearance[] = bridgeTalentAgencies !== null
    ? bridgeTalentAgencies.map((a) => ({
        id: a.id,
        name: a.agencyName,
        slug: a.agencySlug,
        status: a.rosterStatus,
        isPrimary: a.isPrimary,
        visibility: a.agencyVisibility,
        planTier: a.plan,
      }))
    : MY_AGENCIES.map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        status: a.status,
        isPrimary: a.isPrimary,
        visibility: "roster_only",
        planTier: a.planTier,
      }));

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 0" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12, marginBottom: 24 }}>
        <div style={{ flex: "1 1 240px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: FONTS.body, margin: 0 }} className="text-admin-ink">
            My Pages
          </h2>
          <p style={{ fontSize: 13, fontFamily: FONTS.body, margin: "4px 0 0" }} className="text-admin-ink-muted">
            Your Tulala page, and every workspace your profile appears on.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            style={{
              background: preview ? COLORS.fill : "transparent",
              color:      preview ? "#fff" : COLORS.ink,
              border:     `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
              padding:    "7px 14px", fontSize: 12, fontWeight: 600,
              cursor:     "pointer", fontFamily: FONTS.body,
            }}
          >
            {preview ? "✓ Preview on" : "Preview"}
          </button>
          <a
            href={`/t/${publicSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: COLORS.fill, color: "#fff",
              border: "none", borderRadius: RADIUS.md,
              padding: "7px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONTS.body,
              textDecoration: "none", display: "inline-block",
            }}
          >
            View page ↗
          </a>
        </div>
      </div>

      {/* ════════ Block 1 — Your Tulala page ════════ */}
      <SectionLabel>Your Tulala page</SectionLabel>

      {/* URL identity card */}
      <div
        style={{
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: RADIUS.lg, padding: "14px 16px", marginBottom: 16,
        }}
      >
        <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
          tulala.digital/t/{publicSlug}
        </div>
        <div style={{ fontSize: 11.5, fontFamily: FONTS.body, marginTop: 3, lineHeight: 1.5 }} className="text-admin-ink-muted">
          Your personal page — yours on every plan, and the destination behind every roster you join.
        </div>
      </div>

      {/* Tier gate banner */}
      {!isPro && (
        <div style={{ background: "rgba(79,70,229,0.06)", border: "1px solid rgba(79,70,229,0.18)", padding: "12px 16px", marginBottom: 20, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }} className="rounded-admin-lg">
          <span className="text-xl">✨</span>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body }} className="text-admin-ink">
              Unlock Pro to customise your page
            </div>
            <div style={{ fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
              Change layout, add a bio video, hide agency branding, and set contact controls.
            </div>
          </div>
          <button
            type="button"
            onClick={() => openDrawer("talent-tier-compare")}
            style={{
              background: COLORS.accent, color: "#fff",
              border: "none", borderRadius: RADIUS.md,
              padding: "6px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONTS.body, flexShrink: 0,
            }}
          >
            Upgrade →
          </button>
        </div>
      )}

      {/* Animated cover (Pro+) — WebGPU shader; static gradient fallback. */}
      {isPro && <GalleryFxCard />}

      {/* Layout selector */}
      <section className="mb-5">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONTS.body, marginBottom: 10 }} className="text-admin-ink-dim">
          Page template
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }} data-tulala-template-grid>
          {TALENT_PAGE_TEMPLATES.map((tpl) => {
            const tierOrder: TalentSubscriptionTier[] = ["free", "pro", "max"];
            const locked = tierOrder.indexOf(tier) < tierOrder.indexOf(tpl.availableAt);
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  if (locked) { openDrawer("talent-tier-compare"); return; }
                  // Template save not yet wired — visual selection only
                }}
                style={{
                  background:    "#fff",
                  border:        `2px solid ${locked ? COLORS.borderSoft : COLORS.border}`,
                  borderRadius:  RADIUS.md,
                  padding:       "12px 10px",
                  cursor:        locked ? "not-allowed" : "pointer",
                  opacity:       locked ? 0.6 : 1,
                  textAlign:     "center",
                  fontFamily:    FONTS.body,
                  position:      "relative",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{tpl.thumb}</div>
                <div className="text-admin-ink text-xs font-semibold">{tpl.label}</div>
                <div style={{ fontSize: 10, marginTop: 2 }} className="text-admin-ink-muted">{tpl.blurb}</div>
                {locked && (
                  <div style={{ position: "absolute", top: 6, right: 6, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 5px", borderRadius: 4 }} className="bg-admin-accent-soft text-admin-accent">
                    {tpl.availableAt === "max" ? "MAX" : "PRO"}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <style>{`@media (max-width: 480px) { [data-tulala-template-grid] { grid-template-columns: repeat(2, 1fr) !important; } }`}</style>
      </section>

      {/* Visibility + contact settings — coming in Phase 2 */}
      <section style={{ border: `1px solid ${COLORS.borderSoft}`, padding: "14px 18px", marginBottom: 20 }} className="bg-admin-surface-alt rounded-admin-lg">
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONTS.body, marginBottom: 4 }} className="text-admin-ink-muted">
          Visibility &amp; privacy settings
        </div>
        <p style={{ fontSize: 12, fontFamily: FONTS.body, margin: 0, lineHeight: 1.5 }} className="text-admin-ink-muted">
          Roster visibility, direct contact, and earnings privacy controls are coming soon.
        </p>
      </section>

      {/* Custom domain — Max only */}
      <section style={{ background: isMax ? "#fff" : COLORS.surfaceAlt, border: `1px solid ${COLORS.borderSoft}`, padding: "16px 18px", opacity: isMax ? 1 : 0.7 }} className="rounded-admin-lg">
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONTS.body }} className="text-admin-ink">
            Custom domain
          </span>
          {!isMax && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 4, fontFamily: FONTS.body }} className="bg-admin-accent-soft text-admin-accent">
              MAX
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, fontFamily: FONTS.body, margin: "0 0 10px" }} className="text-admin-ink-muted">
          Point your own domain (e.g. yourname.com) to your Tulala public page.
        </p>
        {isMax ? (
          <button
            type="button"
            onClick={() => openDrawer("talent-custom-domain")}
            style={{
              background: COLORS.fill, color: "#fff", border: "none",
              borderRadius: RADIUS.md, padding: "6px 14px", fontSize: 12,
              fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body,
            }}
          >
            Connect a domain →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openDrawer("talent-tier-compare")}
            style={{
              background: "transparent", color: COLORS.accent,
              border: `1px solid ${COLORS.accent}`, borderRadius: RADIUS.md,
              padding: "6px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONTS.body,
            }}
          >
            Upgrade to Max →
          </button>
        )}
      </section>

      {/* ════════ Block 2 — Where you appear ════════ */}
      <div style={{ marginTop: 28 }}>
        <SectionLabel>Where you appear · {workspaces.length}</SectionLabel>
        <p style={{ fontSize: 12, fontFamily: FONTS.body, margin: "0 0 12px", lineHeight: 1.5 }} className="text-admin-ink-muted">
          Every Tulala workspace your profile is published on — agencies, studios, and hubs. The page above is the same wherever you appear.
        </p>
        {workspaces.length === 0 ? (
          <div style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.lg, padding: "20px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body }} className="text-admin-ink">
              Not on any workspace yet
            </div>
            <p style={{ fontSize: 12, fontFamily: FONTS.body, margin: "4px 0 0", lineHeight: 1.5 }} className="text-admin-ink-muted">
              Agencies and studios that add you to their roster will appear here, each linking to your live page on their site.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {workspaces.map((w) => (
              <WorkspaceAppearanceCard
                key={w.id}
                workspace={w}
                onManage={() => setTalentPage("agencies")}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile preview pane — appears when "Preview" toggle is on.
          Renders an iPhone-shaped card showing what tulala.digital/t/<slug>
          looks like on a phone. Pure CSS frame; no iframe. */}
      {preview && (
        <section
          aria-label="Mobile preview"
          style={{
            marginTop: 28,
            padding: 20,
            background: COLORS.surfaceAlt,
            borderRadius: RADIUS.lg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONTS.body }} className="text-admin-ink-dim">
            Mobile preview · 390 × 844
          </div>
          <div
            data-tulala-mobile-preview
            style={{
              width: 320,
              height: 640,
              borderRadius: 36,
              background: "#0B0B0D",
              padding: 8,
              boxShadow: "0 24px 60px -10px rgba(11,11,13,0.30)",
              position: "relative",
            }}
          >
            {/* Notch */}
            <div style={{
              position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
              width: 86, height: 22, borderRadius: 12, background: "#0B0B0D",
              zIndex: 2,
            }} />
            {/* Screen */}
            <div
              style={{
                width: "100%", height: "100%",
                borderRadius: 28,
                background: "#fff",
                overflowY: "auto",
                fontFamily: FONTS.body,
                position: "relative",
              }}
            >
              {/* Cover banner */}
              <div style={{
                height: 180,
                background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.accentDeep} 100%)`,
                display: "flex", alignItems: "flex-end", padding: 14, color: "#fff",
              }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    {profile.specialties[0] ?? "Talent"}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, letterSpacing: -0.5 }}>
                    {profile.name}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                    {profile.currentLocation}
                  </div>
                </div>
              </div>
              {/* Stats / measurements */}
              <div style={{ padding: "16px 16px 8px" }}>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }} className="text-admin-ink">
                  {profile.measurementsSummary} · {profile.bookingStats.completedBookings} bookings · {profile.bookingStats.yearsActive}y experience
                </p>
              </div>
              {/* Photo grid */}
              <div style={{ padding: "0 12px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    paddingBottom: "100%", borderRadius: 8,
                    background: `linear-gradient(${i*45}deg, ${COLORS.accentSoft}, ${COLORS.surfaceAlt})`,
                  }} />
                ))}
              </div>
              {/* Contact CTA */}
              <div style={{ padding: "0 16px 20px" }}>
                <button type="button" disabled style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12,
                  background: COLORS.fill, color: "#fff", border: "none",
                  fontSize: 13, fontWeight: 700, fontFamily: FONTS.body,
                  cursor: "default",
                }}>
                  Send an inquiry
                </button>
                <div style={{ fontSize: 10.5, textAlign: "center", marginTop: 8 }} className="text-admin-ink-dim">
                  Powered by Tulala
                </div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">
            This is what visitors see at <strong>tulala.digital/t/{publicSlug}</strong>
          </div>
        </section>
      )}
    </div>
  );
}
