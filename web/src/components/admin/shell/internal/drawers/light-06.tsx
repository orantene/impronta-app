"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  CLIENT_TRUST_META,
  COLORS,
  ClientTrustChip,
  ConversationBubble,
  DrawerShell,
  EmptyState,
  FONTS,
  FieldRow,
  GhostButton,
  INQUIRY_STAGE_META,
  Icon,
  InquiryComposerLazyD,
  InquiryTrustPanel,
  PrimaryButton,
  RICH_INQUIRIES,
  SecondaryButton,
  Section,
  StageBadgeMini,
  StandardFooter,
  SummaryTile,
  TRANSITION,
  TextArea,
  TextInput,
  createClientAccount,
  createManualBooking,
  getClients,
  getInquiries,
  meetsRole,
  updateAdminClientProfile,
  useAdminShell,
  useQueuedRouterRefresh,
  useSaveAndClose
} from "./drawer-shared";
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 5 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function InquiryPeekDrawer() {
  const { state, closeDrawer, effectiveMessagesInquiries } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const id = state.drawer.payload?.id as string | undefined;
  // Bridge path: adapt RichInquiry → old Inquiry shape used by this drawer.
  const richSource = effectiveMessagesInquiries/* trust the bridge — context handles empty-vs-mock */;
  const richInq = richSource.find((i) => i.id === id) ?? richSource[0];
  const inquiry = richInq
    ? {
        id: richInq.id,
        client: richInq.clientName,
        brief: richInq.brief,
        stage: (
          richInq.stage === "draft"        ? "draft"
          : richInq.stage === "booked"     ? "confirmed"
          : richInq.stage === "rejected" || richInq.stage === "expired" ? "archived"
          : "awaiting-client"
        ) as "draft" | "awaiting-client" | "confirmed" | "archived" | "hold",
        ageDays: richInq.ageDays,
        talent: richInq.requirementGroups.flatMap((g) => g.talents.map((t) => t.name)),
        amount: richInq.offer?.total,
        date: richInq.date ?? undefined,
      }
    : (getInquiries(state.plan).find((i) => i.id === id) ?? getInquiries(state.plan)[0]);
  const canEdit = meetsRole(state.role, "manager");
  const onSend = useSaveAndClose(tt("Offer sent to client"));

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={inquiry.client}
      description={inquiry.brief}
      width={580}
      footer={
        canEdit ? (
          <>
            <SecondaryButton onClick={closeDrawer}>{tt("Save draft")}</SecondaryButton>
            <PrimaryButton onClick={onSend}>{tt("Send offer")}</PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
        )
      }
    >
      <Section title={tt("At a glance")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <SummaryTile label={tt("Stage")} value={<StageBadgeMini stage={inquiry.stage} />} />
          <SummaryTile label={tt("Amount")} value={inquiry.amount ?? "—"} />
          <SummaryTile label={tt("Date")} value={inquiry.date ?? tt("TBD")} />
          <SummaryTile label={tt("Age")} value={`${inquiry.ageDays}d`} />
        </div>
      </Section>

      {/* Trust panel — coordinator sees both sides */}
      <InquiryTrustPanel clientName={inquiry.client} talentNames={inquiry.talent} />

      <Section title={tt("Talent on this inquiry")}>
        <div className="flex flex-wrap gap-1.5">
          {inquiry.talent.map((t) => (
            <span
              key={t}
              style={{
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                padding: "5px 10px",
                borderRadius: 999,
                fontFamily: FONTS.body,
                fontSize: 12,
                color: COLORS.ink,
                fontWeight: 500,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </Section>

      <Section title={tt("Brief")}>
        <TextArea
          rows={4}
          defaultValue={`${inquiry.brief}\n\nUsage: digital + print, 6 months, EU territory. Half-day shoot.`}
        />
      </Section>

      <Section title={tt("Conversation")}>
        <div className="flex flex-col gap-2.5">
          <ConversationBubble who="Client" name={inquiry.client} when="2d ago" body={`Looking for a model for our ${inquiry.brief.toLowerCase()}. Open to suggestions.`} />
          <ConversationBubble who="You" name="Sara Bianchi" when="1d ago" body={`Sending you ${inquiry.talent[0]} — fits the brief. Rate quote attached.`} mine />
          <ConversationBubble who="Client" name={inquiry.client} when="22h ago" body="Love it. Can we lock dates?" />
        </div>
      </Section>
    </DrawerShell>
  );
}

/**
 * Two-column trust panel for the inquiry detail drawer. Coordinator-facing
 * view showing both client trust + talent trust at a glance, so they can
 * judge risk and priority without leaving the inquiry.
 */

export function NewInquiryDrawer() {
  const { closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("New inquiry")}
      description={tt("Capture a lead from a client. Send an offer when ready.")}
      width={560}
    >
      <InquiryComposerLazyD
        mode="admin"
        embedded
        onCancel={closeDrawer}
        onSubmit={() => { closeDrawer(); }}
      />
    </DrawerShell>
  );
}

// ─── Day detail ──────────────────────────────────────────────────────
// Opened when clicking a calendar day cell. Shows all inquiries/bookings
// scheduled on that date so the coordinator can drill in without leaving
// the calendar view.

export function DayDetailDrawer() {
  const { state, closeDrawer, openDrawer, effectiveCalendarEvents, effectiveMessagesInquiries } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const dateStr: string = (state.drawer.payload as { date?: string })?.date ?? "";

  // Parse "YYYY-MM-DD" → human-readable label and month index
  const parts = dateStr.split("-");
  const displayLabel = dateStr
    ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).toLocaleDateString(
        copy.isSpanish ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric" }
      )
    : tt("Selected day");

  const displayMonth = dateStr ? parseInt(parts[1]) - 1 : -1;
  const displayDay   = dateStr ? parseInt(parts[2]) : -1;

  // Match events for this calendar day.
  // Phase 3.12: use bridge CalendarEvents when available (ISO date match);
  // fall back to RICH_INQUIRIES human-readable date parsing.
  // The rendering uses clientName/brief/location/requirementGroups, so we
  // normalize both paths into a compatible partial-RichInquiry shape.
  type DayInq = {
    id: string;
    clientName: string;
    brief: string;
    stage: import("../state").InquiryStage;
    location: string | null;
    requirementGroups: { id: string; role: string; needed: number; approved: number }[];
  };
  let dayInquiries: DayInq[];
  if (effectiveCalendarEvents != null && effectiveCalendarEvents.length > 0 && dateStr) {
    dayInquiries = effectiveCalendarEvents
      .filter((ev) => ev.event_date === dateStr)
      .map((ev) => ({
        id: ev.id,
        clientName: ev.company ?? ev.contact_name,
        brief: ev.contact_name,
        stage: (ev.status === "booked" || ev.status === "converted" ? "booked"
          : ev.status === "approved" ? "approved"
          : ev.status === "offer_pending" ? "offer_pending"
          : ev.status === "rejected" ? "rejected"
          : ev.status === "expired" ? "expired"
          : "submitted") as import("../state").InquiryStage,
        location: null,
        requirementGroups: [],
      }));
  } else {
    const MONTH_ABBR: Record<string, number> = {
      Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
    };
    const richSource = effectiveMessagesInquiries/* trust the bridge — context handles empty-vs-mock */;
    dayInquiries = richSource.filter((inq) => {
      if (!inq.date) return false;
      const s = inq.date.replace(/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s*/, "").trim();
      const rangeM = s.match(/^([A-Z][a-z]{2})\s+(\d+)[–\-](\d+)/);
      if (rangeM) {
        if (MONTH_ABBR[rangeM[1]] !== displayMonth) return false;
        return displayDay >= parseInt(rangeM[2]) && displayDay <= parseInt(rangeM[3]);
      }
      const singleM = s.match(/^([A-Z][a-z]{2})\s+(\d+)/);
      return !!singleM && MONTH_ABBR[singleM[1]] === displayMonth && parseInt(singleM[2]) === displayDay;
    });
  }

  const stageMeta = INQUIRY_STAGE_META;

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={displayLabel}
      description={
        dayInquiries.length === 0
          ? tt("Nothing scheduled. Add a booking below.")
          : (copy.isSpanish
              ? `${dayInquiries.length} ${dayInquiries.length === 1 ? "consulta programada" : "consultas programadas"}.`
              : `${dayInquiries.length} ${dayInquiries.length === 1 ? "inquiry" : "inquiries"} scheduled.`)
      }
      footer={
        <>
          <SecondaryButton onClick={() => openDrawer("new-booking")}>{tt("New booking")}</SecondaryButton>
          <GhostButton onClick={closeDrawer}>{tt("Close")}</GhostButton>
        </>
      }
    >
      {dayInquiries.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={tt("Nothing scheduled for this day")}
          body={tt("Log a booking or block time using the buttons below.")}
          primaryLabel={tt("Log a booking")}
          onPrimary={() => openDrawer("new-booking")}
          compact
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {dayInquiries.map((inq) => {
            const sm = stageMeta[inq.stage];
            return (
              <button
                key={inq.id}
                type="button"
                onClick={() => openDrawer("inquiry-workspace", { inquiryId: inq.id })}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "14px 16px",
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  textAlign: "left",
                  transition: `border-color ${TRANSITION.micro}`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
              >
                <Avatar
                  initials={inq.clientName.slice(0, 2).toUpperCase()}
                  hashSeed={inq.clientName}
                  size={36}
                  tone="auto"
                />
                <div className="flex-1 min-w-0">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="text-admin-ink text-admin-13h font-semibold">
                      {inq.clientName}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        padding: "1px 7px",
                        borderRadius: 999,
                        background:
                          sm.tone === "green" ? "rgba(46,125,91,0.1)"
                          : sm.tone === "amber" ? "rgba(184,134,11,0.1)"
                          : sm.tone === "red"   ? "rgba(192,57,43,0.08)"
                          : sm.tone === "indigo" ? "rgba(43,63,163,0.1)"
                          : "rgba(11,11,13,0.06)",
                        color:
                          sm.tone === "green" ? COLORS.green
                          : sm.tone === "amber" ? COLORS.amber
                          : sm.tone === "red"   ? "#c0392b"
                          : sm.tone === "indigo" ? "#2B3FA3"
                          : COLORS.ink,
                      }}
                    >
                      {sm.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 3 }} className="text-admin-ink-muted">
                    {inq.brief}
                  </div>
                  {inq.location && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 11.5 }} className="text-admin-ink-dim">
                      <Icon name="map-pin" size={11} stroke={1.7} color={COLORS.inkDim} />
                      {inq.location}
                    </div>
                  )}
                  {inq.requirementGroups.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {inq.requirementGroups.map((rg) => (
                        <span key={rg.id} style={{ fontSize: 11, color: COLORS.inkMuted, background: COLORS.surfaceAlt, padding: "2px 8px", borderRadius: 5 }}>
                          {rg.approved}/{rg.needed} {rg.role}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
              </button>
            );
          })}
        </div>
      )}
    </DrawerShell>
  );
}


