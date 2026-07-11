"use client";

/**
 * TalentProfileInquireButton — public-talent-profile primary inquiry CTA.
 *
 * Phase 3 collapse (Jon 360): this used to be a PARALLEL front door — it built a
 * fresh single-talent InquiryIntent (oneTalentRoster, selected_ids:[talentId])
 * and, for GUESTS, submitted it immediately. That dropped any lineup the visitor
 * had built and spawned a competing inquiry alongside the chat launcher.
 *
 * W2-E (front-door collapse): the floating chat launcher
 * (TalentProfileChatLauncher) is the ONE canonical inquiry surface for BOTH
 * guests AND signed-in clients. This CTA adds the talent to the shared lineup
 * and asks the launcher to open (resolver-driven), never a parallel composer and
 * never an instant submit. The InquiryDrawer sheet is gone from this surface
 * (D6: the drawer survives ONLY as the workspace-dashboard form).
 */

import { useEffect, useRef, useState } from "react";

import { Mail, MessageCirclePlus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { registerCartTalent } from "@/app/t/[profileCode]/_chat/cart-talent-registry";
import { FONT } from "@/app/t/[profileCode]/_chat/mini-chat-styles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TalentProfileInquireButtonProps = {
  talentId: string;
  talentProfileCode: string;
  displayName: string;
  /** tenantId — retained for caller compatibility (analytics/provenance). */
  tenantId?: string;
  /** tenantSlug — retained for caller compatibility. */
  tenantSlug?: string;
  /** Agency display name — retained for caller compatibility. */
  agencyName?: string;
  /** Source page for analytics + source attribution (e.g. /t/TA-12345). */
  sourcePage: string;
  /** Optional portrait for the lineup avatar fly/registry. */
  portraitUrl?: string | null;
  /** Resolved page locale (from getRequestLocale on the profile page). */
  locale: string;
  /** Button className override — caller controls placement context. */
  className?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TalentProfileInquireButton({
  talentId,
  talentProfileCode,
  displayName,
  sourcePage,
  portraitUrl = null,
  locale,
  className,
}: TalentProfileInquireButtonProps) {
  const t = createTranslator(locale);
  const cart = useInquiryCart();
  const inquiryModal = useOptionalDirectoryInquiryModal();

  const firstName = displayName.split(" ")[0] ?? displayName;

  // DOCK v2.1 — the chooser: when the visitor already has OTHER talent in
  // their lineup, one tap should not silently mutate the in-progress inquiry.
  // Offer the two honest paths ("add to current" / "separate inquiry about
  // {name}"). With an empty (or her-only) lineup there is nothing to decide.
  const [chooserOpen, setChooserOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chooserOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setChooserOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChooserOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [chooserOpen]);

  const othersInLineup = cart.cartIds.filter((id) => id !== talentId).length;

  const addToCurrent = (path: "direct" | "add_to_current" = "direct") => {
    setChooserOpen(false);
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.start_inquiry, {
      talent_id: talentId,
      source_page: sourcePage,
      cta_path: path,
    });
    // W2-E — one canonical inquiry surface for guests AND signed-in clients:
    // the chat launcher. Add this talent to the shared lineup (so the chat opens
    // preloaded + the rail avatar appears) and ask the launcher to open. NO
    // parallel composer, NO instant submit, the lineup is preserved. When no
    // launcher is mounted, requestOpenChat falls back to the synced sheet.
    registerCartTalent(talentId, { displayName, portraitUrl });
    if (!cart.isInCart(talentId)) {
      cart.setInCart(
        { talentProfileId: talentId, profileCode: talentProfileCode, displayName },
        true,
        sourcePage,
      );
    }
    inquiryModal?.requestOpenChat();
  };

  const startSeparate = () => {
    setChooserOpen(false);
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.start_inquiry, {
      talent_id: talentId,
      source_page: sourcePage,
      cta_path: "separate",
    });
    inquiryModal?.requestSeparateInquiry({
      talentProfileId: talentId,
      profileCode: talentProfileCode,
      displayName,
      portraitUrl,
    });
  };

  const handleClick = () => {
    // Fire the conversion event on the ACTUAL chosen path (below), not here:
    // an empty/her-only lineup goes straight through addToCurrent("direct"); a
    // lineup with others opens the chooser and the event fires on the choice.
    if (othersInLineup > 0 && inquiryModal) {
      setChooserOpen((v) => !v);
      return;
    }
    addToCurrent("direct");
  };

  // Modern-sans CTA type (owner: the serif/tracked site button read badly in
  // this context) — the same FONT stack the chat panel uses, so the inquiry
  // journey is typographically one thing from CTA to conversation.
  const ctaTypeStyle = { fontFamily: FONT, fontWeight: 600, letterSpacing: 0 } as const;

  const optionStyle = {
    display: "flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "#1c2230",
    cursor: "pointer",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left" as const,
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <Button type="button" onClick={handleClick} className={className} style={ctaTypeStyle}>
        <Mail className="size-4" />
        {interpolate(t("public.profileCta.inquireAbout"), { name: firstName })}
      </Button>
      {chooserOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            zIndex: 60,
            minWidth: 250,
            padding: 5,
            borderRadius: 12,
            border: "1px solid rgba(28,34,48,0.14)",
            background: "#ffffff",
            boxShadow: "0 16px 40px -14px rgba(16,18,29,0.45)",
          }}
        >
          <button type="button" role="menuitem" onClick={() => addToCurrent("add_to_current")} style={optionStyle}>
            <UserPlus size={15} strokeWidth={2.1} aria-hidden style={{ flexShrink: 0, opacity: 0.65 }} />
            <span style={{ minWidth: 0 }}>
              {interpolate(t("public.profileCta.addToCurrent"), {
                name: firstName,
                count: othersInLineup,
              })}
            </span>
          </button>
          <button type="button" role="menuitem" onClick={startSeparate} style={optionStyle}>
            <MessageCirclePlus size={15} strokeWidth={2.1} aria-hidden style={{ flexShrink: 0, opacity: 0.65 }} />
            <span style={{ minWidth: 0 }}>
              {interpolate(t("public.profileCta.separateInquiry"), { name: firstName })}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
