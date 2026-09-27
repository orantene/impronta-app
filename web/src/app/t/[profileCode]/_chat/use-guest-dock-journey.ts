"use client";

/**
 * Resolves Hablar journey chrome + optional dev OFERTA preview override.
 * Kept out of MiniChatPanelColumn to stay under the 800-line file cap.
 */

import type { Translator } from "@/i18n/interpolate";
import type {
  GuestChipValue,
  GuestThreadStatus,
  GuestThreadV5Extras,
  MiniChatBrand,
} from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";

import { resolveGuestJourneyChrome } from "./guest-journey-chrome";
import { useHablarOfferPreview } from "./GuestHablarOfferPreview";
import type { StreamRow } from "./MiniChatMessageBubble";

export function useGuestDockJourney(input: {
  readonly brand: MiniChatBrand;
  readonly inquiryIntent: InquiryIntent | null | undefined;
  readonly capturedChipValues: Partial<Record<string, GuestChipValue>> | null | undefined;
  readonly threadStatus: GuestThreadStatus;
  readonly inquiryId: string | null;
  readonly receipt: boolean;
  readonly contactPromoted: boolean;
  readonly cartTalentCount: number;
  readonly v5: GuestThreadV5Extras | null | undefined;
  readonly rows: readonly StreamRow[];
  readonly t: Translator;
}): {
  offerPreview: boolean;
  journeyLabel: string | null;
  railLabel: string | null;
  journeySegs: Array<{ id: string; on: boolean; label: string }>;
} {
  const talentSite = Boolean(input.brand.omitPlatformBrand);
  const offerPreview = useHablarOfferPreview(talentSite);
  const chrome = resolveGuestJourneyChrome({
    trade: input.brand.dockIntake,
    intent: input.inquiryIntent,
    captured: input.capturedChipValues,
    threadStatus: offerPreview ? "offer_pending" : input.threadStatus,
    inquiryId: offerPreview ? input.inquiryId ?? "preview-offer" : input.inquiryId,
    receipt: offerPreview ? true : input.receipt,
    contactPromoted: offerPreview ? true : input.contactPromoted,
    cartTalentCount: input.cartTalentCount,
    v5: input.v5,
    rows: input.rows,
    t: input.t,
    talentSiteChrome: talentSite,
  });
  return {
    offerPreview,
    journeyLabel: offerPreview
      ? input.t("public.guestChat.headerJourneyOffer")
      : chrome.journeyLabel,
    railLabel: chrome.railLabel,
    journeySegs: chrome.journeySegs,
  };
}
