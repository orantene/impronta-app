"use client";

import { useState } from "react";
import { GalleryFxCard } from "../../modern-features";
import { COLORS, FONTS, MY_TALENT_PROFILE, RADIUS, TALENT_PAGE_TEMPLATES, TALENT_PROFILES_BY_ID, buildFreshTalentProfile, useAdminShell, type TalentSubscriptionTier } from "../../state";



// ════════════════════════════════════════════════════════════════════
// WS-8.2 Public page editor (split from ReachPage)
// ════════════════════════════════════════════════════════════════════

export function PublicPageEditor() {
  const { openDrawer, bridgeTalentSelfProfile } = useAdminShell();
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

  const tier = profile.subscription?.tier ?? "basic";
  const isPro  = tier === "pro"  || tier === "portfolio";
  const isPort = tier === "portfolio";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body, margin: 0 }}>
            Public page
          </h2>
          <p style={{ fontSize: 13, color: COLORS.inkMuted, fontFamily: FONTS.body, margin: "4px 0 0" }}>
            tulala.digital/t/{publicSlug}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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

      {/* Tier gate banner */}
      {!isPro && (
        <div style={{
          background: "rgba(79,70,229,0.06)", border: "1px solid rgba(79,70,229,0.18)",
          borderRadius: RADIUS.lg, padding: "12px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>✨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, fontFamily: FONTS.body }}>
              Unlock Pro to customise your page
            </div>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
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

      {/* Animated cover (Pro only) — WebGPU shader. Falls back to a
          static gradient when WebGPU isn't available. */}
      {isPro && <GalleryFxCard />}

      {/* Layout selector */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.inkDim, fontFamily: FONTS.body, marginBottom: 10 }}>
          Page template
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {TALENT_PAGE_TEMPLATES.map((tpl) => {
            const tierOrder: TalentSubscriptionTier[] = ["basic", "pro", "portfolio"];
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
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink }}>{tpl.label}</div>
                <div style={{ fontSize: 10, color: COLORS.inkMuted, marginTop: 2 }}>{tpl.blurb}</div>
                {locked && (
                  <div style={{
                    position: "absolute", top: 6, right: 6,
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                    padding: "2px 5px", borderRadius: 4,
                    background: COLORS.accentSoft, color: COLORS.accent,
                  }}>
                    PRO
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Visibility + contact settings — coming in Phase 2 */}
      <section style={{
        background: COLORS.surfaceAlt, border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.lg, padding: "14px 18px", marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.inkMuted, fontFamily: FONTS.body, marginBottom: 4 }}>
          Visibility &amp; privacy settings
        </div>
        <p style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body, margin: 0, lineHeight: 1.5 }}>
          Roster visibility, direct contact, and earnings privacy controls are coming soon.
        </p>
      </section>

      {/* Custom domain — Portfolio only */}
      <section style={{
        background: isPort ? "#fff" : COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.lg, padding: "16px 18px",
        opacity: isPort ? 1 : 0.7,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body }}>
            Custom domain
          </span>
          {!isPort && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
              padding: "2px 6px", borderRadius: 4,
              background: COLORS.accentSoft, color: COLORS.accent, fontFamily: FONTS.body,
            }}>
              PORTFOLIO
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body, margin: "0 0 10px" }}>
          Point your own domain (e.g. yourname.com) to your Tulala public page.
        </p>
        {isPort ? (
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
            Upgrade to Portfolio →
          </button>
        )}
      </section>

      {/* Mobile preview pane — appears when "Preview" toggle is on.
          Renders an iPhone-shaped card showing what tulala.digital/t/<slug>
          looks like on a phone. Pure CSS frame; no iframe (we don't have
          the public-page route in the prototype yet, so we render a
          stylized mock from the same MY_TALENT_PROFILE data). */}
      {preview && (
        <section
          aria-label="Mobile preview"
          style={{
            marginTop: 24,
            padding: 20,
            background: COLORS.surfaceAlt,
            borderRadius: RADIUS.lg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.inkDim, fontFamily: FONTS.body }}>
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
                <p style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5, margin: 0 }}>
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
                <div style={{ fontSize: 10.5, color: COLORS.inkDim, textAlign: "center", marginTop: 8 }}>
                  Powered by Tulala
                </div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
            This is what visitors see at <strong>tulala.digital/t/{profile.name.toLowerCase().replace(/\s+/g, "-")}</strong>
          </div>
        </section>
      )}
    </div>
  );
}

