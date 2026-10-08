"use client";

/**
 * CardDockPanel: the card SKIN of the one guest dock. It draws the same
 * `MiniChatPanelColumn` the default skin draws, in the same two modes:
 *
 *   mini      one column in the card frame (phone: bottom sheet)
 *   expanded  desktop: the default's two-pane layout (conversation list on the
 *             left, the thread column on the right), painted from the site's
 *             tokens; phone: the frame goes full screen
 *
 * Presentation only. Nothing here reads or writes thread data.
 */

import type { CSSProperties } from "react";

import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";

import { CardDockFrame } from "./CardDockFrame";
import { ExpandedChatLayout } from "./ExpandedChatLayout";
import { MiniChatPanelColumn, type MiniChatPanelColumnProps } from "./MiniChatPanelColumn";
import { cardVars } from "./card-dock-skin";

export function CardDockPanel({
  card,
  compact,
  keyboardInsetPx,
  columnProps,
}: {
  card: ChatCardConfig;
  compact: boolean;
  keyboardInsetPx: number;
  columnProps: MiniChatPanelColumnProps;
}) {
  const { brand, accent, accentInk, expanded, onClose } = columnProps;
  const t = createTranslator(brand.locale ?? "en");
  const ariaLabel = interpolate(t("public.guestChat.messageBrandAria"), { brand: brand.talentDisplayName || brand.agencyName });
  const column = <MiniChatPanelColumn {...columnProps} card={card} />;
  if (expanded && !compact) {
    return (
      <div style={{ display: "contents", color: "var(--cc-ink)", ...(cardVars(card, accent, accentInk) as CSSProperties) }} data-chat-variant="card" data-chat-expanded="true">
        <ExpandedChatLayout
          right={column}
          accent={accent}
          accentInk={accentInk}
          surfaceMode="card"
          locale={brand.locale}
          ariaLabel={ariaLabel}
          inquiries={columnProps.inquiries ?? []}
          activeInquiryId={columnProps.inquiryId}
          seenAtByInquiry={columnProps.seenAtByInquiry}
          onSelect={columnProps.onSwitchInquiry}
        />
      </div>
    );
  }
  return (
    <CardDockFrame
      card={card}
      accent={accent}
      accentInk={accentInk}
      compact={compact}
      expanded={expanded}
      keyboardInsetPx={keyboardInsetPx}
      ariaLabel={ariaLabel}
      onClose={onClose}
    >
      {column}
    </CardDockFrame>
  );
}
