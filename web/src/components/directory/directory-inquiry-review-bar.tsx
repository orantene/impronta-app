"use client";

import { usePathname, useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { clientDirectoryHref } from "@/i18n/client-directory-href";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

/**
 * Persistent "open your inquiry" CTA for the directory grid.
 *
 * The redesign's per-card action is a hover-revealed pill that only ADDS talent
 * to the cart — it never opens or submits the inquiry. The only path to the
 * composer on the grid was a tiny unlabeled header Send icon, so filled carts
 * quietly became lost revenue (directory audit, top finding). This floats a
 * labeled gold "open inquiry · N" pill bottom-centre whenever the cart has
 * talent, mounting the same `openInquiry()` the header icon uses. Renders
 * nothing when the cart is empty / inquiry can't open on this surface, so it
 * never adds chrome for a visitor who hasn't shortlisted anyone.
 */
export function DirectoryInquiryReviewBar({ ui }: { ui: DirectoryUiCopy }) {
  const pathname = usePathname();
  const router = useRouter();
  const cart = useInquiryCart();

  // Show whenever the cart has talent (not gated on the modal provider) so the
  // bar and the header inquiry icon agree across surfaces. When the composer
  // can open here, open it in place; otherwise route to the directory and
  // auto-open it there (no dead-end).
  if (!cart.isReady || cart.cartCount === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <button
        type="button"
        onClick={() =>
          cart.canOpenInquiry
            ? cart.openInquiry({ sourcePage: pathname })
            : router.push(clientDirectoryHref(pathname, "?inquiry=open"))
        }
        className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full border border-[var(--dir-accent)] bg-[color-mix(in_srgb,var(--dir-accent)_22%,rgba(0,0,0,0.82))] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--impronta-gold-bright)] shadow-[0_12px_44px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md transition-colors hover:bg-[color-mix(in_srgb,var(--dir-accent)_32%,rgba(0,0,0,0.82))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dir-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Send className="size-4" aria-hidden />
        {ui.inquiry.openInquiry}
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--impronta-gold-bright)] px-1.5 text-[11px] font-bold tabular-nums text-black">
          {cart.cartCount}
        </span>
      </button>
    </div>
  );
}
