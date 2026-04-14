"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  createBooking,
  updateInquiry,
  updateInquiryClientInfo,
  updateInquiryLocation,
  updateInquiryRequestDetails,
  type AdminActionState,
} from "@/app/(dashboard)/admin/actions";
import { AdminNewClientSheet } from "@/app/(dashboard)/admin/clients/admin-new-client-sheet";
import { AdminClientSearchPicker } from "@/components/admin/admin-client-search-picker";
import { CreateClientAccountSheet, EditClientAccountButton, type ClientLocationFormValues } from "@/components/admin/create-client-account-sheet";
import { CreateClientContactSheetTrigger } from "@/components/admin/create-client-contact-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import {
  BOOKING_STATUS_VALUES,
  INQUIRY_SOURCE_CHANNEL_VALUES,
  INQUIRY_STATUS_VALUES,
} from "@/lib/admin/validation";

type ContactOption = { id: string; client_account_id: string; label: string };
type AccountOption = { id: string; name: string };

function channelLabel(value: string) {
  return value.replace(/_/g, " ");
}

export function InquiryClientCardForm({
  inquiry,
  linkedClient,
}: {
  inquiry: {
    id: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string | null;
    company: string | null;
    client_user_id: string | null;
  };
  linkedClient: { id: string; displayName: string | null } | null;
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(updateInquiryClientInfo, undefined);
  const [selectedClient, setSelectedClient] = useState<{
    id: string;
    displayName: string | null;
    subtitle: string | null;
  } | null>(
    linkedClient
      ? {
          id: linkedClient.id,
          displayName: linkedClient.displayName,
          subtitle: null,
        }
      : null,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="inquiry_id" value={inquiry.id} />
      <input type="hidden" name="client_user_id" value={selectedClient?.id ?? ""} />

      <div className="flex flex-wrap gap-2">
        <AdminNewClientSheet
          triggerLabel="Add new client"
          triggerVariant="outline"
          onCreatedClient={(client) => setSelectedClient(client)}
        />
        {selectedClient?.id ? (
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/admin/clients/${selectedClient.id}`} scroll={false}>
              Edit client
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Linked platform client</Label>
        <AdminClientSearchPicker
          selectedClient={selectedClient}
          onSelect={(client) => setSelectedClient(client)}
          helpText="Optional. Link the inquiry to a platform client while keeping the inquiry snapshot person-focused."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="contact_name">Name</Label>
          <Input id="contact_name" name="contact_name" defaultValue={inquiry.contact_name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_email">Email</Label>
          <Input id="contact_email" name="contact_email" type="email" defaultValue={inquiry.contact_email} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_phone">Phone</Label>
          <Input id="contact_phone" name="contact_phone" defaultValue={inquiry.contact_phone ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="company">Company (optional)</Label>
          <Input id="company" name="company" defaultValue={inquiry.company ?? ""} />
        </div>
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save client"}
      </Button>
    </form>
  );
}

export function InquiryLocationCardForm({
  inquiryId,
  accounts,
  contacts,
  currentAccountId,
  currentContactId,
  currentAccount,
}: {
  inquiryId: string;
  accounts: AccountOption[];
  contacts: ContactOption[];
  currentAccountId: string | null;
  currentContactId: string | null;
  currentAccount: ClientLocationFormValues | null;
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(updateInquiryLocation, undefined);
  const [accountId, setAccountId] = useState(currentAccountId ?? "");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts.slice(0, 100);
    return accounts.filter((account) => account.name.toLowerCase().includes(q)).slice(0, 100);
  }, [accounts, query]);
  const filteredContacts = accountId ? contacts.filter((contact) => contact.client_account_id === accountId) : [];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="inquiry_id" value={inquiryId} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          Add new location
        </Button>
        <CreateClientAccountSheet open={createOpen} onOpenChange={setCreateOpen} linkInquiryId={inquiryId} />
        {currentAccount ? <EditClientAccountButton account={currentAccount} label="Edit location" /> : null}
        {accountId ? (
          <CreateClientContactSheetTrigger
            accountOptions={accounts}
            lockedAccountId={accountId}
            lockedAccountName={currentAccount?.name ?? null}
            linkInquiryId={inquiryId}
            variant="outline"
            label="Add secondary contact"
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="client_account_search">Find location</Label>
        <Input
          id="client_account_search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search location by name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="client_account_id">Work Location</Label>
        <select
          id="client_account_id"
          name="client_account_id"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className={ADMIN_FORM_CONTROL}
        >
          <option value="">— None —</option>
          {filteredAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="client_contact_id">Secondary contact</Label>
        <select
          id="client_contact_id"
          name="client_contact_id"
          defaultValue={currentContactId ?? ""}
          key={`${accountId}-${currentContactId ?? ""}`}
          className={ADMIN_FORM_CONTROL}
          disabled={!accountId}
        >
          <option value="">— None —</option>
          {filteredContacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Keep this optional and location-scoped.</p>
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save location"}
      </Button>
    </form>
  );
}

export function InquiryRequestDetailsForm({
  inquiry,
}: {
  inquiry: {
    id: string;
    raw_ai_query: string | null;
    message: string | null;
    event_location: string | null;
    source_channel: string;
    staff_notes: string | null;
  };
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(updateInquiryRequestDetails, undefined);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="inquiry_id" value={inquiry.id} />
      <div className="space-y-2">
        <Label htmlFor="raw_ai_query">Request summary</Label>
        <Input id="raw_ai_query" name="raw_ai_query" defaultValue={inquiry.raw_ai_query ?? ""} placeholder="Short operational title for this request" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Brief / notes</Label>
        <Textarea id="message" name="message" rows={4} defaultValue={inquiry.message ?? ""} placeholder="Scope, deliverables, timing, or any client-facing context." />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-2">
          <Label htmlFor="event_location">Event location / setup detail</Label>
          <Input id="event_location" name="event_location" defaultValue={inquiry.event_location ?? ""} placeholder="Only if the exact event spot differs from the Work Location above" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Use this for the exact on-site spot, room, or setup note when it is more specific than the main Work Location.
          </p>
        </div>
        <div className="space-y-2 rounded-2xl border border-border/45 bg-muted/10 p-3">
          <Label htmlFor="source_channel">Source channel</Label>
          <select id="source_channel" name="source_channel" defaultValue={inquiry.source_channel} className={ADMIN_FORM_CONTROL}>
            {INQUIRY_SOURCE_CHANNEL_VALUES.map((channel) => (
              <option key={channel} value={channel}>
                {channelLabel(channel)}
              </option>
            ))}
          </select>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Operational metadata only. Keep it accurate so staff can trace where the request came from without turning it into a major business field.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff_notes">Internal notes</Label>
        <Textarea id="staff_notes" name="staff_notes" rows={3} defaultValue={inquiry.staff_notes ?? ""} placeholder="Internal handoff notes, blockers, or follow-up context for the team." />
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}

export function InquiryUpdateForm({
  inquiry,
  staff,
}: {
  inquiry: {
    id: string;
    status: string;
    assigned_staff_id: string | null;
    closed_reason: string | null;
    staff_notes: string | null;
    client_account_id: string | null;
    client_contact_id: string | null;
    source_channel: string;
  };
  staff: { id: string; display_name: string | null }[];
}) {
  const [state, formAction] = useActionState(updateInquiry, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="inquiry_id" value={inquiry.id} />
      <input type="hidden" name="staff_notes" value={inquiry.staff_notes ?? ""} />
      <input type="hidden" name="client_account_id" value={inquiry.client_account_id ?? ""} />
      <input type="hidden" name="client_contact_id" value={inquiry.client_contact_id ?? ""} />
      <input type="hidden" name="source_channel" value={inquiry.source_channel} />
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="status">Workflow status</Label>
          <select id="status" name="status" defaultValue={inquiry.status} className={ADMIN_FORM_CONTROL}>
            {INQUIRY_STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="assigned_staff_id">Assigned</Label>
          <select id="assigned_staff_id" name="assigned_staff_id" defaultValue={inquiry.assigned_staff_id ?? ""} className={ADMIN_FORM_CONTROL}>
            <option value="">—</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.display_name ?? person.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="closed_reason">Closed / lost reason</Label>
          <Input id="closed_reason" name="closed_reason" defaultValue={inquiry.closed_reason ?? ""} placeholder="Optional" />
        </div>
      </div>
      <Button type="submit" size="sm">
        Save operations
      </Button>
    </form>
  );
}

export function NewBookingForm({
  inquiryId,
  talentOptions,
}: {
  inquiryId: string;
  talentOptions: { id: string; profile_code: string; display_name: string | null }[];
}) {
  const [state, formAction] = useActionState(createBooking, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="inquiry_id" value={inquiryId} />
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" placeholder="e.g. Hotel activation" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="talent_profile_id">Talent (optional)</Label>
        <select id="talent_profile_id" name="talent_profile_id" className={ADMIN_FORM_CONTROL}>
          <option value="">—</option>
          {talentOptions.map((talent) => (
            <option key={talent.id} value={talent.id}>
              {talent.profile_code} · {talent.display_name ?? "Talent"}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="booking_status">Booking status</Label>
        <select id="booking_status" name="booking_status" defaultValue="draft" className={ADMIN_FORM_CONTROL}>
          {BOOKING_STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="starts_at">Starts</Label>
          <Input id="starts_at" name="starts_at" type="datetime-local" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ends_at">Ends</Label>
          <Input id="ends_at" name="ends_at" type="datetime-local" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
      <Button type="submit" variant="secondary">
        Add booking
      </Button>
    </form>
  );
}
