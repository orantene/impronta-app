"use client";
import { logServerError } from "@/lib/server/safe-error";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { createAgencyInquiry } from "@/lib/server-actions/admin-inquiries";
import { FONTS, COLORS, useAdminShell, type InquiryRecord, type InquiryUnitType } from "../../state";
import { ghostBtn, primaryBtn } from "./machinery-13";
import { LockedTabOverlay } from "./machinery-9";


export function PageTopCollection({
  title, count, action,
}: {
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <header style={{
      display: "flex", alignItems: "baseline", gap: 8,
      padding: "10px 0 8px", fontFamily: FONTS.body,
    }}>
      <h1 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 19, fontWeight: 700, letterSpacing: -0.2 }} className="text-admin-ink">{title}</h1>
      {count !== undefined && (
        <span className="text-admin-ink-dim text-xs font-medium">
          {count}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {action && (
        <button type="button" onClick={action.onClick} style={{
          padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
          border: "none", background: COLORS.accent, color: "#fff", cursor: "pointer",
        }}>{action.label}</button>
      )}
    </header>
  );
}

/**
 * Premium thread header — single-line layout (Linear/Things style):
 *   ‹ Projects · Mango                                    [Inquiry]
 *   Spring lookbook · Madrid
 *
 * Back-link + separator + title sit inline so the eye travels left-to-right
 * once. Status chip pinned to the right. Subtitle one line below in muted
 * ink. Status pill uses sentence-case via `textTransform: capitalize`.
 */
export function PageTopThread({
  back, title, meta, statusChip, statusTone,
}: {
  back: { label: string; onClick: () => void };
  title: string;
  meta?: string;
  statusChip?: string;
  statusTone?: { bg: string; fg: string };
}) {
  const tone = statusTone ?? { bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted };
  return (
    <header style={{ padding: "4px 0 8px", fontFamily: FONTS.body }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        minWidth: 0,
      }}>
        {/* Back link (inline, not its own row) */}
        <button type="button" onClick={back.onClick} aria-label={`Back to ${back.label}`} style={{
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
          color: COLORS.inkMuted, fontSize: 13, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="hidden">{back.label}</span>
        </button>
        <span className="text-admin-ink-dim text-admin-13">{back.label}</span>
        <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 12 }}>·</span>
        {/* Title takes remaining width; truncates if too long */}
        <h1 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 700, letterSpacing: -0.25, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">{title}</h1>
        {statusChip && (
          <span style={{
            fontSize: 10.5, fontWeight: 600,
            padding: "2px 9px", borderRadius: 999,
            background: tone.bg, color: tone.fg, flexShrink: 0,
            textTransform: "capitalize",
          }}>{statusChip}</span>
        )}
      </div>
      {meta && (
        <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4, // Indent so it lines up under the title, not under the back-arrow.
          paddingLeft: 0 }} className="text-admin-ink-muted">{meta}</div>
      )}
    </header>
  );
}

export type ComposerMode = "client" | "admin" | "hub";

/**
 * In-memory inquiry store. Production reads/writes the DB; in the
 * prototype we keep a process-local list so submitting from the composer
 * actually produces a real `InquiryRecord` that surfaces in lists. Both
 * entry points (client form + admin manual) push to the same store.
 */
export const __inquiryStore: InquiryRecord[] = [];
export function getProtoInquiries(): InquiryRecord[] { return __inquiryStore.slice(); }

/**
 * Lift a composer draft into the canonical Inquiry shape. Defaults are
 * source-aware so a client form submission lands as a "client_form"
 * inquiry with `submitted` status while an admin manual entry lands as
 * "workspace_manual" already in `coordinating` (someone owns it).
 */
