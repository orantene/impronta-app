"use client";

import { useEffect, useState } from "react";
import { getMarketingSupportCopy, TULALA_SUPPORT_OPEN_EVENT } from "@/lib/marketing/support-copy";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { MarketingSupportPanel } from "./MarketingSupportPanel";

export function MarketingSupportLauncher({
  locale,
  originSlug,
  signedIn,
}: {
  locale: "en" | "es";
  originSlug: string;
  signedIn: boolean;
}) {
  const copy = getMarketingSupportCopy(locale);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [resumeTicketId, setResumeTicketId] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ ticketId?: string }>).detail;
      if (detail?.ticketId) setResumeTicketId(detail.ticketId);
      setOpen(true);
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.marketing_support_opened, { locale, origin: originSlug });
    };
    window.addEventListener(TULALA_SUPPORT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TULALA_SUPPORT_OPEN_EVENT, onOpen);
  }, [locale, originSlug]);

  return (
    <>
      <button
        type="button"
        aria-label={copy.launcherAria}
        onClick={() => {
          setOpen(true);
          setUnread(false);
          trackProductEvent(PRODUCT_ANALYTICS_EVENTS.marketing_support_opened, { locale, origin: originSlug });
        }}
        className="fixed z-[380] flex h-12 w-12 items-center justify-center rounded-full border border-[var(--plt-hairline-strong)] bg-[var(--plt-forest)] text-[var(--plt-bg)] shadow-md transition-colors hover:bg-[var(--plt-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plt-forest)]"
        style={{
          right: "max(16px, env(safe-area-inset-right))",
          bottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        <span aria-hidden className="text-lg font-semibold">?</span>
        {unread ? (
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[var(--plt-ink)]" />
        ) : null}
      </button>
      {open ? (
        <MarketingSupportPanel
          locale={locale}
          originSlug={originSlug}
          signedIn={signedIn}
          resumeTicketId={resumeTicketId}
          onClose={() => setOpen(false)}
          onUnread={() => setUnread(true)}
        />
      ) : null}
    </>
  );
}
