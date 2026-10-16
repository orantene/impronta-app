/**
 * Promo widget types (TUL-1051 part B). Pure and serialisable: the server block
 * picks and localises, the client island only draws and measures time.
 */

import type { Audience, OfferKind, ScopeKind, Unlock } from "../types";

export const PROMO_WIDGET_VARIANTS = ["banner", "cards", "reveal", "countdown", "popup", "sticky", "book"] as const;
export type PromoWidgetVariant = (typeof PROMO_WIDGET_VARIANTS)[number];

export const PROMO_WIDGET_AUDIENCES = ["everyone", "new", "returning", "signed_in", "guest"] as const;
export type PromoWidgetAudience = (typeof PROMO_WIDGET_AUDIENCES)[number];

export const PROMO_WIDGET_PAGES_MODES = ["all", "only", "except"] as const;
export type PromoWidgetPagesMode = (typeof PROMO_WIDGET_PAGES_MODES)[number];

export const PROMO_WIDGET_FREQUENCIES = ["always", "session", "once", "daily", "weekly"] as const;
export type PromoWidgetFrequency = (typeof PROMO_WIDGET_FREQUENCIES)[number];

export const PROMO_WIDGET_POPUP_STYLES = ["modal", "slide"] as const;
export type PromoWidgetPopupStyle = (typeof PROMO_WIDGET_POPUP_STYLES)[number];

export const PROMO_WIDGET_POSITIONS = ["bottom_right", "bottom_left", "bottom_center"] as const;
export type PromoWidgetPosition = (typeof PROMO_WIDGET_POSITIONS)[number];

export const PROMO_WIDGET_TONES = ["accent", "ink", "soft"] as const;
export type PromoWidgetTone = (typeof PROMO_WIDGET_TONES)[number];

/** The block's own options. Mirrors `promoPropsSchema` in the builder registry. */
export type PromoWidgetOptions = {
  variant?: PromoWidgetVariant;
  /** A specific promo; empty = the best live one. */
  promoId?: string;
  audience?: PromoWidgetAudience;
  /** Schedule: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", in the promo's timezone. */
  startsAt?: string;
  endsAt?: string;
  pagesMode?: PromoWidgetPagesMode;
  /** Comma or line separated site paths; "/" is home, a trailing "*" is a prefix. */
  pages?: string;
  headline?: string;
  body?: string;
  ctaLabel?: string;
  /** Where "Book" goes: a same-page anchor or a site path. Default "#services". */
  ctaHref?: string;
  dismissible?: boolean;
  popupStyle?: PromoWidgetPopupStyle;
  delaySec?: number;
  scrollPct?: number;
  exitIntent?: boolean;
  frequency?: PromoWidgetFrequency;
  position?: PromoWidgetPosition;
  tone?: PromoWidgetTone;
  maxCards?: number;
};

/** A live, non-personal promo as the widgets know it. Server only until picked. */
export type WidgetPromo = {
  id: string;
  offerKind: OfferKind;
  value: number;
  currency: string;
  unlock: Unlock;
  audience: Audience;
  scope: ScopeKind;
  tz: string;
  /** Only meaningful for unlock = "code". Never set for auto / link promos. */
  code: string | null;
  /** The end of the window as a real instant; null = open ended. */
  endsAtMs: number | null;
  /** The talent's "show the countdown" switch on this promo. */
  showCountdown: boolean;
  /** The talent's "Show on my site" switch. */
  showOnSite: boolean;
  title: Readonly<Record<string, string>> | null;
  description: Readonly<Record<string, string>> | null;
  /** Units left, only when small enough to say out loud. */
  left: number | null;
};

export type PromoWidgetData = {
  items: readonly WidgetPromo[];
  nowMs: number;
  /** True only in the editor preview: lets an empty block show a hint. */
  preview?: boolean;
};

export const EMPTY_PROMO_WIDGET_DATA: PromoWidgetData = { items: [], nowMs: 0 };

/** What the client island receives for one promo: localised, nothing else. */
export type WidgetView = {
  id: string;
  /** "20% off" */
  offer: string;
  headline: string;
  body: string;
  /** Present only for unlock = "code" promos. */
  code: string | null;
  unlock: Unlock;
  endsAtMs: number | null;
  /** Countdown shown when the talent allows it for this promo. */
  countdown: boolean;
  leftLabel: string | null;
};
