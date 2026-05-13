"use client";

/**
 * Call sheet editor — client component.
 *
 * Two-column form with structured fields: schedule, venue, talents,
 * contacts, notes. Save sends the full payload to
 * `saveBookingCallSheet`. Optimistic on save success (toast +
 * router.refresh).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBookingCallSheet, clearBookingCallSheet } from "@/lib/call-sheet/actions";
import type { CallSheetPayload, CallSheetTalentEntry, CallSheetContact } from "@/lib/call-sheet/types";

interface EditorProps {
  bookingId: string;
  tenantSlug: string;
  initialPayload: CallSheetPayload;
  bookingTitle: string;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
  rosterTalents: Array<{ profileId: string; displayName: string }>;
}

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkDim: "rgba(11,11,13,0.38)",
  border: "rgba(11,11,13,0.10)",
  borderSoft: "rgba(11,11,13,0.06)",
  surface: "#FCFBF7",
  surfaceRaised: "#FFFFFF",
  accent: "#7A5B1F",
  accentSoft: "rgba(122,91,31,0.10)",
  ok: "#2A6B3F",
  okSoft: "rgba(42,107,63,0.10)",
  alert: "#9A2B2B",
  alertSoft: "rgba(154,43,43,0.10)",
} as const;

export function CallSheetEditor({
  bookingId,
  tenantSlug,
  initialPayload,
  bookingTitle,
  startsAt,
  endsAt,
  updatedAt,
  rosterTalents,
}: EditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<CallSheetPayload>(initialPayload);
  const [pending, startTxn] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const set = <K extends keyof CallSheetPayload>(key: K, val: CallSheetPayload[K]) => {
    setDraft((d) => ({ ...d, [key]: val }));
  };

  const addTalent = () => {
    setDraft((d) => ({
      ...d,
      talents: [...d.talents, { talent_profile_id: rosterTalents[0]?.profileId ?? "", call_time: null, wrap_time: null, role: null, notes: null }],
    }));
  };
  const updateTalent = (idx: number, patch: Partial<CallSheetTalentEntry>) => {
    setDraft((d) => ({
      ...d,
      talents: d.talents.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  };
  const removeTalent = (idx: number) => {
    setDraft((d) => ({ ...d, talents: d.talents.filter((_, i) => i !== idx) }));
  };

  const addContact = () => {
    setDraft((d) => ({
      ...d,
      contacts: [...d.contacts, { name: "", role: "", phone: null, email: null }],
    }));
  };
  const updateContact = (idx: number, patch: Partial<CallSheetContact>) => {
    setDraft((d) => ({
      ...d,
      contacts: d.contacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };
  const removeContact = (idx: number) => {
    setDraft((d) => ({ ...d, contacts: d.contacts.filter((_, i) => i !== idx) }));
  };

  const onSave = () => {
    if (pending) return;
    setFeedback(null);
    startTxn(async () => {
      const r = await saveBookingCallSheet(bookingId, draft);
      if (r.ok) {
        setFeedback({ kind: "ok", text: "Call sheet saved." });
        router.refresh();
      } else {
        setFeedback({ kind: "err", text: r.error });
      }
    });
  };

  const onClear = () => {
    if (pending) return;
    if (!confirm("Clear the entire call sheet? This can't be undone.")) return;
    setFeedback(null);
    startTxn(async () => {
      const r = await clearBookingCallSheet(bookingId);
      if (r.ok) {
        setDraft((d) => ({ ...d, talents: [], contacts: [], venue: null, venue_address: null, parking_note: null, holding_area: null, general_call_time: null, general_wrap_time: null, hmua_call_time: null, transport_note: null, weather_note: null, internal_note: null }));
        setFeedback({ kind: "ok", text: "Call sheet cleared." });
        router.refresh();
      } else {
        setFeedback({ kind: "err", text: r.error });
      }
    });
  };

  return (
    <div style={{
      fontFamily: FONT, color: C.ink, background: C.surface,
      maxWidth: 960, margin: "0 auto", padding: "24px 20px 96px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>
            Call sheet
          </div>
          <h1 style={{ margin: "4px 0 2px", fontSize: 24 }}>{bookingTitle}</h1>
          <div style={{ fontSize: 12.5, color: C.inkMuted }}>
            {fmtRange(startsAt, endsAt)}
            {updatedAt && ` · last saved ${fmtRelative(updatedAt)}`}
          </div>
        </div>
        <a
          href={`/${tenantSlug}/admin/bookings`}
          style={{
            fontSize: 12.5, color: C.inkMuted, textDecoration: "none",
            padding: "6px 12px", borderRadius: 999, border: `1px solid ${C.borderSoft}`,
          }}
        >← Back to bookings</a>
      </div>

      {feedback && (
        <div role="status" aria-live="polite" style={{
          marginTop: 14, padding: "10px 14px", borderRadius: 10,
          background: feedback.kind === "ok" ? C.okSoft : C.alertSoft,
          color: feedback.kind === "ok" ? C.ok : C.alert,
          fontSize: 13, fontWeight: 600,
        }}>
          {feedback.text}
        </div>
      )}

      {/* Schedule */}
      <Section title="Schedule">
        <Row>
          <Field label="Call time"><TimeInput value={draft.general_call_time} onChange={(v) => set("general_call_time", v)} /></Field>
          <Field label="Wrap time"><TimeInput value={draft.general_wrap_time} onChange={(v) => set("general_wrap_time", v)} /></Field>
          <Field label="Hair & makeup call"><TimeInput value={draft.hmua_call_time} onChange={(v) => set("hmua_call_time", v)} /></Field>
        </Row>
      </Section>

      {/* Venue */}
      <Section title="Venue">
        <Row>
          <Field label="Venue name" wide><TextInput value={draft.venue} onChange={(v) => set("venue", v)} placeholder="Studio name / location" /></Field>
          <Field label="Address" wide><TextInput value={draft.venue_address} onChange={(v) => set("venue_address", v)} placeholder="Full address" /></Field>
        </Row>
        <Row>
          <Field label="Parking note"><TextInput value={draft.parking_note} onChange={(v) => set("parking_note", v)} placeholder="Free until 10am, valet $20…" /></Field>
          <Field label="Holding area"><TextInput value={draft.holding_area} onChange={(v) => set("holding_area", v)} placeholder="Green Room (basement)" /></Field>
        </Row>
      </Section>

      {/* Talents */}
      <Section title={`Talent on call${draft.talents.length ? ` (${draft.talents.length})` : ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {draft.talents.length === 0 && (
            <div style={{ fontSize: 12.5, color: C.inkMuted, padding: "8px 0" }}>
              No talent added yet. Use the button below to add a row per talent on the job.
            </div>
          )}
          {draft.talents.map((t, idx) => (
            <div key={idx} style={{
              border: `1px solid ${C.borderSoft}`, borderRadius: 10, background: C.surfaceRaised,
              padding: 12, display: "grid",
              gridTemplateColumns: "minmax(160px, 1.6fr) repeat(2, minmax(90px, 1fr)) minmax(120px, 1fr) auto",
              gap: 10, alignItems: "end",
            }}>
              <Field label="Talent">
                <select
                  value={t.talent_profile_id}
                  onChange={(e) => updateTalent(idx, { talent_profile_id: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">— Select —</option>
                  {rosterTalents.map((r) => (
                    <option key={r.profileId} value={r.profileId}>{r.displayName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Call"><TimeInput value={t.call_time} onChange={(v) => updateTalent(idx, { call_time: v })} /></Field>
              <Field label="Wrap"><TimeInput value={t.wrap_time} onChange={(v) => updateTalent(idx, { wrap_time: v })} /></Field>
              <Field label="Role"><TextInput value={t.role} onChange={(v) => updateTalent(idx, { role: v })} placeholder="lead, supporting, …" /></Field>
              <button type="button" onClick={() => removeTalent(idx)} aria-label="Remove" style={removeBtnStyle}>×</button>
              <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                <Field label="Talent notes">
                  <TextInput value={t.notes} onChange={(v) => updateTalent(idx, { notes: v })} placeholder="Bring nude heels, allergy to…" />
                </Field>
              </div>
            </div>
          ))}
          <button type="button" onClick={addTalent} style={addRowBtnStyle}>+ Add talent row</button>
        </div>
      </Section>

      {/* Contacts */}
      <Section title={`Contacts${draft.contacts.length ? ` (${draft.contacts.length})` : ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {draft.contacts.length === 0 && (
            <div style={{ fontSize: 12.5, color: C.inkMuted, padding: "8px 0" }}>
              Coordinator, photographer, MUA, drivers — anyone the talent needs to reach.
            </div>
          )}
          {draft.contacts.map((c, idx) => (
            <div key={idx} style={{
              border: `1px solid ${C.borderSoft}`, borderRadius: 10, background: C.surfaceRaised,
              padding: 12, display: "grid",
              gridTemplateColumns: "minmax(140px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(160px, 1.4fr) auto",
              gap: 10, alignItems: "end",
            }}>
              <Field label="Name"><TextInput value={c.name} onChange={(v) => updateContact(idx, { name: v ?? "" })} placeholder="Full name" /></Field>
              <Field label="Role"><TextInput value={c.role} onChange={(v) => updateContact(idx, { role: v ?? "" })} placeholder="Coordinator / MUA / …" /></Field>
              <Field label="Phone"><TextInput value={c.phone} onChange={(v) => updateContact(idx, { phone: v })} placeholder="+52 …" /></Field>
              <Field label="Email"><TextInput value={c.email} onChange={(v) => updateContact(idx, { email: v })} placeholder="name@agency.com" /></Field>
              <button type="button" onClick={() => removeContact(idx)} aria-label="Remove" style={removeBtnStyle}>×</button>
            </div>
          ))}
          <button type="button" onClick={addContact} style={addRowBtnStyle}>+ Add contact</button>
        </div>
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <Row>
          <Field label="Transport note" wide><TextArea value={draft.transport_note} onChange={(v) => set("transport_note", v)} placeholder="Pickup arrangements, parking codes, gate access…" /></Field>
        </Row>
        <Row>
          <Field label="Weather note" wide><TextArea value={draft.weather_note} onChange={(v) => set("weather_note", v)} placeholder="Outdoor backup plan, dress code adjustments…" /></Field>
        </Row>
        <Row>
          <Field label="Internal note (staff only — not exported)" wide>
            <TextArea value={draft.internal_note} onChange={(v) => set("internal_note", v)} placeholder="Anything the coordinator team needs to know" />
          </Field>
        </Row>
      </Section>

      {/* Sticky save bar */}
      <div style={{
        position: "sticky", bottom: 0, marginTop: 24,
        background: C.surface, padding: "12px 0 0",
        borderTop: `1px solid ${C.borderSoft}`,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        <button
          type="button"
          onClick={onClear}
          disabled={pending}
          style={{
            border: `1px solid ${C.alertSoft}`, background: "transparent", color: C.alert,
            padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600,
            cursor: pending ? "wait" : "pointer", opacity: pending ? 0.6 : 1,
          }}
        >
          Clear call sheet
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          style={{
            border: "none", background: C.accent, color: "#fff",
            padding: "10px 18px", borderRadius: 999, fontSize: 13.5, fontWeight: 700,
            cursor: pending ? "wait" : "pointer", opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Saving…" : "Save call sheet"}
        </button>
      </div>
    </div>
  );
}

/* ─── tiny presentational helpers ──────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: "#fff",
  fontFamily: FONT, fontSize: 13, color: C.ink, outline: "none",
};

const addRowBtnStyle: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 10,
  border: `1.5px dashed ${C.border}`, background: "transparent",
  color: C.inkMuted, fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
  cursor: "pointer",
};

const removeBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 999,
  border: `1px solid ${C.borderSoft}`, background: "transparent",
  color: C.inkMuted, cursor: "pointer", fontSize: 18, lineHeight: 1,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{
        margin: "0 0 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
        textTransform: "uppercase", color: C.inkMuted,
      }}>{title}</h2>
      <div style={{
        background: C.surfaceRaised, borderRadius: 12,
        border: `1px solid ${C.borderSoft}`, padding: 14,
      }}>
        {children}
      </div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      gap: 12, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: wide ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: C.inkMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}

function TimeInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <input
      type="time"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      style={inputStyle}
    />
  );
}

function TextArea({ value, onChange, placeholder }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={placeholder}
      rows={3}
      style={{ ...inputStyle, fontFamily: FONT, resize: "vertical", minHeight: 60 }}
    />
  );
}

function fmtRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Date TBC";
  try {
    const s = new Date(startsAt);
    const sLabel = s.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    if (!endsAt) return sLabel;
    const e = new Date(endsAt);
    const eLabel = e.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return `${sLabel} → ${eLabel}`;
  } catch {
    return "Date TBC";
  }
}

function fmtRelative(iso: string): string {
  try {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diffMs = Math.max(0, Date.now() - t);
    const min = diffMs / 60_000;
    if (min < 1) return "just now";
    if (min < 60) return `${Math.floor(min)}m ago`;
    const hr = min / 60;
    if (hr < 24) return `${Math.floor(hr)}h ago`;
    const day = hr / 24;
    if (day < 7) return `${Math.floor(day)}d ago`;
    return new Date(t).toLocaleDateString();
  } catch {
    return "";
  }
}
