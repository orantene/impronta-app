"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { useDashboardText } from "../dashboard-i18n";
import { Icon, useRovingTabindex, type AdminShellIconName } from "../primitives";
import {
  COLORS,
  FAB_PALETTE_OPEN_EVENT,
  FONTS,
  TALENT_PAGES,
  TALENT_PAGE_META,
  TRANSITION,
  WORKSPACE_PAGES,
  Z,
  useAdminShell,
} from "../state";
import { MOBILE_NAV_CSS } from "./mobile-nav-css";
import { MOBILE_BUTTON_SECONDARY, MobileSheet } from "./MobileSheet";
import { WORKSPACE_SWITCH_OPEN_EVENT, WorkspaceSwitchSheet } from "./WorkspaceSwitchSheet";
import type { TalentPage, WorkspacePage } from "../state";
import {
  destinationHref,
  destinationLabel,
  destinationShortLabel,
  isPosSegment,
  liveRouteSegment,
  mobileTabs,
  sidebarGroups,
  type Destination,
  type DestinationId,
  type WorkRole,
  type WorkspaceNavContext,
} from "@/lib/workspace/destinations";
import { canManageBilling, derivePreset, deriveWorkRole } from "@/lib/workspace/nav-context";
import { mobileMoreActions } from "@/lib/workspace/mobile-more-actions";
import { MOBILE_TAB_LIMIT } from "./SurfaceRouter";

// English label -> the copy dictionary key. destinationLabel/destinationShortLabel
// already return English strings sourced from the registry; copy.t() below is
// what turns them Spanish on an es locale (see dashboard-i18n.ts's T2-mobile block
// for the entries this file needed and did not already have).
const WORK_ROLE_LABEL: Readonly<Record<WorkRole, string>> = {
  owner: "Owner",
  manager: "Manager",
  assistant: "Assistant",
};

/**
 * A destination's live segment, translated to the id the legacy
 * `setPage`/`state.page` mechanism understands. `setPage` is dual-mode aware
 * (it flips local state only in mock/prototype mode, and pushes a real
 * navigation once a tenant is bridged — see context.tsx), so it is the right
 * way to move for any destination it can route.
 *
 * `null` covers three cases: no live route at all (`mywork`, honestly —
 * see destinations.ts), the admin root (`segment === ""`, mapped to the
 * literal "overview" id below instead of the empty string, which is not a
 * `WorkspacePage`), and a small set of real canonical routes that
 * `WORKSPACE_PAGES` deliberately excludes as "NOT a SPA nav tab" per their
 * own comments in state/types.ts (`orders`, the `financials` page `payments`
 * falls back to, `exceptions`). Callers fall back to `destinationHref` +
 * real navigation for that last group — exactly how WorkspaceShell.tsx's own
 * `href`-based sub-items already reach them.
 */
function toLegacyPage(destination: Destination): WorkspacePage | null {
  const segment = liveRouteSegment(destination);
  if (segment === null) return null;
  if (segment === "") return "overview";
  return (WORKSPACE_PAGES as readonly string[]).includes(segment)
    ? (segment as WorkspacePage)
    : null;
}

