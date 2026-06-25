"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/premium-pages — Phase 1d body chunk.
// Owns: TalentTierCompareDrawer, TalentPersonalPageDrawer,
// TalentPageTemplateDrawer, TalentMediaEmbedsDrawer, TalentPressDrawer,
// TalentMediaKitDrawer, TalentCustomDomainDrawer.
// Private helpers: LockedBadge, FeatureCell (matrix → TALENT_TIER_CATALOG).
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import {
  COLORS,
  FONTS,
  MY_TALENT_PROFILE,
  TALENT_PAGE_TEMPLATES,
  TALENT_TIER_CATALOG,
  TALENT_TIER_GROUP_LABELS,
  TALENT_TIER_META,
  tierAllows,
  useAdminShell,
  type TalentMediaEmbed,
  type TalentSubscriptionTier,
  type TalentTierCell,
  type TalentTierGroup,
} from "../state";
import {
  CapsLabel,
  Divider,
  DrawerShell,
  FieldRow,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Toggle,
} from "../primitives";

// ─── LockedBadge (inlined — also in _talent.tsx for MyProfilePage) ────────────
/** Lock badge shown next to a feature card when the talent's tier doesn't unlock it. */
function LockedBadge({ requiredTier }: { requiredTier: TalentSubscriptionTier }) {
  const meta = TALENT_TIER_META[requiredTier];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        background: requiredTier === "max" ? COLORS.fill : COLORS.accentSoft,
        color: requiredTier === "max" ? "#fff" : COLORS.accent,
        border: `1px solid ${requiredTier === "max" ? COLORS.accent : "rgba(15,79,62,0.28)"}`,
        fontFamily: FONTS.body,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.3,
        borderRadius: 999,
        textTransform: "uppercase",
      }}
      title={`Unlocked at ${meta.label}`}
    >
      <span className="text-admin-9">🔒</span>
      {meta.label}
    </span>
  );
}

// ─── Tier compare ────────────────────────────────────────────────
// The feature matrix is data-driven: TALENT_TIER_CATALOG (state/fixtures)
// is the single source for the rows below AND the per-feature gates.

