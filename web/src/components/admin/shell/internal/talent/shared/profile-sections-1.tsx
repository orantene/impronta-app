"use client";

import { useEffect, useRef, useState } from "react";
import { Bullet, CapsLabel, Icon } from "../../primitives";
import { AVAILABILITY_BLOCKS, COLORS, FONTS, MY_TALENT_PROFILE, POLAROID_SET, TALENT_PROFILES_BY_ID, TALENT_SPECIALTY_LABEL, applyProfileOverride, buildFreshTalentProfile, computeProfileCompleteness, getProfileById, useAdminShell, useProfileOverrideSubscription } from "../../state";
import { actionLoadTalentMediaBundle } from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
import { BadgeChip, ProfileChip, TierPill } from "./profile-sections-2";



// ── AllSectionsGrid ─────────────────────────────────────────────────
// Renders all 18 PROFILE_SECTIONS as a 2-up tile grid (1-up on mobile).
// Each tile deep-links via openSection. Status chip is derived from a
// quick read of the talent's profile state — best-effort heuristics
// keyed off MY_TALENT_PROFILE so the talent sees what's complete vs
// outstanding without opening each section.
export function AllSectionsGrid({ openSection }: { openSection: (s: string) => void }) {
  const { tenantSlug, bridgeTalentSelfProfile } = useAdminShell();
  const hidePolaroids = tenantSlug === "impronta";
  // Subscribe + read merged profile so completion chips refresh when
  // the talent edits anything in the shell.
  useProfileOverrideSubscription();
  // Use the REAL talent's profile for completion state — a real talent must
  // see their own filled/empty sections, not the demo "t1" (Marta) profile.
  // Falls back to the mock override store only in standalone preview mode.
  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  const baseAS = bridgeTalentSelfProfile && !TALENT_PROFILES_BY_ID[selfTalentId]
    ? buildFreshTalentProfile(bridgeTalentSelfProfile)
    : applyProfileOverride("t1", getProfileById("t1"));
  // Catalog-driven completeness — same calc as MyProfilePage so the
  // header percent and the section grid agree.
  const compAS = computeProfileCompleteness(baseAS, [baseAS.primaryType, ...baseAS.secondaryTypes]);
  const p = {
    ...baseAS,
    completeness: compAS.percent,
    missing: compAS.missing.map(m => m.label),
  };
  // Real completion state per section — derived from the actual
  // talent profile object. Each section computes filled vs total
  // required fields and surfaces a chip + a "3 of 5" remainder so
  // the talent knows what's outstanding before opening the section.
  type Status = "complete" | "partial" | "empty" | "optional";
  type SectionDef = { id: string; label: string; emoji: string; description: string; status: Status; remainder?: string };
  // Helpers — simple "is field filled" probes
  const has = (v: unknown): boolean => {
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return Boolean(v);
  };
  const ratio = (filled: number, total: number): { status: Status; remainder?: string } => {
    if (filled === 0) return { status: "empty",   remainder: `Add ${total} required` };
    if (filled < total) return { status: "partial", remainder: `${total - filled} of ${total} left` };
    return { status: "complete" };
  };
  // Identity — required: stage name, pronouns, age (proxies for the
  // canonical fields that don't all exist on MyTalentProfile yet).
  const identityFilled = [p.name, p.pronouns, p.age].filter(has).length;
  const identityRatio = ratio(identityFilled, 3);
  // Services — at least one specialty.
  const servicesRatio = ratio(p.specialties.length > 0 ? 1 : 0, 1);
  // Location — required: city + at least one passport / work auth.
  const locationFilled = [p.city, p.travel?.passports ?? [], p.travel?.workAuth ?? []].filter(has).length;
  const locationRatio = ratio(Math.min(locationFilled, 2), 2);
  // Media — cover + headshot.
  const mediaFilled = [p.coverPhoto, p.profilePhoto].filter(has).length;
  const mediaRatio = ratio(mediaFilled, 2);
  // Polaroids — 5 required (front · side · back · smile · no-makeup).
  const polaroidsFilled = POLAROID_SET.filter(x => x.thumb !== "—").length;
  const polaroidsRatio = ratio(polaroidsFilled, 5);
  // Albums — heuristic: any portfolio shot counts.
  const albumsRatio = ratio(p.profilePhoto ? 1 : 0, 6);
  // About — at least 1 link.
  const aboutRatio = ratio(p.links.length > 0 ? 1 : 0, 1);
  // Details (physicality) — height + bust + waist + hips filled.
  const m = p.measurements;
  const detailsFilled = [m?.heightImperial, m?.bust, m?.waist, m?.hips, m?.hairColor, m?.eyeColor].filter(has).length;
  const detailsRatio = ratio(Math.min(detailsFilled, 4), 4);
  // Rates — required: rateCard set.
  const ratesRatio = ratio(p.rateCard ? 1 : 0, 1);
  // Availability — completed when any blocks set.
  const availabilityRatio: { status: Status; remainder?: string } = AVAILABILITY_BLOCKS.length > 0 ? { status: "complete" } : { status: "empty", remainder: "Block your unavailable dates" };
  // Languages — at least 1.
  const languagesRatio: { status: Status; remainder?: string } = p.languages.length > 0 ? { status: "complete" } : { status: "empty", remainder: "Add a language" };
  // Skills — at least 3.
  const skillsRatio = ratio(Math.min(p.skills.length, 3), 3);
  // Credits — at least 1.
  const creditsRatio: { status: Status; remainder?: string } = p.credits.length > 0 ? { status: "complete" } : { status: "empty", remainder: "Add your first credit" };
  // Limits — optional.
  const limitsRatio: { status: Status } = p.limits.length > 0 ? { status: "complete" } : { status: "optional" };
  // Files — required: W-8BEN + model release uploaded.
  const docsUploaded = (p.documents ?? []).filter(d => d.state === "uploaded").length;
  const filesRatio = ratio(Math.min(docsUploaded, 2), 2);
  // Social proof — completed via reviews.
  const socialProofRatio: { status: Status } = p.reviews.length > 0 ? { status: "complete" } : { status: "optional" };
  // Trust — bookingStats.completedBookings as a proxy.
  const trustRatio: { status: Status; remainder?: string } = p.bookingStats?.completedBookings && p.bookingStats.completedBookings > 0
    ? { status: "complete" }
    : { status: "partial", remainder: "Verify ID + payout" };

  const sections: SectionDef[] = [
    { id: "identity",      emoji: "👤", label: "Identity",       description: "Stage name · pronouns · gender · DOB. You control privacy per field.", ...identityRatio },
    { id: "services",      emoji: "🎯", label: "Talent type & specialties", description: "Your talent type, specialties, and what you're growing into.", ...servicesRatio },
    { id: "location",      emoji: "📍", label: "Location & travel", description: "Home base · cities you work · passport · driver's license.", ...locationRatio },
    { id: "media",         emoji: "📷", label: "Cover · headshot · reel", description: "Banner, main photo, hello reel, showreel.", ...mediaRatio },
    { id: "albums",        emoji: "🗂", label: "Portfolio albums", description: "Editorial · Lookbook · Behind-the-scenes · Personal.", ...albumsRatio },
    { id: "polaroids",     emoji: "🪪", label: "Polaroids",       description: "Front · side · back · smile · no-makeup. Casting standard.", ...polaroidsRatio },
    { id: "about",         emoji: "✏️", label: "Bio & links",     description: "Short bio per language. External links surface here too.", ...aboutRatio },
    { id: "details",       emoji: "📋", label: "Physical details", description: "Height · sizes · skin tone · tattoos · allergies.", ...detailsRatio },
    { id: "rates",         emoji: "💶", label: "Rates",           description: "Per-day / per-event rates. Different rates for direct, agency, hub.", ...ratesRatio },
    { id: "availability",  emoji: "📅", label: "Availability",    description: "Block dates, recurring patterns, vacation windows.", ...availabilityRatio },
    { id: "languages",     emoji: "🌐", label: "Languages",       description: "Languages spoken with proficiency level.", ...languagesRatio },
    { id: "refinement",    emoji: "✦",  label: "Skills",          description: "Movement · sport · voice · instruments. Triggers casting filters.", ...skillsRatio },
    { id: "credits",       emoji: "🏆", label: "Credits",         description: "Past campaigns, editorials, runway, lookbooks. Pin the proudest.", ...creditsRatio },
    { id: "limits",        emoji: "⊘",  label: "Wardrobe & limits", description: "Hard limits block pitches; soft limits ask first.", ...limitsRatio },
    { id: "files",         emoji: "📎", label: "Documents",       description: "W-8BEN · model release · NDA · certifications.", ...filesRatio },
    { id: "social_proof",  emoji: "⭐", label: "Past clients & reviews", description: "Logos of brands you've worked with + client kudos.", ...socialProofRatio },
    { id: "verifications", emoji: "🛡", label: "Trust & verification", description: "Email · phone · ID · payout. Drives your trust tier.", ...trustRatio },
    { id: "admin",         emoji: "🔒", label: "Visibility & privacy", description: "Where this profile shows. Field locks. Profile status.", status: "complete" },
  ];
  const visibleSections = hidePolaroids
    ? sections.filter((section) => section.id !== "polaroids")
    : sections;

  const statusMeta: Record<Status, { label: string; bg: string; fg: string }> = {
    complete: { label: "Complete", bg: COLORS.successSoft, fg: COLORS.successDeep ?? COLORS.success },
    partial:  { label: "In progress", bg: COLORS.amberSoft ?? "rgba(217,119,6,0.10)", fg: COLORS.amberDeep ?? COLORS.amber },
    empty:    { label: "Add",      bg: "rgba(176,48,58,0.08)", fg: COLORS.coralDeep ?? COLORS.coral },
    optional: { label: "Optional", bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted },
  };

  return (
    <div data-tulala-all-sections style={{
      display: "grid", gap: 8,
      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    }}>
      <style>{`
        @media (max-width: 720px) {
          [data-tulala-all-sections] { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {visibleSections.map(s => {
        const meta = statusMeta[s.status];
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => openSection(s.id)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
              minWidth: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = "rgba(11,11,13,0.015)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.background = "#fff"; }}
          >
            <span aria-hidden style={{
              width: 36, height: 36, borderRadius: 10,
              background: COLORS.surfaceAlt,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, flexShrink: 0,
            }}>{s.emoji}</span>
            <div className="flex-1 min-w-0">
              <div style={{
                display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                marginBottom: 2,
              }}>
                <span className="text-admin-ink text-admin-13h font-bold">{s.label}</span>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                  textTransform: "uppercase",
                  padding: "2px 7px", borderRadius: 999,
                  background: meta.bg, color: meta.fg,
                }}>{meta.label}</span>
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.45 }} className="text-admin-ink-muted">{s.description}</div>
              {s.remainder && (
                <div style={{
                  fontSize: 11, fontWeight: 600, color: meta.fg,
                  marginTop: 4,
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  <span aria-hidden className="text-admin-9">›</span>
                  {s.remainder}
                </div>
              )}
            </div>
            <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
          </button>
        );
      })}
    </div>
  );
}


// ─── Hero (cover photo + headshot + identity strip) ─────────────────

export function ProfileHero() {
  const { openDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  useProfileOverrideSubscription();
  const baseHero = applyProfileOverride(
    selfTalentId,
    bridgeTalentSelfProfile && !TALENT_PROFILES_BY_ID[selfTalentId]
      ? buildFreshTalentProfile(bridgeTalentSelfProfile)
      : getProfileById(selfTalentId),
  );
  const compHero = computeProfileCompleteness(baseHero, [baseHero.primaryType, ...baseHero.secondaryTypes]);
  const p = {
    ...baseHero,
    completeness: compHero.percent,
    missing: compHero.missing.map(m => m.label),
  };
  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: selfTalentId, section });

  // Load real cover + avatar photos from the DB, falling back to mock data.
  const [dbAvatarUrl, setDbAvatarUrl] = useState<string | null>(null);
  const [dbHeroUrl, setDbHeroUrl] = useState<string | null>(null);
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!bridgeTalentSelfProfile?.id) return;
    if (loadedForRef.current === bridgeTalentSelfProfile.id) return;
    loadedForRef.current = bridgeTalentSelfProfile.id;
    void actionLoadTalentMediaBundle(bridgeTalentSelfProfile.id).then((res) => {
      if (!res.ok) return;
      if (res.data.card?.url) setDbAvatarUrl(res.data.card.url);
      if (res.data.hero?.url) setDbHeroUrl(res.data.hero.url);
    });
  }, [bridgeTalentSelfProfile?.id]);

  const coverSrc = dbHeroUrl ?? (p.coverPhoto.startsWith("http") ? p.coverPhoto : null);
  const avatarSrc = dbAvatarUrl ?? (p.profilePhoto.startsWith("http") ? p.profilePhoto : null);

  return (
    <section
      style={{
        position: "relative",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {/* Cover photo */}
      <div
        style={{
          position: "relative",
          height: 200,
          background: coverSrc
            ? `url(${coverSrc}) center/cover, ${COLORS.surfaceAlt}`
            : `linear-gradient(180deg, ${COLORS.surfaceAlt} 0%, rgba(15,79,62,0.18) 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 72,
          letterSpacing: 8,
        }}
      >
        {!coverSrc && <span style={{ filter: "saturate(0.8)", fontSize: 48, fontFamily: FONTS.body }} className="text-admin-ink-muted">No cover photo</span>}
        <button
          onClick={() => openSection("media")}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(11,11,13,0.55)",
            color: "#fff",
            border: "none",
            padding: "5px 10px",
            borderRadius: 999,
            fontFamily: FONTS.body,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(6px)",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            letterSpacing: 0.3,
          }}
        >
          <Icon name="palette" size={11} stroke={2} color="#fff" /> Replace cover
        </button>
      </div>

      {/* Identity strip */}
      <div style={{ padding: "0 24px 22px", position: "relative" }}>
        {/* Avatar overlapping the cover */}
        <button
          onClick={() => openSection("media")}
          style={{
            position: "absolute",
            top: -52,
            left: 24,
            width: 104,
            height: 104,
            borderRadius: "50%",
            background: avatarSrc
              ? `url(${avatarSrc}) center/cover, ${COLORS.surfaceAlt}`
              : COLORS.surfaceAlt,
            border: `4px solid #fff`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 50,
            cursor: "pointer",
            boxShadow: "0 6px 18px -8px rgba(0,0,0,0.25)",
            padding: 0,
          }}
          aria-label="Edit headshot"
        >
          {!avatarSrc && <span className="text-[40px]">👤</span>}
          <span style={{ position: "absolute", bottom: 2, right: 2, width: 26, height: 26, borderRadius: "50%", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }} className="bg-admin-fill">
            <Icon name="palette" size={11} stroke={2} color="#fff" />
          </span>
        </button>

        <div style={{ paddingTop: 64, display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 500, letterSpacing: -0.5, margin: 0 }} className="text-admin-ink">
                {p.name}
              </h2>
              <span style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 500, padding: "2px 8px", background: "rgba(11,11,13,0.04)", borderRadius: 999 }} className="text-admin-ink-muted">
                {p.pronouns} · {p.age}
              </span>
              <TierPill tier={p.subscription.tier} onClick={() => openDrawer("talent-tier-compare")} />
            </div>
            <div style={{ marginTop: 6, fontFamily: FONTS.body, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} className="text-admin-ink-muted">
              <span>{p.measurementsSummary}</span>
              <Bullet />
              <span>{p.city}</span>
              <Bullet />
              <span>{p.primaryAgency}</span>
            </div>

            {/* Specialties chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
              {p.specialties.map((s) => (
                <ProfileChip key={s} label={TALENT_SPECIALTY_LABEL[s]} tone="ink" />
              ))}
            </div>
          </div>

          {/* Trust badges column */}
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
              maxWidth: 280,
            }}
          >
            <CapsLabel>Trust</CapsLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {p.badges.slice(0, 4).map((b) => (
                <BadgeChip key={b.kind} badge={b} compact />
              ))}
              {p.badges.length > 4 && (
                <span style={{ fontFamily: FONTS.body, fontSize: 11, padding: "3px 8px" }} className="text-admin-ink-muted">
                  +{p.badges.length - 4}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


// ─── Engagement strip (rank · views · inquiries · trend) ────────────

/**
 * Premium engagement strip — replaces the 4-up StatusCard grid that
 * was eating ~600px on mobile (stacked tall cards). One white card,
 * 4 inline cells, hairline dividers. Mobile collapses 4→2x2.
 */
export function EngagementStrip({ profile }: { profile?: import("../../state").MyTalentProfile } = {}) {
  // Take the profile as a prop so freshly-provisioned talents see their
  // actual stats (zeros) instead of Marta's hardcoded #12 rank / 142 views.
  // Falls back to MY_TALENT_PROFILE only when nothing was passed (legacy
  // call sites / standalone prototype demo).
  const p = profile ?? MY_TALENT_PROFILE;
  const items = [
    { label: "Discover rank", value: p.discoverRank > 0 ? `#${p.discoverRank}` : "—", sub: p.discoverRank > 0 ? "Updated daily" : "Not yet ranked", tone: COLORS.indigo },
    {
      label: "Views · 7d",
      value: p.profileViews7d.toLocaleString(),
      sub: p.profileViews7d > 0
        ? `${p.viewsTrend > 0 ? "▲" : "▼"} ${Math.abs(p.viewsTrend)}% vs last week`
        : "No views yet",
      tone: p.viewsTrend > 0 ? COLORS.success : COLORS.amber,
    },
    { label: "Inquiries · 7d", value: String(p.inquiries7d), sub: p.inquiries7d > 0 ? `${p.bookingStats.repeatClients} repeat clients` : "No inquiries yet", tone: COLORS.coral },
    { label: "On-time rate", value: p.bookingStats.completedBookings > 0 ? `${p.bookingStats.onTimeRate}%` : "—", sub: p.bookingStats.completedBookings > 0 ? `${p.bookingStats.completedBookings} bookings` : "No bookings yet", tone: COLORS.success },
  ];
  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <CapsLabel>Profile performance</CapsLabel>
        <span className="text-admin-ink-dim text-admin-11">Last 7 days</span>
      </div>
      <div data-tulala-talent-stat-strip style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${COLORS.borderSoft}`,
        display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        overflow: "hidden",
      }}>
        <style>{`
          @media (max-width: 640px) {
            [data-tulala-talent-stat-strip] { grid-template-columns: 1fr 1fr !important; }
            [data-tulala-talent-stat-strip] > div { border-bottom: 1px solid ${COLORS.borderSoft} !important; }
            [data-tulala-talent-stat-strip] > div:nth-last-child(-n+2) { border-bottom: none !important; }
            [data-tulala-talent-stat-strip] > div:nth-child(2n) { border-right: none !important; }
          }
        `}</style>
        {items.map((it, i) => (
          <div key={it.label} style={{
            padding: "14px 16px", fontFamily: FONTS.body,
            borderRight: i < items.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: it.tone, flexShrink: 0 }} />
              <span className="text-admin-ink-muted text-admin-11 font-medium">{it.label}</span>
            </div>
            <div style={{
              fontFamily: FONTS.display, fontSize: 28, fontWeight: 700,
              color: it.value === "—" ? COLORS.inkDim : COLORS.ink,
              lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5,
            }}>{it.value}</div>
            {it.sub && (
              <div style={{ fontSize: 11, marginTop: 5, lineHeight: 1.3 }} className="text-admin-ink-dim">{it.sub}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
