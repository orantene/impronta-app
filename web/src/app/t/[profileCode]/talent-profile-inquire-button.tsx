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

import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { registerCartTalent } from "@/app/t/[profileCode]/_chat/cart-talent-registry";

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

  const handleClick = () => {
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.start_inquiry, {
      talent_id: talentId,
      source_page: sourcePage,
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

  return (
    <Button type="button" onClick={handleClick} className={className}>
      <Mail className="size-4" />
      {interpolate(t("public.profileCta.inquireAbout"), { name: firstName })}
    </Button>
  );
}