export function TalentTierCompareDrawer() {
  const { state, closeDrawer, setTalentTier } = useAdminShell();
  const open = state.drawer.drawerId === "talent-tier-compare";
  const current = state.talentTier;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Compare talent plans"
      description="Your Tulala personal page tier. Coexists with whatever agencies and hubs you're on — agency rosters never change."
      width={760}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      {process.env.NODE_ENV !== "production" && (
        <div style={{ marginBottom: 10, fontFamily: FONTS.body, fontSize: 11, fontWeight: 600 }} className="text-admin-ink-dim">
          Dev — switch tier to preview plan gating live across the talent surface.
        </div>
      )}
      {/* Tier columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {(["free", "pro", "max"] as const).map((t) => {
          const meta = TALENT_TIER_META[t];
          const isCurrent = t === current;
          return (
            <div
              key={t}
              style={{
                padding: "16px 16px",
                background: t === "max" ? COLORS.fill : "#fff",
                color: t === "max" ? "#fff" : COLORS.ink,
                border: `1.5px solid ${isCurrent ? COLORS.accentDeep : t === "max" ? COLORS.accent : COLORS.borderSoft}`,
                borderRadius: 12,
                position: "relative",
              }}
            >
              {isCurrent && (
                <span style={{ position: "absolute", top: -10, left: 14, color: "#fff", fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "3px 9px", borderRadius: 999, textTransform: "uppercase" }} className="bg-admin-accent-deep">
                  Current
                </span>
              )}
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                }}
              >
                {meta.label}
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  opacity: 0.75,
                  marginTop: 3,
                }}
              >
                {meta.tagline}
              </div>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 18,
                  marginTop: 12,
                  color: t === "max" ? "#fff" : COLORS.accentDeep,
                  fontWeight: 600,
                }}
              >
                {meta.monthlyPrice}
              </div>
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  marginTop: 8,
                  marginBottom: 0,
                  opacity: 0.85,
                }}
              >
                {meta.blurb}
              </p>
              {process.env.NODE_ENV !== "production" && !isCurrent && (
                <button
                  type="button"
                  onClick={() => setTalentTier(t)}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    padding: "6px 10px",
                    background: "transparent",
                    color: t === "max" ? "#fff" : COLORS.ink,
                    border: `1px solid ${t === "max" ? "rgba(255,255,255,0.4)" : COLORS.border}`,
                    borderRadius: 8,
                    fontFamily: FONTS.body,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Switch to {meta.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Feature matrix */}
      <div style={{ marginTop: 18 }}>
        <CapsLabel>What&apos;s included</CapsLabel>
        <div
          style={{
            marginTop: 8,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", padding: "10px 14px", background: "rgba(11,11,13,0.025)", borderBottom: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }} className="text-admin-ink-muted">
            <span>Feature</span>
            <span className="text-center">Free</span>
            <span className="text-center">Pro</span>
            <span className="text-center">Max</span>
          </div>
          {/* Rows — grouped by section */}
          {(["page", "discovery", "money", "tools"] as TalentTierGroup[]).map((group, gi) => {
            const rows = TALENT_TIER_CATALOG.filter((r) => r.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group}>
                <div style={{ padding: "7px 14px", background: "rgba(11,11,13,0.02)", borderTop: gi > 0 ? `1px solid ${COLORS.borderSoft}` : "none", borderBottom: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }} className="text-admin-ink-dim">
                  {TALENT_TIER_GROUP_LABELS[group]}
                </div>
                {rows.map((f, i) => (
                  <div
                    key={f.label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
                      padding: "10px 14px",
                      borderBottom: i < rows.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
                      fontFamily: FONTS.body,
                      fontSize: 12.5,
                      color: COLORS.ink,
                      alignItems: "center",
                    }}
                  >
                    <span className="font-medium">{f.label}</span>
                    <FeatureCell value={f.free} />
                    <FeatureCell value={f.pro} />
                    <FeatureCell value={f.max} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: "12px 14px", border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 10, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.55 }} className="bg-admin-surface-alt text-admin-ink">
        Personal page tiers are independent of agency / hub presence. You stay on every roster
        you&apos;re on now. The tier only affects your direct Tulala destination page.
      </div>

      {/* Phase 1.5: Pro & Max not yet available for launch — waitlist card replaces trial CTA */}
      <div
        style={{
          marginTop: 16,
          padding: "18px 20px",
          background: "#fff",
          border: `1.5px solid rgba(91,107,160,0.28)`,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: FONTS.body,
        }}
      >
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }} className="text-admin-indigo-deep">
            Pro &amp; Max launching soon
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink-muted">
            We&apos;ll let you know the moment Pro and Max open, with an early-access discount for current talent.
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

function FeatureCell({ value }: { value: TalentTierCell }) {
  if (value === true) {
    return (
      <span style={{ textAlign: "center", fontWeight: 600 }} className="text-admin-green">✓</span>
    );
  }
  if (value === false) {
    return <span style={{ textAlign: "center" }} className="text-admin-ink-dim">—</span>;
  }
  return (
    <span style={{ textAlign: "center", fontSize: 11.5 }} className="text-admin-ink-muted">
      {value}
    </span>
  );
}

// ─── Personal site section plan (Max) ──────────────────────────────

export function TalentPersonalPageDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-personal-page";
  const sub = MY_TALENT_PROFILE.subscription;
  const sections = [
    { id: "hero", label: "Hero", body: "Cover · headshot · name · pronouns · tagline.", removable: false },
    { id: "story", label: "About / story", body: "1-2 paragraphs in your own voice.", removable: true },
    { id: "embeds", label: "Media embeds", body: `${sub.embeds.length} embed${sub.embeds.length === 1 ? "" : "s"} live.`, removable: true },
    { id: "credits", label: "Credits & tearsheet", body: "Pulled from your profile credits.", removable: true },
    { id: "press", label: "Press band", body: `${sub.press.length} clip${sub.press.length === 1 ? "" : "s"}.`, removable: true },
    { id: "contact", label: "Contact CTA", body: "'Inquire' button → routes through your agency unless you're un-rep'd.", removable: false },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Personal site sections"
      description="Hero and Contact CTA are required. Your Max site can grow from these personal-brand sections."
      width={620}
      footer={
        <>
          {/* Fake publish remains stripped; publish belongs to the governed builder flow. */}
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {sections.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ fontSize: 14, cursor: "grab" }} className="text-admin-ink-dim">⋮⋮</span>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500 }} className="text-admin-ink">
                {s.label}
                {!s.removable && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400 }} className="text-admin-ink-muted">
                    Required
                  </span>
                )}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                {s.body}
              </div>
            </div>
            <Toggle on={true} onChange={() => {}} />
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Page template picker ───────────────────────────────────────────


