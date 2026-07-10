"use client";

/**
 * GuestDockViewSwitcher — Wave 2 (W2-A) segmented view switcher for the guest
 * panel dock: Chat · Lineup · Projects. Rendered as a slim band directly under
 * GuestPanelHeader (both compact and expanded modes); the active segment picks
 * which body MiniChatPanelColumn renders. Chat is the default and renders
 * today's conversation stack unchanged.
 *
 * House rules: tenant accent only (no gold/rust), dark-aware via the injected
 * palette, no em dashes, honest counts (real cart size / real project count).
 */

import type { Translator } from "@/i18n/interpolate";

import type { GuestDockView } from "./guest-dock-view";
import { FONT, readableOn, type Palette } from "./mini-chat-styles";

export type GuestDockViewSwitcherProps = {
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

const VIEWS: Array<{ view: GuestDockView; labelKey: string }> = [
  { view: "chat", labelKey: "public.guestChat.dockViewChat" },
  { view: "lineup", labelKey: "public.guestChat.dockViewLineup" },
  { view: "projects", labelKey: "public.guestChat.dockViewProjects" },
];

export function GuestDockViewSwitcher({
  active,
  onChange,
  accent,
  C,
  t,
  lineupCount = 0,
  projectsCount = 0,
}: GuestDockViewSwitcherProps) {
  const countFor = (view: GuestDockView): number =>
    view === "lineup" ? lineupCount : view === "projects" ? projectsCount : 0;

  return (
    <div
      role="tablist"
      aria-label={t("public.guestChat.dockViewSwitcherAria")}
      style={{
        display: "flex",
        gap: 4,
        padding: "7px 12px",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        flexShrink: 0,
      }}
    >
      {VIEWS.map(({ view, labelKey }) => {
        const isActive = view === active;
        const count = countFor(view);
        return (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              if (!isActive) onChange(view);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 999,
              border: `1px solid ${isActive ? `${accent}55` : "transparent"}`,
              background: isActive ? `${accent}16` : "transparent",
              color: isActive ? accent : C.inkMuted,
              fontFamily: FONT,
              fontSize: 11.5,
              fontWeight: isActive ? 700 : 500,
              lineHeight: 1,
              cursor: isActive ? "default" : "pointer",
              transition: "background 120ms, color 120ms",
            }}
          >
            {t(labelKey)}
            {count > 0 && (
              <span
                aria-hidden
                style={{
                  minWidth: 15,
                  height: 15,
                  padding: "0 4px",
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isActive ? accent : C.surfaceCool,
                  color: isActive ? readableOn(accent) : C.inkMuted,
                  fontSize: 9.5,
                  fontWeight: 700,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
