"use client";

/**
 * TUL-1066 slice: a persistent inquiry tray. "In your inquiry" used to live at the bottom of
 * each scrolling tab (and not at all on Talk / Yours). This strip shows the count on every
 * dock tab and opens the lineup (Items) tab where the inquiry is reviewed and sent.
 */

import type { paletteFor } from "./mini-chat-styles";
import { inquiryTrayVisible } from "./guest-dock-inquiry-tray";
import type { GuestDockView } from "./guest-dock-view";

type Palette = ReturnType<typeof paletteFor>;

export function GuestDockInquiryTray({
  count, activeView, enabled, t, C, accent, accentInk, onOpen,
}: {
  count: number;
  activeView: GuestDockView;
  enabled: boolean;
  t: (key: string) => string;
  C: Palette;
  accent: string;
  accentInk: string;
  onOpen: () => void;
}) {
  if (!inquiryTrayVisible({ count, activeView, enabled })) return null;
  return (
    <div
      data-guest-inquiry-tray=""
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 14px", borderBottom: `1px solid ${C.borderSoft}`, background: `${accent}10` }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t("public.guestChat.dockTrayLabel").replace("{n}", String(count))}</span>
      <button
        type="button"
        onClick={onOpen}
        style={{ border: 0, borderRadius: 999, padding: "6px 14px", background: accent, color: accentInk, font: "600 12.5px inherit", cursor: "pointer" }}
      >
        {t("public.guestChat.dockTrayOpen")}
      </button>
    </div>
  );
}