// ─── Page template picker ───────────────────────────────────────────

export function TalentPageTemplateDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-page-template";
  const tier = state.talentTier;
  const active = MY_TALENT_PROFILE.subscription.template;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Choose a template"
      description="Templates set the layout, hero size, and section order of your personal page. Switch any time — content stays."
      width={680}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {TALENT_PAGE_TEMPLATES.map((t) => {
          const locked = !tierAllows(tier, "template-picker") && t.availableAt !== "free";
          const tierLocked = !tierAllows(tier, "media-embeds") && t.availableAt === "pro";
          const sigLocked = !tierAllows(tier, "extra-sections") && t.availableAt === "max";
          const isLocked = locked || tierLocked || sigLocked;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => {
                if (isLocked) {
                  openDrawer("talent-tier-compare");
                }
              }}
              style={{
                position: "relative",
                padding: 14,
                textAlign: "left",
                background: isActive ? COLORS.surfaceAlt : "#fff",
                border: `1.5px solid ${isActive ? COLORS.accentDeep : COLORS.borderSoft}`,
                borderRadius: 12,
                cursor: "pointer",
                opacity: isLocked ? 0.78 : 1,
              }}
            >
              <div style={{ aspectRatio: "16 / 9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, marginBottom: 10, filter: isLocked ? "grayscale(0.4)" : "none" }} className="bg-admin-surface-alt">
                {t.thumb}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontFamily: FONTS.display, fontSize: 16 }} className="text-admin-ink">{t.label}</span>
                {isActive && (
                  <span style={{ fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-accent-deep">
                    Active
                  </span>
                )}
                {isLocked && <LockedBadge requiredTier={t.availableAt} />}
              </div>
              <p style={{ margin: "4px 0 0", fontFamily: FONTS.body, fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
                {t.blurb}
              </p>
            </button>
          );
        })}
      </div>
    </DrawerShell>
  );
}

// ─── Media embeds ──────────────────────────────────────────────────


// ─── Media embeds ──────────────────────────────────────────────────

