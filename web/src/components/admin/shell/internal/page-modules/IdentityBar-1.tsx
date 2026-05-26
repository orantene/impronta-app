"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";

const START_WORKSPACE_EVENT = "tulala:open-start-workspace-dialog";
import { DashboardLocaleToggle } from "@/components/dashboard-locale-toggle";
import { CreateMyTalentProfileDialog } from "@/components/talent/create-my-talent-profile-dialog";
import { StartFreeWorkspaceDialog } from "@/components/talent/start-free-workspace-dialog";
import type { Locale } from "@/i18n/config";
import { useDashboardText } from "../dashboard-i18n";
import { NotificationsBell } from "../notifications-hub";
import { Avatar, Icon, PlanChip, ShortcutsModal } from "../primitives";
import { COLORS, FONTS, MY_TALENT_PROFILE, PLAN_META, TRANSITION, fmtMoney, meetsRole, useAdminShell } from "../state";
import { TULALA_BRAND } from "@/lib/brand/tulala";
import { AccountMenuItem, IdentityBarIconButton, LocaleToggle, ModeTogglePill } from "./IdentityBar-2";
import { TALENT_UNREAD } from "./WorkspaceTopbar";


export function TulalaIdentityBar() {
  const {
    state,
    openDrawer,
    flipMode,
    toast,
    setClientPage,
    setTalentPage,
    totalUnread: bridgeTotalUnread,
    bridgeTenantIdentity,
    bridgeSessionIdentity,
    bridgeTalentSelfProfile,
    bridgeTalentAgencies,
    bridgeTalentEarnings,
    overviewMetrics,
    bridgeTalentUnread,
    bridgeWorkspaceUnread,
    bridgeFirstRunToggleTipSeen,
    effectiveTenant,
  } = useAdminShell();
  const copy = useDashboardText();
  const { surface, alsoTalent, role, plan, entityType } = state;

  // Identity bar renders for the three end-user surfaces (workspace +
  // talent + client). Platform HQ has its own dark chrome and skips it.
  if (surface === "platform") return null;

  const inWorkspace = surface === "workspace";
  const inClient    = surface === "client";
  const inTalent    = !inWorkspace && !inClient;
  const agencyCount = bridgeTalentAgencies?.length ?? 0;
  const isPureTalent = inTalent && !state.alsoTalent;

  // Shared "Start a workspace" dialog state. Trigger sources:
  //   1. Account menu item ("Start a workspace") — see AccountMenuTrigger.
  //   2. "Your agencies" pill click when agencyCount === 0 — onActingClick below.
  //   3. Talent /today dashboard tile — fires the same window event.
  // The dialog mount lives at this level so all three entries share state.
  const [startWorkspaceDialogOpen, setStartWorkspaceDialogOpen] = useState(false);
  useEffect(() => {
    const handler = () => setStartWorkspaceDialogOpen(true);
    window.addEventListener("tulala:open-start-workspace-dialog", handler);
    return () => window.removeEventListener("tulala:open-start-workspace-dialog", handler);
  }, []);
  // Resolve client profile from the URL/state-driven id. Two profiles
  // for QA: Martina Beach Club (business) and The Gringo (personal).
  // Inline-defined to dodge HMR cache issues with the fresh export.
  const CP = {
    martina: { name: "Martina Beach Club", initials: "MB", industry: "Hospitality · beach club", contactName: "Martina González", photoUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80", isBusiness: true },
    gringo:  { name: "The Gringo",         initials: "TG", industry: "Personal client",          contactName: "The Gringo",        photoUrl: "https://i.pravatar.cc/300?img=33", isBusiness: false },
  } as const;
  const activeClientProfile = CP[state.clientProfile] ?? CP.martina;

  // Phase 1 — when the workspace admin layout provides bridgeSessionIdentity,
  // use the real signed-in user instead of MY_TALENT_PROFILE (which is the
  // prototype's hardcoded talent persona "Marta Reyes"). Standalone demo mode
  // (no bridge identity) still falls back to the constant.
  const realUserName =
    bridgeSessionIdentity?.displayName?.trim() ||
    bridgeSessionIdentity?.email ||
    null;
  const realUserInitials = (() => {
    if (!bridgeSessionIdentity) return null;
    const src = (bridgeSessionIdentity.displayName ?? bridgeSessionIdentity.email ?? "").trim();
    if (!src) return null;
    const parts = src.split(/[\s@.]+/u).filter(Boolean);
    const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
    return letters.toUpperCase() || src.slice(0, 2).toUpperCase();
  })();

  // Talent surface name/initials prefer bridgeTalentSelfProfile (real
  // freshly-provisioned talent) over the prototype's hardcoded "Marta Reyes".
  // Falls back through bridgeSessionIdentity (same signed-in user) before
  // landing on the demo constant in standalone mode.
  const talentBridgeName = bridgeTalentSelfProfile?.displayName?.trim() || null;
  const talentBridgeInitials = (() => {
    if (!talentBridgeName) return null;
    const parts = talentBridgeName.split(/\s+/u).filter(Boolean);
    const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
    return letters.toUpperCase() || talentBridgeName.slice(0, 2).toUpperCase();
  })();

  const userName = inClient
    ? activeClientProfile.contactName
    : (inWorkspace && realUserName)
      ? realUserName
      : (talentBridgeName ?? realUserName ?? MY_TALENT_PROFILE.name);
  const userInitials = inClient
    ? activeClientProfile.initials
    : (inWorkspace && realUserInitials)
      ? realUserInitials
      : (talentBridgeInitials ?? realUserInitials ?? MY_TALENT_PROFILE.initials);
  const userPhotoUrl = inClient ? activeClientProfile.photoUrl : undefined;

  // Acting-as context flips with surface. For the workspace surface, use
  // effectiveTenant.name (derived from bridge in production, mock in demo).
  // For talent surface, prefer the bridge's `agencyName` (the actual agency
  // hosting this rostered talent) over Marta's hardcoded primaryAgency.
  const actingLabel = inWorkspace
    ? effectiveTenant.name
    : inClient ? activeClientProfile.name
    : agencyCount === 1
      ? (bridgeTalentAgencies?.[0]?.agencyName ?? bridgeTalentSelfProfile?.agencyName?.trim() ?? MY_TALENT_PROFILE.primaryAgency)
      : copy.isSpanish
        ? "Tus agencias"
        : "Your agencies";
  // Subtext stays terse — the plan tier now has its own badge inline,
  // so this just clarifies the role + entity context.
  const actingRoleLabel = bridgeSessionIdentity?.role ?? role;
  const actingSubLabel = inWorkspace
    ? `${actingRoleLabel.charAt(0).toUpperCase() + actingRoleLabel.slice(1)} · ${entityType}`
    : inClient ? (activeClientProfile.isBusiness ? "Business client" : "Personal client")
    : inTalent
      ? (agencyCount === 1 ? "Primary agency" : `${agencyCount} agencies`)
      : "Primary agency";
  // Real KPI subline: when overviewMetrics is available, compose live
  // counters; otherwise fall back to the prototype's hardcoded copy.
  const actingDetail = (() => {
    if (inWorkspace) {
      if (overviewMetrics) {
        const open = overviewMetrics.openInquiries ?? 0;
        const roster = overviewMetrics.rosterTotal ?? 0;
        return copy.isSpanish
          ? `${roster} talento · ${open} consulta${open === 1 ? "" : "s"} abierta${open === 1 ? "" : "s"}`
          : `${roster} talent · ${open} open ${open === 1 ? "inquiry" : "inquiries"}`;
      }
      return `${fmtMoney(4200)} pending · 3 confirmed`;
    }
    if (inClient) return activeClientProfile.industry;
    if (inTalent) {
      if (bridgeTalentEarnings != null) {
        const ytdEuros = Math.round(bridgeTalentEarnings.totals.ytdNetCents / 100);
        return copy.isSpanish
          ? `${fmtMoney(ytdEuros)} neto YTD`
          : `${fmtMoney(ytdEuros)} net YTD`;
      }
      const n = agencyCount;
      return copy.isSpanish
        ? `${n} agencia${n === 1 ? "" : "s"}`
        : `${n} agenc${n === 1 ? "y" : "ies"}`;
    }
    return `3 confirmed · ${fmtMoney(4200)} YTD`;
  })();
  // Pure talent with zero agencies → invite them to start a workspace of
  // their own (one-click discovery of the hybrid path). Otherwise fall back
  // to the existing money / switcher destinations.
  const onActingClick = () =>
    inWorkspace ? openDrawer("tenant-switcher")
    : inClient ? openDrawer("client-brand-switcher")
    : inTalent && agencyCount === 0
      ? window.dispatchEvent(new CustomEvent(START_WORKSPACE_EVENT))
      : isPureTalent || agencyCount !== 1
        ? setTalentPage("money")
        : openDrawer("talent-agency-switcher");

  // The notifications + help drawers differ per surface.
  const notificationsDrawerId = inWorkspace ? "notifications"
    : inClient ? "client-today-pulse"
    : "talent-notifications";
  // Phase 3.12 — use live bridge totalUnread for workspace when available.
  // Phase 5 — use bridgeTalentUnread for talent surface; fall back to mock
  // only in standalone prototype mode (bridgeTalentUnread === undefined).
  const notificationsUnread = inWorkspace
    ? (bridgeTotalUnread > 0 ? bridgeTotalUnread : (bridgeWorkspaceUnread ?? 0))
    : inClient ? 0
    : (bridgeTalentUnread !== undefined ? bridgeTalentUnread : TALENT_UNREAD);

  return (
    <header
      data-tulala-identity-bar
      style={{
        background: "#fff",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        position: "sticky",
        top: "var(--proto-cbar, 50px)",
        zIndex: 50,
        padding: "0 24px",
        height: 56,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          height: "100%",
          maxWidth: 1440,
          margin: "0 auto",
        }}
      >
        {/* Brand mark — talent surface is Tulala-canonical (L41): always the
            platform wordmark, never the active agency logo. Workspace/client
            surfaces show the tenant logo when uploaded. */}
        {inTalent ? (
          <img
            src="/brand/tulala-wordmark.svg"
            alt={TULALA_BRAND.name}
            data-tulala-brand
            className="tulala-talent-brand-mark"
          />
        ) : bridgeTenantIdentity?.logoUrl ? (
          <img
            src={bridgeTenantIdentity.logoUrl}
            alt={bridgeTenantIdentity.displayName || "Workspace logo"}
            data-tulala-brand
            style={{
              height: 36,
              width: "auto",
              maxWidth: 220,
              objectFit: "contain",
              objectPosition: "left center",
              paddingRight: 4,
              display: "block",
            }}
          />
        ) : (
          <div
            aria-label={TULALA_BRAND.name}
            data-tulala-brand
            style={{
              fontFamily: FONTS.display,
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: 0.4,
              color: COLORS.ink,
              textTransform: "uppercase",
              paddingRight: 4,
            }}
          >
            {TULALA_BRAND.name}
          </div>
        )}

        <div data-tulala-id-divider style={{ width: 1, height: 22, background: COLORS.borderSoft, margin: "0 4px" }} />

        {/* User identity — the one human across modes. Click opens
            the account menu (audit #3). */}
        <AccountMenuTrigger userName={userName} userInitials={userInitials}>
          <Avatar initials={userInitials} size={26} tone="ink" hashSeed={userName} photoUrl={userPhotoUrl} />
          <span
            data-tulala-identity-name
            style={{
              fontFamily: FONTS.body,
              fontSize: 14,
              fontWeight: 500,
              color: COLORS.ink,
              letterSpacing: -0.05,
            }}
          >
            {userName}
          </span>
          {/* Hamburger icon — universal "menu" affordance. Replaces the
              ambiguous chevron-down so the avatar reads as a tappable
              menu trigger, not just identity. */}
          <span aria-hidden style={{ display: "inline-flex", alignItems: "center", color: COLORS.inkMuted, marginLeft: 1 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </span>
        </AccountMenuTrigger>

        {/* Subtle separator dot between identity and acting-as.
            Hidden at phone widths (where the name text also collapses). */}
        <span
          aria-hidden
          data-tulala-id-slash
          style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.inkDim, marginLeft: -2 }}
        >
          /
        </span>

        {/* Acting-as context — flips with mode. Click opens the
            tenant or agency switcher depending on which side.
            Audit #4 — chevron rotates on hover to invite the click. */}
        <button
          type="button"
          onClick={onActingClick}
          aria-label={copy.isSpanish ? `Actuando como ${actingLabel} — cambiar` : `Acting as ${actingLabel} — switch`}
          title={actingSubLabel}
          className="tulala-acting-chip"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "5px 9px",
            borderRadius: 999,
            fontFamily: FONTS.body,
            transition: `background ${TRANSITION.micro}`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: COLORS.green,
              flexShrink: 0,
            }}
          />
          <span
            data-tulala-acting-label
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "flex-start",
              minWidth: 0,
              overflow: "hidden",
              maxWidth: 220,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, letterSpacing: -0.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.15 }} className="text-admin-ink">
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{actingLabel}</span>
              {inWorkspace && (
                <span
                  data-tulala-plan-tier-badge
                  data-plan={plan}
                  style={{ flexShrink: 0, display: "inline-flex" }}
                >
                  <PlanChip
                    plan={
                      (bridgeTenantIdentity?.planTier as typeof plan) ?? plan
                    }
                    variant="outline"
                  />
                </span>
              )}
            </span>
            <span data-tulala-acting-detail style={{
              fontFamily: FONTS.body,
              fontSize: 10,
              fontWeight: 500,
              color: COLORS.inkMuted,
              letterSpacing: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.1,
              marginTop: 1,
            }}>{actingDetail}</span>
          </span>
          <span
            aria-hidden
            className="tulala-acting-chevron"
            style={{
              display: "inline-flex",
              transition: `transform ${TRANSITION.layout}`,
            }}
          >
            <Icon name="chevron-down" size={10} color={COLORS.inkDim} />
          </span>
        </button>

        <div style={{ flex: 1 }} />

        {/* Mode toggle — only for hybrid users (talent who also have a
            workspace). Hidden on the client surface — clients are
            single-mode and don't have a talent/workspace dual identity. */}
        {alsoTalent && !inClient && (
          <ModeTogglePill
            surface={surface}
            flipMode={flipMode}
            workspaceUnread={bridgeTotalUnread > 0 ? bridgeTotalUnread : (bridgeWorkspaceUnread ?? 0)}
            talentUnread={bridgeTalentUnread !== undefined ? bridgeTalentUnread : TALENT_UNREAD}
            showFirstRunTip={bridgeFirstRunToggleTipSeen === false && alsoTalent}
          />
        )}

        {/* Global utilities — single source for both modes.
            Workspace + talent surfaces use the new NotificationsBell
            popover hub. Client keeps its dedicated /notifications page. */}
        {inClient ? (
          <IdentityBarIconButton
            aria-label={copy.isSpanish ? `Notificaciones · ${notificationsUnread} sin leer` : `Notifications · ${notificationsUnread} unread`}
            onClick={() => setClientPage("notifications")}
            badge={notificationsUnread}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
              <path d="M10 21a2 2 0 0 0 4 0" />
            </svg>
          </IdentityBarIconButton>
        ) : (
          <NotificationsBell />
        )}

        <IdentityBarIconButton
          aria-label={copy.t("Help")}
          onClick={() => openDrawer("help")}
        >
          <span style={{ fontFamily: FONTS.body, fontWeight: 700, fontSize: 13 }}>?</span>
        </IdentityBarIconButton>

        {/* Locale toggle — matches production EN/ES affordance.
            Compact pill; the inactive side flips on click. */}
        <LocaleToggle />

        {/* Sign out — matches production. Compact icon button at the
            far right; click confirms via toast in the prototype. */}
        <IdentityBarIconButton
          aria-label={copy.t("Sign out")}
          onClick={() => toast(copy.t("Signed out"))}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </IdentityBarIconButton>
      </div>

      {/* Shared dialog — mounted at the bar level so the account menu,
          the "Your agencies" pill, and a /today dashboard tile can all
          open it via the START_WORKSPACE_EVENT. */}
      <StartFreeWorkspaceDialog
        open={startWorkspaceDialogOpen}
        onOpenChange={setStartWorkspaceDialogOpen}
        defaultWorkspaceName={userName ? `${userName} Studio` : "My Studio"}
      />
    </header>
  );
}

