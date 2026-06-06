"use client";

import { useState } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import {
  COLORS,
  FONTS,
  buildFreshTalentProfile,
  TALENT_PROFILES_BY_ID,
} from "@/components/admin/shell/internal/state";
import { SectionHeader } from "@/components/admin/shell/internal/talent/shared/today-2";
import { agencyRosterProfileUrl } from "@/lib/talent/agency-roster-profile-url";
import {
  resolveEffectiveVisibility,
  representationChipCopy,
  type RosterStatus,
  type AgencyVisibility,
  type EffectiveVisibility,
} from "@/lib/talent/representation";
import { talentSiteCopy, type TalentSiteLocale } from "@/lib/talent-site/talent-site-i18n";

type WorkspaceAppearance = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isPrimary: boolean;
  visibility: string;
  planTier: string;
  rosterProfileUrl: string | null;
  rosterProfileShareUrl: string | null;
  /** True effective visibility (matches the Representation drawer). */
  effective: EffectiveVisibility;
};

// Normalize raw DB values to the resolver's enums — kept byte-identical to
// load-representation.ts so the list chip and the drawer chip never disagree.
function asAgencyVisibility(v: string): AgencyVisibility {
  if (v === "site_visible" || v === "featured") return v;
  return "roster_only";
}
function asRosterStatus(v: string): RosterStatus {
  if (v === "active" || v === "pending" || v === "inactive" || v === "removed") {
    return v;
  }
  return "active";
}

// Chip tone → palette, mirrored from the Representation drawer
// (talent-drawers/representation.tsx chipStyles) so both surfaces read the same.
function chipStyles(tone: "live" | "warn" | "muted" | "conflict") {
  if (tone === "live") {
    return { bg: "rgba(15,79,62,0.12)", fg: COLORS.accentDeep, prefix: "🟢" };
  }
  if (tone === "warn") {
    return { bg: "rgba(214,158,46,0.12)", fg: "#7C5A14", prefix: "🟡" };
  }
  if (tone === "conflict") {
    return { bg: "rgba(220,38,38,0.08)", fg: "#b91c1c", prefix: "🔴" };
  }
  return { bg: "rgba(11,11,13,0.06)", fg: COLORS.inkMuted, prefix: "⚪" };
}

/**
 * Effective-visibility chip for the "Where you appear" list. Always the
 * talent's own point of view (this is the My-pages surface), so it surfaces
 * the two-way truth — e.g. "Agency isn't showing you" when a roster lists the
 * talent but hasn't published them.
 */
function VisibilityChip({ effective }: { effective: EffectiveVisibility }) {
  const copy = representationChipCopy(effective, "talent");
  if (!copy) return null;
  const styles = chipStyles(copy.tone);
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.3,
        background: styles.bg,
        color: styles.fg,
        whiteSpace: "nowrap",
        fontFamily: FONTS.body,
      }}
    >
      {styles.prefix} {copy.talent}
    </span>
  );
}

function workspaceKindLabel(planTier: string): string {
  return planTier === "free" ? "Free workspace" : "Agency";
}

function visibilityLabel(visibility: string): string {
  switch (visibility) {
    case "featured":
      return "Featured on their site";
    case "site_visible":
      return "Shown on their public site";
    default:
      return "On their roster";
  }
}

function rosterStatusLabel(status: string): string {
  switch (status) {
    case "exclusive":
      return "Exclusive";
    case "non-exclusive":
      return "Non-exclusive";
    case "pending":
      return "Pending";
    case "ended":
      return "Ended";
    case "active":
      return "Active";
    default:
      return status || "Active";
  }
}

