"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { signOut } from "@/app/auth/actions";

const START_WORKSPACE_EVENT = "tulala:open-start-workspace-dialog";
import { DashboardLocaleToggle } from "@/components/dashboard-locale-toggle";
import { CreateMyTalentProfileDialog } from "@/components/talent/create-my-talent-profile-dialog";
import { StartFreeWorkspaceDialog } from "@/components/talent/start-free-workspace-dialog";
import { WorkspaceLifecycleDialog } from "@/components/admin/workspace-lifecycle-dialog";
import type { Locale } from "@/i18n/config";
import { useDashboardText } from "../dashboard-i18n";
import { NotificationsBell } from "../notifications-hub";
import { Avatar, Icon, ShortcutsModal } from "../primitives";
import { COLORS, FAB_PALETTE_OPEN_EVENT, MY_TALENT_PROFILE, PLAN_META, meetsRole, useAdminShell } from "../state";
import { TULALA_BRAND } from "@/lib/brand/tulala";
import { planTierHasWhitelabel } from "@/lib/saas/workspace-public-url";
import { formatMoneyCents } from "@/lib/talent/earnings-view";
import { AccountMenuItem, IdentityBarIconButton, ModeTogglePill } from "./IdentityBar-2";
import { TALENT_UNREAD } from "./WorkspaceTopbar";
import { WorkspacePulseChip } from "./WorkspacePulseChip";


