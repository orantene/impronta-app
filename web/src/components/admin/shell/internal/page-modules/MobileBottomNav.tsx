"use client";

import { useRef, useState } from "react";
import { useDashboardText } from "../dashboard-i18n";
import { Divider, Icon, useRovingTabindex } from "../primitives";
import { CLIENT_PAGES, CLIENT_PAGE_META, COLORS, ENTITY_TYPE_META, FONTS, PAGE_META, PLATFORM_PAGES, PLATFORM_PAGE_META, TALENT_NOTIFICATION_COUNT, TALENT_PAGES, TALENT_PAGE_META, TRANSITION, WORKSPACE_NOTIFICATION_COUNT, WORKSPACE_PAGES, Z, useAdminShell } from "../state";
import type { ClientPage, PlatformPage, TalentPage, WorkspacePage } from "../state";
import { MOBILE_TAB_LIMIT } from "./SurfaceRouter";


export function MobileBottomNav() {
  const {
    state,
    setPage,
    setTalentPage,
    setClientPage,
    setPlatformPage,
    effectiveRoster,
    totalUnread: bridgeTotalUnread,
  } = useAdminShell();
  const copy = useDashboardText();
  const [moreOpen, setMoreOpen] = useState(false);
  // WS-12.6 — left/right arrows move between bottom nav tabs
  const bottomNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(bottomNavRef, "button", { orientation: "horizontal" });

  const tabs = (() => {
    if (state.surface === "workspace") {
      // Mobile nav badges — surface pending-approval count on the Roster tab
      // + unread message count on Messages, matching the desktop topbar nav.
      // Roster badge derived from effectiveRoster (same source as the page body)
      // so it never echoes fixture data when live mode shows 0 talent.
      const effectiveUnread = bridgeTotalUnread > 0 ? bridgeTotalUnread : WORKSPACE_NOTIFICATION_COUNT;
      const rosterPending = effectiveRoster.filter(
        (p) => p.state === "awaiting-approval"
      ).length;
      const WORKSPACE_TAB_BADGE: Partial<Record<WorkspacePage, number>> = {
        roster: rosterPending || undefined,
        messages: effectiveUnread || undefined,
      };
      return WORKSPACE_PAGES.map((p) => ({
        id: p,
        label: p === "talent" ? copy.t(ENTITY_TYPE_META[state.entityType].rosterLabel) : copy.t(PAGE_META[p].label),
        active: state.page === p,
        run: () => setPage(p as WorkspacePage),
        icon: WORKSPACE_TAB_ICON[p as WorkspacePage] ?? "info",
        badge: WORKSPACE_TAB_BADGE[p as WorkspacePage],
      }));
    }
    if (state.surface === "talent") {
      // Per-tab unread badges — derived from real NOTIFICATIONS data.
      const TALENT_TAB_BADGE: Partial<Record<TalentPage, number>> = {
        messages: TALENT_NOTIFICATION_COUNT || undefined,
      };
      return TALENT_PAGES.map((p) => ({
        id: p,
        label: copy.t(TALENT_PAGE_META[p].label),
        active: state.talentPage === p,
        run: () => setTalentPage(p as TalentPage),
        icon: TALENT_TAB_ICON[p as TalentPage] ?? "info",
        badge: TALENT_TAB_BADGE[p as TalentPage],
      }));
    }
    if (state.surface === "client") {
      // Client surface badges — unread on Messages (mock 2 for prototype).
      const CLIENT_TAB_BADGE: Partial<Record<ClientPage, number>> = {
        messages: 2,
      };
      return CLIENT_PAGES.map((p) => ({
        id: p,
        label: copy.t(CLIENT_PAGE_META[p].label),
        active: state.clientPage === p,
        run: () => setClientPage(p as ClientPage),
        icon: CLIENT_TAB_ICON[p as ClientPage] ?? "info",
        badge: CLIENT_TAB_BADGE[p as ClientPage],
      }));
    }
    return PLATFORM_PAGES.map((p) => ({
      id: p,
      label: copy.t(PLATFORM_PAGE_META[p].label),
      active: state.platformPage === p,
      run: () => setPlatformPage(p as PlatformPage),
      icon: "info" as const,
    }));
  })();

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
              icon="info"
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

function BottomTab({
  label,
  icon,
  active,
  run,
  badge,
}: {
  id: string;
  label: string;
  icon: "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit" | "x" | "chevron-right" | "chevron-down";
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

const WORKSPACE_TAB_ICON: Partial<Record<WorkspacePage, "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit">> = {
  overview: "bolt",
  messages: "mail",
  calendar: "calendar",
  roster: "team",
  clients: "user",
  pitches: "bolt",
  operations: "search",
  production: "sparkle",
  settings: "info",
  // legacy aliases
  inbox: "mail",
  work: "info",
  talent: "team",
  site: "sparkle",
  billing: "credit",
  workspace: "info",
};

const TALENT_TAB_ICON: Partial<Record<TalentPage, "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit">> = {
  today: "bolt",
  messages: "mail",
  profile: "user",
  reviews: "sparkle",
  calendar: "calendar",
  agencies: "team",
  "public-page": "sparkle",
  settings: "info",
  // legacy aliases
  inbox: "mail",
  activity: "sparkle",
  reach: "search",
};

const CLIENT_TAB_ICON: Partial<Record<ClientPage, "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit">> = {
  today: "bolt",
  messages: "mail",
  discover: "search",
  shortlists: "team",
  inquiries: "mail",
  bookings: "calendar",
  settings: "info",
};
