"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";
import { createManualInquiry } from "@/lib/server-actions/admin-inquiries";
import { AdminNewClientSheet } from "@/components/admin/forms/admin-new-client-sheet";
import type { AccountOption } from "@/components/admin/forms/add-contact-form";
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
import { useLiveTaxonomy } from "@/components/admin/shell/internal/use-taxonomy";
import { useT } from "@/i18n/use-t";

type Contact = { id: string; client_account_id: string; label: string };
// Optional picker-enrichment fields (exclusivity + availability) are passed
// straight through to InquiryTalentDraftField. They're optional so loaders
// that don't enrich stay valid. See @/lib/inquiry/picker-talent-guard.
type TalentOption = {
  id: string;
  profile_code: string;
  display_name: string | null;
  isExclusiveElsewhere?: boolean;
  nextAvailableDate?: string | null;
  availableDaysInNext30?: number | null;
  availabilityDots14d?: string | null;
};

// Friendly labels for the source-channel select. Falls back to a
// title-cased underscore-to-space transform for any value not in the
// override map. The engine-set channels (Discover, hub site, etc.)
// stay listed because they're valid enum values an admin might need
// to backfill, but their labels are humanized so the dropdown reads
// naturally.
const CHANNEL_LABEL_KEYS: Record<string, string> = {
  phone: "phone",
  whatsapp: "whatsapp",
  email: "email",
  admin: "admin",
  other: "other",
  pitch: "pitch",
  directory_guest: "directoryGuest",
  directory_client: "directoryClient",
  direct_client_dashboard: "directClientDashboard",
  discover_single_talent: "discoverSingleTalent",
  discover_shortlist: "discoverShortlist",
  saved_talent: "savedTalent",
  public_talent_profile: "publicTalentProfile",
  agency_site: "agencySite",
  hub_site: "hubSite",
  admin_created: "adminCreated",
  book_again: "bookAgain",
};
function channelLabel(ch: string, t: (key: string) => string) {
  const key = CHANNEL_LABEL_KEYS[ch];
  if (key) return t(`dashboard.adminInquirySheet.channel.${key}`);
  const spaced = ch.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
  tenantId,
}: {
  onClose: () => void;
  accounts: AccountOption[];
  contacts: Contact[];
  talents: TalentOption[];
  /** Tenant whose `agency_taxonomy_settings` gate the skill-targeting picker.
   *  Null falls back to the canonical (ungoverned) taxonomy. */
  tenantId?: string | null;
}) {
  const t = useT();
  const queueRouterRefresh = useQueuedRouterRefresh();
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

  // Phase 6.1 — skill targeting (optional)
  // Pass the tenant so categories the agency disabled in
  // `agency_taxonomy_settings` are not offered as targeting options.
  const taxonomy = useLiveTaxonomy({ tenantId: tenantId ?? null });
  const allParents = [
    ...(taxonomy.visibleParents ?? []),
    ...(taxonomy.restParents ?? []),
  ];
  const [selectedParentId, setSelectedParentId] = useState("");
  const [selectedSkillTermId, setSelectedSkillTermId] = useState("");
  const [selectedProficiencyMin, setSelectedProficiencyMin] = useState("");

  const selectedParent = allParents.find((p) => p.raw.id === selectedParentId) ?? null;
  const talentTypesForParent = selectedParent?.talentTypes ?? [];

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
      queueRouterRefresh();
    }
  }, [queueRouterRefresh, state?.createdInquiryId]);

  if (state?.createdInquiryId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("dashboard.adminInquirySheet.createdBody")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="rounded-full" asChild>
            <Link href={`/admin/inquiries/${state.createdInquiryId}`} scroll={false}>
              {t("dashboard.adminInquirySheet.openInquiry")}
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
            {t("dashboard.adminInquirySheet.done")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="submit_mode" value="sheet" />
      <input type="hidden" name="client_user_id" value={selectedClient?.id ?? ""} />
      <input type="hidden" name="requested_skill_term_id" value={selectedSkillTermId} />
      <input type="hidden" name="requested_proficiency_min" value={selectedProficiencyMin} />

      <SectionCard
        title={t("dashboard.adminInquirySheet.section1Title")}
        description={t("dashboard.adminInquirySheet.section1Desc")}
      >
        <div className="flex flex-wrap gap-2">
          <AdminNewClientSheet
            triggerLabel={t("dashboard.adminInquirySheet.addNewClient")}
            triggerVariant="outline"
            onCreatedClient={(client) => setSelectedClient(client)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("dashboard.adminInquirySheet.findExistingClient")}</Label>
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
            helpText={t("dashboard.adminInquirySheet.clientSearchHelp")}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("dashboard.adminInquirySheet.contactForInquiry")}</Label>
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
                <span className="font-medium text-foreground">{t("dashboard.adminInquirySheet.useSelectedClient")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("dashboard.adminInquirySheet.useSelectedClientHint")}
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
                <span className="font-medium text-foreground">{t("dashboard.adminInquirySheet.useDifferentContact")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("dashboard.adminInquirySheet.useDifferentContactHint")}
                </span>
              </span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.adminInquirySheet.contactSnapshotNote")}
          </p>
          {contactMode === "selected_client" && !selectedClient ? (
            <p className="text-xs text-muted-foreground">{t("dashboard.adminInquirySheet.selectClientFirst")}</p>
          ) : null}
          {contactMode === "selected_client" && clientSnapshotLoading ? (
            <p className="text-xs text-muted-foreground">{t("dashboard.adminInquirySheet.loadingClientInfo")}</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_contact_name">{t("dashboard.adminInquirySheet.fieldName")}</Label>
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
            <Label htmlFor="ni_contact_email">{t("dashboard.adminInquirySheet.fieldEmail")}</Label>
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
            <Label htmlFor="ni_contact_phone">{t("dashboard.adminInquirySheet.fieldPhone")}</Label>
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
            <Label htmlFor="ni_company">{t("dashboard.adminInquirySheet.fieldCompany")}</Label>
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
        title={t("dashboard.adminInquirySheet.section2Title")}
        description={t("dashboard.adminInquirySheet.section2Desc")}
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setLocationOpen(true)}>
            {t("dashboard.adminInquirySheet.addNewLocation")}
          </Button>
          <CreateClientAccountSheet open={locationOpen} onOpenChange={setLocationOpen} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ni_account_search">{t("dashboard.adminInquirySheet.findLocation")}</Label>
          <Input
            id="ni_account_search"
            value={accountQuery}
            onChange={(event) => setAccountQuery(event.target.value)}
            placeholder={t("dashboard.adminInquirySheet.searchLocationPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ni_account">{t("dashboard.adminInquirySheet.workLocation")}</Label>
          <select
            id="ni_account"
            name="client_account_id"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="">{t("dashboard.adminInquirySheet.optionNone")}</option>
            {filteredAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ni_contact">{t("dashboard.adminInquirySheet.secondaryContact")}</Label>
          <select id="ni_contact" name="client_contact_id" className={ADMIN_FORM_CONTROL} defaultValue="" disabled={!accountId}>
            <option value="">{t("dashboard.adminInquirySheet.optionNone")}</option>
            {filteredContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t("dashboard.adminInquirySheet.secondaryContactNote")}</p>
        </div>
      </SectionCard>

      <SectionCard
        title={t("dashboard.adminInquirySheet.section3Title")}
        description={t("dashboard.adminInquirySheet.section3Desc")}
      >
        <InquiryTalentDraftField talents={talents} />
      </SectionCard>

      <SectionCard
        title={t("dashboard.adminInquirySheet.section4Title")}
        description={t("dashboard.adminInquirySheet.section4Desc")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_raw_ai_query">{t("dashboard.adminInquirySheet.requestSummary")}</Label>
            <Input id="ni_raw_ai_query" name="raw_ai_query" placeholder={t("dashboard.adminInquirySheet.requestSummaryPlaceholder")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_message">{t("dashboard.adminInquirySheet.briefNotes")}</Label>
            <Textarea id="ni_message" name="message" rows={3} placeholder={t("dashboard.adminInquirySheet.briefNotesPlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ni_event_location">{t("dashboard.adminInquirySheet.eventLocation")}</Label>
            <Input id="ni_event_location" name="event_location" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ni_source_channel">{t("dashboard.adminInquirySheet.sourceChannel")}</Label>
            <select id="ni_source_channel" name="source_channel" defaultValue="phone" className={ADMIN_FORM_CONTROL}>
              {INQUIRY_SOURCE_CHANNEL_VALUES.map((ch) => (
                <option key={ch} value={ch}>
                  {channelLabel(ch, t)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_staff_notes">{t("dashboard.adminInquirySheet.internalNotes")}</Label>
            <Textarea id="ni_staff_notes" name="staff_notes" rows={2} placeholder={t("dashboard.adminInquirySheet.internalNotesPlaceholder")} />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("dashboard.adminInquirySheet.section5Title")}
        description={t("dashboard.adminInquirySheet.section5Desc")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ni_skill_parent">{t("dashboard.adminInquirySheet.category")}</Label>
            <select
              id="ni_skill_parent"
              value={selectedParentId}
              onChange={(event) => {
                setSelectedParentId(event.target.value);
                setSelectedSkillTermId("");
              }}
              className={ADMIN_FORM_CONTROL}
              disabled={taxonomy.loading}
            >
              <option value="">{t("dashboard.adminInquirySheet.anyCategory")}</option>
              {allParents.map((p) => (
                <option key={p.raw.id} value={p.raw.id}>
                  {p.display.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ni_skill_type">{t("dashboard.adminInquirySheet.talentType")}</Label>
            <select
              id="ni_skill_type"
              value={selectedSkillTermId}
              onChange={(event) => setSelectedSkillTermId(event.target.value)}
              className={ADMIN_FORM_CONTROL}
              disabled={!selectedParentId || talentTypesForParent.length === 0}
            >
              <option value="">{t("dashboard.adminInquirySheet.anyType")}</option>
              {talentTypesForParent.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ni_proficiency_min">{t("dashboard.adminInquirySheet.minProficiency")}</Label>
            <select
              id="ni_proficiency_min"
              value={selectedProficiencyMin}
              onChange={(event) => setSelectedProficiencyMin(event.target.value)}
              className={ADMIN_FORM_CONTROL}
            >
              <option value="">{t("dashboard.adminInquirySheet.anyProficiency")}</option>
              <option value="beginner">{t("dashboard.adminInquirySheet.proficiency.beginner")}</option>
              <option value="intermediate">{t("dashboard.adminInquirySheet.proficiency.intermediate")}</option>
              <option value="advanced">{t("dashboard.adminInquirySheet.proficiency.advanced")}</option>
              <option value="expert">{t("dashboard.adminInquirySheet.proficiency.expert")}</option>
              <option value="master">{t("dashboard.adminInquirySheet.proficiency.master")}</option>
            </select>
          </div>
        </div>
      </SectionCard>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="rounded-full" disabled={pending}>
          {pending ? t("dashboard.adminInquirySheet.saving") : t("dashboard.adminInquirySheet.saveInquiry")}
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onClose}>
          {t("dashboard.adminInquirySheet.cancel")}
        </Button>
      </div>
    </form>
  );
}

export function AdminNewInquirySheet({
  accounts,
  contacts,
  talents,
  tenantId,
}: {
  accounts: AccountOption[];
  contacts: Contact[];
  talents: TalentOption[];
  /** Tenant whose `agency_taxonomy_settings` gate the skill-targeting picker. */
  tenantId?: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        {t("dashboard.adminOverview.newInquiry")}
      </Button>
      <DashboardEditPanel
        open={open}
        onOpenChange={setOpen}
        title={t("dashboard.adminOverview.newInquiry")}
        description={t("dashboard.adminInquirySheet.panelDescription")}
        className="max-w-[860px]"
      >
        {open ? (
          <div className="max-h-[min(85vh,860px)] overflow-y-auto pr-1">
            <AdminNewInquirySheetBody onClose={() => setOpen(false)} accounts={accounts} contacts={contacts} talents={talents} tenantId={tenantId} />
          </div>
        ) : null}
      </DashboardEditPanel>
    </>
  );
}
