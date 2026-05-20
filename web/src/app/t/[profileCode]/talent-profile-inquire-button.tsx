"use client";

/**
 * TalentProfileInquireButton — public-talent-profile "Inquire about X" CTA.
 *
 * Phase B-4 (2026-05-14) rewrite: now wraps the canonical InquiryDrawer
 * (web/src/components/inquiry/InquiryDrawer.tsx) per spec
 * web/docs/inquiry-engine-spec-2026-05-14.md. Source =
 * "public_talent_profile". Talent is pre-attached via initialIntent.
 *
 * Guest path: the drawer renders with name/email/phone fields visible and
 * autosave disabled (no draft for guests — they submit immediately and
 * receive a magic link after the inquiry lands).
 *
 * Logged-in path: prefilled requester info + trust card showing
 * verification + member info.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Mail, X } from "lucide-react";

import { InquiryDrawer } from "@/components/inquiry/InquiryDrawer";
import { Button } from "@/components/ui/button";
import { getTalentProfileInquireData } from "./talent-profile-inquire-data";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";

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
  /** Button className override — caller controls placement context. */
  className?: string;
};

type InquireData = {
  pov: "client" | "guest";
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultCompany?: string;
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
  className,
}: TalentProfileInquireButtonProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InquireData | null>(null);
  const [, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      const result = await getTalentProfileInquireData();
      setData({
        pov: result.pov,
        defaultEmail: result.defaultEmail,
        defaultName: result.defaultName,
        defaultPhone: result.defaultPhone,
        defaultCompany: result.defaultCompany,
      });
    });
  }, []);

  // Pre-load on mount so the drawer opens instantly when clicked.
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only prefetch: loadData is a stable useCallback with [] deps; preloads drawer data once on mount
  }, []);

  const handleOpen = () => {
    if (!data) loadData();
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.start_inquiry, {
      talent_id: talentId,
      source_page: sourcePage,
    });
    setOpen(true);
  };

  const firstName = displayName.split(" ")[0] ?? displayName;
  const isLoggedIn = data?.pov === "client";

  // Roster passed to the drawer's talent picker. For the public profile
  // path we only ship the one talent the visitor is inquiring about —
  // they can browse the agency's other talent on Discover before deciding
  // to inquire.
  const oneTalentRoster = [
    {
      id: talentId,
      name: displayName,
    },
  ];

  return (
    <>
      <Button type="button" onClick={handleOpen} className={className}>
        <Mail className="size-4" />
        Inquire about {firstName}
      </Button>

      {open && data && (
        <InquiryDrawer
          source="public_talent_profile"
          initialIntent={{
            requester: {
              name: data.defaultName ?? "",
              email: data.defaultEmail ?? "",
              phone: data.defaultPhone ?? "",
              trust_level: isLoggedIn ? "verified" : "basic",
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
            },
          }}
          tenantSlug={tenantSlug}
          agencyName={agencyName ?? "the agency"}
          client={
            isLoggedIn
              ? {
                  user_id: undefined, // server-resolved at submit time
                  displayName: data.defaultName,
                  email: data.defaultEmail,
                  phone: data.defaultPhone,
                  company: data.defaultCompany,
                  trust_level: "verified",
                }
              : null
          }
          roster={oneTalentRoster}
          // Guests submit immediately; logged-in clients can draft.
          enableDraftAutosave={isLoggedIn}
          onClose={() => setOpen(false)}
        />
      )}

      {/* When data is still loading and the user clicks fast, we show a
          minimal fallback so the click isn't lost. Hidden under the
          backdrop the drawer renders. */}
      {open && !data && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Loading inquiry form"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div className="rounded-lg bg-white px-6 py-4 text-sm text-foreground shadow-lg">
            Loading inquiry form…
            <X className="ml-3 inline size-4 cursor-pointer text-muted-foreground" />
          </div>
        </div>
      )}
    </>
  );
}