export function MobileBottomNav() {
  const {
    state,
    setPage,
    setTalentPage,
    effectiveRoster,
    totalUnread: bridgeTotalUnread,
    bridgeTalentUnread,
    openDrawer,
    adminBasePath,
    workspacePosEnabled,
    workspacePosModes,
    effectiveTenant,
  } = useAdminShell();
  const copy = useDashboardText();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  // MW26: "My work" has no route (destinations.ts, built: false); its chip
  // opens the screen that says so, in the person's language.
  const [myWorkOpen, setMyWorkOpen] = useState(false);
  // WS-12.6 — left/right arrows move between bottom nav tabs
  const bottomNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(bottomNavRef, "button", { orientation: "horizontal" });

  // The point of sale owns the whole screen (destinations.ts: `chrome: "pos"`)
  // and this bar must never show over it. `usePathname` is null during the
  // initial server render in this shell (see ConditionalAdminShellRoot in
  // admin-shell-client.tsx) — treating null as "not on POS" keeps the first
  // client render identical to the server's, and this settles on hydration
  // the same way every other pathname-driven check in this file's siblings
  // does.
  const lastSegment = pathname ? (pathname.split("/").filter(Boolean).at(-1) ?? "") : "";
  const onPosRoute = pathname !== null && isPosSegment(lastSegment);
  if (onPosRoute) return null;

  if (state.surface === "workspace") {
    const role: WorkRole = deriveWorkRole(state.role);
    // `agencies.settings.industry_preset` is not threaded onto the client
    // shell's state today (context.tsx carries no such field) — this mirrors
    // nav-context.ts's own documented fail-open default for missing input.
    // Cafe/solo preset label overrides ("Menu and catalog", "Team",
    // "Services") will not appear on mobile until a later task wires that
    // data onto the bridge, the same gap the sidebar rewrite will hit too.
    const preset = derivePreset({ industryPreset: undefined });
    const navContext: WorkspaceNavContext = {
      workspaceType: state.workspaceType,
      plan: state.plan,
      preset,
      role,
      professional: state.alsoTalent,
      takesReservations: state.visiblePages.includes("reservations"),
      runsEvents: state.visiblePages.includes("events"),
      // The platform POS kill switch (`platform_settings.workspace_pos_enabled`,
      // read by `loadPlatformWorkspaceUi`) now rides the shell bridge as
      // `workspaceUi.posEnabled`, the same channel fabEnabled/tourEnabled/
      // supportEnabled already use. It was a hardcoded `false` here, which made
      // the Open POS row below unreachable no matter what HQ had switched on.
      posEnabled: workspacePosEnabled,
      canManageBilling: canManageBilling(role),
    };

    // The registry carries no per-destination "needs attention" marker today
    // (`Destination` has no such field). These are the same two live signals
    // the desktop nav already surfaces for this purpose.
    const effectiveUnread = bridgeTotalUnread;
    const rosterPending = effectiveRoster.filter(
      (p) => p.state === "awaiting-approval",
    ).length;
    const destinationBadge: Partial<Record<DestinationId, number>> = {
      messages: effectiveUnread || undefined,
      people: rosterPending || undefined,
    };

    // Top 4 by the registry's own mobile ordering (the MW00 board: Today ·
    // Calendar · Clients · Sales), plus More — never a hand-written list, so a
    // destination can't appear here and be missing from the sidebar (or the
    // reverse): both are projections of the same
    // `visibleDestinations(navContext)`.
    const barDestinations = mobileTabs(navContext, 4);
    const go = (d: Destination) => {
      const legacy = toLegacyPage(d);
      if (legacy !== null) {
        setPage(legacy);
        return;
      }
      const href = destinationHref(d, adminBasePath);
      if (href !== null) router.push(href);
    };
    const isActive = (d: Destination) => {
      const legacy = toLegacyPage(d);
      if (legacy !== null) return state.page === legacy;
      const href = destinationHref(d, adminBasePath);
      return pathname !== null && href !== null && pathname === href;
    };
    const tabs = barDestinations.map((d) => ({
      id: d.id,
      label: d.id === "overview" ? copy.t("Today") : copy.t(destinationShortLabel(d, preset)),
      active: isActive(d),
      run: () => go(d),
      icon: d.icon,
      badge: destinationBadge[d.id],
    }));

    // The sheet's non-destination rows. `workspacePosModes` is the workspace's
    // own `pos.locations.default.modes`, already parsed (and already defaulted
    // to `["counter"]` when a workspace has no `pos` settings) by
    // `enabledPosModesFromSettings` on the server — never the `[]` this file
    // used to pass, which could only ever resolve to "no modes".
    const moreActions = mobileMoreActions({
      posEnabled: workspacePosEnabled,
      role: state.role,
      workspaceEnabledModes: workspacePosModes,
    });

    const runMoreAction = (id: (typeof moreActions)[number]["id"]) => {
      if (id === "search") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(FAB_PALETTE_OPEN_EVENT));
        }
      } else if (id === "notifications") {
        openDrawer("notifications");
      } else {
        setPage("pos");
      }
      setMoreOpen(false);
    };

    // Same grouping, same order the sidebar uses — sidebarGroups() already
    // drops the pos group and empty groups. The board (MW00) draws each
    // group as a cloud of chips under its eyebrow, and Settings as the
    // sheet's last line; staff, who have no Settings row (W38), read where
    // setup lives instead.
    const groups = sidebarGroups(navContext);
    // The four destinations on the bar are not repeated as chips (MW00
    // draws Operate without Calendar, Relationships without Clients, Money
    // without Sales); they stay one tap away on the bar itself.
    const onBar = new Set(barDestinations.map((d) => d.id));
    const chipGroups = groups
      .filter((g) => g.group !== "settings")
      .map((g) => ({ ...g, destinations: g.destinations.filter((d) => !onBar.has(d.id)) }))
      .filter((g) => g.destinations.length > 0);
    const settingsRow = groups.find((g) => g.group === "settings")?.destinations[0] ?? null;

    const moreActive = moreOpen;

    return (
      <>
        <WorkspaceSwitchSheet />
        <nav
          ref={bottomNavRef}
          data-tulala-mobile-bottom-nav
          aria-label={`${copy.t(state.surface)} ${copy.t("sections")}`}
          className="tulala-mnav-bar"
        >
          <div className="tulala-mnav-bar-row">
            {tabs.map((tb) => (
              <BottomTab key={tb.id} {...tb} />
            ))}
            <BottomTab
              id="more"
              label={copy.t("More")}
              icon="ellipsis"
              active={moreActive}
              run={() => setMoreOpen(true)}
            />
          </div>
        </nav>
        <MobileSheet
          open={moreOpen}
          name="more"
          title={copy.t("More")}
          closeLabel={t("dashboard.mobile.close")}
          onClose={() => setMoreOpen(false)}
        >
          <button
            type="button"
            className="tulala-mnav-switcher"
            onClick={() => {
              setMoreOpen(false);
              if (typeof window !== "undefined") window.dispatchEvent(new Event(WORKSPACE_SWITCH_OPEN_EVENT));
            }}
          >
            <span aria-hidden className="tulala-mnav-switcher-avatar">
              {effectiveTenant.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="tulala-mnav-switcher-text">
              <span className="tulala-mnav-switcher-name">{effectiveTenant.name}</span>
              <span className="tulala-mnav-role-chip" role="status" aria-label={`${copy.t("Role")}: ${copy.t(WORK_ROLE_LABEL[role])}`}>
                {copy.t(WORK_ROLE_LABEL[role])} · {t("dashboard.mobile.switch.rowHint")}
              </span>
            </span>
            <Icon name="chevron-down" size={14} stroke={1.75} color="currentColor" />
          </button>

          {chipGroups.map((g) => (
            <div key={g.group}>
              {g.label && <div className="tulala-mnav-group-label">{copy.t(g.label)}</div>}
              <div className="tulala-mnav-chips">
                {g.destinations.map((d) => {
                  const legacy = toLegacyPage(d);
                  // A handful of real canonical routes (orders, the
                  // financials page payments falls back to, exceptions)
                  // are deliberately not in WORKSPACE_PAGES — see
                  // toLegacyPage's doc comment. Those still get a real href
                  // via the registry so they are reachable, just via
                  // navigation instead of the SPA's setPage.
                  const href = legacy === null ? destinationHref(d, adminBasePath) : null;
                  if (legacy === null && href === null) {
                    // `mywork` has no route (destinations.ts): the chip opens
                    // the screen with the sentence (MW26), never a page that
                    // is not there.
                    return (
                      <button
                        key={d.id}
                        type="button"
                        title={t("dashboard.mobile.myWorkNotBuilt")}
                        className="tulala-mnav-row"
                        onClick={() => {
                          setMoreOpen(false);
                          setMyWorkOpen(true);
                        }}
                      >
                        {copy.t(destinationLabel(d, preset))}
                      </button>
                    );
                  }
                  const active = isActive(d);
                  const badge = destinationBadge[d.id];
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={active ? "tulala-mnav-row tulala-mnav-row--active" : "tulala-mnav-row"}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        go(d);
                        setMoreOpen(false);
                      }}
                    >
                      <span className="tulala-mnav-row-label">{copy.t(destinationLabel(d, preset))}</span>
                      {badge && badge > 0 && (
                        <span className="tulala-mnav-badge">{badge > 9 ? "9+" : badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="tulala-mnav-chips">
            {moreActions.map((a) => (
              <button
                key={a.id}
                type="button"
                className="tulala-mnav-row"
                data-mnav-action={a.id}
                onClick={() => runMoreAction(a.id)}
              >
                <Icon name={a.icon} size={14} stroke={1.7} color="currentColor" />
                <span className="tulala-mnav-row-label">{copy.t(a.label)}</span>
              </button>
            ))}
          </div>

          <div className="tulala-mnav-foot">
            {settingsRow ? (
              <button
                type="button"
                className="tulala-mnav-foot-row"
                onClick={() => {
                  go(settingsRow);
                  setMoreOpen(false);
                }}
              >
                <Icon name="settings" size={14} stroke={1.75} color="currentColor" />
                {copy.t(destinationLabel(settingsRow, preset))} · {t("dashboard.mobile.ownerOnly")}
              </button>
            ) : (
              <div className="tulala-mnav-foot-row">
                <Icon name="settings" size={14} stroke={1.75} color="currentColor" />
                {copy.t("Setup is owner-only · ask the owner")}
              </div>
            )}
            {/* Feedback row — same behaviour as the talent branch's copy,
                drawn from this branch's own class sheet rather than a
                duplicated style object. */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("tulala-open-feedback"));
                }
                setMoreOpen(false);
              }}
              className="tulala-mnav-foot-row tulala-mnav-feedback text-admin-ink"
            >
              <span className="tulala-mnav-feedback-icon text-admin-ink-muted">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4.5h10v6.5l-3 .5-2 2-2-2H3v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              {copy.t("Send feedback")}
            </button>
          </div>
        </MobileSheet>
        <MobileSheet
          open={myWorkOpen}
          name="mywork"
          title={t("dashboard.mobile.myWork.title")}
          closeLabel={t("dashboard.mobile.close")}
          onClose={() => setMyWorkOpen(false)}
          footer={
            <button type="button" onClick={() => setMyWorkOpen(false)} className={MOBILE_BUTTON_SECONDARY}>
              {t("dashboard.mobile.close")}
            </button>
          }
        >
          <p className="m-0 text-admin-13 leading-[1.5] text-admin-ink">{t("dashboard.mobile.myWork.sentence")}</p>
          <p className="m-0 text-admin-12h leading-[1.5] text-admin-ink-muted">{t("dashboard.mobile.myWork.detail")}</p>
        </MobileSheet>
        <style>{MOBILE_NAV_CSS}</style>
      </>
    );
  }

  if (state.surface === "talent") {
    // Per-tab unread badges — live bridge count only (matches the desktop
    // talent rail, which reads bridgeTalentUnread). 0 shows no badge; no
    // fixture fallback (was echoing TALENT_NOTIFICATION_COUNT on live 0).
    const TALENT_TAB_BADGE: Partial<Record<TalentPage, number>> = {
      messages: bridgeTalentUnread || undefined,
    };
    const tabs = TALENT_PAGES.map((p) => ({
      id: p,
      label: copy.t(TALENT_PAGE_META[p].label),
      active: state.talentPage === p,
      run: () => setTalentPage(p as TalentPage),
      icon: TALENT_TAB_ICON[p as TalentPage] ?? "info",
      badge: TALENT_TAB_BADGE[p as TalentPage],
    }));

    const visible = tabs.slice(0, MOBILE_TAB_LIMIT - 1);
    const overflow = tabs.slice(MOBILE_TAB_LIMIT - 1);
    const hasOverflow = overflow.length > 0;
    const moreActive = overflow.some((t) => t.active);

    return (
      <>
        <nav
          ref={bottomNavRef}
          data-tulala-mobile-bottom-nav
          aria-label={`${copy.t(state.surface)} ${copy.t("sections")}`}
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            background: "#fff",
            borderTop: `1px solid ${COLORS.borderSoft}`,
            zIndex: Z.topbar,
            display: "none",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            fontFamily: FONTS.body,
          }}
        >
          <div style={{ display: "flex", alignItems: "stretch", height: 64 }}>
            {visible.map((t) => (
              <BottomTab key={t.id} {...t} />
            ))}
            {hasOverflow && (
              <BottomTab
                id="more"
                label={copy.t("More")}
                icon="ellipsis"
                active={moreActive}
                run={() => setMoreOpen(true)}
              />
            )}
          </div>
        </nav>
        {moreOpen && (
          <div
            onClick={() => setMoreOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(11,11,13,0.36)",
              zIndex: Z.modalBackdrop,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={copy.t("More sections")}
              style={{
                width: "100%",
                background: "#fff",
                borderRadius: "16px 16px 0 0",
                padding: "8px 0 max(env(safe-area-inset-bottom, 0px), 12px)",
                boxShadow: "0 -10px 30px rgba(11,11,13,0.18)",
                fontFamily: FONTS.body,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 999,
                  background: "rgba(11,11,13,0.18)",
                  margin: "8px auto 12px",
                }}
              />
              {overflow.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    t.run();
                    setMoreOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "14px 18px",
                    background: t.active ? COLORS.accentSoft : "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 15,
                    fontWeight: 500,
                    color: t.active ? COLORS.accentDeep : COLORS.ink,
                    textAlign: "left",
                  }}
                >
                  <Icon name={t.icon} size={16} stroke={1.7} color={t.active ? COLORS.accent : COLORS.inkMuted} />
                  {t.label}
                </button>
              ))}
              {/* Divider + auxiliary actions (feedback, help) — keep them
                  inside the same menu instead of as floating buttons that
                  cover content. */}
              <div style={{ height: 1, background: COLORS.borderSoft, margin: "6px 12px" }} />
              <button
                type="button"
                onClick={() => {
                  // Trigger the FeedbackButton via a custom event the
                  // primitive listens to. Simple + decoupled.
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("tulala-open-feedback"));
                  }
                  setMoreOpen(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", fontFamily: FONTS.body, fontSize: 15, fontWeight: 500, textAlign: "left" }} className="text-admin-ink">
                <span style={{ display: "inline-flex" }} className="text-admin-ink-muted">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4.5h10v6.5l-3 .5-2 2-2-2H3v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                {copy.t("Send feedback")}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // WP2 — platform SPA surface deleted; surface is workspace|talent only,
  // both handled above. This fallback is unreachable but keeps the
  // component total.
  return null;
}

function BottomTab({
  label,
  icon,
  active,
  run,
  badge,
}: {
  id: string;
  label: string;
  icon: AdminShellIconName;
  active: boolean;
  run: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={run}
      className={active ? "tulala-bottom-tab tulala-mnav-tab tulala-mnav-tab--active" : "tulala-bottom-tab tulala-mnav-tab"}
      aria-current={active ? "page" : undefined}
    >
      <span aria-hidden className="tulala-mnav-tab-icon">
        <Icon name={icon} size={18} stroke={1.75} color="currentColor" />
        {badge && badge > 0 && <span className="tulala-mnav-tab-badge">{badge > 9 ? "9+" : badge}</span>}
      </span>
      <span className="tulala-mnav-tab-label">{label}</span>
    </button>
  );
}

const TALENT_TAB_ICON: Partial<Record<TalentPage, AdminShellIconName>> = {
  today: "bolt",
  messages: "mail",
  calendar: "calendar",
  money: "credit",       // mirrors desktop rail (talent.tsx)
  profile: "user",
  "public-page": "globe",
  services: "briefcase", // mirrors desktop rail (talent.tsx)
  reviews: "star",
  settings: "info",
  // legacy aliases
  inbox: "mail",
  activity: "sparkle",
  reach: "search",
  agencies: "team",
};
