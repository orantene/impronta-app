/**
 * One service's quick view (TUL-1272 #3): the same facts its own page shows,
 * shaped for a popup (desktop) or a bottom sheet (phone). Pure, so the talent
 * widget, the business widget and tests share it.
 *
 * Guests see only what the public loaders already let through (published,
 * approved, public or on_request). D-10a: an on_request service is listed with
 * NO price: `priceText` is null and only `priceNote` says to ask.
 */
import {
  serviceBookHref,
  servicePageCopy,
  servicePageIsQuote,
  servicePagePriceText,
  type ServicePageOffering,
} from "@/lib/talent-site/service-page";
import { serviceFaqItems, type ServiceFaqItem } from "@/lib/talent-site/service-page-faq";
import { shownServiceReviews, type ServiceReviews } from "@/lib/talent-site/service-page-reviews";
import { serviceQuickViewId } from "./card-target";

export type QuickViewOffering = ServicePageOffering;

/** Same cap as the service page photo grid. */
export const SERVICE_PHOTO_MAX_QUICK_VIEW = 6;

export type ServiceQuickViewCopy = {
  close: string;
  fullPage: string;
  photos: string;
  policies: string;
  onRequest: string;
  freeCancel: (hours: number) => string;
  deposit: (pct: number) => string;
  payFull: string;
  payNone: string;
};

export function serviceQuickViewCopy(locale: string): ServiceQuickViewCopy {
  return locale.toLowerCase().startsWith("en")
    ? {
        close: "Close",
        fullPage: "See full page",
        photos: "Photos",
        policies: "Policies",
        onRequest: "Price on request",
        freeCancel: (h) => `Free cancellation up to ${h} h before`,
        deposit: (p) => `${p}% deposit when you book`,
        payFull: "Paid in full when you book",
        payNone: "No payment needed to book",
      }
    : {
        close: "Cerrar",
        fullPage: "Ver página completa",
        photos: "Fotos",
        policies: "Políticas",
        onRequest: "Precio a consultar",
        freeCancel: (h) => `Cancelación gratuita hasta ${h} h antes`,
        deposit: (p) => `Anticipo del ${p}% al reservar`,
        payFull: "Se paga el total al reservar",
        payNone: "No se paga nada al reservar",
      };
}

export type ServiceQuickView = {
  /** Fragment id: `#<id>` on the list opens this quick view. */
  id: string;
  offeringId: string;
  title: string;
  categoryLabel: string | null;
  photos: string[];
  /** Null when the guest must not see a price (on_request, quote). */
  priceText: string | null;
  /** "Precio a consultar" for on_request; null otherwise. */
  priceNote: string | null;
  durationText: string | null;
  description: string;
  faq: ServiceFaqItem[];
  reviews: ServiceReviews | null;
  policies: string[];
  /** "Ver página completa": only when this service has a page the plan allows. */
  pageHref: string | null;
  /** Booking deep link; null when the talent's switches hide the CTA. */
  bookHref: string | null;
  ctaLabel: string;
  locale: string;
};

function policyLines(o: QuickViewOffering, c: ServiceQuickViewCopy): string[] {
  const out: string[] = [];
  if (o.cancellationHours && o.cancellationHours > 0) out.push(c.freeCancel(o.cancellationHours));
  if (o.reserveMode === "deposit" && o.depositPct && o.depositPct > 0) out.push(c.deposit(o.depositPct));
  else if (o.reserveMode === "full") out.push(c.payFull);
  else if (o.reserveMode === "free") out.push(c.payNone);
  return out;
}

export function buildServiceQuickView(
  o: QuickViewOffering,
  opts: {
    /** Fragment id (unique per widget); defaults to the service slug. */
    quickViewId?: string;
    locale: string;
    /** Locale home path ("/" or "/en"): the booking deep link hangs off it. */
    homePath: string;
    pageHref: string | null;
    talentFaq?: readonly { question: string; answer: string }[];
    reviews?: ServiceReviews | null;
  },
): ServiceQuickView {
  const copy = servicePageCopy(opts.locale);
  const qv = serviceQuickViewCopy(opts.locale);
  const onRequest = o.visibility === "on_request";
  const quote = servicePageIsQuote(o);
  const price = onRequest || quote ? null : servicePagePriceText(o, opts.locale) || null;
  const photos = [...new Set((o.imageUrls ?? []).filter((u) => typeof u === "string" && u.trim() !== ""))].slice(
    0,
    SERVICE_PHOTO_MAX_QUICK_VIEW,
  );
  return {
    id: opts.quickViewId ?? serviceQuickViewId(o),
    offeringId: o.id,
    title: o.title.trim(),
    categoryLabel: o.categoryLabel ?? o.category ?? null,
    photos,
    priceText: price,
    priceNote: onRequest ? qv.onRequest : null,
    durationText: o.durationMinutes && o.durationMinutes > 0 ? copy.minutes(o.durationMinutes) : null,
    description: o.description?.trim() ?? "",
    faq: serviceFaqItems(o, opts.talentFaq ?? [], opts.locale),
    reviews: shownServiceReviews(opts.reviews ?? null),
    policies: policyLines(o, qv),
    pageHref: opts.pageHref,
    bookHref: o.publicCtaHidden ? null : serviceBookHref(o.id, opts.homePath),
    ctaLabel: quote || onRequest ? copy.quote : copy.bookShort,
    locale: opts.locale,
  };
}
