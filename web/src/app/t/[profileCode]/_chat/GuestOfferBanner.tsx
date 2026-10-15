"use client";

/**
 * TUL-954: "Ver oferta" banner on the talent profile. Shown when the guest's
 * session has an open inquiry on this talent that carries a pending offer.
 * Tapping opens the existing chat thread (the launcher resumes it from the
 * guest cookie) and jumps to the offer card; accepting stays in the existing
 * in-panel flow, untouched.
 */

import { useEffect } from "react";

import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { jumpToOfferAnchor } from "./jump-to-offer";
import { setExistingGuestThread } from "./existing-thread-store";

export function GuestOfferBanner({
  inquiryId,
  hasPendingOffer,
  locale,
  talentName,
}: {
  inquiryId: string | null;
  hasPendingOffer: boolean;
  locale: string;
  talentName: string;
}) {
  const modal = useOptionalDirectoryInquiryModal();

  useEffect(() => {
    setExistingGuestThread(inquiryId);
    return () => setExistingGuestThread(null);
  }, [inquiryId]);

  if (!inquiryId || !hasPendingOffer) return null;

  const es = locale.toLowerCase().startsWith("es");
  const label = es ? "Ver oferta" : "View offer";
  const hint = es
    ? `${talentName} te envió una oferta`
    : `${talentName} sent you an offer`;

  const onClick = () => {
    modal?.requestOpenChat();
    // The panel mounts its thread after opening; retry briefly until the offer card exists.
    let tries = 0;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const timer = window.setInterval(() => {
      tries += 1;
      if (jumpToOfferAnchor(document, reduced) || tries >= 12) window.clearInterval(timer);
    }, 250);
  };

  return (
    <div
      role="region"
      aria-label={label}
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 84,
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          maxWidth: 420,
          padding: "10px 12px 10px 16px",
          borderRadius: 999,
          background: "#1c2230",
          color: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          fontSize: 13,
        }}
      >
        <span>{hint}</span>
        <button
          type="button"
          onClick={onClick}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "7px 14px",
            background: "#fff",
            color: "#1c2230",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
