"use client";

import { useState } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import {
  COLORS,
  FONTS,
  MY_AGENCIES,
  buildFreshTalentProfile,
  TALENT_PROFILES_BY_ID,
} from "@/components/admin/shell/internal/state";
import { SectionHeader } from "@/components/admin/shell/internal/talent/shared/today-2";
import { agencyRosterProfileUrl } from "@/lib/talent/agency-roster-profile-url";

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
};

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
            {workspaceKindLabel(workspace.planTier)} · {rosterStatusLabel(workspace.status)} ·{" "}
            {visibilityLabel(workspace.visibility)}
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
              View roster profile
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
            Manage
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
export function TalentSiteAppearancesPanel() {
  const { setTalentPage, bridgeTalentSelfProfile, bridgeTalentAgencies } = useAdminShell();

  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  const profile =
    bridgeTalentSelfProfile && !TALENT_PROFILES_BY_ID[selfTalentId]
      ? buildFreshTalentProfile(bridgeTalentSelfProfile)
      : null;
  const profileCode =
    bridgeTalentSelfProfile?.profileCode ??
    profile?.name?.toLowerCase().replace(/\s+/g, "-") ??
    null;

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
          rosterProfileShareUrl: agencyRosterProfileUrl(a.agencySlug, profileCode, {
            absolute: true,
          }),
        }))
      : MY_AGENCIES.map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          status: a.status,
          isPrimary: a.isPrimary,
          visibility: "roster_only",
          planTier: a.planTier,
          rosterProfileUrl: agencyRosterProfileUrl(a.slug, profileCode),
          rosterProfileShareUrl: agencyRosterProfileUrl(a.slug, profileCode, { absolute: true }),
        }));

  return (
    <section data-tulala-talent-where-you-appear>
      <SectionHeader
        icon="globe"
        iconTone="indigo"
        title={`Where you appear${workspaces.length > 0 ? ` · ${workspaces.length}` : ""}`}
        subtitle="Every workspace your profile is on. Open the agency's roster page or manage the relationship."
      />

      {workspaces.length === 0 ? (
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
          {workspaces.map((w) => (
            <WorkspaceAppearanceCard
              key={w.id}
              workspace={w}
              onManage={() => setTalentPage("agencies")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