export function NewBookingDrawer() {
  const { closeDrawer, toast } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const canSave = title.trim().length > 0;

  const handleSubmit = () => {
    if (!canSave) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", title.trim() || clientName.trim() || "Booking");
      fd.set("booking_status", "confirmed");
      fd.set("currency_code", "USD");
      fd.set("client_account_id", "");
      fd.set("client_contact_id", "");
      fd.set("owner_staff_id", "");
      fd.set("starts_at", eventDate ? `${eventDate}T09:00:00` : "");
      fd.set("ends_at", eventDate ? `${eventDate}T18:00:00` : "");
      fd.set("event_date", eventDate);
      fd.set("venue_name", location.trim());
      fd.set("venue_location_text", location.trim());
      fd.set("internal_notes", notes.trim());
      fd.set("redirect_after_create", "list");
      // createManualBooking calls redirect() on success, which throws an
      // error with a specific NEXT_REDIRECT digest. Distinguish that from
      // real failures so genuine errors aren't silently shown as success.
      try {
        await createManualBooking(fd);
        // If we got here without throwing, the action neither redirected
        // nor errored — treat as success. (Default codepath returns void.)
        toast(tt("Booking created"));
        closeDrawer();
      } catch (err) {
        const digest = (err as { digest?: unknown } | null)?.digest;
        const isNextRedirect =
          typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
        if (isNextRedirect) {
          toast(tt("Booking created"));
          closeDrawer();
          throw err; // Re-throw so Next.js can perform the redirect.
        }
        const message =
          err instanceof Error && err.message ? err.message : tt("Could not create booking.");
        toast(`${tt("Create failed:")} ${message}`);
      }
    });
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("New booking")}
      description={tt("Skip the inquiry. Log a confirmed job.")}
      footer={
        <StandardFooter
          onSave={handleSubmit}
          saveLabel={pending ? tt("Creating…") : tt("Create booking")}
          disabled={!canSave || pending}
        />
      }
    >
      <Section title={tt("Details")} framed>
        <FieldRow label={tt("Job title")}>
          <TextInput
            placeholder={tt("Vogue Italia · editorial")}
            value={title}
            onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
          />
        </FieldRow>
        <FieldRow label={tt("Client")} optional>
          <TextInput
            placeholder="Vogue Italia"
            value={clientName}
            onChange={(e) => setClientName((e.target as HTMLInputElement).value)}
          />
        </FieldRow>
        <FieldRow label={tt("Notes")} optional>
          <TextInput
            placeholder={tt("Any internal notes…")}
            value={notes}
            onChange={(e) => setNotes((e.target as HTMLInputElement).value)}
          />
        </FieldRow>
      </Section>
      <Section title={tt("When & where")} framed>
        <FieldRow label={tt("Date")} optional>
          <TextInput
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate((e.target as HTMLInputElement).value)}
          />
        </FieldRow>
        <FieldRow label={tt("Location")} optional>
          <TextInput
            placeholder="Madrid · Studio 5"
            value={location}
            onChange={(e) => setLocation((e.target as HTMLInputElement).value)}
          />
        </FieldRow>
      </Section>
    </DrawerShell>
  );
}


