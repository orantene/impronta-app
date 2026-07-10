"use client";

/**
 * GuestDockNav — DOCK v2 bottom tab bar (Home · Chat · Lineup · Projects).
 *
 * Replaces the old top segmented switcher (Chat/Lineup/Projects). Modeled on the
 * Intercom/tawk messenger bottom bar: a slim, always-present row of icon+label
 * tabs pinned to the base of the panel, so navigation is one clean control and
 * never competes with the header. The active tab paints in the tenant accent;
 * Lineup/Projects show a live count badge when non-empty.
 *
 * House rules: tenant accent only (no gold/rust), dark-aware via the injected
 * palette, honest counts, reduced-motion safe, no em dashes. Sized to never clip
 * at 380px (four equal flex cells, icon over a short label).
 */

import { Home, MessageCircle, Users, Sparkles } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";

import type { GuestDockView } from "./guest-dock-view";
import { FONT, readableOn, type Palette } from "./mini-chat-styles";

export type GuestDockNavProps = {
  active: GuestDockView;
  onChange: (view: GuestDockView) => void;
  accent: string;
  C: Palette;
  t: Translator;
  /** Live inquiry-lineup size (cart). 0 hides the badge. */
  lineupCount?: number;
  /** Live project (inquiry) count. 0 hides the badge. */
  projectsCount?: number;
};

const TABS: Array<{
  view: GuestDockView;
  labelKey: string;
  Icon: typeof Home;
}> = [
  { view: "home", labelKey: "public.guestChat.dockNavHome", Icon: Home },
  { view: "chat", labelKey: "public.guestChat.dockNavChat", Icon: MessageCircle },
  { view: "lineup", labelKey: "public.guestChat.dockNavLineup", Icon: Users },
  { view: "projects", labelKey: "public.guestChat.dockNavProjects", Icon: Sparkles },
];

export function GuestDockNav({
  active,
  onChange,
  accent,
  C,
  t,
  lineupCount = 0,
  projectsCount = 0,
}: GuestDockNavProps) {
  const countFor = (view: GuestDockView): number =>
    view === "lineup" ? lineupCount : view === "projects" ? projectsCount : 0;

  return (
    <div
      role="tablist"
      aria-label={t("public.guestChat.dockNavAria")}
      style={{
        display: "flex",
        alignItems: "stretch",
        borderTop: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        flexShrink: 0,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map(({ view, labelKey, Icon }) => {
        const isActive = view === active;
        const count = countFor(view);
        return (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={t(labelKey)}
            onClick={() => {
              if (!isActive) onChange(view);
            }}
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: "9px 2px 8px",
              border: "none",
              background: "transparent",
              color: isActive ? accent : C.inkMuted,
              cursor: isActive ? "default" : "pointer",
              fontFamily: FONT,
              transition: "color 120ms",
            }}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon size={19} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
              {count > 0 && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: -6,
                    left: "100%",
                    marginLeft: -7,
                    minWidth: 14,
                    height: 14,
                    padding: "0 3px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: accent,
                    color: readableOn(accent),
                    fontSize: 9,
                    fontWeight: 700,
                    boxShadow: `0 0 0 2px ${C.surfaceFaint}`,
                  }}
                >
                  {count}
                </span>
              )}
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: 0.1,
                lineHeight: 1,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t(labelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
