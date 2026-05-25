"use client";

import { useState, useTransition } from "react";
import { assertTalentPersonalSiteBuilderAccess } from "@/app/(workspace)/[tenantSlug]/talent/site/actions";
import { workspacePathUrl } from "@/lib/saas/workspace-public-url";
import {
  COLORS,
  FONTS,
  MY_AGENCIES,
  MY_TALENT_PROFILE,
  RADIUS,
  TALENT_PROFILES_BY_ID,
  buildFreshTalentProfile,
  useAdminShell,
} from "@/components/admin/shell/internal/state";

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
          {workspaceKindLabel(workspace.planTier)} - {rosterStatusLabel(workspace.status)} -{" "}
          {visibilityLabel(workspace.visibility)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <a
          href={workspacePathUrl(workspace.slug)}
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
          View live page
        </a>
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

function FeatureGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 8,
        marginTop: 16,
      }}
      data-tulala-site-feature-grid
    >
      {[
        "Build a personal website",
        "Publish a portfolio",
        "Add gallery, video, services, and credits",
        "Share a professional Tulala URL",
      ].map((item) => (
        <div
          key={item}
          style={{
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: RADIUS.md,
            padding: "10px 12px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: FONTS.body,
          }}
          className="text-admin-ink"
        >
          {item}
        </div>
      ))}
      <style>{`@media (max-width: 560px) { [data-tulala-site-feature-grid] { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

export function TalentMySitePage() {
  const {
    openDrawer,
    setTalentPage,
    state,
    bridgeTalentSelfProfile,
    bridgeTalentAgencies,
    tenantSlug,
    toast,
  } = useAdminShell();
  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  const profile =
    bridgeTalentSelfProfile && !TALENT_PROFILES_BY_ID[selfTalentId]
      ? buildFreshTalentProfile(bridgeTalentSelfProfile)
      : MY_TALENT_PROFILE;
  const publicSlug =
    bridgeTalentSelfProfile?.profileCode ?? profile.name.toLowerCase().replace(/\s+/g, "-");
  const publicUrl = `tulala.digital/t/${publicSlug}`;
  const tier = state.talentTier;
  const isMax = tier === "max";
  const tierLabel = tier === "max" ? "Max" : tier === "pro" ? "Pro" : "Free";
  const [preview, setPreview] = useState(false);
  const [builderPending, startBuilderTransition] = useTransition();

  function handleOpenMaxSitePlanner() {
    if (!isMax) {
      openDrawer("talent-tier-compare");
      return;
    }
    if (!tenantSlug) {
      toast("Open this from a workspace talent route to verify Max access.");
      return;
    }
    startBuilderTransition(async () => {
      const result = await assertTalentPersonalSiteBuilderAccess(tenantSlug);
      if (!result.ok) {
        if (result.reason === "plan_not_eligible") {
          openDrawer("talent-tier-compare");
          toast("Talent Max is required to build or publish a personal site.");
          return;
        }
        toast("We could not verify personal site access. Try again from your Talent Dashboard.");
        return;
      }
      openDrawer("talent-personal-page");
    });
  }

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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ flex: "1 1 240px" }}>
          <h2
            style={{ fontSize: 20, fontWeight: 700, fontFamily: FONTS.body, margin: 0 }}
            className="text-admin-ink"
          >
            My Site
          </h2>
          <p
            style={{ fontSize: 13, fontFamily: FONTS.body, margin: "4px 0 0" }}
            className="text-admin-ink-muted"
          >
            Your personal Tulala destination, separate from the agency sites where you appear.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            style={{
              background: preview ? COLORS.fill : "transparent",
              color: preview ? "#fff" : COLORS.ink,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
          >
            {preview ? "Preview on" : "Preview"}
          </button>
          <a
            href={`/t/${publicSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: COLORS.fill,
              color: "#fff",
              border: "none",
              borderRadius: RADIUS.md,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            View live profile
          </a>
        </div>
      </div>

      <SectionLabel>Personal Site</SectionLabel>
      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: RADIUS.lg,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <div
          style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600 }}
          className="text-admin-ink"
        >
          {publicUrl}
        </div>
        <div
          style={{ fontSize: 11.5, fontFamily: FONTS.body, marginTop: 3, lineHeight: 1.5 }}
          className="text-admin-ink-muted"
        >
          Your owned Tulala destination. Agency rosters can link here, but agencies cannot edit it.
        </div>
      </div>

      <section
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: RADIUS.lg,
          padding: "18px 20px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <h3
                style={{ fontSize: 16, fontWeight: 700, fontFamily: FONTS.body, margin: 0 }}
                className="text-admin-ink"
              >
                {isMax
                  ? "Personal site access is enabled"
                  : "Build your personal site with Talent Max"}
              </h3>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  padding: "2px 7px",
                  borderRadius: 999,
                  fontFamily: FONTS.body,
                  background: isMax ? COLORS.fill : undefined,
                  color: isMax ? "#fff" : undefined,
                }}
                className={isMax ? "" : "bg-admin-accent-soft text-admin-accent"}
              >
                MAX
              </span>
            </div>
            <p
              style={{ fontSize: 12.5, fontFamily: FONTS.body, margin: 0, lineHeight: 1.55 }}
              className="text-admin-ink-muted"
            >
              {isMax
                ? "Your public profile stays live while your personal site is prepared. Site editing and publishing belong to your Max plan, separate from agency websites."
                : `Your current plan is ${tierLabel}. Free and Pro keep the standard public profile; Max unlocks the personal-site builder, preview, and publish controls.`}
            </p>
          </div>
          <button
            type="button"
            onClick={isMax ? handleOpenMaxSitePlanner : () => openDrawer("talent-tier-compare")}
            disabled={builderPending}
            style={{
              background: COLORS.fill,
              color: "#fff",
              border: "none",
              borderRadius: RADIUS.md,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: builderPending ? "wait" : "pointer",
              fontFamily: FONTS.body,
              flexShrink: 0,
              opacity: builderPending ? 0.7 : 1,
            }}
          >
            {isMax ? (builderPending ? "Verifying..." : "Plan site sections") : "Upgrade to Max"}
          </button>
        </div>
        {isMax ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
              marginTop: 16,
            }}
            data-tulala-site-status-grid
          >
            {[
              ["Status", "Profile fallback live"],
              ["Draft", "Ready to create"],
              ["Public URL", publicUrl],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: RADIUS.md,
                  padding: "10px 12px",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontFamily: FONTS.body,
                    marginBottom: 4,
                  }}
                  className="text-admin-ink-dim"
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: FONTS.body,
                    overflowWrap: "anywhere",
                  }}
                  className="text-admin-ink"
                >
                  {value}
                </div>
              </div>
            ))}
            <style>{`@media (max-width: 620px) { [data-tulala-site-status-grid] { grid-template-columns: 1fr !important; } }`}</style>
          </div>
        ) : (
          <FeatureGrid />
        )}
      </section>

      <div style={{ marginTop: 28 }}>
        <SectionLabel>Where you appear - {workspaces.length}</SectionLabel>
        <p
          style={{ fontSize: 12, fontFamily: FONTS.body, margin: "0 0 12px", lineHeight: 1.5 }}
          className="text-admin-ink-muted"
        >
          Every Tulala workspace your profile is published on. Your personal site remains yours.
        </p>
        {workspaces.length === 0 ? (
          <div
            style={{
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: RADIUS.lg,
              padding: "20px 18px",
              textAlign: "center",
            }}
          >
            <div
              style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body }}
              className="text-admin-ink"
            >
              Not on any workspace yet
            </div>
            <p
              style={{
                fontSize: 12,
                fontFamily: FONTS.body,
                margin: "4px 0 0",
                lineHeight: 1.5,
              }}
              className="text-admin-ink-muted"
            >
              Agencies and studios that add you to their roster will appear here.
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

      {preview && (
        <section
          aria-label="Mobile preview"
          style={{
            marginTop: 28,
            padding: 20,
            background: COLORS.surfaceAlt,
            borderRadius: RADIUS.lg,
          }}
        >
          <SectionLabel>Preview</SectionLabel>
          <div
            style={{
              background: "#fff",
              borderRadius: RADIUS.lg,
              border: `1px solid ${COLORS.borderSoft}`,
              padding: 18,
            }}
          >
            <div
              style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}
              className="text-admin-ink-dim"
            >
              {profile.specialties[0] ?? "Talent"}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                fontFamily: FONTS.body,
                marginTop: 4,
              }}
              className="text-admin-ink"
            >
              {profile.name}
            </div>
            <div
              style={{ fontSize: 12, fontFamily: FONTS.body, marginTop: 3 }}
              className="text-admin-ink-muted"
            >
              {profile.currentLocation} - {publicUrl}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 14 }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: RADIUS.md,
                    background: `linear-gradient(${i * 45}deg, ${COLORS.accentSoft}, ${COLORS.surfaceAlt})`,
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
