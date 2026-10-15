"use client";

/**
 * GuestInquiryTray (TUL-1066): the expandable list behind the persistent tray
 * bar. Lists every talent in the inquiry (with Remove, through the launcher's
 * unified remove path) and every catalog item added this session (no remove:
 * there is no server action to drop a catalog line).
 */

import { useCartTalentRegistry } from "./cart-talent-registry";
import { useAddedCatalogItems } from "./guest-added-items-store";
import { useCartTalents } from "./use-cart-talents";
import { FONT, type paletteFor } from "./mini-chat-styles";

type Palette = ReturnType<typeof paletteFor>;

export function useInquiryTrayCount(): number {
  const talents = useCartTalents(useCartTalentRegistry());
  return talents.length + useAddedCatalogItems().length;
}

export function GuestInquiryTrayList({
  t, C, onRemoveCartTalent,
}: {
  t: (key: string) => string;
  C: Palette;
  onRemoveCartTalent?: (talentProfileId: string) => void;
}) {
  const talents = useCartTalents(useCartTalentRegistry());
  const added = useAddedCatalogItems();
  const row = { display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", fontFamily: FONT, fontSize: 13, color: C.ink } as const;
  return (
    <ul data-guest-inquiry-tray-list="" role="list" style={{ listStyle: "none", margin: 0, padding: "4px 0", borderBottom: `1px solid ${C.borderSoft}`, maxHeight: 220, overflowY: "auto" }}>
      {talents.map((tl) => (
        <li key={tl.talentProfileId} style={row}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tl.displayName}</span>
          {onRemoveCartTalent ? (
            <button type="button" onClick={() => onRemoveCartTalent(tl.talentProfileId)} style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 8, background: "transparent", color: C.inkMuted, padding: "3px 9px", fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
              {t("public.guestChat.dockTrayRemove")}
            </button>
          ) : null}
        </li>
      ))}
      {added.map((it) => (
        <li key={it.id} style={row}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
          {it.priceLabel ? <span style={{ fontSize: 11.5, color: C.inkDim }}>{it.priceLabel}</span> : null}
        </li>
      ))}
    </ul>
  );
}
