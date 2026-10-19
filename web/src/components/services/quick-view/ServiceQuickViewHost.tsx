"use client";

/**
 * Opens a services list's quick views (TUL-1272 #3, #9). The cards are plain
 * links rendered by the widget; this host only intercepts clicks inside its
 * widget: a quick-view card opens its <dialog> (popup on desktop, bottom sheet
 * on phones), a book card or the dialog's "Reservar" opens the booking sheet,
 * and a `#servicio-...` share link opens the dialog on load. Without JS every
 * link still works (page, list fragment, booking deep link).
 */
import { useEffect } from "react";

import { dispatchOffering } from "@/lib/site-admin/builder-node/services-catalog-detail";
import type { ServiceCardTarget } from "@/lib/services/presentation/card-target";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\#.]/g, "\\$&");
}

export function ServiceQuickViewHost({
  nodeId,
  targets,
  offerings,
  confirmsByHand,
  bookingPosture,
}: {
  nodeId: string;
  targets: Record<string, ServiceCardTarget>;
  offerings: readonly TalentOffering[];
  confirmsByHand: boolean;
  bookingPosture?: TalentBookingPosture;
}) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-builder-node-id="${cssEscape(nodeId)}"]`);
    if (!root) return;
    const byHref = new Map<string, { offeringId: string; target: ServiceCardTarget }>();
    for (const [offeringId, target] of Object.entries(targets)) {
      byHref.set(new URL(target.href, window.location.href).href, { offeringId, target });
    }
    const byId = new Map(offerings.map((o) => [o.id, o]));
    const dialogFor = (id: string): HTMLDialogElement | null => {
      if (!id) return null;
      try {
        return root.querySelector<HTMLDialogElement>(`dialog#${cssEscape(id)}`);
      } catch {
        return null;
      }
    };
    const clearHash = (id: string) => {
      if (window.location.hash === `#${id}`) {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      }
    };
    const open = (id: string) => {
      const d = dialogFor(id);
      if (!d || d.open) return;
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      d.setAttribute("aria-modal", "true");
      if (window.location.hash !== `#${id}`) window.history.replaceState(window.history.state, "", `#${id}`);
    };
    const close = (d: HTMLDialogElement | null) => {
      if (!d) return;
      d.removeAttribute("aria-modal");
      if (typeof d.close === "function") d.close();
      else {
        d.removeAttribute("open");
        clearHash(d.id);
      }
    };
    const book = (offeringId: string): boolean => {
      const o = byId.get(offeringId);
      if (!o) return false;
      dispatchOffering(o, confirmsByHand, undefined, undefined, bookingPosture);
      return true;
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = e.target as Element | null;
      if (el instanceof HTMLDialogElement && el.classList.contains("sqv") && el.open) {
        close(el);
        return;
      }
      const closer = el?.closest?.("[data-sqv-close]") as HTMLElement | null;
      if (closer && root.contains(closer)) {
        e.preventDefault();
        close(closer.closest("dialog.sqv") as HTMLDialogElement | null);
        return;
      }
      const a = el?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !root.contains(a)) return;
      const dialog = a.closest("dialog.sqv") as HTMLDialogElement | null;
      const bookId = a.getAttribute("data-sqv-book");
      if (bookId) {
        if (book(bookId)) {
          e.preventDefault();
          close(dialog);
        }
        return;
      }
      const hit = byHref.get(a.href);
      if (!hit) return;
      if (hit.target.opens === "quick_view" && hit.target.quickViewId && dialogFor(hit.target.quickViewId)) {
        e.preventDefault();
        open(hit.target.quickViewId);
      } else if (hit.target.opens === "book" && book(hit.offeringId)) {
        e.preventDefault();
      }
    };
    const dialogs = Array.from(root.querySelectorAll<HTMLDialogElement>("dialog.sqv"));
    const onClose = (e: Event) => clearHash((e.currentTarget as HTMLDialogElement).id);
    for (const d of dialogs) d.addEventListener("close", onClose);
    const fromHash = () => {
      // A crafted or truncated fragment (`#%E0%A4%A`) must never crash the page.
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      open(id);
    };
    root.addEventListener("click", onClick);
    window.addEventListener("hashchange", fromHash);
    fromHash();
    return () => {
      root.removeEventListener("click", onClick);
      window.removeEventListener("hashchange", fromHash);
      for (const d of dialogs) d.removeEventListener("close", onClose);
    };
  }, [nodeId, targets, offerings, confirmsByHand, bookingPosture]);
  return null;
}