export function draftToInquiry(draft: ComposerDraft, mode: ComposerMode): InquiryRecord {
  const now = new Date();
  const sourceKind: "client_form" | "workspace_manual" | "hub" =
      mode === "client" ? "client_form"
    : mode === "hub"    ? "hub"
    : "workspace_manual";
  const status: import("../../state").InquiryStatus =
      mode === "admin" ? "coordinating" : "submitted";
  const id = `IQ-${Math.floor(Math.random() * 9000 + 1000)}`;
  const amount = parseInt(draft.budgetAmount.replace(/\D/g, ""), 10);
  return {
    id,
    source: { kind: sourceKind },
    status,
    createdBy: { id: "me", name: draft.clientName || "Me" },
    createdAt: now.toISOString().slice(0, 10),
    title: draft.briefSummary || "Untitled inquiry",
    client: {
      id: (draft.clientName || "client").toLowerCase().replace(/\s+/g, "-"),
      name: draft.clientName || "—",
      contactName: draft.contactName || undefined,
      email: draft.contactEmail || undefined,
      phone: draft.contactPhone || undefined,
    },
    coordinators: [],
    talent: draft.talent.map((t, i) => ({
      talentId: t.id || `t-${i}`,
      name: t.name,
      initials: t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      state: "invited",
    })),
    schedule: {
      start: draft.scheduleStart || "TBC",
      end: draft.scheduleEnd || undefined,
    },
    location: draft.locationCity || draft.locationVenue
      ? { mode: "on_site", city: draft.locationCity || undefined, venue: draft.locationVenue || undefined }
      : { mode: "tbc" },
    brief: {
      summary: draft.briefSummary,
      notes: draft.briefNotes || undefined,
      files: [],
    },
    budget: amount > 0
      ? { amount, currency: draft.budgetCurrency, unitType: draft.budgetUnit, perPerson: draft.budgetPerPerson }
      : undefined,
    offerStage: amount > 0 ? "client_budget" : "no_offer",
    threads: { client: `${id}:client`, talentGroup: `${id}:talent` },
    timeline: [{
      id: `${id}-tl-0`,
      ts: now.toLocaleString(),
      actor: draft.clientName || "Me",
      body: `Inquiry created · ${draft.briefSummary || "no brief"}`,
      tone: "info",
    }],
  };
}