/**
 * Account menu trigger + popover (audit #3). Wraps the identity
 * button with click-to-open menu. Items: Profile / Settings /
 * Keyboard shortcuts / Sign out. Used in the persistent identity
 * bar above the surfaces.
 */
function AccountMenuTrigger({
  userName,
  userInitials: _userInitials,
  children,
}: {
  userName: string;
  userInitials: string;
  children: ReactNode;
}) {
  const { toast, state, openDrawer, bridgeTalentSelfProfile, tenantSlug, bridgeSessionIdentity } = useAdminShell();
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const [createTalentDialogOpen, setCreateTalentDialogOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Talent surface entry-point to spin up their own workspace. The dialog
  // itself is mounted at the TulalaIdentityBar level (so the "Your agencies"
  // pill can also trigger it); we dispatch a window event to open it.
  const isTalentSurface = state.surface === "talent";
  const fireOpenStartWorkspaceDialog = () => {
    window.dispatchEvent(new CustomEvent(START_WORKSPACE_EVENT));
  };
  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-tulala-account-menu-root]")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      data-tulala-account-menu-root
      style={{ position: "relative" }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${copy.t("Open account menu")} — ${copy.t("Signed in as")} ${userName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          // Always-on subtle pill so the trigger reads as a button, not
          // just an avatar. Stronger when open / hovered. Border makes
          // it visually distinct from a static avatar.
          background: open ? "rgba(11,11,13,0.08)" : "rgba(11,11,13,0.035)",
          border: `1px solid ${open ? "rgba(11,11,13,0.12)" : "rgba(11,11,13,0.07)"}`,
          cursor: "pointer",
          padding: "3px 8px 3px 3px",
          borderRadius: 999,
          fontFamily: FONTS.body,
          transition: `background ${TRANSITION.micro}, border-color ${TRANSITION.micro}`,
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = "rgba(11,11,13,0.06)";
            e.currentTarget.style.borderColor = "rgba(11,11,13,0.10)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = "rgba(11,11,13,0.035)";
            e.currentTarget.style.borderColor = "rgba(11,11,13,0.07)";
          }
        }}
      >
        {children}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 240,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 40px rgba(11,11,13,0.16)",
            padding: 6,
            zIndex: 200,
            fontFamily: FONTS.body,
            animation: "tulala-menu-fade .14s ease",
          }}
        >
          <style>{`@keyframes tulala-menu-fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {/* Header — signed-in-as identity */}
          <div
            style={{
              padding: "10px 12px 10px",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              marginBottom: 4,
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 2 }} className="text-admin-ink-muted">
              {copy.t("Signed in as")}
            </div>
            <div className="text-admin-ink text-admin-13 font-semibold">{userName}</div>
            <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">{bridgeSessionIdentity?.email ?? ""}</div>
            {/* Tenant meta — plan / role, shown on mobile where the identity
                bar chips are hidden (#2) */}
            {state.surface === "workspace" && (
              <div
                data-tulala-tenant-meta-mobile
                style={{
                  display: "none",
                  marginTop: 8,
                  padding: "6px 8px",
                  background: COLORS.surfaceAlt,
                  borderRadius: 7,
                  fontSize: 11,
                  color: COLORS.ink,
                  fontWeight: 500,
                  gap: 6,
                }}
              >
                <span className="capitalize">{copy.t(PLAN_META[state.plan].label)}</span>
                <span className="text-admin-ink-muted">·</span>
                <span className="capitalize">{copy.t(state.entityType)}</span>
                <span className="text-admin-ink-muted">·</span>
                <span className="capitalize">{copy.t(state.role)}</span>
              </div>
            )}
          </div>

          <AccountMenuItem
            label="Profile"
            sub="View / edit your public profile"
            onClick={() => { setOpen(false); openDrawer("my-profile"); }}
          />
          <AccountMenuItem
            label="Workspace settings"
            sub="Name, domain, branding, team"
            onClick={() => { setOpen(false); openDrawer("workspace-settings"); }}
          />
          {/* Talent-surface CTA — let a talent provision their own free
              workspace without leaving their identity. Mirrors the Pure-Workspace
              "Create your talent page" pattern below. The dialog itself is
              mounted at the TulalaIdentityBar level so the "Your agencies"
              pill can open it too; we fire a window event to open it. */}
          {isTalentSurface && (
            <AccountMenuItem
              label="Start a workspace"
              sub="Run your own roster — free plan, 1 minute"
              onClick={() => { setOpen(false); fireOpenStartWorkspaceDialog(); }}
            />
          )}
          <AccountMenuItem
            label="Notifications"
            sub="Email, push, digest preferences"
            onClick={() => { setOpen(false); openDrawer("notifications-prefs"); }}
          />
          {/* Language — real cookie-based switcher */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 10px", borderRadius: 8,
            fontFamily: FONTS.body,
          }}>
            <div>
              <div className="text-admin-ink text-admin-13 font-medium">{copy.t("Language")}</div>
              <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">{copy.t("Dashboard display language")}</div>
            </div>
            <DashboardLocaleToggle variant="prototype" />
          </div>
          <AccountMenuItem
            label="Keyboard shortcuts"
            sub="Press ? anywhere"
            onClick={() => { setOpen(false); setShortcutsOpen(true); }}
          />
          {/* Phase 4 — Pure Workspace state: CTA to create own talent page.
              Rendered only when the signed-in user has no talent profile in
              this workspace (bridgeTalentSelfProfile is null) AND is on the
              workspace surface with admin-level access. */}
          {bridgeTalentSelfProfile === null && state.surface === "workspace" && meetsRole(state.role, "admin") && tenantSlug && (
            <>
              <div style={{ borderTop: `1px solid ${COLORS.borderSoft}`, margin: "4px 0" }} />
              <AccountMenuItem
                label="Create your talent page"
                sub="Take bookings as a talent on this workspace"
                onClick={() => { setOpen(false); setCreateTalentDialogOpen(true); }}
              />
            </>
          )}
          <div style={{ borderTop: `1px solid ${COLORS.borderSoft}`, marginTop: 4, paddingTop: 4 }}>
            <AccountMenuItem
              label={signingOut ? "Signing out…" : "Sign out"}
              sub=""
              tone="coral"
              onClick={async () => {
                if (signingOut) return;
                setOpen(false);
                setSigningOut(true);
                await signOut();
              }}
            />
          </div>
        </div>
      )}
      {/* Dialog mounted outside the dropdown so it survives dropdown close */}
      {tenantSlug && (
        <CreateMyTalentProfileDialog
          open={createTalentDialogOpen}
          onOpenChange={setCreateTalentDialogOpen}
          tenantSlug={tenantSlug}
        />
      )}
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
