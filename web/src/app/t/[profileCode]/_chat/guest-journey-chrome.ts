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
  /**
   * Front-door brief journey chrome (Nueva / Oferta / New / Offer / …).
   * True for talent vanity sites and agency public docks (Impronta).
   * Platform hub keeps StatusLine until a thread.
   */
  readonly talentSiteChrome?: boolean;
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
  // Front-door brief center status (CSS uppercase → NUEVA / OFERTA / ENVIADA / …).
  const journeyLabel = resolveJourneyLabel({
    threadStatus: input.threadStatus,
    hasInquiry: Boolean(input.inquiryId),
    receipt: input.receipt,
    isDraft: Boolean(input.inquiryId) && !input.receipt && !input.contactPromoted,
    talentSiteChrome: Boolean(input.talentSiteChrome),
    t: input.t,
  });
  return { journeyLabel, railLabel, journeySegs };
}

/** Map thread status → brief header journey label (null = use StatusLine). */
export function resolveJourneyLabel(input: {
  readonly threadStatus: GuestThreadStatus;
  readonly hasInquiry: boolean;
  readonly receipt: boolean;
  readonly isDraft: boolean;
  /** When true, empty first-visit paints "Nueva" (DoR) instead of StatusLine. */
  readonly talentSiteChrome?: boolean;
  readonly t: Translator;
}): string | null {
  if (!input.hasInquiry) {
    return input.talentSiteChrome
      ? input.t("public.guestChat.headerJourneyNew")
      : null;
  }
  switch (input.threadStatus) {
    case "offer_pending":
      return input.t("public.guestChat.headerJourneyOffer");
    case "approved":
      return input.t("public.guestChat.headerJourneyTime");
    case "booked":
      return input.t("public.guestChat.headerJourneyBooked");
    case "closed":
      return input.t("public.guestChat.headerJourneyClosed");
    case "draft":
      return input.t("public.guestChat.headerJourneyDraft");
    case "open":
      // Sent but no offer yet → Enviada / En conversación.
      return input.receipt
        ? input.t("public.guestChat.headerJourneyThread")
        : input.isDraft
          ? input.t("public.guestChat.headerJourneyDraft")
          : input.t("public.guestChat.headerJourneySent");
    default:
      return input.talentSiteChrome
        ? input.t("public.guestChat.headerJourneyNew")
        : null;
  }
}

/**
 * Front-door brief journey chrome applies on talent vanity sites and on
 * agency public docks (Impronta Talk). Platform hub stays on StatusLine.
 * Do not use dockIntake for surface identity — intakeTradeForPreset maps
 * custom/portfolio/act onto the agency progress-rail trade, which is not
 * the same as an agency public storefront.
 */
export function usesFrontDoorJourneyChrome(
  brand: {
    readonly omitPlatformBrand?: boolean;
    readonly agencyPublicSurface?: boolean;
  },
  opts?: { readonly isHub?: boolean },
): boolean {
  // Hub (tulala.digital) keeps StatusLine even on an agency-shaped brand.
  if (opts?.isHub) return false;
  return Boolean(brand.omitPlatformBrand) || Boolean(brand.agencyPublicSurface);
}
