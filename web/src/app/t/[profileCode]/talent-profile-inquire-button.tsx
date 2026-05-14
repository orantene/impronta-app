"use client";

/**
 * TalentProfileInquireButton — self-contained "Inquire about <Name>" CTA
 * for the public talent profile page (/t/[profileCode]).
 *
 * Opens a right-side Drawer containing the shared <InquiryCartForm> pre-
 * populated with just this talent. Does NOT depend on the directory's
 * DirectoryInquiryModalContext; it owns its own open/closed state so it
 * works on the /t/* route tree which has PublicDiscoveryStateProvider but
 * not DirectoryInquiryModalProvider.
 *
 * Step 10 of the inquiry-funnel sprint (2026-05-13).
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Mail, X } from "lucide-react";

import { InquiryCartForm } from "@/components/inquiry-cart/InquiryCartForm";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";
import { getTalentProfileInquireData } from "./talent-profile-inquire-data";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TalentProfileInquireButtonProps = {
  /** The talent_profiles.id — becomes prefilledTalentIds[0] in the form. */
  talentId: string;
  talentProfileCode: string;
  /** Display name used in button label and sheet title. */
  displayName: string;
  /** tenantId for analytics events (from getPublicHostContext). */
  tenantId: string;
  /** Source page for analytics + source attribution (e.g. /t/TA-12345). */
  sourcePage: string;
  /** Button className override — caller controls placement context. */
  className?: string;
};

type InquireData = {
  pov: "client" | "guest";
  eventTypes: Array<{ id: string; name_en: string }>;
  agencyWhatsAppNumber?: string;
  aiInquiryDraftEnabled: boolean;
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
  sourcePage,
  className,
}: TalentProfileInquireButtonProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InquireData | null>(null);
  const [_isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      const result = await getTalentProfileInquireData();
      setData(result);
    });
  }, []);

  // Pre-load on first render so the drawer opens instantly.
  useEffect(() => {
    loadData();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpen = () => {
    if (!data) {
      loadData();
    }
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.start_inquiry, {
      talent_id: talentId,
      source_page: sourcePage,
    });
    setOpen(true);
  };

  const selectedTalent = [
    {
      id: talentId,
      profile_code: talentProfileCode,
      display_name: displayName,
    },
  ];

  const firstName = displayName.split(" ")[0] ?? displayName;

  return (
    <>
      <Button
        type="button"
        onClick={handleOpen}
        className={className}
      >
        <Mail className="size-4" />
        Inquire about {firstName}
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          side="right"
          className="flex w-full max-w-lg flex-col border-l border-border/80 bg-background p-0 sm:max-w-xl"
        >
          <div className="border-b border-border/60 px-6 pb-4 pt-6 pr-14">
            <DrawerHeader className="space-y-1 p-0 text-left">
              <DrawerTitle className="font-display text-xl tracking-wide">
                Inquire about {displayName}
              </DrawerTitle>
              <DrawerDescription className="text-m text-muted-foreground">
                Fill in the form below and we&apos;ll get back to you shortly.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
            </DrawerClose>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
            {!data ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <InquiryCartForm
                pov={data.pov}
                tenantId={tenantId}
                sourceWorkspaceId={null}
                originDomain={null}
                prefilledTalentIds={[talentId]}
                selectedTalent={selectedTalent}
                eventTypes={data.eventTypes}
                agencyWhatsAppNumber={data.agencyWhatsAppNumber}
                inquiryDraftEnabled={data.aiInquiryDraftEnabled}
                prefilledClient={
                  data.pov === "client"
                    ? {
                        contactEmail: data.defaultEmail,
                        contactName: data.defaultName,
                        contactPhone: data.defaultPhone,
                        company: data.defaultCompany,
                      }
                    : undefined
                }
                formId="talent-profile-inquiry-form"
                searchContext={{
                  sourcePage,
                }}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