export function ClientProfileDrawer() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { state, closeDrawer, toast, effectiveClients } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const id = state.drawer.payload?.id as string | undefined;
  const isNew = id === "new" || !id;
  const clientPool = effectiveClients.length > 0 ? effectiveClients : getClients(state.plan);
  const client = isNew ? null : clientPool.find((c) => c.id === id) ?? null;
  const fallbackToast = useSaveAndClose(isNew ? tt("Client created") : tt("Client saved"));
  const trust = client?.trust ?? "basic";
  const [pending, startTransition] = useTransition();

  // 2026 redesign — Add Client mirrors Add Talent's hierarchy:
  // Display name → Industry (the "what kind of client") → Home base
  // → Engagement method. Each section is hairline, premium, mobile-first.
  const [name, setName] = useState(client?.name ?? "");
  const [contact, setContact] = useState(client?.contact ?? "");
  const [industry, setIndustry] = useState<string | null>(null);
  const [homeBase, setHomeBase] = useState("");
  const [method, setMethod] = useState<"direct" | "referral" | "import">("direct");
  const [notes, setNotes] = useState("");

  // Map prototype industry chip ids onto the canonical client_account_type
  // enum values. Anything we don't know about lands in "other" (with the
  // detail field set to the chip label).
  const INDUSTRY_TO_ACCOUNT_TYPE: Record<string, string> = {
    hotel: "hotel",
    beach_club: "beach_club",
    restaurant: "restaurant",
    brand: "brand",
    agency: "agency",
    publication: "brand",
    venue: "event_venue",
    personal: "private_client",
  };

  const onSave = () => {
    if (!name.trim()) {
      toast(tt("Add a name"));
      return;
    }
    startTransition(async () => {
      if (isNew) {
        const fd = new FormData();
        fd.set("name", name.trim());
        fd.set("account_type", industry ? (INDUSTRY_TO_ACCOUNT_TYPE[industry] ?? "other") : "other");
        fd.set("account_type_detail", industry && !INDUSTRY_TO_ACCOUNT_TYPE[industry] ? industry : "");
        fd.set("primary_email", contact.includes("@") ? contact.trim() : "");
        fd.set("primary_phone", contact.includes("@") ? "" : contact.trim());
        fd.set("website_url", "");
        fd.set("location_text", homeBase.trim());
        fd.set("city", homeBase.trim());
        fd.set("country", "");
        fd.set("address_notes", notes.trim());
        fd.set("google_place_id", "");
        fd.set("latitude", "");
        fd.set("longitude", "");
        const result = await createClientAccount({}, fd);
        if (result && "error" in result && result.error) {
          toast(`${tt("Save failed:")} ${result.error}`);
        } else {
          toast(tt("Client created"));
          queueRouterRefresh();
          closeDrawer();
        }
        return;
      }
      // Edit path — client.id is the auth user_id (per WorkspaceClientRow).
      // Synthetic mock ids fall through to the toast-and-close stub, and so do
      // account-less customers, whose id is `customer:<uuid>` rather than a
      // bare uuid. That is deliberate: a customer id would pass this regex and
      // update no rows, silently. Editing an account-less customer needs a
      // path that writes `customers`, which does not exist yet.
      if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        fallbackToast();
        return;
      }
      const fd = new FormData();
      fd.set("user_id", id);
      // Map drawer fields onto client_profiles columns. industry → company
      // when no explicit company name was entered.
      fd.set("company_name", name.trim());
      fd.set("phone", contact.includes("@") ? "" : contact.trim());
      fd.set("whatsapp_phone", "");
      fd.set("website_url", "");
      fd.set("notes", [homeBase.trim(), notes.trim()].filter(Boolean).join(" · "));
      const result = await updateAdminClientProfile(undefined, fd);
      if (result && "error" in result && result.error) {
        toast(`${tt("Save failed:")} ${result.error}`);
      } else {
        toast(tt("Client saved"));
        queueRouterRefresh();
        closeDrawer();
      }
    });
  };

  // Industry options — the client equivalent of Talent Type. Drives
  // Discover matching ("hotels need …", "beach clubs need…").
  const INDUSTRIES = [
    { id: "hotel",       label: tt("Hotel"),         emoji: "🏨" },
    { id: "beach_club",  label: tt("Beach club"),    emoji: "🏖" },
    { id: "restaurant",  label: tt("Restaurant"),    emoji: "🍽" },
    { id: "brand",       label: tt("Brand"),         emoji: "🏷" },
    { id: "agency",      label: tt("Agency"),        emoji: "🎬" },
    { id: "publication", label: tt("Publication"),   emoji: "📰" },
    { id: "venue",       label: tt("Venue · event"), emoji: "🎉" },
    { id: "personal",    label: tt("Personal"),      emoji: "✨" },
  ];

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={isNew ? tt("Add client") : client?.name ?? tt("Client")}
      description={isNew
        ? tt("Industry and home base first. Full profile builder opens after this step.")
        : `${client?.contact ?? ""} · ${client?.bookingsYTD ?? 0} ${tt("bookings YTD")}`}
      toolbar={!isNew ? <ClientTrustChip level={trust} /> : undefined}
      footer={isNew ? (
        <>
          <SecondaryButton onClick={closeDrawer}>{tt("Cancel")}</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              if (!name.trim() || !industry) {
                toast(tt("Add at least a name and industry"));
                return;
              }
              onSave();
            }}
          >
            {tt("Create client")}
          </PrimaryButton>
        </>
      ) : <StandardFooter onSave={onSave} saveLabel={tt("Save")} />}
    >
      {/* New-client guided flow */}
      {isNew && (
        <>
          <Section title={tt("Display name")} framed>
            <FieldRow label={tt("Client / brand name")}>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={tt("e.g. Bvlgari · Mango · Martina Beach Club")} />
            </FieldRow>
            <FieldRow label={tt("Primary contact")} optional>
              <TextInput value={contact} onChange={(e) => setContact(e.target.value)} placeholder={tt("Name · email")} />
            </FieldRow>
          </Section>

          <Section title={tt("Industry")} framed>
            <div style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {tt("Drives Discover matching, brief templates, and which talent gets recommended.")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {INDUSTRIES.map((it) => {
                const active = industry === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setIndustry(it.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 13px",
                      borderRadius: 999,
                      border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                      background: active ? "rgba(15,79,62,0.08)" : "#fff",
                      color: active ? COLORS.accentDeep : COLORS.ink,
                      fontFamily: FONTS.body,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <span aria-hidden className="text-sm">{it.emoji}</span>
                    {it.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title={tt("Home base")} framed>
            <FieldRow label={tt("Where do they operate?")}>
              <TextInput value={homeBase} onChange={(e) => setHomeBase(e.target.value)} placeholder={tt("e.g. Tulum · Madrid · Global")} />
            </FieldRow>
            <div style={{ fontSize: 11.5, marginTop: -2, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {tt("Multiple regions can be set in the full profile builder.")}
            </div>
          </Section>

          <Section title={tt("How did this client come to you?")}>
            <div className="flex flex-col gap-2">
              {([
                { id: "direct" as const,   title: tt("Direct inquiry"),        desc: tt("Found you through your storefront or directory.") },
                { id: "referral" as const, title: tt("Referral / partner"),     desc: tt("Recommended by another agency, talent, or peer.") },
                { id: "import" as const,   title: tt("Imported relationship"),  desc: tt("Existing client moved over from another tool.") },
              ]).map((o) => {
                const active = method === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setMethod(o.id)}
                    style={{
                      background: "#fff",
                      border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                      borderRadius: 10,
                      padding: 12,
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      textAlign: "left",
                      display: "flex",
                      gap: 10,
                      transition: `border-color ${TRANSITION.micro}`,
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        border: `1.5px solid ${active ? COLORS.accent : "rgba(11,11,13,0.18)"}`,
                        background: active ? COLORS.fill : "transparent",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {active && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
                    </span>
                    <div className="flex-1">
                      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{o.title}</div>
                      <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">{o.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title={tt("Internal notes")} framed>
            <TextArea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tt("Preferences, do-not-book talent, special pricing. Visible to your team only.")}
            />
          </Section>
        </>
      )}

      {/* Existing-client edit view (unchanged behavior) */}
      {!isNew && (
        <Section title={tt("Identity")}>
          <FieldRow label={tt("Client name")}>
            <TextInput defaultValue={client?.name ?? ""} placeholder={tt("Brand or company")} />
          </FieldRow>
          <FieldRow label={tt("Primary contact")}>
            <TextInput defaultValue={client?.contact ?? ""} placeholder={tt("Name · email")} />
          </FieldRow>
        </Section>
      )}
      {!isNew && (
        <Section
          title={tt("Trust level")}
          description={tt("Driven by verification and funded-account events. Not editable by hand.")}
        >
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 14,
              fontFamily: FONTS.body,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div className="flex items-center gap-2.5">
              <ClientTrustChip level={trust} />
              <span className="text-admin-ink-muted text-xs">
                {CLIENT_TRUST_META[trust].hint}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink">
              {CLIENT_TRUST_META[trust].rationale}
            </p>
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }} className="text-admin-ink-dim">
              {tt("Tiers reflect real verification and funded-balance events on the client side. Talent decide which tiers can reach them in their contact preferences.")}
            </p>
          </div>
        </Section>
      )}
      {!isNew && (
        <Section title={tt("Recent bookings")}>
          <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, padding: 12, fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink-muted">
            {client?.bookingsYTD
              ? (copy.isSpanish ? `${client.bookingsYTD} reservas confirmadas este año.` : `${client.bookingsYTD} confirmed bookings this year.`)
              : tt("No recent bookings.")}
          </div>
        </Section>
      )}
      <Section title={tt("Notes")}>
        <TextArea rows={3} placeholder={tt("Internal notes. Preferences, do-not-book talent, special pricing.")} />
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// "Needs attention", workflow, filtered work views
// ════════════════════════════════════════════════════════════════════

