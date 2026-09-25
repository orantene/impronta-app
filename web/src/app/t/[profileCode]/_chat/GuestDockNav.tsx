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

import { Briefcase, Calendar, MessageCircle } from "lucide-react";

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
  /** L13: tenant switch, show the Items (lineup) tab. Default on. */
  itemsTab?: boolean;
  /** L13: per-business label for the Items tab; null → the i18n default. */
  itemsLabel?: string | null;
  /** Live project (inquiry) count. 0 hides the badge. */
  projectsCount?: number;
};

const TABS: Array<{
  view: GuestDockView;
  labelKey: string;
  Icon: typeof MessageCircle;
}> = [
  { view: "chat", labelKey: "public.guestChat.dockNavChat", Icon: MessageCircle },
  { view: "lineup", labelKey: "public.guestChat.dockNavLineup", Icon: Briefcase },
  { view: "projects", labelKey: "public.guestChat.dockNavProjects", Icon: Calendar },
];

export function GuestDockNav({
  active,
  onChange,
  accent,
  C,
  t,
  lineupCount = 0,
  projectsCount = 0,
  itemsTab = true,
  itemsLabel = null,
}: GuestDockNavProps) {
  const countFor = (view: GuestDockView): number =>
    view === "lineup" ? lineupCount : view === "projects" ? projectsCount : 0;
  // L13: the Lineup tab is the Items tab, labelled per business (Talent &
  // services / Your order / Tickets & tables / Services / Items) and hidden
  // when the tenant switched it off.
  const tabs = itemsTab ? TABS : TABS.filter((tab) => tab.view !== "lineup");
  const labelFor = (view: GuestDockView, labelKey: string): string =>
    view === "lineup" && itemsLabel ? itemsLabel : t(labelKey);

  return (
    <div
      role="tablist"
      aria-label={t("public.guestChat.dockNavAria")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        margin: "0 16px 8px",
        padding: 4,
        borderRadius: 999,
        background: C.surfaceFaint,
        flexShrink: 0,
      }}
    >
      {tabs.map(({ view, labelKey, Icon }) => {
        const isActive = view === active;
        const count = countFor(view);
        return (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={labelFor(view, labelKey)}
            onClick={() => {
              if (!isActive) onChange(view);
            }}
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "inline-flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 10px",
              border: "none",
              borderRadius: 999,
              background: isActive ? "#fff" : "transparent",
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
              {labelFor(view, labelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
