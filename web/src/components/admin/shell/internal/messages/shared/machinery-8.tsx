"use client";
import { logServerError } from "@/lib/server/safe-error";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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
      <h1 style={{
        margin: 0, fontFamily: FONTS.display, fontSize: 19, fontWeight: 700,
        color: COLORS.ink, letterSpacing: -0.2,
      }}>{title}</h1>
      {count !== undefined && (
        <span style={{ fontSize: 12, color: COLORS.inkDim, fontWeight: 500 }}>
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
          <span style={{ display: "none" }}>{back.label}</span>
        </button>
        <span style={{ color: COLORS.inkDim, fontSize: 13 }}>{back.label}</span>
        <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 12 }}>·</span>
        {/* Title takes remaining width; truncates if too long */}
        <h1 style={{
          margin: 0, flex: 1, minWidth: 0,
          fontFamily: FONTS.display, fontSize: 18, fontWeight: 700,
          color: COLORS.ink, letterSpacing: -0.25, lineHeight: 1.2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{title}</h1>
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
        <div style={{
          fontSize: 12, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.4,
          // Indent so it lines up under the title, not under the back-arrow.
          paddingLeft: 0,
        }}>{meta}</div>
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
  const [draft, setDraft] = useState<ComposerDraft>(() => ({
    title: "",
    clientName: mode === "client" ? defaultClientName ?? "" : "",
    contactName: "", contactEmail: "", contactPhone: "",
    scheduleStart: "", scheduleEnd: "",
    locationCity: "", locationVenue: "",
    talent: [],
    briefSummary: "", briefNotes: "",
    budgetAmount: "", budgetUnit: "day", budgetCurrency: "EUR", budgetPerPerson: false,
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
      toast("Add a brief so the agency can triage");
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
        toast("Add a client name");
        return;
      }
      if (!contactEmail) {
        toast("Add a client email");
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
          toast(result.error || "Couldn't create inquiry — try again.");
          return;
        }
        toast("Inquiry created");
        // Refresh server data so Messages + Calendar surface the new row.
        router.refresh();
        onSubmit(draft);
      } catch (err) {
        // Network / unexpected error — keep the drawer open so the user
        // can retry without losing their draft.
        logServerError("createagencyinquiry", err);
        toast("Couldn't create inquiry — try again.");
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
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted }}>
              {mode === "client" ? "New inquiry" : mode === "hub" ? "Hub inquiry" : "Manual inquiry"}
            </div>
            <h2 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700, fontFamily: FONTS.display, color: COLORS.ink }}>
              What do you need?
            </h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" style={{
            padding: "6px 10px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "transparent",
            color: COLORS.ink, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
          }}>× Close</button>
        </div>
      )}

      {/* Body — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: embedded ? 0 : "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* #22 — Booking-for Profile selector. On client mode, top-of-form
            "Booking as <Profile>" picker. Producer/multi-Profile users
            need to confirm WHICH Profile this inquiry is on behalf of. */}
        {mode === "client" && (
          <ComposerSection title="Booking as" subtitle="Which profile are you sending this from?">
            <ComposerSelect
              value={draft.clientName || "Martina Beach Club"}
              onChange={v => update("clientName", v)}
              options={[
                { value: "Martina Beach Club", label: "Martina Beach Club · Business" },
                { value: "The Gringo",         label: "The Gringo · Personal" },
              ]}
            />
          </ComposerSection>
        )}

        {/* #21 — Adaptive composer: pick the talent category first.
            Subsequent fields swap based on this choice.
            #28 — Multi-talent group: opt-in. Default is single category.
            Picking "Mixed group" reveals a row-builder for "3 hosts +
            2 models + 1 DJ" style group inquiries. */}
        <ComposerSection title="1. What do you need" subtitle="Pick a category — or build a mixed group.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              { id: "models",        label: "Models",        emoji: "👤" },
              { id: "hosts",         label: "Hosts",         emoji: "🎤" },
              { id: "chefs",         label: "Chefs",         emoji: "👨‍🍳" },
              { id: "artists",       label: "Artists",       emoji: "🎨" },
              { id: "djs",           label: "DJs",           emoji: "🎧" },
              { id: "photographers", label: "Photographers", emoji: "📷" },
              { id: "performers",    label: "Performers",    emoji: "✨" },
              { id: "mixed",         label: "Mixed group",   emoji: "✦" },
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
                  <span aria-hidden style={{ fontSize: 13 }}>{c.emoji}</span>
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
          <ComposerSection title="2. Who's it for" subtitle="Search or add a new client.">
            <ComposerInput placeholder="Search clients by name, email…" value={draft.clientName} onChange={v => update("clientName", v)} />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
              <ComposerInput placeholder="Contact name" value={draft.contactName} onChange={v => update("contactName", v)} />
              <ComposerInput placeholder="Contact email" value={draft.contactEmail} onChange={v => update("contactEmail", v)} />
            </div>
          </ComposerSection>
        )}

        {/* Schedule */}
        <ComposerSection title="2. When" subtitle="One-day or range. Use TBC if flexible.">
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <ComposerInput placeholder="Start (e.g. May 6)" value={draft.scheduleStart} onChange={v => update("scheduleStart", v)} />
            <ComposerInput placeholder="End (optional)" value={draft.scheduleEnd} onChange={v => update("scheduleEnd", v)} />
          </div>
        </ComposerSection>

        {/* Location */}
        <ComposerSection title="3. Where" subtitle="City + venue. Address can come later.">
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <ComposerInput placeholder="City" value={draft.locationCity} onChange={v => update("locationCity", v)} />
            <ComposerInput placeholder="Venue / location name" value={draft.locationVenue} onChange={v => update("locationVenue", v)} />
          </div>
        </ComposerSection>

        {/* Talent */}
        <ComposerSection title="4. Who you want" subtitle={mode === "client" ? "Pick from the directory or leave blank — we'll suggest." : "Invite represented talent. Search by code or name."}>
          <ComposerInput placeholder="Search talent…" value={"" /* stub */} onChange={() => {}} />
          <div style={{ marginTop: 8, fontSize: 11.5, color: COLORS.inkDim }}>
            {draft.talent.length === 0 ? "No talent added yet." : `${draft.talent.length} added`}
          </div>
        </ComposerSection>

        {/* Brief */}
        <ComposerSection title="5. The ask" subtitle="One line for triage. Long brief in notes.">
          <ComposerInput
            placeholder={mode === "client" ? "e.g. 3 promo models for a beach club launch" : "Brief headline for triage"}
            value={draft.briefSummary} onChange={v => update("briefSummary", v)}
          />
          <div style={{ marginTop: 8 }}>
            <ComposerTextarea
              placeholder="Notes — timing, dress code, languages, deliverables…"
              value={draft.briefNotes} onChange={v => update("briefNotes", v)}
            />
          </div>
        </ComposerSection>

        {/* Budget */}
        <ComposerSection
          title="6. Budget"
          subtitle={mode === "client"
            ? "Optional but recommended — gives the agency a faster path to your offer."
            : "Optional. Leave empty to let talent propose."}
        >
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "120px 110px 1fr" }}>
            <ComposerInput placeholder="Amount" value={draft.budgetAmount} onChange={v => update("budgetAmount", v)} />
            <ComposerSelect
              value={draft.budgetUnit}
              onChange={v => update("budgetUnit", v as InquiryUnitType)}
              options={[
                { value: "hour", label: "per hour" },
                { value: "day", label: "per day" },
                { value: "contract", label: "total contract" },
                { value: "event", label: "per event" },
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
          <label style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: COLORS.inkMuted, cursor: "pointer",
          }}>
            <input type="checkbox" checked={draft.budgetPerPerson} onChange={e => update("budgetPerPerson", e.target.checked)} />
            Budget is per talent (not group total)
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
        <button type="button" onClick={onCancel} style={ghostBtn()}>Cancel</button>
        <button
          type="button"
          onClick={send}
          disabled={submitDisabled}
          title={submitDisabled ? "Inquiry sending coming soon" : undefined}
          style={{
            ...primaryBtn(COLORS.accent),
            cursor: submitDisabled ? "not-allowed" : "pointer",
            opacity: submitDisabled ? 0.45 : 1,
          }}
        >
          {mode === "client" ? "Send to agency" : "Save inquiry"}
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
  const update = (id: string, patch: Partial<{ category: string; count: number }>) =>
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  const remove = (id: string) => onChange(rows.filter(r => r.id !== id));
  const add = () => onChange([...rows, { id: `g${rows.length + 1}-${Math.random().toString(36).slice(2, 6)}`, category: "models", count: 1 }]);
  const total = rows.reduce((s, r) => s + (r.count || 0), 0);
  const categoryOptions = [
    { value: "models",        label: "Models" },
    { value: "hosts",         label: "Hosts" },
    { value: "chefs",         label: "Chefs" },
    { value: "artists",       label: "Artists" },
    { value: "djs",           label: "DJs" },
    { value: "photographers", label: "Photographers" },
    { value: "performers",    label: "Performers" },
    { value: "promoters",     label: "Promoters" },
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
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.indigoDeep }}>
            Mixed group
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
            One inquiry · multiple categories. Coordinator routes each category to the right talent.
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600,
          padding: "3px 9px", borderRadius: 999,
          background: "#fff", color: COLORS.indigoDeep,
          fontVariantNumeric: "tabular-nums",
        }}>{total} talent</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
              <button type="button" onClick={() => remove(r.id)} aria-label="Remove" style={{
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
      }}>+ Add another category</button>
    </div>
  );
}

export function ComposerSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: "12px 14px", borderRadius: 10,
      border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
    }}>
      <div style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>{title}</h3>
        {subtitle && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4 }}>{subtitle}</p>}
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
  | "chat"     // single Chat tab with Client | Group | DM sub-toggle
  | "lineup"   // people on this inquiry (was Live lineup panel)
  | "event"    // when/where/transport/lodging/call-sheet/activity (was Project/Details)
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
