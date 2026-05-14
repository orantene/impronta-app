"use client";

/**
 * NewInquiryForm — workspace dashboard new-inquiry form.
 *
 * Owns the <form> element + useActionState binding to
 * createClientWorkspaceInquiryAction (which handles tenant-scoped logic,
 * client-profile lookup, relationship upsert, and redirect).
 *
 * Renders InquiryCartFormFields for the shared field set so the UI stays
 * in sync with the public directory cart automatically.
 *
 * Step 2 of the inquiry-funnel sprint (2026-05-13).
 */

import { useActionState, useEffect, useRef } from "react";
import {
  createClientWorkspaceInquiryAction,
  type ClientWorkspaceInquiryActionState,
} from "./actions";
import {
  clearFormPersistence,
  useFormPersistence,
} from "@/lib/ui/use-form-persistence";
import { InquiryCartFormFields } from "@/components/inquiry-cart/InquiryCartForm";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";

type TalentOption = {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
};

type ClientSummary = {
  displayName: string;
  company?: string | null;
  agencyName: string;
};

export function NewInquiryForm({
  tenantSlug,
  client,
  roster,
  selectedTalentId,
  initialError,
}: {
  tenantSlug: string;
  client: ClientSummary;
  roster: TalentOption[];
  selectedTalentId?: string;
  initialError?: string;
}) {
  const initialState: ClientWorkspaceInquiryActionState = {
    error: initialError,
    values: {
      contactName: client.displayName,
      company: client.company ?? "",
      talentProfileId: selectedTalentId ?? "",
      eventDate: "",
      quantity: "",
      eventLocation: "",
      message: "",
    },
  };
  const [state, formAction, pending] = useActionState(
    createClientWorkspaceInquiryAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // F.9 — persist brief draft across reloads, tabs, and validation failures.
  useFormPersistence(formRef, {
    step: `inquiry-brief-${tenantSlug}`,
    exclude: ["contact_name", "company", "talent_ids", "tenantSlug"],
  });

  // Clear saved draft on confirmed success (action redirects; this is a
  // belt-and-suspenders guard for the rare non-redirect success path).
  useEffect(() => {
    if (state && !state.error && !pending) {
      clearFormPersistence(`inquiry-brief-${tenantSlug}`);
    }
  }, [state, pending, tenantSlug]);

  // Step 12: track form_started on mount and abandoned on unmount.
  const submittedRef = useRef(false);
  useEffect(() => {
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.inquiry_form_started, {
      surface: "dashboard_new",
      source_page: `/${tenantSlug}/client/inquiries/new`,
    });
    return () => {
      if (!submittedRef.current) {
        trackProductEvent(PRODUCT_ANALYTICS_EVENTS.inquiry_abandoned, {
          surface: "dashboard_new",
          source_page: `/${tenantSlug}/client/inquiries/new`,
        });
      }
    };
    // Mount-only — tenantSlug is stable per page render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map roster to the shape InquiryCartFormFields expects.
  const selectedTalent = roster.map((item) => ({
    id: item.id,
    // roster items don't carry a separate profile_code; use id as stable key
    profile_code: item.id,
    display_name: item.name,
  }));

  const prefilledTalentIds = selectedTalentId ? [selectedTalentId] : [];

  return (
    <form
      ref={formRef}
      id="new-inquiry-form"
      action={formAction}
      className="space-y-4"
      onSubmit={() => { submittedRef.current = true; }}
    >
      {/* tenantSlug is read by createClientWorkspaceInquiryAction for the
          workspace lookup — this hidden input must be preserved. */}
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      <InquiryCartFormFields
        defaultName={state.values.contactName}
        defaultCompany={state.values.company}
        talentIds={prefilledTalentIds}
        selectedTalent={selectedTalent}
        eventTypes={[]}
        error={state.error}
        formId="new-inquiry-form"
        searchContext={{ sourcePage: `/${tenantSlug}/client/inquiries/new` }}
      />
    </form>
  );
}
