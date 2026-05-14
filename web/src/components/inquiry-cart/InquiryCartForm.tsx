"use client";

/**
 * InquiryCartForm — canonical shared inquiry-create UI.
 *
 * Renders the full inquiry form for both the public directory cart
 * (pov="guest" | "client") and the workspace dashboard new-inquiry page
 * (pov="client").  All callers reference this single component so field
 * changes propagate everywhere automatically.
 *
 * Exports:
 *   InquiryCartForm          — full self-contained form with useActionState
 *   InquiryCartFormFields    — bare field set only (no <form> wrapper, no
 *                              action binding); use this when the caller owns
 *                              the <form> element and its server action.
 *   InquiryCartFormProps     — prop type for InquiryCartForm
 *   InquiryCartFormFieldsProps — prop type for InquiryCartFormFields
 *
 * Step 2 of the inquiry-funnel sprint (2026-05-13).
 */

import { useActionState, useEffect, useMemo, useRef } from "react";
import { useFormStatus } from "react-dom";

import { InquiryDraftAssistant } from "@/components/directory/inquiry-draft-assistant";
import {
  submitClientInquiry,
  submitGuestInquiry,
  type InquiryFormState,
} from "@/app/(public)/directory/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildInquiryWhatsAppMessage,
  buildWhatsAppHref,
} from "@/lib/inquiries";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";

// ---------------------------------------------------------------------------
// Public prop types
// ---------------------------------------------------------------------------

/** Shared discovery context that drives field defaults. */
export type InquirySearchContext = {
  q?: string;
  locationSlug?: string;
  sort?: string;
  taxonomyTermIds?: string[];
  sourcePage?: string;
};

export type InquiryCartFormProps = {
  /** "client" = authenticated user; "guest" = unauthenticated visitor. */
  pov: "client" | "guest";
  tenantId: string;
  sourceWorkspaceId: string | null;
  originDomain: string | null;
  /** Talent IDs to pre-select (from cart hydration or URL param). */
  prefilledTalentIds?: string[];
  /** Pre-fill contact fields from the authenticated client profile. */
  prefilledClient?: {
    contactName?: string;
    company?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  /** Passed through for future plan-gating (step 6). Unused now. */
  planTier?: "free" | "studio" | "agency" | "hub";
  locale?: string;
  formId?: string;
  /** Discovery context — injected by the public cart page; omit on dashboard. */
  searchContext?: InquirySearchContext | null;
  /** Talent display info for WhatsApp message + InquiryDraftAssistant. */
  selectedTalent?: Array<{
    id: string;
    profile_code: string;
    display_name: string | null;
  }>;
  /** Event types for the event_type_id select. */
  eventTypes?: Array<{ id: string; name_en: string }>;
  /** WhatsApp routing number (optional). */
  agencyWhatsAppNumber?: string;
  /** UI copy. Falls back to a minimal English default when omitted. */
  formCopy?: DirectoryUiCopy["inquiryForm"];
  /** Enable AI draft assistant. */
  inquiryDraftEnabled?: boolean;
  /** When supplied the form renders inside this — caller controls layout. */
  children?: React.ReactNode;
};

/**
 * Props for InquiryCartFormFields — the bare field set without a form wrapper.
 * Field names emitted are the canonical snake_case set:
 *   contact_name, contact_email, contact_phone, company, raw_query,
 *   event_type_id, event_date, event_location, quantity, message,
 *   talent_ids, source_page, directory_context, website (honeypot).
 */
export type InquiryCartFormFieldsProps = {
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultCompany?: string;
  eventTypes?: Array<{ id: string; name_en: string }>;
  selectedTalent?: Array<{
    id: string;
    profile_code: string;
    display_name: string | null;
  }>;
  talentIds?: string[];
  /** Server action error to display above the fields. */
  error?: string;
  agencyWhatsAppNumber?: string;
  formCopy?: DirectoryUiCopy["inquiryForm"];
  inquiryDraftEnabled?: boolean;
  locale?: string;
  formId?: string;
  searchContext?: InquirySearchContext | null;
};

// ---------------------------------------------------------------------------
// Minimal English copy fallback
// ---------------------------------------------------------------------------

const DEFAULT_COPY: DirectoryUiCopy["inquiryForm"] = {
  labelYourName: "Your name",
  labelEmail: "Email",
  labelPhone: "Phone",
  labelCompany: "Company",
  labelLookingFor: "What are you looking for?",
  placeholderLookingFor: "Describe the talent or service you need",
  labelEventType: "Event type",
  eventTypeNone: "Select…",
  labelEventDate: "Event date",
  labelEventLocation: "Event location",
  placeholderEventLocation: "City, venue…",
  labelQuantity: "How many?",
  placeholderQuantity: "e.g. 3",
  labelBrief: "Message",
  placeholderBrief:
    "Tell the agency what you are planning, date flexibility, usage, call time, styling…",
  privacyNotice: "We will only use your information to respond to your inquiry.",
  submitInquiry: "Send inquiry",
  sending: "Sending…",
  whatsAppCompose: "Open in WhatsApp",
  whatsAppTitleOn: "Continue in WhatsApp",
  whatsAppTitleOff: "WhatsApp not configured for this workspace",
  draftGenerate: "Draft with AI",
  draftPolish: "Polish",
  draftWorking: "Writing…",
  draftError: "Could not generate draft",
  draftPolishNeedText: "Add some text first",
  draftHint: "AI draft — review before sending",
};

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function SubmitButton({
  label,
  sendingLabel,
}: {
  label: string;
  sendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? sendingLabel : label}
    </Button>
  );
}