export function InquiryComposer({
  mode, defaultClientName, onSubmit, onCancel, embedded, submitDisabled = false,
}: {
  mode: ComposerMode;
  defaultClientName?: string;
  onSubmit: (draft: ComposerDraft) => void;
  onCancel: () => void;
  /** When true, skip the outer header/footer (host drawer provides chrome). */
  embedded?: boolean;
  /** Host can disable submission when no real write path exists. */
  submitDisabled?: boolean;
}) {
  const { toast } = useAdminShell();
  const t = useT();
  const [draft, setDraft] = useState<ComposerDraft>(() => ({
    title: "",
    clientName: mode === "client" ? defaultClientName ?? "" : "",
    contactName: "", contactEmail: "", contactPhone: "",
    scheduleStart: "", scheduleEnd: "",
    locationCity: "", locationVenue: "",
    talent: [],
    briefSummary: "", briefNotes: "",
    budgetAmount: "", budgetUnit: "day", budgetCurrency: "USD", budgetPerPerson: false,
    sourceChannel: mode === "client" ? "form" : "phone",
    mixedRows: undefined,
  }));
  const update = <K extends keyof ComposerDraft>(k: K, v: ComposerDraft[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const send = async () => {
    if (submitDisabled) return;
    if (!draft.briefSummary.trim()) {
      toast(t("dashboard.talentThread.composerToastAddBrief"));
      return;
    }
    if (isSaving) return;

    // Phase 3 (deep QA fix) — admin "manual" mode now writes to the real
    // inquiries table via createAgencyInquiry. The prior implementation
    // pushed to a client-only __inquiryStore so the inquiry never reached
    // the database — agency operators couldn't actually create inquiries.
    if (mode === "admin") {
      // Validate minimum: contact info. We accept the typed name from the
      // composer's contactName + contactEmail fields (which the form
      // exposes per ComposerDraft), falling back to clientName if a
      // dedicated contact wasn't provided yet.
      const contactName = (draft.contactName || draft.clientName || "").trim();
      const contactEmail = (draft.contactEmail || "").trim();
      if (!contactName) {
        toast(t("dashboard.talentThread.composerToastAddClientName"));
        return;
      }
      if (!contactEmail) {
        toast(t("dashboard.talentThread.composerToastAddClientEmail"));
        return;
      }

      setIsSaving(true);
      try {
        const result = await createAgencyInquiry({
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: draft.contactPhone ?? "",
          company: draft.clientName ?? "",
          event_date: draft.scheduleStart ?? "",
          event_location: [draft.locationCity, draft.locationVenue]
            .filter(Boolean)
            .join(" · "),
          message: [draft.briefSummary, draft.briefNotes]
            .filter(Boolean)
            .join("\n\n"),
          source_channel: draft.sourceChannel,
          talent_profile_ids: (draft.talent ?? []).join(","),
        });
        if (!result.ok) {
          toast(result.error || t("dashboard.talentThread.composerToastCreateFailed"));
          return;
        }
        toast(t("dashboard.talentThread.composerToastInquiryCreated"));
        // Refresh server data so Messages + Calendar surface the new row.
        router.refresh();
        onSubmit(draft);
      } catch (err) {
        // Network / unexpected error — keep the drawer open so the user
        // can retry without losing their draft.
        logServerError("createagencyinquiry", err);
        toast(t("dashboard.talentThread.composerToastCreateFailed"));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // Client / hub modes still use the prototype mock store for now.
    // (Their canonical write paths are the public inquiry submit + hub
    // intake flow respectively, both already wired elsewhere.)
    const record = draftToInquiry(draft, mode);
    __inquiryStore.push(record);
    onSubmit(draft);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: FONTS.body }}>
      {/* Header — skipped in embedded mode (drawer provides its own) */}
      {!embedded && (
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div className="flex-1">
            <div className="text-admin-ink-muted text-admin-10h font-bold">
              {mode === "client" ? t("dashboard.talentThread.composerNewInquiry") : mode === "hub" ? t("dashboard.talentThread.composerHubInquiry") : t("dashboard.talentThread.composerManualInquiry")}
            </div>
            <h2 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700, fontFamily: FONTS.display }} className="text-admin-ink">
              {t("dashboard.talentThread.composerHeadline")}
            </h2>
          </div>
          <button type="button" onClick={onCancel} aria-label={t("dashboard.talentThread.composerCloseAria")} style={{
            padding: "6px 10px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "transparent",
            color: COLORS.ink, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
          }}>{t("dashboard.talentThread.composerClose")}</button>
        </div>
      )}

      {/* Body — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: embedded ? 0 : "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* #22 — Booking-for Profile selector. On client mode, top-of-form
            "Booking as <Profile>" picker. Producer/multi-Profile users
            need to confirm WHICH Profile this inquiry is on behalf of. */}
        {mode === "client" && (
          <ComposerSection title={t("dashboard.talentThread.composerBookingAs")} subtitle={t("dashboard.talentThread.composerBookingAsSubtitle")}>
            <ComposerSelect
              value={draft.clientName || "Martina Beach Club"}
              onChange={v => update("clientName", v)}
              options={[
                { value: "Martina Beach Club", label: `Martina Beach Club · ${t("dashboard.talentThread.composerBusinessSuffix")}` },
                { value: "The Gringo",         label: `The Gringo · ${t("dashboard.talentThread.composerPersonalSuffix")}` },
              ]}
            />
          </ComposerSection>
        )}

        {/* #21 — Adaptive composer: pick the talent category first.
            Subsequent fields swap based on this choice.
            #28 — Multi-talent group: opt-in. Default is single category.
            Picking "Mixed group" reveals a row-builder for "3 hosts +
            2 models + 1 DJ" style group inquiries. */}
        <ComposerSection title={t("dashboard.talentThread.composerStep1Title")} subtitle={t("dashboard.talentThread.composerStep1Subtitle")}>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "models",        label: t("dashboard.talentThread.composerCatModels"),        emoji: "👤" },
              { id: "hosts",         label: t("dashboard.talentThread.composerCatHosts"),         emoji: "🎤" },
              { id: "chefs",         label: t("dashboard.talentThread.composerCatChefs"),         emoji: "👨‍🍳" },
              { id: "artists",       label: t("dashboard.talentThread.composerCatArtists"),       emoji: "🎨" },
              { id: "djs",           label: t("dashboard.talentThread.composerCatDjs"),           emoji: "🎧" },
              { id: "photographers", label: t("dashboard.talentThread.composerCatPhotographers"), emoji: "📷" },
              { id: "performers",    label: t("dashboard.talentThread.composerCatPerformers"),    emoji: "✨" },
              { id: "mixed",         label: t("dashboard.talentThread.composerCatMixed"),   emoji: "✦" },
            ].map(c => {
              const active = (draft.title || "models") === c.id;
              return (
                <button key={c.id} type="button" onClick={() => update("title", c.id)} style={{
                  padding: "7px 12px", borderRadius: 999,
                  border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                  background: active ? "rgba(15,79,62,0.08)" : "#fff",
                  color: active ? COLORS.accentDeep : COLORS.ink,
                  fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  <span aria-hidden className="text-admin-13">{c.emoji}</span>
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* #28 — Multi-talent row builder. Only renders when "mixed" is
              picked, so the default single-category flow stays clean. */}
          {draft.title === "mixed" && (
            <MixedGroupBuilder
              rows={draft.mixedRows ?? [{ id: "g1", category: "hosts", count: 3 }]}
              onChange={(rows) => update("mixedRows", rows)}
            />
          )}
        </ComposerSection>

        {/* Client (admin/hub mode only — client mode covered above) */}
        {mode !== "client" && (
          <ComposerSection title={t("dashboard.talentThread.composerWhoTitle")} subtitle={t("dashboard.talentThread.composerWhoSubtitle")}>
            <ComposerInput placeholder={t("dashboard.talentThread.composerSearchClients")} value={draft.clientName} onChange={v => update("clientName", v)} />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
              <ComposerInput placeholder={t("dashboard.talentThread.composerContactName")} value={draft.contactName} onChange={v => update("contactName", v)} />
              <ComposerInput placeholder={t("dashboard.talentThread.composerContactEmail")} value={draft.contactEmail} onChange={v => update("contactEmail", v)} />
            </div>
          </ComposerSection>
        )}

        {/* Schedule */}
        <ComposerSection title={t("dashboard.talentThread.composerWhenTitle")} subtitle={t("dashboard.talentThread.composerWhenSubtitle")}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <ComposerInput placeholder={t("dashboard.talentThread.composerStartPlaceholder")} value={draft.scheduleStart} onChange={v => update("scheduleStart", v)} />
            <ComposerInput placeholder={t("dashboard.talentThread.composerEndPlaceholder")} value={draft.scheduleEnd} onChange={v => update("scheduleEnd", v)} />
          </div>
        </ComposerSection>

        {/* Location */}
        <ComposerSection title={t("dashboard.talentThread.composerWhereTitle")} subtitle={t("dashboard.talentThread.composerWhereSubtitle")}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <ComposerInput placeholder={t("dashboard.talentThread.composerCity")} value={draft.locationCity} onChange={v => update("locationCity", v)} />
            <ComposerInput placeholder={t("dashboard.talentThread.composerVenue")} value={draft.locationVenue} onChange={v => update("locationVenue", v)} />
          </div>
        </ComposerSection>

        {/* Talent */}
        <ComposerSection title={t("dashboard.talentThread.composerTalentTitle")} subtitle={mode === "client" ? t("dashboard.talentThread.composerTalentSubtitleClient") : t("dashboard.talentThread.composerTalentSubtitleStaff")}>
          <ComposerInput placeholder={t("dashboard.talentThread.composerSearchTalent")} value={"" /* stub */} onChange={() => {}} />
          <div style={{ marginTop: 8, fontSize: 11.5 }} className="text-admin-ink-dim">
            {draft.talent.length === 0 ? t("dashboard.talentThread.composerNoTalentYet") : interpolate(t("dashboard.talentThread.composerTalentAdded"), { count: draft.talent.length })}
          </div>
        </ComposerSection>

        {/* Brief */}
        <ComposerSection title={t("dashboard.talentThread.composerAskTitle")} subtitle={t("dashboard.talentThread.composerAskSubtitle")}>
          <ComposerInput
            placeholder={mode === "client" ? t("dashboard.talentThread.composerAskPlaceholderClient") : t("dashboard.talentThread.composerAskPlaceholderStaff")}
            value={draft.briefSummary} onChange={v => update("briefSummary", v)}
          />
          <div className="mt-2">
            <ComposerTextarea
              placeholder={t("dashboard.talentThread.composerNotesPlaceholder")}
              value={draft.briefNotes} onChange={v => update("briefNotes", v)}
            />
          </div>
        </ComposerSection>

        {/* Budget */}
        <ComposerSection
          title={t("dashboard.talentThread.composerBudgetTitle")}
          subtitle={mode === "client"
            ? t("dashboard.talentThread.composerBudgetSubtitleClient")
            : t("dashboard.talentThread.composerBudgetSubtitleStaff")}
        >
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "120px 110px 1fr" }}>
            <ComposerInput placeholder={t("dashboard.talentThread.composerAmount")} value={draft.budgetAmount} onChange={v => update("budgetAmount", v)} />
            <ComposerSelect
              value={draft.budgetUnit}
              onChange={v => update("budgetUnit", v as InquiryUnitType)}
              options={[
                { value: "hour", label: t("dashboard.talentThread.composerPerHour") },
                { value: "day", label: t("dashboard.talentThread.composerPerDay") },
                { value: "contract", label: t("dashboard.talentThread.composerTotalContract") },
                { value: "event", label: t("dashboard.talentThread.composerPerEvent") },
              ]}
            />
            <ComposerSelect
              value={draft.budgetCurrency}
              onChange={v => update("budgetCurrency", v)}
              options={[
                { value: "EUR", label: "EUR €" },
                { value: "USD", label: "USD $" },
                { value: "MXN", label: "MXN $" },
                { value: "GBP", label: "GBP £" },
              ]}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, cursor: "pointer" }} className="text-admin-ink-muted">
            <input type="checkbox" checked={draft.budgetPerPerson} onChange={e => update("budgetPerPerson", e.target.checked)} />
            {t("dashboard.talentThread.composerBudgetPerPerson")}
          </label>
        </ComposerSection>
      </div>

      {/* Sticky footer */}
      <div style={{
        position: "sticky", bottom: 0,
        padding: embedded ? "10px 0 0" : "10px 16px",
        borderTop: embedded ? "none" : `1px solid ${COLORS.borderSoft}`,
        background: embedded ? "transparent" : "rgba(255,255,255,0.96)",
        display: "flex", gap: 8, justifyContent: "flex-end",
      }}>
        <button type="button" onClick={onCancel} style={ghostBtn()}>{t("dashboard.talentThread.composerCancel")}</button>
        <button
          type="button"
          onClick={send}
          disabled={submitDisabled}
          title={submitDisabled ? t("dashboard.talentThread.composerSendingSoon") : undefined}
          style={{
            ...primaryBtn(COLORS.accent),
            cursor: submitDisabled ? "not-allowed" : "pointer",
            opacity: submitDisabled ? 0.45 : 1,
          }}
        >
          {mode === "client" ? t("dashboard.talentThread.composerSendToAgency") : t("dashboard.talentThread.composerSaveInquiry")}
        </button>
      </div>
    </div>
  );
}

