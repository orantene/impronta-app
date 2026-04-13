"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createManualInquiry } from "@/app/(dashboard)/admin/actions";
import { AdminNewClientSheet } from "@/app/(dashboard)/admin/clients/admin-new-client-sheet";
import type { AccountOption } from "@/app/(dashboard)/admin/accounts/[id]/add-contact-form";
import { AdminClientSearchPicker } from "@/components/admin/admin-client-search-picker";
import { InquiryTalentDraftField } from "@/components/admin/inquiry-talent-editor";
import { CreateClientAccountSheet } from "@/components/admin/create-client-account-sheet";
import { Button } from "@/components/ui/button";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { INQUIRY_SOURCE_CHANNEL_VALUES } from "@/lib/admin/validation";

type Contact = { id: string; client_account_id: string; label: string };
type TalentOption = { id: string; profile_code: string; display_name: string | null };

function channelLabel(ch: string) {
  return ch.replace(/_/g, " ");
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/45 bg-muted/10 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function AdminNewInquirySheetBody({
  onClose,
  accounts,
  contacts,
  talents,
}: {
  onClose: () => void;
  accounts: AccountOption[];
  contacts: Contact[];
  talents: TalentOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(createManualInquiry, undefined);
  const [accountId, setAccountId] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<{
    id: string;
    displayName: string | null;
    subtitle: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
  } | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [contactMode, setContactMode] = useState<"selected_client" | "different_contact">("different_contact");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [clientSnapshotLoading, setClientSnapshotLoading] = useState(false);

  useEffect(() => {
    if (!selectedClient?.id) return;
    if (selectedClient.email != null || selectedClient.phone != null || selectedClient.company != null) {
      return;
    }

    let cancelled = false;
    setClientSnapshotLoading(true);

    (async () => {
      try {
        const response = await fetch(`/api/admin/clients/${selectedClient.id}/snapshot`, {
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Failed");
        const snapshot = (await response.json()) as {
          id: string;
          displayName: string | null;
          email: string | null;
          phone: string | null;
          company: string | null;
        };
        if (cancelled) return;
        setSelectedClient((current) =>
          current && current.id === snapshot.id
            ? {
                ...current,
                displayName: snapshot.displayName,
                email: snapshot.email,
                phone: snapshot.phone,
                company: snapshot.company,
              }
            : current,
        );
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) setClientSnapshotLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedClient]);

  useEffect(() => {
    if (contactMode !== "selected_client" || !selectedClient) return;
    setContactName(selectedClient.displayName ?? "");
    setContactEmail(selectedClient.email ?? "");
    setContactPhone(selectedClient.phone ?? "");
    setContactCompany(selectedClient.company ?? selectedClient.subtitle ?? "");
  }, [contactMode, selectedClient]);

  const filteredContacts = accountId ? contacts.filter((c) => c.client_account_id === accountId) : [];
  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase();
    if (!q) return accounts.slice(0, 100);
    return accounts.filter((account) => account.name.toLowerCase().includes(q)).slice(0, 100);
  }, [accountQuery, accounts]);

  useEffect(() => {
    if (state?.createdInquiryId) {
      router.refresh();
    }
  }, [router, state?.createdInquiryId]);

  if (state?.createdInquiryId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Inquiry created. Client, location, shortlist, and details were saved in one pass.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="rounded-full" asChild>
            <Link href={`/admin/inquiries/${state.createdInquiryId}`} scroll={false}>
              Open inquiry
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              formRef.current?.reset();
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="submit_mode" value="sheet" />
      <input type="hidden" name="client_user_id" value={selectedClient?.id ?? ""} />

      <SectionCard
        title="1. Client"
        description="The person making the request. Link an existing client login if there is one, then keep the snapshot fields person-focused."
      >
        <div className="flex flex-wrap gap-2">
          <AdminNewClientSheet
            triggerLabel="Add new client"
            triggerVariant="outline"
            onCreatedClient={(client) => setSelectedClient(client)}
          />
        </div>
        <div className="space-y-2">
          <Label>Find existing client</Label>
          <AdminClientSearchPicker
            selectedClient={selectedClient}
            onSelect={(client) => {
              setSelectedClient(client);
              if (!client && contactMode === "selected_client") {
                setContactMode("different_contact");
                setContactName("");
                setContactEmail("");
                setContactPhone("");
                setContactCompany("");
              }
            }}
            helpText="Optional. Search platform clients by name, email, or phone."
          />
        </div>
        <div className="space-y-2">
          <Label>Contact for this inquiry</Label>
          <div className="space-y-2 rounded-xl border border-border/45 bg-background/70 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="client_contact_mode"
                value="selected_client"
                checked={contactMode === "selected_client"}
                onChange={() => {
                  setContactMode("selected_client");
                  if (selectedClient) {
                    setContactName(selectedClient.displayName ?? "");
                    setContactEmail(selectedClient.email ?? "");
                    setContactPhone(selectedClient.phone ?? "");
                    setContactCompany(selectedClient.company ?? selectedClient.subtitle ?? "");
                  }
                }}
                disabled={!selectedClient}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-foreground">Use selected client information</span>
                <span className="block text-xs text-muted-foreground">
                  Autofill the inquiry contact snapshot from the linked client.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="client_contact_mode"
                value="different_contact"
                checked={contactMode === "different_contact"}
                onChange={() => setContactMode("different_contact")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-foreground">Enter a different contact for this inquiry</span>
                <span className="block text-xs text-muted-foreground">
                  Keep the linked Client as-is, but use a different inquiry contact snapshot.
                </span>
              </span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            These fields are saved on the inquiry only. They do not overwrite the linked Client record.
          </p>
          {contactMode === "selected_client" && !selectedClient ? (
            <p className="text-xs text-muted-foreground">Select a client first to use their information.</p>
          ) : null}
          {contactMode === "selected_client" && clientSnapshotLoading ? (
            <p className="text-xs text-muted-foreground">Loading selected client information…</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_contact_name">Name</Label>
            <Input
              id="ni_contact_name"
              name="contact_name"
              required
              autoComplete="name"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ni_contact_email">Email</Label>
            <Input
              id="ni_contact_email"
              name="contact_email"
              type="email"
              required
              autoComplete="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ni_contact_phone">Phone</Label>
            <Input
              id="ni_contact_phone"
              name="contact_phone"
              type="tel"
              autoComplete="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_company">Company (optional)</Label>
            <Input
              id="ni_company"
              name="company"
              autoComplete="organization"
              value={contactCompany}
              onChange={(event) => setContactCompany(event.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="2. Client Location"
        description="The place or business the work is for. One client can have many locations."
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setLocationOpen(true)}>
            Add new location
          </Button>
          <CreateClientAccountSheet open={locationOpen} onOpenChange={setLocationOpen} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ni_account_search">Find location</Label>
          <Input
            id="ni_account_search"
            value={accountQuery}
            onChange={(event) => setAccountQuery(event.target.value)}
            placeholder="Search location by name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ni_account">Client Location</Label>
          <select
            id="ni_account"
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
          <Label htmlFor="ni_contact">Secondary contact (optional)</Label>
          <select id="ni_contact" name="client_contact_id" className={ADMIN_FORM_CONTROL} defaultValue="" disabled={!accountId}>
            <option value="">— None —</option>
            {filteredContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">This stays scoped to the selected Client Location.</p>
        </div>
      </SectionCard>

      <SectionCard
        title="3. Requested Talent"
        description="Inquiry-owned shortlist. Add the represented talent requested for this lead."
      >
        <InquiryTalentDraftField talents={talents} />
      </SectionCard>

      <SectionCard
        title="4. Details"
        description="Keep this concise so staff can triage and convert quickly."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_raw_ai_query">Request summary</Label>
            <Input id="ni_raw_ai_query" name="raw_ai_query" placeholder="e.g. 3 promo models for a beach club launch" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_message">Brief / notes</Label>
            <Textarea id="ni_message" name="message" rows={3} placeholder="Timing, dress code, languages, priorities…" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ni_event_location">Event location (optional)</Label>
            <Input id="ni_event_location" name="event_location" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ni_source_channel">Source channel</Label>
            <select id="ni_source_channel" name="source_channel" defaultValue="phone" className={ADMIN_FORM_CONTROL}>
              {INQUIRY_SOURCE_CHANNEL_VALUES.map((ch) => (
                <option key={ch} value={ch}>
                  {channelLabel(ch)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_staff_notes">Internal notes</Label>
            <Textarea id="ni_staff_notes" name="staff_notes" rows={2} placeholder="Staff-only context." />
          </div>
        </div>
      </SectionCard>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="rounded-full" disabled={pending}>
          {pending ? "Saving…" : "Save inquiry"}
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AdminNewInquirySheet({
  accounts,
  contacts,
  talents,
}: {
  accounts: AccountOption[];
  contacts: Contact[];
  talents: TalentOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        New inquiry
      </Button>
      <DashboardEditPanel
        open={open}
        onOpenChange={setOpen}
        title="New inquiry"
        description="Create a request around the same four anchors used on the inquiry workspace: client, client location, requested talent, and details."
        className="max-w-[860px]"
      >
        {open ? (
          <div className="max-h-[min(85vh,860px)] overflow-y-auto pr-1">
            <AdminNewInquirySheetBody onClose={() => setOpen(false)} accounts={accounts} contacts={contacts} talents={talents} />
          </div>
        ) : null}
      </DashboardEditPanel>
    </>
  );
}