function MetaChip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" }) {
  const bg = tone === "accent" ? COLORS.accentSoft : "rgba(11,11,13,0.05)";
  const fg = tone === "accent" ? COLORS.accentDeep : COLORS.inkMuted;
  return (
    <span
      style={{
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color: fg,
        background: bg,
        borderRadius: 999,
        fontFamily: FONTS.body,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/**
 * Plan badge for the Tulala personal-site card. Tones map to talent
 * subscription tier so the visual weight grows with the plan:
 *   free → neutral grey (no chromatic emphasis)
 *   pro  → indigo (cool, informational)
 *   max  → accent deep (the premium forest green)
 */
function TulalaPlanBadge({ tier }: { tier: "free" | "pro" | "max" }) {
  const palette =
    tier === "max"
      ? { bg: COLORS.accentSoft, fg: COLORS.accentDeep }
      : tier === "pro"
        ? { bg: COLORS.indigoSoft, fg: COLORS.indigo }
        : { bg: "rgba(11,11,13,0.06)", fg: COLORS.inkMuted };
  const label = tier === "max" ? "Max" : tier === "pro" ? "Pro" : "Free";
  return (
    <span
      style={{
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: palette.fg,
        background: palette.bg,
        borderRadius: 999,
        fontFamily: FONTS.body,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l5 5 9-11" />
    </svg>
  );
}

function CopyableProfileLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const display = url.replace(/^https?:\/\//, "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied to clipboard" : "Copy profile link"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        maxWidth: "100%",
        padding: "5px 10px",
        background: copied ? COLORS.accentSoft : "rgba(11,11,13,0.04)",
        border: `1px solid ${copied ? COLORS.accentSoft : "rgba(11,11,13,0.06)"}`,
        borderRadius: 999,
        color: copied ? COLORS.accentDeep : COLORS.inkMuted,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: -0.05,
        cursor: "pointer",
        transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {copied ? "Link copied" : display}
      </span>
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </span>
    </button>
  );
}

function TulalaPersonalSiteCard({
  profileCode,
  tier,
  globalHidden,
  onManage,
  locale = "en",
}: {
  profileCode: string;
  tier: "free" | "pro" | "max";
  globalHidden: boolean;
  onManage: () => void;
  locale?: TalentSiteLocale;
}) {
  const shareUrl = `https://tulala.digital/t/${encodeURIComponent(profileCode)}`;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: 38,
            height: 38,
            borderRadius: 10,
            background: COLORS.accentDeep,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONTS.display,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: -0.2,
          }}
        >
          T
        </span>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: COLORS.ink,
                letterSpacing: -0.05,
              }}
            >
              Tulala.digital
            </span>
            <VisibilityChip effective={globalHidden ? "global_hidden" : "live"} />
            <TulalaPlanBadge tier={tier} />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11.5,
              color: COLORS.inkMuted,
              lineHeight: 1.5,
            }}
          >
            {talentSiteCopy(locale, "descPersonalSite")}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              background: "#fff",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              color: COLORS.ink,
              textDecoration: "none",
              whiteSpace: "nowrap",
              fontFamily: FONTS.body,
            }}
          >
            {talentSiteCopy(locale, "whereViewSite")}
          </a>
          <button
            type="button"
            onClick={onManage}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.inkMuted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: FONTS.body,
              whiteSpace: "nowrap",
            }}
          >
            {talentSiteCopy(locale, "whereManage")}
          </button>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          paddingLeft: 50,
          minWidth: 0,
        }}
      >
        <CopyableProfileLink url={shareUrl} />
      </div>
    </div>
  );
}

function WorkspaceAppearanceCard({
  workspace,
  onManage,
  locale = "en",
}: {
  workspace: WorkspaceAppearance;
  onManage: () => void;
  locale?: TalentSiteLocale;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: 38,
            height: 38,
            borderRadius: 10,
            background: COLORS.accentSoft,
            color: COLORS.accentDeep,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONTS.display,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {workspace.name.charAt(0).toUpperCase()}
        </span>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: COLORS.ink,
                letterSpacing: -0.05,
              }}
            >
              {workspace.name}
            </span>
            <VisibilityChip effective={workspace.effective} />
            {workspace.isPrimary && <MetaChip label="Primary" tone="accent" />}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11.5,
              color: COLORS.inkMuted,
              lineHeight: 1.5,
            }}
          >
            {workspace.planTier === "free"
              ? `${talentSiteCopy(locale, "labelWorkspaceRoster")} · ${visibilityLabel(workspace.visibility)}`
              : `${talentSiteCopy(locale, "labelAgencyRoster")} · Managed by ${workspace.name} · ${rosterStatusLabel(workspace.status)}`}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {workspace.rosterProfileUrl ? (
            <a
              href={workspace.rosterProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                background: "#fff",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                color: COLORS.ink,
                textDecoration: "none",
                whiteSpace: "nowrap",
                fontFamily: FONTS.body,
              }}
            >
              {talentSiteCopy(locale, "whereViewRoster")}
            </a>
          ) : null}
          <button
            type="button"
            onClick={onManage}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.inkMuted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: FONTS.body,
              whiteSpace: "nowrap",
            }}
          >
            {talentSiteCopy(locale, "whereManage")}
          </button>
        </div>
      </div>
      {workspace.rosterProfileShareUrl ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            paddingLeft: 50,
            minWidth: 0,
          }}
        >
          <CopyableProfileLink url={workspace.rosterProfileShareUrl} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Agency roster hub — "where you appear" with per-agency profile links.
 * Renders below the Tulala personal-site section in PublicPageEditor.
 */
