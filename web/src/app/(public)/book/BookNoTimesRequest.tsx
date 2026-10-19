"use client";

/**
 * What /book shows for a service with no online times (B2/D3): friendly copy
 * and the request form, not a red error with a lone "Send a message" link.
 * The form is the same InquiryDrawer BookableComposer opens for a request.
 */

import Link from "next/link";
import { useState } from "react";
import { InquiryDrawer } from "@/components/inquiry/InquiryDrawer";
import type { BookableComposerClient } from "@/components/public-booking/BookableComposer";
import type { BookableOffering } from "@/components/public-booking/pick-bookable-offering";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";

type Translate = (key: string) => string;

export function bookNoTimesIntent(offering: BookableOffering): InquiryIntent {
  return {
    source: "offering_request",
    requester: {},
    talent: offering.talentProfileId
      ? { selected_ids: [offering.talentProfileId], selection_mode: "i_know_who" }
      : undefined,
    location: offering.locationLabel
      ? { city: offering.locationLabel, status: "confirmed" }
      : { status: "unconfirmed" },
  };
}

export function BookNoTimesRequest({
  offeringId,
  offering,
  tenantSlug,
  agencyName,
  signedIn,
  client,
  contactHref,
  t,
  bare = false,
}: {
  offeringId: string;
  offering: BookableOffering;
  tenantSlug: string;
  agencyName: string;
  signedIn: boolean;
  client: BookableComposerClient | null;
  contactHref: string | null;
  t: Translate;
  /** Button + drawer only: the picker above already explains why (B2/D3). */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-3" data-book-no-times={offeringId}>
      {bare ? null : (
        <p className="text-sm text-[var(--token-color-muted,rgba(11,11,13,0.62))]">
          {t("public.bookPage.noTimesRequest")}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-full bg-[#0B0B0D] px-5 py-2.5 text-sm font-medium text-white"
      >
        {t("public.bookPage.requestCta")}
      </button>
      {contactHref && !bare ? (
        <Link href={contactHref} className="text-sm underline">
          {t("public.bookPage.contactCta")}
        </Link>
      ) : null}
      {open ? (
        <InquiryDrawer
          source="offering_request"
          tenantSlug={tenantSlug}
          agencyName={agencyName}
          soloTalentName={null}
          client={
            signedIn && client
              ? {
                  displayName: client.displayName ?? undefined,
                  email: client.email ?? undefined,
                  phone: client.phone ?? undefined,
                  trust_level: "verified",
                }
              : null
          }
          enableDraftAutosave={false}
          bookableOffering={offering}
          followUpOnSite
          initialIntent={bookNoTimesIntent(offering)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