function WhatsAppButton({
  agencyWhatsAppNumber,
  selectedTalent,
  form,
}: {
  agencyWhatsAppNumber?: string;
  selectedTalent: Array<{
    id: string;
    profile_code: string;
    display_name: string | null;
  }>;
  form: DirectoryUiCopy["inquiryForm"];
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const enabled = Boolean(
    agencyWhatsAppNumber && agencyWhatsAppNumber.trim().length > 0,
  );

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={!enabled}
      title={enabled ? form.whatsAppTitleOn : form.whatsAppTitleOff}
      ref={buttonRef}
      onClick={() => {
        if (!enabled) return;
        const htmlForm = buttonRef.current?.form;
        if (!htmlForm) return;

        const data = new FormData(htmlForm);
        const eventTypeSelect =
          htmlForm.querySelector<HTMLSelectElement>("#event_type_id");
        const eventTypeNameRaw =
          eventTypeSelect?.selectedOptions[0]?.textContent?.trim() || "";
        const eventTypeName =
          eventTypeNameRaw && eventTypeNameRaw !== form.eventTypeNone
            ? eventTypeNameRaw
            : "";

        const text = buildInquiryWhatsAppMessage({
          company: String(data.get("company") ?? ""),
          contactEmail: String(data.get("contact_email") ?? ""),
          contactName: String(data.get("contact_name") ?? ""),
          contactPhone: String(data.get("contact_phone") ?? ""),
          eventDate: String(data.get("event_date") ?? ""),
          eventLocation: String(data.get("event_location") ?? ""),
          eventTypeName: eventTypeName || undefined,
          message: String(data.get("message") ?? ""),
          quantity:
            Number.parseInt(String(data.get("quantity") ?? ""), 10) ||
            undefined,
          rawQuery: String(data.get("raw_query") ?? ""),
          talents: selectedTalent.map((t) => ({
            id: t.id,
            profileCode: t.profile_code,
            displayName: t.display_name,
          })),
        });

        window.open(
          buildWhatsAppHref(text, agencyWhatsAppNumber),
          "_blank",
          "noopener,noreferrer",
        );
      }}
    >
      {form.whatsAppCompose}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// FormBody — shared field set (used by InquiryCartFormFields + internal forms)
// ---------------------------------------------------------------------------

function FormBody({
  agencyWhatsAppNumber,
  defaultEmail,
  defaultName,
  defaultPhone,
  defaultCompany,
  eventTypes = [],
  selectedTalent = [],
  talentIds = [],
  error,
  form,
  inquiryDraftEnabled,
  locale,
  formId,
  searchContext,
}: {
  agencyWhatsAppNumber?: string;
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultCompany?: string;
  eventTypes: Array<{ id: string; name_en: string }>;
  selectedTalent: Array<{
    id: string;
    profile_code: string;
    display_name: string | null;
  }>;
  talentIds: string[];
  error?: string;
  form: DirectoryUiCopy["inquiryForm"];
  inquiryDraftEnabled?: boolean;
  locale?: string;
  formId?: string;
  searchContext?: InquirySearchContext | null;
}) {
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const directoryContext = useMemo(
    () =>
      JSON.stringify({
        q: searchContext?.q ?? null,
        locationSlug: searchContext?.locationSlug ?? null,
        sort: searchContext?.sort ?? null,
        taxonomyTermIds: searchContext?.taxonomyTermIds ?? [],
      }),
    [searchContext],
  );

  const draftTalentNames = useMemo(
    () =>
      selectedTalent
        .map((t) =>
          t.display_name?.trim() ? t.display_name.trim() : t.profile_code,
        )
        .filter(Boolean),
    [selectedTalent],
  );

  const effFormId = formId ?? "inquiry-cart-form";
  const effLocale = locale ?? "en";

  return (
    <>
      <input type="hidden" name="talent_ids" value={talentIds.join(",")} />
      <input
        type="hidden"
        name="source_page"
        value={searchContext?.sourcePage ?? "/directory"}
      />
      <input
        type="hidden"
        name="directory_context"
        value={directoryContext}
      />
      {/* Universal-connector P0 (2026-05-13) — honeypot. Hidden from
          humans (off-screen + tabIndex=-1 + autocomplete=off). Bots
          tend to fill every input; submitGuestInquiry returns a fake
          success redirect when this field comes back non-empty. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          height: 0,
          width: 0,
          overflow: "hidden",
        }}
      >
        <label>
          Website (leave empty)
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-m text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact_name">{form.labelYourName}</Label>
          <Input
            id="contact_name"
            name="contact_name"
            required
            defaultValue={defaultName}
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_email">{form.labelEmail}</Label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            required
            defaultValue={defaultEmail}
            autoComplete="email"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact_phone">{form.labelPhone}</Label>
        <Input
          id="contact_phone"
          name="contact_phone"
          type="tel"
          defaultValue={defaultPhone}
          autoComplete="tel"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company">{form.labelCompany}</Label>
        <Input
          id="company"
          name="company"
          defaultValue={defaultCompany}
          autoComplete="organization"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="raw_query">{form.labelLookingFor}</Label>
        <Textarea
          id="raw_query"
          name="raw_query"
          defaultValue={searchContext?.q ?? ""}
          rows={3}
          placeholder={form.placeholderLookingFor}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="event_type_id">{form.labelEventType}</Label>
          <select
            id="event_type_id"
            name="event_type_id"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-m shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{form.eventTypeNone}</option>
            {eventTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name_en}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="event_date">{form.labelEventDate}</Label>
          <Input id="event_date" name="event_date" type="date" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="event_location">{form.labelEventLocation}</Label>
          <Input
            id="event_location"
            name="event_location"
            placeholder={form.placeholderEventLocation}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantity">{form.labelQuantity}</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder={form.placeholderQuantity}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">{form.labelBrief}</Label>
        {inquiryDraftEnabled ? (
          <InquiryDraftAssistant
            formId={effFormId}
            locale={effLocale}
            talentNames={draftTalentNames}
            formCopy={form}
            messageTextareaRef={messageRef}
          />
        ) : null}
        <Textarea
          ref={messageRef}
          id="message"
          name="message"
          placeholder={form.placeholderBrief}
          rows={4}
        />
      </div>
      {/* Step 14 — attachments hint. The uploader itself lives on the
          inquiry detail page (post-create) because File objects can't
          survive the form-action redirect. Once the inquiry exists the
          client can attach mood boards, contracts, references from the
          Files sheet. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: "rgba(29,78,216,0.06)",
          border: "1px solid rgba(29,78,216,0.15)",
          borderRadius: 8,
          fontSize: 12,
          color: "#1D4ED8",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M3 1.5h5l3 3v7.5a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5z M8 1.5V4.5h3"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
        <span>
          You&rsquo;ll be able to attach mood boards, briefs, and references
          right after sending — no need to email them separately.
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{form.privacyNotice}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SubmitButton label={form.submitInquiry} sendingLabel={form.sending} />
        <WhatsAppButton
          agencyWhatsAppNumber={agencyWhatsAppNumber}
          selectedTalent={selectedTalent}
          form={form}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// InquiryCartFormFields — exported bare field set (no <form>, no action)
// ---------------------------------------------------------------------------

export function InquiryCartFormFields({
  defaultEmail,
  defaultName,
  defaultPhone,
  defaultCompany,
  eventTypes = [],
  selectedTalent = [],
  talentIds = [],
  error,
  agencyWhatsAppNumber,
  formCopy,
  inquiryDraftEnabled,
  locale,
  formId,
  searchContext,
}: InquiryCartFormFieldsProps) {
  return (
    <FormBody
      defaultEmail={defaultEmail}
      defaultName={defaultName}
      defaultPhone={defaultPhone}
      defaultCompany={defaultCompany}
      eventTypes={eventTypes}
      selectedTalent={selectedTalent}
      talentIds={talentIds}
      error={error}
      agencyWhatsAppNumber={agencyWhatsAppNumber}
      form={formCopy ?? DEFAULT_COPY}
      inquiryDraftEnabled={inquiryDraftEnabled}
      locale={locale}
      formId={formId}
      searchContext={searchContext}
    />
  );
}

// ---------------------------------------------------------------------------
// Internal client/guest variants (own <form> + useActionState binding)
// ---------------------------------------------------------------------------

function ClientForm({
  talentIds,
  selectedTalent,
  eventTypes,
  agencyWhatsAppNumber,
  prefilledClient,
  formCopy,
  inquiryDraftEnabled,
  locale,
  formId,
  searchContext,
  submittedRef,
}: {
  talentIds: string[];
  selectedTalent: Array<{ id: string; profile_code: string; display_name: string | null }>;
  eventTypes: Array<{ id: string; name_en: string }>;
  agencyWhatsAppNumber?: string;
  prefilledClient?: InquiryCartFormProps["prefilledClient"];
  formCopy?: DirectoryUiCopy["inquiryForm"];
  inquiryDraftEnabled?: boolean;
  locale?: string;
  formId?: string;
  searchContext?: InquirySearchContext | null;
  submittedRef: React.MutableRefObject<boolean>;
}) {
  const [state, formAction] = useActionState<InquiryFormState, FormData>(
    submitClientInquiry,
    undefined,
  );
  const effFormId = formId ?? "inquiry-cart-form";
  return (
    <form id={effFormId} action={formAction} className="space-y-4" onSubmit={() => { submittedRef.current = true; }}>
      <FormBody
        agencyWhatsAppNumber={agencyWhatsAppNumber}
        talentIds={talentIds}
        defaultEmail={prefilledClient?.contactEmail}
        defaultName={prefilledClient?.contactName}
        defaultPhone={prefilledClient?.contactPhone}
        defaultCompany={prefilledClient?.company}
        eventTypes={eventTypes}
        selectedTalent={selectedTalent}
        error={state?.error}
        form={formCopy ?? DEFAULT_COPY}
        inquiryDraftEnabled={inquiryDraftEnabled}
        locale={locale}
        formId={effFormId}
        searchContext={searchContext}
      />
    </form>
  );
}

function GuestForm({
  talentIds,
  selectedTalent,
  eventTypes,
  agencyWhatsAppNumber,
  formCopy,
  inquiryDraftEnabled,
  locale,
  formId,
  searchContext,
  submittedRef,
}: {
  talentIds: string[];
  selectedTalent: Array<{ id: string; profile_code: string; display_name: string | null }>;
  eventTypes: Array<{ id: string; name_en: string }>;
  agencyWhatsAppNumber?: string;
  formCopy?: DirectoryUiCopy["inquiryForm"];
  inquiryDraftEnabled?: boolean;
  locale?: string;
  formId?: string;
  searchContext?: InquirySearchContext | null;
  submittedRef: React.MutableRefObject<boolean>;
}) {
  const [state, formAction] = useActionState<InquiryFormState, FormData>(
    submitGuestInquiry,
    undefined,
  );
  const effFormId = formId ?? "inquiry-cart-form";
  return (
    <form id={effFormId} action={formAction} className="space-y-4" onSubmit={() => { submittedRef.current = true; }}>
      <FormBody
        agencyWhatsAppNumber={agencyWhatsAppNumber}
        talentIds={talentIds}
        eventTypes={eventTypes}
        selectedTalent={selectedTalent}
        error={state?.error}
        form={formCopy ?? DEFAULT_COPY}
        inquiryDraftEnabled={inquiryDraftEnabled}
        locale={locale}
        formId={effFormId}
        searchContext={searchContext}
      />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Public export — canonical surface
// ---------------------------------------------------------------------------

export function InquiryCartForm(props: InquiryCartFormProps) {
  const {
    pov,
    tenantId,
    prefilledTalentIds = [],
    selectedTalent = [],
    eventTypes = [],
    searchContext,
  } = props;

  const talentIds =
    prefilledTalentIds.length > 0
      ? prefilledTalentIds
      : selectedTalent.map((t) => t.id);

  // Step 12: track form_started on mount and abandoned on unmount.
  // submittedRef is set to true in the form's onSubmit so the cleanup
  // knows NOT to fire inquiry_abandoned when the submit causes a redirect.
  const submittedRef = useRef(false);

  const surface: string = searchContext?.sourcePage?.includes("talent")
    ? "talent_page_cta"
    : "directory_cart";
  const sourcePage = searchContext?.sourcePage ?? "/directory";

  useEffect(() => {
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.inquiry_form_started, {
      surface,
      tenant_id: tenantId,
      source_page: sourcePage,
    });
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (!submittedRef.current) {
        trackProductEvent(PRODUCT_ANALYTICS_EVENTS.inquiry_abandoned, {
          surface,
          tenant_id: tenantId,
          source_page: sourcePage,
        });
      }
    };
    // Mount-only — surface/sourcePage are stable for the lifetime of this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sharedProps = {
    talentIds,
    selectedTalent,
    eventTypes,
    agencyWhatsAppNumber: props.agencyWhatsAppNumber,
    formCopy: props.formCopy,
    inquiryDraftEnabled: props.inquiryDraftEnabled,
    locale: props.locale,
    formId: props.formId,
    searchContext,
    submittedRef,
  };

  if (pov === "client") {
    return (
      <ClientForm
        {...sharedProps}
        prefilledClient={props.prefilledClient}
      />
    );
  }
  return <GuestForm {...sharedProps} />;
}