export function TulalaIdentityBar() {
  const {
    state,
    openDrawer,
    flipMode,
    setClientPage,
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
    tenantSlug,
    supportedLocales,
    tenantDefaultLocale,
  } = useAdminShell();
  const copy = useDashboardText();
  const { surface, alsoTalent, role, entityType } = state;

  // Hooks must be called unconditionally (Rules of Hooks). These drive the
  // "Start a workspace" dialog that only renders on non-platform surfaces, but
  // the hook registration itself must happen before any early return.
  const [startWorkspaceDialogOpen, setStartWorkspaceDialogOpen] = useState(false);
  useEffect(() => {
    const handler = () => setStartWorkspaceDialogOpen(true);
    window.addEventListener(START_WORKSPACE_EVENT, handler);
    return () => window.removeEventListener(START_WORKSPACE_EVENT, handler);
  }, []);

  // Identity bar renders for the three end-user surfaces (workspace +
  // talent + client). Platform HQ has its own dark chrome and skips it.
  if (surface === "platform") return null;

  const inWorkspace = surface === "workspace";
  const inTalent    = !inWorkspace;
  const agencyCount = bridgeTalentAgencies?.length ?? 0;

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

  const userName = (inWorkspace && realUserName)
      ? realUserName
      : (talentBridgeName ?? realUserName ?? MY_TALENT_PROFILE.name);
  const userInitials = (inWorkspace && realUserInitials)
      ? realUserInitials
      : (talentBridgeInitials ?? realUserInitials ?? MY_TALENT_PROFILE.initials);
  const userPhotoUrl = undefined;

  // Acting-as context flips with surface. For the workspace surface, use
  // effectiveTenant.name (derived from bridge in production, mock in demo).
  // For talent surface, prefer the bridge's `agencyName` (the actual agency
  // hosting this rostered talent) over Marta's hardcoded primaryAgency.
  const actingLabel = inWorkspace
    ? effectiveTenant.name
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
    : inTalent
      ? (agencyCount === 1 ? "Primary agency" : `${agencyCount} agencies`)
      : "Primary agency";
  // Real KPI subline: workspace identity bar shows live financial KPIs
  // (workspace commission lane — see decision-log L43) when the snapshot
  // loader returned data. When metrics are null (loader errored or
  // unauthenticated bridge), fall through to a roster/open-inquiry summary
  // and finally to a dash placeholder — never a fake euro figure.
  const actingDetail = (() => {
    if (inWorkspace) {
      if (overviewMetrics) {
        const pendingCents = overviewMetrics.pendingPayoutCents;
        const confirmedCount = overviewMetrics.confirmedBookingCount;
        if (pendingCents != null && confirmedCount != null) {
          // USD-first: format in the workspace KPI currency (the platform
          // operating currency, default USD) — never a hardcoded €. The
          // currency-aware formatter divides cents internally.
          const primaryCurrency = overviewMetrics.kpiCurrency ?? "USD";
          const pendingLabel = formatMoneyCents(pendingCents, primaryCurrency);

          // Append a compact off-currency affordance when there are bookings
          // in other currencies (e.g. "· +€1,030"). This prevents real money
          // from silently vanishing from the KPI strip. We show the pending
          // total per off-currency (the most actionable signal) if non-zero,
          // otherwise skip that currency to keep the label short.
          const offCurrencyParts: string[] = [];
          for (const sub of overviewMetrics.offCurrencySubtotals ?? []) {
            if (sub.pendingCents > 0) {
              offCurrencyParts.push(`+${formatMoneyCents(sub.pendingCents, sub.currency)}`);
            } else if (sub.confirmedCount > 0) {
              // Nothing pending in this currency but there are confirmed
              // bookings — show the YTD confirmed amount so it isn't invisible.
              offCurrencyParts.push(`+${formatMoneyCents(sub.confirmedYtdCents, sub.currency)}`);
            }
          }
          const offCurrencySuffix = offCurrencyParts.length > 0
            ? ` ${offCurrencyParts.join(" ")}`
            : "";

          return copy.isSpanish
            ? `${pendingLabel}${offCurrencySuffix} pendiente · ${confirmedCount} confirmada${confirmedCount === 1 ? "" : "s"}`
            : `${pendingLabel}${offCurrencySuffix} pending · ${confirmedCount} confirmed`;
        }
        const open = overviewMetrics.openInquiries ?? 0;
        const roster = overviewMetrics.rosterTotal ?? 0;
        return copy.isSpanish
          ? `${roster} talento · ${open} consulta${open === 1 ? "" : "s"} abierta${open === 1 ? "" : "s"}`
          : `${roster} talent · ${open} open ${open === 1 ? "inquiry" : "inquiries"}`;
      }
      // Metrics null — degraded local-dev / missing env. Show a neutral
      // dash rather than a fabricated euro amount.
      return "—";
    }
    if (inTalent) {
      if (bridgeTalentEarnings != null) {
        // Honor the booking's currency (MXN/ARS/USD/…), never a hardcoded €.
        const ytd = formatMoneyCents(
          bridgeTalentEarnings.totals.ytdNetCents,
          bridgeTalentEarnings.totals.currency,
        );
        return copy.isSpanish ? `${ytd} neto YTD` : `${ytd} net YTD`;
      }
      const n = agencyCount;
      return copy.isSpanish
        ? `${n} agencia${n === 1 ? "" : "s"}`
        : `${n} agenc${n === 1 ? "y" : "ies"}`;
    }
    return "—";
  })();
  // Pure talent with zero agencies → invite them to start a workspace of
  // their own (one-click discovery of the hybrid path). With agencies, the
  // chip opens the Switch-agency drawer — the ONE switcher for the talent
  // surface (the drawer now switches the active-agency cookie in place; the
  // old raw select strip above the shell is gone). The old routing sent
  // multi-agency talents to the Money page, which lists agencies but cannot
  // switch context.
  const onActingClick = () =>
    inWorkspace ? openDrawer("tenant-switcher")
    : inTalent && agencyCount === 0
      ? window.dispatchEvent(new CustomEvent(START_WORKSPACE_EVENT))
      : openDrawer("talent-agency-switcher");

  // The notifications + help drawers differ per surface.
  const notificationsDrawerId = inWorkspace ? "notifications" : "talent-notifications";
  // Phase 3.12 — use live bridge totalUnread for workspace when available.
  // Phase 5 — use bridgeTalentUnread for talent surface; fall back to mock
  // only in standalone prototype mode (bridgeTalentUnread === undefined).
  const notificationsUnread = inWorkspace
    ? (bridgeTotalUnread > 0 ? bridgeTotalUnread : (bridgeWorkspaceUnread ?? 0))
    : (bridgeTalentUnread !== undefined ? bridgeTalentUnread : TALENT_UNREAD);

  return (
    <header
      data-tulala-identity-bar
      className="sticky top-[var(--proto-cbar,50px)] z-50 h-[56px] border-b border-admin-border-soft bg-white px-[24px]"
    >
      {/* Full-bleed row (no centered max-width box): brand hugs the left
          edge above the sidebar rail, controls hug the right — Shopify
          edge alignment. */}
      <div
        className="flex h-full w-full items-center gap-[14px]"
      >
        {/* Brand mark — whitelabel branding (Agency/Network tier) decides whose
            brand the talent + client see:
            • Workspace surface: the agency's OWN staff always see their tenant
              logo (their workspace, regardless of tier).
            • Talent surface: the active agency's logo ONLY when the talent is
              EXCLUSIVE to it and it is on a whitelabel tier; otherwise the
              Tulala platform wordmark.
            • Client surface: the home agency's logo ONLY when it is on a
              whitelabel tier; otherwise the Tulala wordmark.
            When no eligible agency logo applies, the surface stays Tulala. */}
        {(() => {
          const whitelabel = planTierHasWhitelabel(bridgeTenantIdentity?.planTier);
          const agencyLogoUrl = bridgeTenantIdentity?.logoUrl ?? null;
          const showAgencyLogo =
            agencyLogoUrl != null &&
            (inWorkspace ||
              (inTalent && whitelabel && bridgeTenantIdentity?.talentExclusive === true));
          if (showAgencyLogo && agencyLogoUrl) {
            return (
              <img
                src={agencyLogoUrl}
                alt={bridgeTenantIdentity?.displayName || "Workspace logo"}
                data-tulala-brand
                className="block h-[36px] w-auto max-w-[220px] object-contain object-left pr-[4px]"
              />
            );
          }
          // Talent surface keeps its dedicated wordmark sizing; workspace/client
          // fall back to the Tulala text wordmark.
          if (inTalent) {
            return (
              <img
                src="/brand/tulala-wordmark.svg"
                alt={TULALA_BRAND.name}
                data-tulala-brand
                className="tulala-talent-brand-mark"
              />
            );
          }
          return (
            <div
              aria-label={TULALA_BRAND.name}
              data-tulala-brand
              className="font-admin-display text-[16px] font-medium uppercase tracking-[0.4px] text-admin-ink pr-[4px]"
            >
              {TULALA_BRAND.name}
            </div>
          );
        })()}

        <div data-tulala-id-divider className="mx-[4px] h-[22px] w-px bg-admin-border-soft" />

        {/* Left context — split by surface (audit: the workspace acting-as
            chip duplicated the sidebar tenant chip: same name, same switcher
            drawer, 100px apart). On the workspace surface the RAIL owns
            identity + switching, and this slot becomes the Business Pulse:
            live money/ops signals with a breakdown popover. Talent + client
            surfaces have no rail, so they keep the acting-as switcher. */}
        {inWorkspace ? (
          <WorkspacePulseChip />
        ) : (
          <button
            type="button"
            onClick={onActingClick}
            aria-label={copy.isSpanish ? `Actuando como ${actingLabel} — cambiar` : `Acting as ${actingLabel} — switch`}
            title={actingSubLabel}
            className="tulala-acting-chip inline-flex cursor-pointer items-center gap-[8px] rounded-[999px] border-none bg-transparent px-[9px] py-[5px] font-admin-body hover:bg-[rgba(11,11,13,0.04)] [transition:background_var(--transition-admin-micro)]"
          >
            <span
              aria-hidden
              className="h-[6px] w-[6px] shrink-0 rounded-full bg-admin-green"
            />
            <span
              data-tulala-acting-label
              className="inline-flex max-w-[220px] min-w-0 flex-col items-start overflow-hidden"
            >
              <span className="inline-flex items-center gap-[6px] font-admin-body text-[13px] font-medium tracking-[-0.05px] whitespace-nowrap overflow-hidden text-ellipsis leading-[1.15] text-admin-ink">
                <span className="overflow-hidden text-ellipsis">{actingLabel}</span>
              </span>
              <span data-tulala-acting-detail className="mt-px font-admin-body text-[10px] font-medium tracking-[0px] whitespace-nowrap overflow-hidden text-ellipsis leading-[1.1] text-admin-ink-muted">{actingDetail}</span>
            </span>
            <span
              aria-hidden
              className="tulala-acting-chevron inline-flex [transition:transform_var(--transition-admin-layout)]"
            >
              <Icon name="chevron-down" size={10} color={COLORS.inkDim} />
            </span>
          </button>
        )}

        {/* Centered global search — Shopify-style. One pill in the middle of
            the chrome that opens the unified command palette (same target as
            ⌘K). Workspace surface only; hidden on mobile where the bottom
            FAB is the single command surface. */}
        {inWorkspace ? (
          <>
            <div className="flex-1" />
            <button
              type="button"
              data-tulala-topbar-search
              onClick={() => window.dispatchEvent(new Event(FAB_PALETTE_OPEN_EVENT))}
              aria-label={copy.isSpanish ? "Buscar en el workspace" : "Search workspace"}
              className="hidden h-[34px] w-[min(420px,32vw)] min-w-[180px] cursor-pointer items-center gap-[8px] rounded-[9px] border border-admin-border-soft bg-admin-surface px-[10px] font-admin-body text-[12.5px] text-admin-ink-dim md:inline-flex [transition:border-color_var(--transition-admin-micro),background_var(--transition-admin-micro)]"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.background = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.background = "";
              }}
            >
              <Icon name="search" size={13} color={COLORS.inkDim} />
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                {copy.isSpanish ? "Buscar" : "Search"}
              </span>
              <span
                aria-hidden
                className="inline-flex h-[18px] items-center rounded-[5px] border border-admin-border-soft bg-white px-[5px] font-mono text-[10px] font-semibold text-admin-ink-dim"
              >
                ⌘K
              </span>
            </button>
            <div className="flex-1" />
          </>
        ) : (
          <div className="flex-1" />
        )}

        {/* Plan chip / locale pills / help "?" / sign-out icon all moved
            into the account menu (right-most avatar): the sidebar tenant
            chip already shows the plan, and Language + Sign out lived in
            the menu anyway — the standalone controls were duplicates. */}

        {/* Mode toggle — only for hybrid users (talent who also have a
            workspace). Hidden on the client surface — clients are
            single-mode and don't have a talent/workspace dual identity. */}
        {alsoTalent && (
          <ModeTogglePill
            surface={surface}
            flipMode={flipMode}
            workspaceUnread={bridgeTotalUnread > 0 ? bridgeTotalUnread : (bridgeWorkspaceUnread ?? 0)}
            talentUnread={bridgeTalentUnread !== undefined ? bridgeTalentUnread : TALENT_UNREAD}
            showFirstRunTip={bridgeFirstRunToggleTipSeen === false && alsoTalent}
          />
        )}

        {/* Global utilities — workspace + talent both use the
            NotificationsBell popover hub. */}
        <NotificationsBell />

        {/* Preview public site — opens the agency homepage in a new tab */}
        <a
          href={tenantSlug ? `/${tenantSlug}` : "/"}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Preview site"
          title="Preview public site"
          className="inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[8px] border border-admin-border-soft bg-white text-admin-ink-muted no-underline [transition:border-color_var(--transition-admin-micro),color_var(--transition-admin-micro)]"
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.color = COLORS.ink;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLORS.borderSoft;
            e.currentTarget.style.color = COLORS.inkMuted;
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </a>

        {/* User identity — Shopify/Gmail-style avatar-only menu trigger.
            The name used to sit inline and wrapped to two lines whenever
            the bar got tight (the recurring breakage). It's an avatar
            button now: never wraps, and the full name + email live in the
            dropdown header, the aria-label, and a hover tooltip. One human,
            one menu: profile, settings, plan & billing, notifications,
            language, help, shortcuts, sign out. */}
        <AccountMenuTrigger userName={userName} userInitials={userInitials} align="right">
          <Avatar initials={userInitials} size={28} tone="ink" hashSeed={userName} photoUrl={userPhotoUrl} />
        </AccountMenuTrigger>
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
  align = "left",
}: {
  userName: string;
  userInitials: string;
  children: ReactNode;
  /** Which edge the dropdown hugs — "right" when the trigger sits at the bar's right end. */
  align?: "left" | "right";
}) {
  const { state, openDrawer, bridgeTalentSelfProfile, bridgeTenantIdentity, tenantSlug, adminBasePath, bridgeSessionIdentity, supportedLocales, tenantDefaultLocale } = useAdminShell();
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const [createTalentDialogOpen, setCreateTalentDialogOpen] = useState(false);
  const [lifecycleDialogOpen, setLifecycleDialogOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Talent surface entry-point to spin up their own workspace. The dialog
  // itself is mounted at the TulalaIdentityBar level (so the "Your agencies"
  // pill can also trigger it); we dispatch a window event to open it.
  const isTalentSurface = state.surface === "talent";
  const fireOpenStartWorkspaceDialog = () => {
    window.dispatchEvent(new CustomEvent(START_WORKSPACE_EVENT));
  };

  // Workspace-surface lifecycle entry. Owners see "Archive workspace"
  // (typed-slug confirmation); members see "Leave workspace" (soft
  // confirmation). Hidden on talent/client/platform surfaces.
  const isWorkspaceSurface = state.surface === "workspace";
  const isWorkspaceOwner = state.role === "owner";
  const lifecycleMode: "archive" | "leave" = isWorkspaceOwner
    ? "archive"
    : "leave";
  const workspaceDisplayName =
    bridgeTenantIdentity?.displayName?.trim() ||
    tenantSlug ||
    "this workspace";
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
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${copy.t("Open account menu")} — ${copy.t("Signed in as")} ${userName}`}
        title={userName}
        aria-haspopup="menu"
        aria-expanded={open}
        // Circular avatar button — the avatar IS the affordance (Gmail /
        // Shopify pattern), so a fixed round ring around it can never wrap
        // or reflow no matter how tight the bar gets. Symmetric p-[3px] +
        // rounded-full keeps it a perfect circle. Hover/open shades flow
        // through CSS custom properties so the imperative handlers stay
        // no-render while React reconciles the open-state color on toggle.
        className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--ib-pill-bd)] bg-[var(--ib-pill-bg)] p-[3px] font-admin-body [transition:background_var(--transition-admin-micro),border-color_var(--transition-admin-micro)]"
        style={{
          "--ib-pill-bg": open ? "rgba(11,11,13,0.08)" : "rgba(11,11,13,0.035)",
          "--ib-pill-bd": open ? "rgba(11,11,13,0.12)" : "rgba(11,11,13,0.07)",
        } as CSSProperties}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.setProperty("--ib-pill-bg", "rgba(11,11,13,0.06)");
            e.currentTarget.style.setProperty("--ib-pill-bd", "rgba(11,11,13,0.10)");
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.setProperty("--ib-pill-bg", "rgba(11,11,13,0.035)");
            e.currentTarget.style.setProperty("--ib-pill-bd", "rgba(11,11,13,0.07)");
          }
        }}
      >
        {children}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-[calc(100%_+_6px)] z-[200] min-w-[240px] rounded-[12px] border border-admin-border-soft bg-white p-[6px] font-admin-body shadow-[0_10px_40px_rgba(11,11,13,0.16)] [animation:tulala-menu-fade_.14s_ease]`}
        >
          <style>{`@keyframes tulala-menu-fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {/* Header — signed-in-as identity */}
          <div
            className="mb-[4px] border-b border-admin-border-soft px-[12px] pt-[10px] pb-[10px]"
          >
            <div className="mb-[2px] text-[10.5px] font-bold uppercase tracking-[0.7px] text-admin-ink-muted">
              {copy.t("Signed in as")}
            </div>
            <div className="text-admin-ink text-admin-13 font-semibold">{userName}</div>
            <div className="mt-px text-[11.5px] text-admin-ink-muted">{bridgeSessionIdentity?.email ?? ""}</div>
            {/* Tenant meta — plan / role, shown on mobile where the identity
                bar chips are hidden (#2) */}
            {state.surface === "workspace" && (
              <div
                data-tulala-tenant-meta-mobile
                className="mt-[8px] hidden gap-[6px] rounded-[7px] bg-admin-surface-alt px-[8px] py-[6px] text-[11px] font-medium text-admin-ink"
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
          {/* Plan & billing — absorbs the old top-bar plan chip (the sidebar
              tenant chip still shows the plan name at a glance). */}
          {isWorkspaceSurface && (
            <AccountMenuItem
              label="Plan & billing"
              sub="Seats, invoices, payouts"
              onClick={() => {
                setOpen(false);
                window.location.assign(`${adminBasePath}/account`);
              }}
            />
          )}
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
          <div className="flex items-center justify-between rounded-[8px] px-[10px] py-[8px] font-admin-body">
            <div>
              <div className="text-admin-ink text-admin-13 font-medium">{copy.t("Language")}</div>
              <div className="mt-px text-[11.5px] text-admin-ink-muted">{copy.t("Dashboard display language")}</div>
            </div>
            <DashboardLocaleToggle
              variant="prototype"
              supportedLocales={supportedLocales}
              defaultLocale={tenantDefaultLocale}
            />
          </div>
          <AccountMenuItem
            label="Help & guides"
            sub="How-it-works, docs, support"
            onClick={() => { setOpen(false); openDrawer("help"); }}
          />
          <AccountMenuItem
            label="Keyboard shortcuts"
            sub="Press ? anywhere"
            onClick={() => { setOpen(false); setShortcutsOpen(true); }}
          />
          {/* Talent-mode entry — the reliable "get me to my talent
              dashboard" path. The top-bar mode pill only appears once the
              server-side isHybrid flag is detected, which lags right after
              a fresh talent signup; this menu item keys off the talent
              profile itself (bridgeTalentSelfProfile) and hard-navigates
              to /<slug>/talent, so it's always there the moment the profile
              exists. When there is NO profile yet, the same slot offers to
              create one. Workspace surface + admin only. */}
          {state.surface === "workspace" && meetsRole(state.role, "admin") && tenantSlug && (
            <>
              <div className="my-1 border-t border-admin-border-soft" />
              {bridgeTalentSelfProfile !== null ? (
                <AccountMenuItem
                  label="Switch to talent"
                  sub="Go to your talent dashboard"
                  onClick={() => {
                    setOpen(false);
                    // Canonical, Tulala-unified platform talent surface —
                    // agency-agnostic, no tenant slug. Deliberately NOT
                    // /{slug}/talent: that legacy redirector checks
                    // "is workspace admin?" FIRST and bounces a hybrid
                    // admin+talent user straight back to /{slug}/admin/roster.
                    window.location.assign("/talent/today");
                  }}
                />
              ) : (
                <AccountMenuItem
                  label="Create your talent page"
                  sub="Take bookings as a talent on this workspace"
                  onClick={() => { setOpen(false); setCreateTalentDialogOpen(true); }}
                />
              )}
            </>
          )}
          <div className="mt-1 border-t border-admin-border-soft pt-1">
            {isWorkspaceSurface && (
              <AccountMenuItem
                label={isWorkspaceOwner ? "Archive workspace" : "Leave workspace"}
                sub={
                  isWorkspaceOwner
                    ? "Hide the workspace — reversible"
                    : "Remove yourself from this workspace"
                }
                tone="coral"
                onClick={() => { setOpen(false); setLifecycleDialogOpen(true); }}
              />
            )}
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
      {isWorkspaceSurface && tenantSlug && bridgeTenantIdentity?.tenantId && (
        <WorkspaceLifecycleDialog
          open={lifecycleDialogOpen}
          onOpenChange={setLifecycleDialogOpen}
          mode={lifecycleMode}
          tenantId={bridgeTenantIdentity.tenantId}
          workspaceName={workspaceDisplayName}
          workspaceSlug={tenantSlug}
        />
      )}
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
