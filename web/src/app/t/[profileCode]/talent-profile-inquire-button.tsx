"use client";

/**
 * TalentProfileInquireButton — public-talent-profile primary inquiry CTA.
 *
 * Phase 3 collapse (Jon 360): this used to be a PARALLEL front door — it built a
 * fresh single-talent InquiryIntent (oneTalentRoster, selected_ids:[talentId])
 * and, for GUESTS, submitted it immediately. That dropped any lineup the visitor
 * had built and spawned a competing inquiry alongside the chat launcher.
 *
 * Locked owner decision 2: remove ONLY the guest instant-submit path. The chat
 * launcher (TalentProfileChatLauncher) is the ONE canonical inquiry surface, so
 * the guest CTA now ADDS this talent to the shared lineup and opens the chat
 * (resolver-driven), never a parallel composer. The InquiryDrawer is KEPT as the
 * synced expanded form-view for LOGGED-IN CLIENTS only (draft autosave, not an
 * instant submit) — reachable as a quiet secondary, the same inquiry expanded.
 */

import { pendingOfferingPayload } from "./_chat/pending-offering-store";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Mail } from "lucide-react";

import { InquiryDrawer } from "@/components/inquiry/InquiryDrawer";
import { Button } from "@/components/ui/button";
import { getTalentProfileInquireData } from "./talent-profile-inquire-data";
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
  /** tenantId for analytics events (from getPublicHostContext). */
  tenantId: string;
  /** tenantSlug for routing the submit through createInquiryFromIntent. */
  tenantSlug: string;
  /** Agency display name shown in the drawer header copy. */
  agencyName?: string;
  /** Source page for analytics + source attribution (e.g. /t/TA-12345). */
  sourcePage: string;
  /** Optional portrait for the lineup avatar fly/registry. */
  portraitUrl?: string | null;
  /** Button className override — caller controls placement context. */
  className?: string;
};

type InquireData = {
  pov: "client" | "guest";
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultCompany?: string;
  userId?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TalentProfileInquireButton({
  talentId,
  talentProfileCode,
  displayName,
  tenantId,
  tenantSlug,
  agencyName,
  sourcePage,
  portraitUrl = null,
  className,
}: TalentProfileInquireButtonProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InquireData | null>(null);
  const [, startTransition] = useTransition();
  const cart = useInquiryCart();
  const inquiryModal = useOptionalDirectoryInquiryModal();

  const loadData = useCallback(() => {
    startTransition(async () => {
      const result = await getTalentProfileInquireData();
      setData({
        pov: result.pov,
        defaultEmail: result.defaultEmail,
        defaultName: result.defaultName,
        defaultPhone: result.defaultPhone,
        defaultCompany: result.defaultCompany,
        userId: result.userId,
      });
    });
  }, []);

  // Pre-load on mount so we know guest-vs-client before the first click (the
  // guest path never opens the drawer, the client path opens it instantly).
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only prefetch: loadData is a stable useCallback with [] deps
  }, []);

  const firstName = displayName.split(" ")[0] ?? displayName;
  const isLoggedIn = data?.pov === "client";

  const handleClick = () => {
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.start_inquiry, {
      talent_id: talentId,
      source_page: sourcePage,
    });

    // GUEST (or pov still resolving): the canonical surface is the chat launcher.
    // Add this talent to the shared lineup (so the chat opens preloaded + the
    // rail avatar appears) and ask the launcher to open. NO parallel composer,
    // NO instant submit, the lineup is preserved.
    if (!isLoggedIn) {
      registerCartTalent(talentId, { displayName, portraitUrl });
      if (!cart.isInCart(talentId)) {
        cart.setInCart(
          { talentProfileId: talentId, profileCode: talentProfileCode, displayName },
          true,
          sourcePage,
        );
      }
      inquiryModal?.requestOpenChat();
      return;
    }

    // LOGGED-IN CLIENT: the InquiryDrawer is the synced form-view (draft
    // autosave, never an instant submit). Open it as the expanded form.
    if (!data) loadData();
    setOpen(true);
  };

  // Roster passed to the drawer's talent picker (client form-view only).
  const oneTalentRoster = [{ id: talentId, name: displayName }];

  return (
    <>
      <Button type="button" onClick={handleClick} className={className}>
        <Mail className="size-4" />
        Inquire about {firstName}
      </Button>

      {/* Client-only synced form-view of the SAME inquiry. Guests never reach
          this — they use the chat launcher (the one canonical surface). */}
      {isLoggedIn && open && data && (
        <InquiryDrawer
          source="public_talent_profile"
          initialIntent={{
            requester: {
              name: data.defaultName ?? "",
              email: data.defaultEmail ?? "",
              phone: data.defaultPhone ?? "",
              user_id: data.userId ?? null,
              trust_level: "verified",
            },
            client: {
              company: data.defaultCompany ?? "",
              same_as_requester: true,
            },
            talent: {
              selected_ids: [talentId],
              selection_mode: "i_know_who",
            },
            source_context: {
              referrer_page: sourcePage,
              public_profile_code: talentProfileCode,
              tenant_id: tenantId,
              // W3-4 — carry a storefront selection into the signed-in drawer
              // exactly like the guest chat does (structured provenance).
              ...(pendingOfferingPayload() ? { offering: pendingOfferingPayload() } : {}),
            },
          }}
          tenantSlug={tenantSlug}
          agencyName={agencyName ?? "the agency"}
          client={{
            user_id: data.userId ?? null,
            displayName: data.defaultName,
            email: data.defaultEmail,
            phone: data.defaultPhone,
            company: data.defaultCompany,
            trust_level: "verified",
          }}
          roster={oneTalentRoster}
          enableDraftAutosave
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
