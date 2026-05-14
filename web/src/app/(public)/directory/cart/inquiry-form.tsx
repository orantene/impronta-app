"use client";

/**
 * inquiry-form.tsx — thin wrappers around the canonical InquiryCartForm.
 *
 * Preserves named exports (InquiryForm, ClientInquiryForm, GuestInquiryForm)
 * so existing callers keep working without changes.  These wrappers live in
 * the public directory route segment and are always rendered inside
 * PublicDiscoveryStateProvider, so usePublicDiscoveryState() is safe to call.
 *
 * Step 2 of the inquiry-funnel sprint (2026-05-13).
 */

import {
  InquiryCartForm,
  type InquiryCartFormProps,
} from "@/components/inquiry-cart/InquiryCartForm";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

// ---------------------------------------------------------------------------
// Shared props that all three variants accept
// ---------------------------------------------------------------------------

type SharedProps = {
  agencyWhatsAppNumber?: string;
  talentIds: string[];
  eventTypes: { id: string; name_en: string }[];
  selectedTalent: {
    id: string;
    profile_code: string;
    display_name: string | null;
  }[];
  formCopy: DirectoryUiCopy["inquiryForm"];
  inquiryDraftEnabled?: boolean;
  locale?: string;
};

// ---------------------------------------------------------------------------
// Helper: map DiscoverySearchContext → InquiryCartFormProps["searchContext"]
// ---------------------------------------------------------------------------

function useCartSearchContext(): InquiryCartFormProps["searchContext"] {
  const { searchContext } = usePublicDiscoveryState();
  if (!searchContext) return null;
  return {
    q: searchContext.q,
    locationSlug: searchContext.locationSlug,
    sort: searchContext.sort,
    taxonomyTermIds: searchContext.taxonomyTermIds,
    sourcePage: searchContext.sourcePage,
  };
}

// ---------------------------------------------------------------------------
// ClientInquiryForm — authenticated visitor
// ---------------------------------------------------------------------------

export function ClientInquiryForm({
  agencyWhatsAppNumber,
  defaultCompany,
  talentIds,
  defaultEmail,
  defaultName,
  defaultPhone,
  eventTypes,
  selectedTalent,
  formCopy,
  inquiryDraftEnabled,
  locale,
}: SharedProps & {
  defaultCompany?: string;
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
}) {
  const searchContext = useCartSearchContext();

  return (
    <InquiryCartForm
      pov="client"
      tenantId=""
      sourceWorkspaceId={null}
      originDomain={null}
      prefilledTalentIds={talentIds}
      prefilledClient={{
        contactName: defaultName,
        company: defaultCompany,
        contactEmail: defaultEmail,
        contactPhone: defaultPhone,
      }}
      selectedTalent={selectedTalent}
      eventTypes={eventTypes}
      agencyWhatsAppNumber={agencyWhatsAppNumber}
      formCopy={formCopy}
      inquiryDraftEnabled={inquiryDraftEnabled}
      locale={locale}
      formId="inquiry-cart-form"
      searchContext={searchContext}
    />
  );
}

// ---------------------------------------------------------------------------
// GuestInquiryForm — unauthenticated visitor
// ---------------------------------------------------------------------------

export function GuestInquiryForm({
  agencyWhatsAppNumber,
  talentIds,
  eventTypes,
  selectedTalent,
  formCopy,
  inquiryDraftEnabled,
  locale,
}: SharedProps) {
  const searchContext = useCartSearchContext();

  return (
    <InquiryCartForm
      pov="guest"
      tenantId=""
      sourceWorkspaceId={null}
      originDomain={null}
      prefilledTalentIds={talentIds}
      selectedTalent={selectedTalent}
      eventTypes={eventTypes}
      agencyWhatsAppNumber={agencyWhatsAppNumber}
      formCopy={formCopy}
      inquiryDraftEnabled={inquiryDraftEnabled}
      locale={locale}
      formId="inquiry-cart-form"
      searchContext={searchContext}
    />
  );
}

// ---------------------------------------------------------------------------
// InquiryForm — mode-switched dispatcher (existing callers)
// ---------------------------------------------------------------------------

export function InquiryForm({
  agencyWhatsAppNumber,
  defaultCompany,
  talentIds,
  mode,
  defaultEmail,
  defaultName,
  defaultPhone,
  eventTypes,
  selectedTalent,
  formCopy,
  inquiryDraftEnabled,
  locale,
}: SharedProps & {
  mode: "client" | "guest";
  defaultCompany?: string;
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
}) {
  if (mode === "client") {
    return (
      <ClientInquiryForm
        agencyWhatsAppNumber={agencyWhatsAppNumber}
        talentIds={talentIds}
        defaultEmail={defaultEmail}
        defaultName={defaultName}
        defaultPhone={defaultPhone}
        defaultCompany={defaultCompany}
        eventTypes={eventTypes}
        selectedTalent={selectedTalent}
        formCopy={formCopy}
        inquiryDraftEnabled={inquiryDraftEnabled}
        locale={locale}
      />
    );
  }
  return (
    <GuestInquiryForm
      agencyWhatsAppNumber={agencyWhatsAppNumber}
      talentIds={talentIds}
      eventTypes={eventTypes}
      selectedTalent={selectedTalent}
      formCopy={formCopy}
      inquiryDraftEnabled={inquiryDraftEnabled}
      locale={locale}
    />
  );
}
