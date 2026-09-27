/**
 * guest-journey-chrome — pure helpers for the front-door brief header status
 * + progress rail. Keeps MiniChatPanelColumn under the max-lines cap.
 */

import type { Translator } from "@/i18n/interpolate";
import type {
  GuestChipValue,
  GuestThreadStatus,
  GuestThreadV5Extras,
} from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";

import {
  resolveGuestJourneySegs,
  resolveGuestRailLabel,
  type IntakeTrade,
} from "./guest-intake-rail";
import type { StreamRow } from "./MiniChatMessageBubble";

export function resolveGuestJourneyChrome(input: {
  readonly trade: IntakeTrade | null | undefined;
  readonly intent: InquiryIntent | null | undefined;
  readonly captured: Partial<Record<string, GuestChipValue>> | null | undefined;
  readonly threadStatus: GuestThreadStatus;
  readonly inquiryId: string | null;
  readonly receipt: boolean;
  readonly contactPromoted: boolean;
  readonly cartTalentCount: number;
  readonly v5: GuestThreadV5Extras | null | undefined;
  readonly rows: readonly StreamRow[];
  readonly t: Translator;
}): {
  journeyLabel: string | null;
  railLabel: string | null;
  journeySegs: Array<{ id: string; on: boolean; label: string }>;
} {
  const items = input.v5?.items;
  const hasServicePinned =
    input.cartTalentCount > 0 ||
    Boolean(items?.lines?.length) ||
    Boolean(items?.records?.length);
  const hasGuestMessage = input.rows.some(
    (r) => r.authorRole === "guest" && r.kind === "text" && Boolean(r.body?.trim()),
  );
  const railExtras = {
    hasService: hasServicePinned,
    hasMessage: hasGuestMessage || input.receipt || input.contactPromoted,
  };
  const railLabel = resolveGuestRailLabel(
    input.trade,
    input.intent,
    input.captured,
    input.threadStatus === "booked",
    Boolean(input.inquiryId),
    input.t,
    railExtras,
  );
  const journeySegs = resolveGuestJourneySegs({
    trade: input.trade,
    intent: input.intent,
    captured: input.captured,
    booked: input.threadStatus === "booked",
    hasInquiry: Boolean(input.inquiryId),
    hasService: railExtras.hasService,
    hasMessage: railExtras.hasMessage,
    t: input.t,
  });
  const journeyLabel =
    input.threadStatus === "offer_pending"
      ? input.t("public.guestChat.headerJourneyOffer")
      : input.threadStatus === "approved"
        ? input.t("public.guestChat.headerJourneyTime")
        : input.threadStatus === "booked"
          ? input.t("public.guestChat.headerJourneyBooked")
          : null;
  return { journeyLabel, railLabel, journeySegs };
}
