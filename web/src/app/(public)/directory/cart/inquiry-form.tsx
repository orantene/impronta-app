"use client";

import { useActionState, useMemo, useRef } from "react";

import { InquiryDraftAssistant } from "@/components/directory/inquiry-draft-assistant";
import { useFormStatus } from "react-dom";
import {
  submitClientInquiry,
  submitGuestInquiry,
  type InquiryFormState,
} from "@/app/(public)/directory/actions";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildInquiryWhatsAppMessage,
  buildWhatsAppHref,
} from "@/lib/inquiries";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

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
  selectedTalent: { id: string; profile_code: string; display_name: string | null }[];
  form: DirectoryUiCopy["inquiryForm"];
}) {
  const formRef = useRef<HTMLButtonElement | null>(null);
  const enabled = Boolean(agencyWhatsAppNumber && agencyWhatsAppNumber.trim().length > 0);

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={!enabled}
      title={enabled ? form.whatsAppTitleOn : form.whatsAppTitleOff}
      onClick={() => {
        if (!enabled) return;
        const form = formRef.current?.form;
        if (!form) return;

        const data = new FormData(form);
        const eventTypeSelect = form.querySelector<HTMLSelectElement>("#event_type_id");
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
          quantity: Number.parseInt(String(data.get("quantity") ?? ""), 10) || undefined,
          rawQuery: String(data.get("raw_query") ?? ""),
          talents: selectedTalent.map((talent) => ({
            id: talent.id,
            profileCode: talent.profile_code,
            displayName: talent.display_name,
          })),
        });

        window.open(buildWhatsAppHref(text, agencyWhatsAppNumber), "_blank", "noopener,noreferrer");
      }}
      ref={formRef}
    >
      {form.whatsAppCompose}
    </Button>
  );
}

function FormFields({
  agencyWhatsAppNumber,
  defaultEmail,
  defaultName,
  defaultPhone,
  defaultCompany,
  eventTypes,
  selectedTalent,
  talentIds,
  state,
  form,
  inquiryDraftEnabled,
  locale,
  formId,
}: {
  agencyWhatsAppNumber?: string;
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultCompany?: string;
  eventTypes: { id: string; name_en: string }[];
  selectedTalent: { id: string; profile_code: string; display_name: string | null }[];
  talentIds: string[];
  state: InquiryFormState;
  form: DirectoryUiCopy["inquiryForm"];
  inquiryDraftEnabled?: boolean;
  locale?: string;
  formId?: string;
}) {
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const { searchContext } = usePublicDiscoveryState();
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
        .map((t) => (t.display_name?.trim() ? t.display_name.trim() : t.profile_code))
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
      {state?.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-m text-destructive">
          {state.error}
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
}: {
  agencyWhatsAppNumber?: string;
  defaultCompany?: string;
  talentIds: string[];
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
  eventTypes: { id: string; name_en: string }[];
  selectedTalent: { id: string; profile_code: string; display_name: string | null }[];
  formCopy: DirectoryUiCopy["inquiryForm"];
  inquiryDraftEnabled?: boolean;
  locale?: string;
}) {
  const [state, formAction] = useActionState(submitClientInquiry, undefined);
  return (
    <form id="inquiry-cart-form" action={formAction} className="space-y-4">
      <FormFields
        agencyWhatsAppNumber={agencyWhatsAppNumber}
        talentIds={talentIds}
        defaultEmail={defaultEmail}
        defaultName={defaultName}
        defaultPhone={defaultPhone}
        defaultCompany={defaultCompany}
        eventTypes={eventTypes}
        selectedTalent={selectedTalent}
        state={state}
        form={formCopy}
        inquiryDraftEnabled={inquiryDraftEnabled}
        locale={locale}
        formId="inquiry-cart-form"
      />
    </form>
  );
}

export function GuestInquiryForm({
  agencyWhatsAppNumber,
  talentIds,
  eventTypes,
  selectedTalent,
  formCopy,
  inquiryDraftEnabled,
  locale,
}: {
  agencyWhatsAppNumber?: string;
  talentIds: string[];
  eventTypes: { id: string; name_en: string }[];
  selectedTalent: { id: string; profile_code: string; display_name: string | null }[];
  formCopy: DirectoryUiCopy["inquiryForm"];
  inquiryDraftEnabled?: boolean;
  locale?: string;
}) {
  const [state, formAction] = useActionState(submitGuestInquiry, undefined);
  return (
    <form id="inquiry-cart-form" action={formAction} className="space-y-4">
      <FormFields
        agencyWhatsAppNumber={agencyWhatsAppNumber}
        talentIds={talentIds}
        eventTypes={eventTypes}
        selectedTalent={selectedTalent}
        state={state}
        form={formCopy}
        inquiryDraftEnabled={inquiryDraftEnabled}
        locale={locale}
        formId="inquiry-cart-form"
      />
    </form>
  );
}

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
}: {
  agencyWhatsAppNumber?: string;
  defaultCompany?: string;
  talentIds: string[];
  mode: "client" | "guest";
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
  eventTypes: { id: string; name_en: string }[];
  selectedTalent: { id: string; profile_code: string; display_name: string | null }[];
  formCopy: DirectoryUiCopy["inquiryForm"];
  inquiryDraftEnabled?: boolean;
  locale?: string;
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
