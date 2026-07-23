"use client";

/**
 * Client button that opens the talent registration modal in place (dispatches
 * `TALENT_MODAL_EVENT`). Drop-in replacement for the old
 * `<a href={getAppUrl()/talent/register}>` CTAs scattered across the marketing
 * sections — it carries arbitrary className/style so each call site keeps its
 * existing look, and fires the standard `marketing_cta_clicked` analytics.
 */

import { trackProductEvent } from "@/lib/analytics/track-client";
import { trackEvent } from "@/lib/marketing/ga-events";
import { TALENT_MODAL_EVENT } from "./talent-register-modal";

export function OpenTalentModalButton({
  children,
  className,
  style,
  eventSource,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  eventSource?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={ariaLabel}
      onClick={() => {
        if (eventSource) {
          trackProductEvent("marketing_cta_clicked", {
            source_page: eventSource,
            intent: "talent-register",
            href: "modal:talent-register",
          });
        }
        trackEvent("talent_modal_open", { source: eventSource });
        window.dispatchEvent(new CustomEvent(TALENT_MODAL_EVENT));
      }}
    >
      {children}
    </button>
  );
}
