"use client";

/**
 * TUL-1066 slice: a persistent inquiry tray. "In your inquiry" used to live at the bottom of
 * each scrolling tab (and not at all on Talk / Yours). This strip shows the count on every
 * dock tab and opens the lineup (Items) tab where the inquiry is reviewed and sent.
 */

import { useState } from "react";

import { useFavorites } from "@/lib/talent-cards/use-favorites";

import type { paletteFor } from "./mini-chat-styles";
import { GuestInquiryTrayList, useInquiryTrayCount } from "./GuestInquiryTray";
import { inquiryTrayVisible } from "./guest-dock-inquiry-tray";
import type { GuestDockView } from "./guest-dock-view";

type Palette = ReturnType<typeof paletteFor>;

export function GuestDockInquiryTray({
  activeView, enabled, t, C, accent, accentInk, onOpen, onRemoveCartTalent, onSend,
}: {
  /** TUL-1066: the one primary step from the tray, sending what is in it (jumps to the chat that carries the draft). */
  onSend?: () => void;
  activeView: GuestDockView;
  enabled: boolean;
  t: (key: string) => string;
  C: Palette;
  accent: string;
  accentInk: string;
  onOpen: () => void;
  onRemoveCartTalent?: (talentProfileId: string) => void;
}) {
  const count = useInquiryTrayCount();
  const savedCount = useFavorites().favoriteIds.length;
  const [open, setOpen] = useState(false);
  if (!inquiryTrayVisible({ count, activeView, enabled, savedCount })) return null;
  return (
    <>
    <div
      data-guest-inquiry-tray=""
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 14px", borderBottom: `1px solid ${C.borderSoft}`, background: `${accent}10` }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
        {count > 0 ? t("public.guestChat.dockTrayLabel").replace("{n}", String(count)) : null}
        {savedCount > 0 ? <span data-guest-tray-saved="" style={{ fontWeight: 500, color: C.inkDim }}>{`${count > 0 ? " · " : ""}${t("public.guestChat.dockLineupShelfSaved")} ${savedCount}`}</span> : null}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ border: 0, borderRadius: 999, padding: "6px 14px", background: accent, color: accentInk, font: "600 12.5px inherit", cursor: "pointer" }}
      >
        {t("public.guestChat.dockTrayOpen")}
      </button>
    </div>
    {open ? <GuestInquiryTrayList t={t} C={C} onRemoveCartTalent={onRemoveCartTalent} /> : null}
    {open && onSend ? (
      <button
        type="button"
        data-guest-inquiry-tray-send=""
        onClick={onSend}
        style={{ margin: "4px 14px", border: 0, borderRadius: 999, padding: "9px 16px", background: accent, color: accentInk, font: "600 13px inherit", cursor: "pointer" }}
      >
        {t("public.guestChat.dockTraySend")}
      </button>
    ) : null}
    {open ? (
      <button type="button" onClick={onOpen} style={{ border: 0, background: "transparent", color: accent, font: "600 12.5px inherit", padding: "6px 14px", cursor: "pointer", textAlign: "left" }}>
        {t("public.guestChat.dockTrayOpenLineup")}
      </button>
    ) : null}
    </>
  );
}
