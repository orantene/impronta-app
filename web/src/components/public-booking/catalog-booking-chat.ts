/**
 * Catalog booking sheet → existing guest chat handoff.
 *
 * Closes the sheet, stashes offering + selection + visitor on the pending
 * stores the launcher already reads, and fires `tulala:ask-question` so the
 * live dock (and the /dev/jor-beauty DemoAskPanel) open with context.
 * Never fires a detail-bearing `tulala:offering-request` — that would reopen
 * CatalogBookingSheet (dual listener on vanity sites).
 */

import type { OfferingRequestDetail } from "@/app/t/[profileCode]/_shared/OfferingCta";
import { setPendingGuestContact } from "@/app/t/[profileCode]/_chat/pending-guest-contact-store";
import {
  setPendingOffering,
  type PendingOfferingSelection,
} from "@/app/t/[profileCode]/_chat/pending-offering-store";
import { formatOfferingPrice } from "@/lib/talent/offerings-types";
import { pickLocale } from "@/lib/i18n/pick-locale";

export type CatalogBookingSelection = PendingOfferingSelection;

export type CatalogBookingVisitor = {
  name?: string;
  phone?: string;
  email?: string;
};

export type CatalogBookingChatHandoff = {
  detail: OfferingRequestDetail;
  selection?: CatalogBookingSelection;
  visitor?: CatalogBookingVisitor;
  /** "sheet" · "menu" · "visit" — where the visitor asked from. */
  from?: string;
  sourcePage?: string;
  talentName?: string;
  /**
   * When true (sheet `mode="demo"`), only fire the named ask event for the
   * harness panel — do not stash pending stores that a live dock would send.
   */
  demo?: boolean;
};

export type OfferingWithSelection = OfferingRequestDetail & {
  selection?: CatalogBookingSelection;
};

/** Visible composer / first-message prefix carrying options + slot + total. */
export function catalogBookingDraftPrefix(
  detail: OfferingRequestDetail,
  selection: CatalogBookingSelection | undefined,
  locale: string,
): string {
  const bits = [
    selection?.variantLabel,
    ...(selection?.addOnLabels ?? []),
    selection?.slotLabel,
  ].filter((b): b is string => Boolean(b && b.trim()));
  const cents =
    selection?.totalCents != null && Number.isFinite(selection.totalCents)
      ? selection.totalCents
      : detail.amountCents;
  const price =
    cents != null ? ` (${formatOfferingPrice(cents, detail.currency, locale)})` : "";
  const title = bits.length ? `${detail.title} · ${bits.join(" · ")}` : detail.title;
  return pickLocale(locale, {
    en: `Question about ${title}${price} — `,
    es: `Consulta sobre ${title}${price} — `,
  });
}

export function openCatalogBookingChat(handoff: CatalogBookingChatHandoff): void {
  if (typeof window === "undefined") return;

  const enriched: OfferingWithSelection = {
    ...handoff.detail,
    ...(handoff.selection ? { selection: handoff.selection } : {}),
  };

  if (!handoff.demo) {
    setPendingOffering(enriched);
    if (handoff.visitor) {
      setPendingGuestContact({
        name: handoff.visitor.name?.trim() || null,
        phone: handoff.visitor.phone?.trim() || null,
        email: handoff.visitor.email?.trim() || null,
      });
    }
  }

  window.dispatchEvent(
    new CustomEvent("tulala:ask-question", {
      detail: {
        talentName: handoff.talentName ?? null,
        sourcePage: handoff.sourcePage ?? (typeof window !== "undefined" ? window.location.pathname : null),
        offeringId: handoff.detail.offeringId,
        offeringTitle: handoff.detail.title,
        from: handoff.from ?? "sheet",
        selection: handoff.selection ?? null,
        visitor: handoff.visitor
          ? {
              name: handoff.visitor.name?.trim() || null,
              phone: handoff.visitor.phone?.trim() || null,
              email: handoff.visitor.email?.trim() || null,
            }
          : null,
        demo: handoff.demo === true,
      },
    }),
  );
}