export function TalentSiteAppearancesPanel({ locale = "en" }: { locale?: TalentSiteLocale }) {
  const { state, openDrawer, bridgeTalentSelfProfile, bridgeTalentAgencies } = useAdminShell();

  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  const profile =
    bridgeTalentSelfProfile && !TALENT_PROFILES_BY_ID[selfTalentId]
      ? buildFreshTalentProfile(bridgeTalentSelfProfile)
      : null;
  const profileCode =
    bridgeTalentSelfProfile?.profileCode ??
    profile?.name?.toLowerCase().replace(/\s+/g, "-") ??
    null;

  // Talent subscription tier for the Tulala personal-site plan badge.
  // Prefer the live bridge value; fall back to admin-shell state in
  // standalone demo mode. The personal-site card only renders when we
  // have a profileCode (otherwise the shareable URL would 404).
  const talentTier: "free" | "pro" | "max" =
    bridgeTalentSelfProfile?.talentTier ?? state.talentTier ?? "free";

  // The talent's global kill-switch (talent_profiles.is_publicly_hidden).
  // When on, it overrides every roster — surfaced as "Hidden everywhere".
  const globalHidden = bridgeTalentSelfProfile?.isPubliclyHidden ?? false;

  // "Manage" on the Tulala card scrolls the user back up to the
  // personal-site editor section above (lives in the same `My pages`
  // surface). Document-level scroll keeps the implementation
  // self-contained — no need to plumb refs through PublicPageEditor.
  const onManageTulala = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const workspaces: WorkspaceAppearance[] =
    bridgeTalentAgencies !== null
      ? bridgeTalentAgencies.map((a) => ({
          id: a.id,
          name: a.agencyName,
          slug: a.agencySlug,
          status: a.rosterStatus,
          isPrimary: a.isPrimary,
          visibility: a.agencyVisibility,
          planTier: a.plan,
          rosterProfileUrl: agencyRosterProfileUrl(a.agencySlug, profileCode),
          rosterProfileShareUrl: agencyRosterProfileUrl(a.agencySlug, profileCode),
          effective: resolveEffectiveVisibility({
            status: asRosterStatus(a.rosterStatus),
            agencyVisibility: asAgencyVisibility(a.agencyVisibility),
            talentSiteHidden: a.talentSiteHidden,
            globalHidden,
          }),
        }))
      : [];

  const showTulalaCard = Boolean(profileCode);
  const totalCount = workspaces.length + (showTulalaCard ? 1 : 0);

  return (
    <section data-tulala-talent-where-you-appear>
      <SectionHeader
        icon="globe"
        iconTone="indigo"
        title={`${talentSiteCopy(locale, "appearancesTitle")}${totalCount > 0 ? ` · ${totalCount}` : ""}`}
        subtitle={talentSiteCopy(locale, "appearancesSubtitle")}
      />

      {totalCount === 0 ? (
        <div
          style={{
            background: COLORS.surfaceAlt,
            border: `1px dashed ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "22px 18px",
            textAlign: "center",
            fontFamily: FONTS.body,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
            Not on any workspace yet
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
            Agencies that add you to their roster will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {showTulalaCard && profileCode && (
            <TulalaPersonalSiteCard
              profileCode={profileCode}
              tier={talentTier}
              globalHidden={globalHidden}
              onManage={onManageTulala}
              locale={locale}
            />
          )}
          {workspaces.map((w) => (
            <WorkspaceAppearanceCard
              key={w.id}
              workspace={w}
              onManage={() => openDrawer("representation", { focusAgencyId: w.id })}
              locale={locale}
            />
          ))}
        </div>
      )}
    </section>
  );
}