export type ComposerDraft = {
  title: string;
  clientName: string; contactName: string; contactEmail: string; contactPhone: string;
  scheduleStart: string; scheduleEnd: string;
  locationCity: string; locationVenue: string;
  talent: { id: string; name: string }[];
  briefSummary: string; briefNotes: string;
  budgetAmount: string; budgetUnit: InquiryUnitType; budgetCurrency: string; budgetPerPerson: boolean;
  sourceChannel: string;
  /** #28 — Mixed group rows (only used when title === "mixed"). */
  mixedRows?: { id: string; category: string; count: number }[];
};

/**
 * #28 — Mixed group row builder. Optional path inside the InquiryComposer
 * that lets a hospitality/event client request multiple talent categories
 * in one inquiry: "3 hosts + 2 models + 1 DJ for Saturday gala". The
 * default single-category flow stays the primary path; this only renders
 * when "Mixed group" is picked.
 */
export function MixedGroupBuilder({
  rows, onChange,
}: { rows: { id: string; category: string; count: number }[]; onChange: (r: { id: string; category: string; count: number }[]) => void }) {
  const t = useT();
  const update = (id: string, patch: Partial<{ category: string; count: number }>) =>
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  const remove = (id: string) => onChange(rows.filter(r => r.id !== id));
  const add = () => onChange([...rows, { id: `g${rows.length + 1}-${Math.random().toString(36).slice(2, 6)}`, category: "models", count: 1 }]);
  const total = rows.reduce((s, r) => s + (r.count || 0), 0);
  const categoryOptions = [
    { value: "models",        label: t("dashboard.talentThread.composerCatModels") },
    { value: "hosts",         label: t("dashboard.talentThread.composerCatHosts") },
    { value: "chefs",         label: t("dashboard.talentThread.composerCatChefs") },
    { value: "artists",       label: t("dashboard.talentThread.composerCatArtists") },
    { value: "djs",           label: t("dashboard.talentThread.composerCatDjs") },
    { value: "photographers", label: t("dashboard.talentThread.composerCatPhotographers") },
    { value: "performers",    label: t("dashboard.talentThread.composerCatPerformers") },
    { value: "promoters",     label: t("dashboard.talentThread.composerCatPromoters") },
  ];
  return (
    <div data-tulala-mixed-builder style={{
      marginTop: 12, padding: "12px 14px", borderRadius: 10,
      background: COLORS.indigoSoft, border: `1px solid rgba(91,107,160,0.18)`,
      fontFamily: FONTS.body,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10, gap: 8,
      }}>
        <div>
          <div className="text-admin-indigo-deep text-xs font-semibold">
            {t("dashboard.talentThread.mixedTitle")}
          </div>
          <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
            {t("dashboard.talentThread.mixedSubtitle")}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: "#fff", fontVariantNumeric: "tabular-nums" }} className="text-admin-indigo-deep">{interpolate(t("dashboard.talentThread.mixedTalentCount"), { count: total })}</span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 8,
            background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
          }}>
            <input type="number" min={1} max={99} value={r.count}
              onChange={(e) => update(r.id, { count: parseInt(e.target.value, 10) || 1 })}
              style={{
                width: 50, padding: "6px 8px", borderRadius: 6,
                border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink,
                textAlign: "center", outline: "none", fontVariantNumeric: "tabular-nums",
              }}
            />
            <select value={r.category}
              onChange={(e) => update(r.id, { category: e.target.value })}
              style={{
                flex: 1, padding: "6px 10px", borderRadius: 6,
                border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none", cursor: "pointer",
              }}>
              {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {rows.length > 1 && (
              <button type="button" onClick={() => remove(r.id)} aria-label={t("dashboard.talentThread.mixedRemoveAria")} style={{
                background: "transparent", border: "none", cursor: "pointer",
                padding: 4, color: COLORS.inkMuted, lineHeight: 1,
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={add} style={{
        marginTop: 10, padding: "8px 12px", borderRadius: 999,
        border: `1px dashed ${COLORS.indigoDeep}40`, background: "transparent",
        color: COLORS.indigoDeep, fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
        cursor: "pointer", width: "100%",
      }}>{t("dashboard.talentThread.mixedAddCategory")}</button>
    </div>
  );
}

export function ComposerSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: "12px 14px", borderRadius: 10,
      border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
    }}>
      <div className="mb-2.5">
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }} className="text-admin-ink">{title}</h3>
        {subtitle && <p style={{ margin: "2px 0 0", fontSize: 11.5, lineHeight: 1.4 }} className="text-admin-ink-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
export function ComposerInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 7,
        border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
        fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
      }}
    />
  );
}
export function ComposerTextarea({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <textarea placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
      rows={3}
      style={{
        width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 7,
        border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
        fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none", resize: "vertical",
      }}
    />
  );
}
export function ComposerSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 7,
        border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
        fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none", cursor: "pointer",
      }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Well-known tab ids. Extra ids are allowed (string-typed) so the same
