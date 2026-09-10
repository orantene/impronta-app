"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { modesForPerson } from "@/lib/pos/modes";
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
  } = useAdminShell();
  const copy = useDashboardText();
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
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
      // The platform POS kill switch (lib/platform/workspace-ui.ts) is not on
      // the client bridge yet either — its own doc comment says "a later
      // task wires this onto the workspace shell's client bridge". Defaulting
      // to false matches the switch's own default-off, so the Open POS row
      // below stays correctly hidden until that wiring lands.
      posEnabled: false,
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

    // Top 4 by the registry's own mobile ordering, plus More — never a
    // hand-written list, so a destination can't appear here and be missing
    // from the sidebar (or the reverse): both are projections of the same
    // `visibleDestinations(navContext)`.
    const barDestinations = mobileTabs(navContext, 4);
    const tabs = barDestinations.map((d) => {
      const legacy = toLegacyPage(d);
      const label = d.id === "overview" ? copy.t("Today") : copy.t(destinationShortLabel(d, preset));
      return {
        id: d.id,
        label,
        active: legacy !== null && state.page === legacy,
        run: () => {
          if (legacy) setPage(legacy);
        },
        icon: d.icon,
        badge: destinationBadge[d.id],
      };
    });

    const posModes = navContext.posEnabled
      ? modesForPerson({ role: state.role, workspaceEnabledModes: [] })
      : [];
    const showOpenPos = navContext.posEnabled && posModes.length > 0;

    // Same grouping, same order the sidebar uses — sidebarGroups() already
    // drops the pos group and empty groups.
    const groups = sidebarGroups(navContext);

    const moreActive = moreOpen;

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
            {tabs.map((t) => (
              <BottomTab key={t.id} {...t} />
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
        {moreOpen && (
          <div
            className="tulala-mnav-backdrop"
            onClick={() => setMoreOpen(false)}
          >
            <div
              className="tulala-mnav-sheet"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={copy.t("More sections")}
            >
              <div className="tulala-mnav-grabber" />

              <button
                type="button"
                className="tulala-mnav-switcher"
                onClick={() => {
                  openDrawer("tenant-switcher");
                  setMoreOpen(false);
                }}
              >
                <Icon name="team" size={16} stroke={1.7} />
                <span>{copy.t("Switch workspace")}</span>
              </button>
              <div
                className="tulala-mnav-role-chip"
                role="status"
                aria-label={`${copy.t("Role")}: ${copy.t(WORK_ROLE_LABEL[role])}`}
              >
                {copy.t(WORK_ROLE_LABEL[role])}
              </div>

              <div className="tulala-mnav-divider" />

              {groups.map((g) => (
                <div key={g.group}>
                  {g.label && (
                    <div className="tulala-mnav-group-label">{copy.t(g.label)}</div>
                  )}
                  {g.destinations.map((d) => {
                    const legacy = toLegacyPage(d);
                    // A handful of real canonical routes (orders, the
                    // financials page payments falls back to, exceptions)
                    // are deliberately not in WORKSPACE_PAGES — see
                    // toLegacyPage's doc comment. Those still get a real href
                    // via the registry so they are reachable, just via
                    // navigation instead of the SPA's setPage.
                    const href = legacy === null ? destinationHref(d, adminBasePath) : null;
                    if (legacy === null && href === null) return null;
                    const active =
                      legacy !== null
                        ? state.page === legacy
                        : pathname !== null && href !== null && pathname === href;
                    const badge = destinationBadge[d.id];
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={
                          active ? "tulala-mnav-row tulala-mnav-row--active" : "tulala-mnav-row"
                        }
                        aria-current={active ? "page" : undefined}
                        onClick={() => {
                          if (legacy !== null) {
                            setPage(legacy);
                          } else if (href !== null) {
                            router.push(href);
                          }
                          setMoreOpen(false);
                        }}
                      >
                        <Icon name={d.icon} size={16} stroke={1.7} />
                        <span className="tulala-mnav-row-label">
                          {copy.t(destinationLabel(d, preset))}
                        </span>
                        {badge && badge > 0 && (
                          <span className="tulala-mnav-badge">{badge > 9 ? "9+" : badge}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="tulala-mnav-divider" />

              <button
                type="button"
                className="tulala-mnav-row"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new Event(FAB_PALETTE_OPEN_EVENT));
                  }
                  setMoreOpen(false);
                }}
              >
                <Icon name="search" size={16} stroke={1.7} />
                <span className="tulala-mnav-row-label">{copy.t("Search")}</span>
              </button>
              <button
                type="button"
                className="tulala-mnav-row"
                onClick={() => {
                  openDrawer("notifications");
                  setMoreOpen(false);
                }}
              >
                <Icon name="bell" size={16} stroke={1.7} />
                <span className="tulala-mnav-row-label">{copy.t("Notifications")}</span>
              </button>
              {showOpenPos && (
                <button
                  type="button"
                  className="tulala-mnav-row"
                  onClick={() => {
                    setPage("pos");
                    setMoreOpen(false);
                  }}
                >
                  <Icon name="credit" size={16} stroke={1.7} />
                  <span className="tulala-mnav-row-label">{copy.t("Open POS")}</span>
                </button>
              )}

              <div className="tulala-mnav-divider" />

              {/* Feedback row — unchanged from the prior implementation. */}
              <button
                type="button"
                onClick={() => {
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
        <style>{`
          .tulala-mnav-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(11,11,13,0.36);
            z-index: ${Z.modalBackdrop};
            display: flex;
            align-items: flex-end;
            justify-content: center;
          }
          .tulala-mnav-sheet {
            width: 100%;
            max-height: 82vh;
            overflow-y: auto;
            background: #fff;
            border-radius: 16px 16px 0 0;
            padding: 8px 0 max(env(safe-area-inset-bottom, 0px), 12px);
            box-shadow: 0 -10px 30px rgba(11,11,13,0.18);
            font-family: ${FONTS.body};
          }
          .tulala-mnav-grabber {
            width: 36px;
            height: 4px;
            border-radius: 999px;
            background: rgba(11,11,13,0.18);
            margin: 8px auto 12px;
          }
          .tulala-mnav-switcher {
            display: flex;
            align-items: center;
            gap: 10px;
            width: calc(100% - 24px);
            margin: 0 12px 4px;
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid ${COLORS.borderSoft};
            background: ${COLORS.surfaceAlt};
            color: ${COLORS.ink};
            font-family: ${FONTS.body};
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }
          .tulala-mnav-role-chip {
            display: inline-flex;
            align-items: center;
            margin: 8px 12px 4px;
            padding: 4px 10px;
            border-radius: 999px;
            background: ${COLORS.borderSoft};
            color: ${COLORS.inkMuted};
            font-family: ${FONTS.body};
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .tulala-mnav-divider {
            height: 1px;
            background: ${COLORS.borderSoft};
            margin: 6px 12px;
          }
          .tulala-mnav-group-label {
            padding: 10px 18px 4px;
            font-family: ${FONTS.body};
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: ${COLORS.inkMuted};
          }
          .tulala-mnav-row {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 12px 18px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-family: ${FONTS.body};
            font-size: 15px;
            font-weight: 500;
            color: ${COLORS.ink};
            text-align: left;
            transition: background ${TRANSITION.sm};
          }
          .tulala-mnav-row--active {
            background: ${COLORS.accentSoft};
            color: ${COLORS.accentDeep};
            font-weight: 600;
          }
          .tulala-mnav-row-label {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .tulala-mnav-badge {
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            border-radius: 999px;
            background: ${COLORS.coral};
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            line-height: 18px;
            text-align: center;
            font-variant-numeric: tabular-nums;
          }
        `}</style>
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
      className="tulala-bottom-tab"
      aria-current={active ? "page" : undefined}
      style={{
        flex: 1,
        // Active: soft accent wash covers the whole tab (icon + label) —
        //   no more "icon-only" half-button feel.
        // Inactive: transparent base; hover/press adds a subtle wash so
        //   it visibly behaves like a button.
        background: active ? COLORS.accentSoft : "transparent",
        border: "none",
        borderRadius: 14,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        padding: "7px 6px 6px",
        margin: "4px 3px",
        color: active ? COLORS.accentDeep : COLORS.inkMuted,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.05,
        lineHeight: 1.2,
        position: "relative",
        transition: `background ${TRANSITION.sm}, color ${TRANSITION.sm}`,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={icon}
          size={18}
          stroke={active ? 2 : 1.7}
          color={active ? COLORS.accent : COLORS.inkMuted}
        />
        {badge && badge > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -4,
              right: -7,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: COLORS.coral,
              color: "#fff",
              fontSize: 9.5,
              fontWeight: 700,
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontVariantNumeric: "tabular-nums",
              boxShadow: "0 0 0 1.5px #fff",
            }}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span style={{
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 76,
        lineHeight: 1.3,
        // Reserve space for descenders so y/g/p don't clip on iOS where
        // line-box rounds down. paddingBottom + display:block guarantees
        // the descender area is part of the layout box.
        display: "block",
      }}>
        {label}
      </span>
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
