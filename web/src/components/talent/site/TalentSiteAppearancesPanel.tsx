"use client";

import Link from "next/link";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import {
  COLORS,
  FONTS,
  MY_AGENCIES,
  RADIUS,
  buildFreshTalentProfile,
  TALENT_PROFILES_BY_ID,
} from "@/components/admin/shell/internal/state";
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontFamily: FONTS.body,
        marginBottom: 10,
      }}
      className="text-admin-ink-dim"
    >
      {children}
    </div>
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
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.lg,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: RADIUS.md,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: FONTS.body,
          flexShrink: 0,
        }}
        className="bg-admin-accent-soft text-admin-accent"
      >
        {workspace.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body }}
            className="text-admin-ink"
          >
            {workspace.name}
          </span>
          {workspace.isPrimary && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 999,
                fontFamily: FONTS.body,
              }}
              className="bg-admin-accent-soft text-admin-accent"
            >
              Primary
            </span>
          )}
        </div>
        <div
          style={{ fontSize: 11.5, fontFamily: FONTS.body, marginTop: 2 }}
          className="text-admin-ink-muted"
        >
          {workspaceKindLabel(workspace.planTier)} · {rosterStatusLabel(workspace.status)} ·{" "}
          {visibilityLabel(workspace.visibility)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {workspace.rosterProfileUrl ? (
          <a
            href={workspace.rosterProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "transparent",
              color: COLORS.ink,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.sm,
              padding: "5px 11px",
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: FONTS.body,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            View roster profile
          </a>
        ) : null}
        <button
          type="button"
          onClick={onManage}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: COLORS.inkMuted,
            fontSize: 11.5,
            fontWeight: 600,
            fontFamily: FONTS.body,
            whiteSpace: "nowrap",
            padding: "5px 4px",
          }}
        >
          Manage
        </button>
      </div>
    </div>
  );
}

/**
 * Agency roster hub — "where you appear" with per-agency profile links.
 * Restored on /talent/site above the Max personal-site builder.
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
        }));

  const personalSitePath = profileCode ? `/t/${profileCode}` : null;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px 0", fontFamily: FONTS.body }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>My pages</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(11,11,13,0.55)" }}>
          Your Tulala personal site and every agency roster where clients can find you.
        </p>
      </header>

      {personalSitePath ? (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel>Your Tulala page</SectionLabel>
          <div
            style={{
              background: "#fff",
              border: "1px solid rgba(24,24,27,0.08)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              <Link href={personalSitePath} target="_blank" rel="noopener noreferrer">
                {personalSitePath}
              </Link>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgba(11,11,13,0.55)" }}>
              Owned by you — separate from agency roster pages below.
            </p>
          </div>
        </section>
      ) : null}

      <section>
        <SectionLabel>Where you appear · {workspaces.length}</SectionLabel>
        <p style={{ fontSize: 12, margin: "0 0 12px", color: "rgba(11,11,13,0.55)", lineHeight: 1.5 }}>
          Every workspace your profile is on. Open each agency&apos;s roster profile or manage the
          relationship in Agencies.
        </p>
        {workspaces.length === 0 ? (
          <div
            style={{
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: RADIUS.lg,
              padding: "20px 18px",
              textAlign: "center",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600 }}>Not on any workspace yet</div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(11,11,13,0.55)" }}>
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
    </div>
  );
}
