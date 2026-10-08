"use client";

import { useEffect, useMemo, useState } from "react";

import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { bookEntryFrom, listBookableOfferings } from "@/lib/talent-site/book-entry";
import { openAtNextSlot, pickSlotOffering, registerSlotOfferings } from "@/lib/talent-site/next-free-slot";
import { requestTalentOpen } from "@/lib/talent-site/open-intent-client";
import { runStickyBarTap } from "@/lib/talent-site/sticky-bar-tap";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";
import { deriveOfferingCta } from "@/lib/talent/offering-cta-derivation";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { useNextFreeSlot } from "./use-next-free-slot";

/**
 * TUL-59 C item 3: the idle bar's main button follows context. Away from the
 * menu it says "Reservar cita" / "Book an appointment" on a site that takes
 * bookings (TUL-72; "Ver servicios" on an inquiry-only site) and scrolls to it; once the menu is on screen
 * it says "Elige un servicio" (nothing to scroll to) and just scrolls the list
 * into place. Once a service is picked, the selection dock ("Continuar") takes
 * over, so this label never has to say it.
 */
export function idleBarLabel(es: boolean, menuInView: boolean, takesBookings = false): string {
  if (menuInView) return es ? "Elige un servicio" : "Choose a service";
  if (takesBookings) return es ? "Reservar cita" : "Book an appointment";
  return es ? "Ver servicios" : "See services";
}

/**
 * TUL-72: does this menu take bookings? True when at least one visible service
 * resolves (same derivation as the rows) to book / buy / request-to-book.
 * Inquiry-only and quote-only menus stay "Ver servicios".
 */
export function catalogTakesBookings(
  items: ReadonlyArray<TalentOffering>,
  opts: { confirmsByHand?: boolean; bookingPosture?: TalentBookingPosture },
): boolean {
  return items.some((offering) => {
    const d = deriveOfferingCta({
      offering,
      defaults: opts.bookingPosture ? { bookingPosture: opts.bookingPosture } : {},
      confirmsByHand: opts.confirmsByHand,
    });
    return !d.hidden && (d.cta === "book_now" || d.cta === "buy_now" || d.cta === "request_to_book");
  });
}

/** True while at least a third of the menu is visible. Stays false without IntersectionObserver. */
function useMenuInView(nodeId: string): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = document.querySelector(`[data-builder-node-id="${nodeId}"]`);
    if (!el) return;
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), {
      threshold: 0.33,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [nodeId]);
  return inView;
}

type BarProps = {
  nodeId: string;
  es: boolean;
  takesBookings?: boolean;
  /** TUL-232: with these, a tap opens booking at the next free slot when one is known. */
  groups?: ReadonlyArray<{ items: ReadonlyArray<TalentOffering> }>;
  settings?: { confirmsByHand?: boolean; bookingPosture?: TalentBookingPosture };
  buildDetail?: (o: TalentOffering) => OfferingRequestDetail;
};

/**
 * Shared by the pill button and the plain bar text. The tap OPENS booking (one bookable service:
 * its sheet; several: the picker; none: scroll to the menu), queued until the sheet has hydrated.
 */
function useIdleBarTap({ nodeId, es, takesBookings: takesBookingsProp, groups, settings, buildDetail }: BarProps) {
  const inView = useMenuInView(nodeId);
  const items = useMemo(() => (groups ? groups.flatMap((g) => g.items) : []), [groups]);
  const takesBookings = takesBookingsProp ?? catalogTakesBookings(items, settings ?? {});
  const picked = takesBookings && buildDetail ? pickSlotOffering(items, settings ?? {}) : null;
  // Idempotent registry writes; the sheet needs the full detail to open at a slot.
  useEffect(() => {
    if (buildDetail) registerSlotOfferings(items, buildDetail);
  });
  const slot = useNextFreeSlot(picked?.id ?? null, picked?.durationMinutes ?? null);
  // Resolved at tap time only: nothing here runs during render.
  const onTap = () => {
    const bookable = groups
      ? listBookableOfferings({
          offerings: items,
          defaults: settings?.bookingPosture ? { bookingPosture: settings.bookingPosture } : {},
          confirmsByHand: settings?.confirmsByHand,
        }).map((b) => (buildDetail ? { ...b, detail: buildDetail(b.offering) } : b))
      : [];
    runStickyBarTap({
      menuInView: inView,
      bookableCount: bookable.length,
      entry: bookEntryFrom(bookable),
      slot,
      openAtSlot: (s) => openAtNextSlot(s),
      request: requestTalentOpen,
      scroll: () =>
        document.querySelector(`[data-builder-node-id="${nodeId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    });
  };
  return { inView, takesBookings, slot, onTap, es };
}

export function CatalogIdleBarGo(props: BarProps) {
  const { inView, takesBookings, slot, onTap, es } = useIdleBarTap(props);
  return (
    <button
      type="button"
      className="cb-bar-go"
      data-in-services={inView ? "true" : undefined}
      data-next-slot={slot?.slotStart}
      onClick={onTap}
    >
      {idleBarLabel(es, inView, takesBookings)}
    </button>
  );
}

/** The non-pill bar (float / dock): its text block is the tap target, same action as the pill button. */
export function CatalogIdleBarText(props: BarProps) {
  const { onTap, es } = useIdleBarTap(props);
  return (
    <div
      className="cb-bar-text"
      role="button"
      tabIndex={0}
      data-bar-tap=""
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap();
        }
      }}
    >
      <strong>{es ? "Elige tu servicio" : "Choose a service"}</strong>
      <span>{es ? "Del menú completo, con sus opciones" : "From the full menu, with its options"}</span>
    </div>
  );
}

/**
 * TUL-59 C overlay rules, kept out of the byte-pinned base booking stylesheet.
 * One banner at a time (consent, then language suggestion), neither over a
 * booking window; more air between the selection's x and the chat button.
 */
export const CATALOG_OVERLAY_CSS = `body:has([data-consent-banner]) [data-locale-suggestion],body:has([role="dialog"][aria-modal="true"]) [data-consent-banner],body:has([role="dialog"][aria-modal="true"]) [data-locale-suggestion]{display:none}
.cb-dock{gap:16px}.cb-dock-stack{margin-left:6px}`;

export function CatalogOverlayStyles() {
  return <style>{CATALOG_OVERLAY_CSS}</style>;
}