export function TalentMediaEmbedsDrawer() {
  // Phase 1.5 STRIP: Pro+ only — save CTA removed; drawer kept for Phase 2 re-wiring
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-media-embeds";
  const embeds = MY_TALENT_PROFILE.subscription.embeds;

  const supported: Array<{ kind: TalentMediaEmbed["kind"]; label: string; thumb: string }> = [
    { kind: "instagram", label: "Instagram", thumb: "📷" },
    { kind: "tiktok", label: "TikTok", thumb: "🎵" },
    { kind: "youtube", label: "YouTube", thumb: "▶️" },
    { kind: "spotify", label: "Spotify", thumb: "🎧" },
    { kind: "soundcloud", label: "SoundCloud", thumb: "☁️" },
    { kind: "vimeo", label: "Vimeo", thumb: "🎬" },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Media embeds"
      description="Drop in a public URL and Tulala renders the live embed on your personal page. Update any time."
      width={580}
      footer={
        <>
          {/* Phase 1.5 STRIP: save removed — Pro+ feature, not wired for Free */}
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <CapsLabel>Live on your page</CapsLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {embeds.map((e) => (
          <div
            key={e.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }} className="bg-admin-surface-alt">
              {e.thumb}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, textTransform: "capitalize" }} className="text-admin-ink">
                {e.kind} · {e.label}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">
                {e.url}
              </div>
            </div>
            <button
              onClick={() => undefined}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <Divider label="Supported sources" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {supported.map((s) => (
          <div
            key={s.kind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: COLORS.surfaceAlt,
              border: `1px solid rgba(15,79,62,0.18)`,
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.ink,
            }}
          >
            <span className="text-base">{s.thumb}</span>
            {s.label}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Press / clippings ──────────────────────────────────────────────


// ─── Press / clippings ──────────────────────────────────────────────

export function TalentPressDrawer() {
  // Phase 1.5 STRIP: Pro+ only — save CTA removed; drawer kept for Phase 2 re-wiring
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-press";
  const press = MY_TALENT_PROFILE.subscription.press;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Press & clippings"
      description="Magazine, blog, podcast, or TV mentions. Pulled from Google Alerts or pasted in manually."
      width={580}
      footer={
        <>
          {/* Phase 1.5 STRIP: save removed — Pro+ feature, not wired for Free */}
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        {press.map((c) => (
          <div
            key={c.id}
            style={{
              padding: "14px 16px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-accent-deep">
                {c.outlet}
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 11, marginLeft: "auto" }} className="text-admin-ink-muted">
                {c.date}
              </span>
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 16, marginTop: 4 }} className="text-admin-ink">
              {c.headline}
            </div>
            {c.quote && (
              <p style={{ margin: "6px 0 0", fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.55, fontStyle: "italic" }} className="text-admin-ink">
                &quot;{c.quote}&quot;
              </p>
            )}
            <div style={{ marginTop: 6, fontFamily: FONTS.mono, fontSize: 11 }} className="text-admin-ink-muted">
              {c.url}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Media kit / EPK ────────────────────────────────────────────────


// ─── Media kit / EPK ────────────────────────────────────────────────

export function TalentMediaKitDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-media-kit";
  const kit = MY_TALENT_PROFILE.subscription.mediaKit;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Media kit (EPK)"
      description="A single PDF with your bio, credits, comp card, press, and contact CTA. Auto-built from your profile data."
      width={560}
      footer={
        <>
          <SecondaryButton disabled>Re-generate</SecondaryButton>
          <PrimaryButton disabled>Download PDF</PrimaryButton>
        </>
      }
    >
      {kit ? (
        <div
          style={{
            padding: "14px 16px",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ width: 56, height: 70, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, border: `1px solid ${COLORS.borderSoft}`, flexShrink: 0 }} className="bg-admin-surface-alt">
            {kit.thumb}
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500 }} className="text-admin-ink">
              {kit.filename}
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
              {kit.size} · updated {kit.updatedAt}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
          No kit generated yet. Click Re-generate to build one from your current profile.
        </div>
      )}
      <Divider label="What's in the kit" />
      <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink">
        <li>Cover page · headshot · name · contact CTA</li>
        <li>Comp card spread (measurements + 4 polaroids)</li>
        <li>Pinned credits + tear-sheets</li>
        <li>Press band (up to 6 clippings)</li>
        <li>Travel + work auth + agency info</li>
        <li>QR code → live Tulala personal page</li>
      </ul>
    </DrawerShell>
  );
}

// ─── Custom domain ──────────────────────────────────────────────────


// ─── Custom domain ──────────────────────────────────────────────────

export function TalentCustomDomainDrawer() {
  // Phase 1.5 STRIP: Max only — save CTA removed; drawer kept for Phase 2 re-wiring
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-custom-domain";
  const sub = MY_TALENT_PROFILE.subscription;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Custom domain"
      description="Point your own domain at your Tulala personal page. Visitors see yourname.com — Tulala handles SSL + redirects."
      width={580}
      footer={
        // Phase 1.5 STRIP: save removed — Max-only feature, not wired for Free
        <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
      }
    >
      <FieldRow label="Domain" hint="Use the apex (yourname.com) or a subdomain (page.yourname.com).">
        <TextInput placeholder="marta-reyes.com" defaultValue={sub.customDomain ?? ""} />
      </FieldRow>
      <div style={{ marginTop: 14 }}>
        <CapsLabel>DNS configuration</CapsLabel>
        <div style={{ marginTop: 8, padding: "12px 14px", border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 10, fontFamily: FONTS.mono, fontSize: 12, lineHeight: 1.7 }} className="bg-admin-surface-alt text-admin-ink">
          <div>A record &nbsp;@ &nbsp;→ &nbsp;76.76.21.21</div>
          <div>CNAME &nbsp;www &nbsp;→ &nbsp;cname.tulala.digital</div>
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          padding: "12px 14px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: sub.customDomainStatus === "verified" ? COLORS.green : COLORS.amber, }}
        />
        <span style={{ fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink">
          Status:{" "}
          <strong>
            {sub.customDomain
              ? sub.customDomainStatus === "verified"
                ? "Verified"
                : sub.customDomainStatus === "pending"
                  ? "Awaiting DNS propagation"
                  : "Failed verification"
              : "Not set"}
          </strong>
        </span>
        <button
          onClick={() => undefined}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            color: COLORS.ink,
            padding: "5px 10px",
            borderRadius: 6,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            cursor: "pointer",
          }}
        >
          Re-check
        </button>
      </div>
      <p style={{ marginTop: 14, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink-muted">
        Tulala issues + auto-renews a Let&apos;s Encrypt SSL certificate once your DNS is pointing
        correctly. No manual cert config needed.
      </p>
    </DrawerShell>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// WS-8.5  Talent career analytics — "You got X inquiries this Q" drawer
// ─────────────────────────────────────────────────────────────────────────────