// shell renders the inquiry config (client | talent | offer | files | details)
// AND the booking config (client | talent | logistics | files | payment | details)
// without TypeScript fighting us.
export type ThreadTabId =
  // Slice B (Messages consolidation v2): new universal tab IDs.
  | "chat"     // single Chat tab with Client | Group | DM sub-toggle (admin)
  | "lineup"   // people on this inquiry (was Live lineup panel)
  | "event"    // when/where/transport/lodging/call-sheet/activity (was Project/Details)
  // F2 (Messages consolidation v2): talent flattened the Chat sub-toggle
  // into three top-level tabs — Client (legacy id below), Group, Activity.
  | "group"    // booking-team coordination thread (talent flattened tab)
  | "activity" // read-only money/booking timeline (talent flattened tab)
  // Legacy IDs kept active during multi-slice migration. Talent + client
  // shells still emit these; they remain valid tab keys until Slices C + D.
  | "client" | "talent" | "offer" | "files" | "details"
  | "logistics" | "payment"   // booking-only legacy tabs
  | "booking"                  // talent merged details+logistics view
  | (string & {});

/** Slice B: which sub-thread is active inside the Chat tab.
 *  Visibility per role lives in §3 of the consolidation plan. */
export type ChatSubThreadId = "client" | "group" | "dm";

export type TabState = "active" | "locked";

export type TabDef = {
  id: ThreadTabId;
  label: string;
  badge?: number | string;
  state: TabState; // "locked" → render LockedTabOverlay when selected
  lockedReason?: string;
};
