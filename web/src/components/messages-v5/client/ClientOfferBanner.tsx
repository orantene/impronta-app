"use client";

/**
 * TUL-954: "Ver oferta" banner on the signed `/c/t/<token>` page. Shown while the thread has an
 * offer the client can still act on; tapping scrolls to it. It also runs once on arrival when the
 * email link carried `?focus=offer`, so the "your offer is ready" email lands on the offer.
 */

import { useEffect } from "react";

import { jumpToClientOffer } from "./jump-to-offer";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** The offer card mounts after hydration; retry briefly until its action exists. */
function jumpWhenReady(): () => void {
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    if (jumpToClientOffer(document, reducedMotion()) || tries >= 12) window.clearInterval(timer);
  }, 250);
  return () => window.clearInterval(timer);
}

export function ClientOfferBanner({ pending, focusOnArrival, hint, cta }: { pending: boolean; focusOnArrival: boolean; hint: string; cta: string }) {
  useEffect(() => {
    if (!pending || !focusOnArrival) return;
    return jumpWhenReady();
  }, [pending, focusOnArrival]);

  if (!pending) return null;
  return (
    <div role="region" aria-label={cta} data-client-offer-banner="" className="pointer-events-none fixed inset-x-3 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-[60] flex justify-center">
      <div className="pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-full bg-[#1c2230] py-2.5 pl-4 pr-3 text-[13px] text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <span>{hint}</span>
        <button type="button" onClick={() => void jumpWhenReady()} className="cursor-pointer rounded-full border-0 bg-white px-3.5 py-[7px] font-semibold text-[#1c2230]">
          {cta}
        </button>
      </div>
    </div>
  );
}
