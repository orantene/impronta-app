"use client";

/**
 * CallSheetEditorSheet — B2 admin call-sheet editor.
 *
 * Opens from the "Edit call sheet" button on the LogisticsTab in the
 * admin Messages shell. Edits a focused set of day-of fields and
 * commits via updateCallSheetAsAdmin. Emits a structured
 * call_sheet_update chat message so client + talent see the change in
 * the conversation stream.
 */

import { useState, useTransition } from "react";
import { updateCallSheetAsAdmin, type CallSheetFields } from "@/lib/server-actions/admin-call-sheet";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.10)",
  accent: "#1D4ED8",
  success: "#0F5132",
} as const;

export type CallSheetInitial = CallSheetFields;

export function CallSheetEditorSheet({
  open,
  inquiryId,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  inquiryId: string;
  initial: CallSheetInitial;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [fields, setFields] = useState<CallSheetInitial>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const set = <K extends keyof CallSheetInitial>(k: K, v: CallSheetInitial[K]) =>
    setFields((p) => ({ ...p, [k]: v }));

  function submit() {
    setError(null);
    // Build a diff: only include fields the user changed from initial.
    const diff: CallSheetFields = {};
    (Object.keys(fields) as Array<keyof CallSheetFields>).forEach((k) => {
      if (fields[k] !== initial[k]) {
        (diff as Record<string, unknown>)[k] = fields[k];
      }
    });
    if (Object.keys(diff).length === 0) {
      onClose();
      return;
    }
    startTransition(async () => {
      const r = await updateCallSheetAsAdmin(inquiryId, diff);
      if (!r.ok) { setError(r.error); return; }
      onSaved?.();
      onClose();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit call sheet"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.45)",
        zIndex: 110,
        display: "flex",
        justifyContent: "flex-end",
        fontFamily: FONT,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100vw)",
          height: "100dvh",
          background: "#FAFAF7",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            padding: "16px 22px",
            borderBottom: `1px solid ${C.borderSoft}`,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div className="flex-1">
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Edit call sheet
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
              Day-of details
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", color: C.ink, fontSize: 18, cursor: "pointer" }}
          >×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Field
            label="Event date"
            type="date"
            value={fields.eventDate ?? ""}
            onChange={(v) => set("eventDate", v || null)}
          />
          <Row>
            <Field
              label="Call time"
              type="time"
              value={fields.callTime ?? ""}
              onChange={(v) => set("callTime", v || null)}
            />
            <Field
              label="Wrap time"
              type="time"
              value={fields.wrapTime ?? ""}
              onChange={(v) => set("wrapTime", v || null)}
            />
          </Row>
          <Field
            label="Duration"
            placeholder="e.g. 8 hours"
            value={fields.duration ?? ""}
            onChange={(v) => set("duration", v || null)}
          />
          <Field
            label="Venue name"
            placeholder="e.g. Tulum Beach Club"
            value={fields.venueName ?? ""}
            onChange={(v) => set("venueName", v || null)}
          />
          <Field
            label="City / region"
            placeholder="e.g. Tulum, Mexico"
            value={fields.eventLocation ?? ""}
            onChange={(v) => set("eventLocation", v || null)}
          />
          <Field
            label="Google Maps URL"
            placeholder="https://maps.google.com/…"
            value={fields.googleMapsUrl ?? ""}
            onChange={(v) => set("googleMapsUrl", v || null)}
          />
          <Field
            label="Timezone"
            placeholder="e.g. America/Cancun"
            value={fields.eventTimezone ?? ""}
            onChange={(v) => set("eventTimezone", v || null)}
          />
          <FieldTextarea
            label="Logistics notes"
            placeholder="Parking, dress code, prep schedule, anything talent needs to know."
            value={fields.notes ?? ""}
            onChange={(v) => set("notes", v || null)}
          />

          {error && (
            <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", color: "#991B1B", borderRadius: 8, fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.borderSoft}`, background: "#fff", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{ padding: "10px 16px", borderRadius: 8, background: "transparent", border: `1px solid ${C.borderSoft}`, color: C.ink, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              background: pending ? "rgba(15,81,50,0.6)" : C.success,
              color: "#fff",
              border: "none",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 700,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {pending ? "Saving…" : "Save call sheet"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2.5">{children}</div>;
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${C.borderSoft}`,
          background: "#fff",
          fontFamily: FONT,
          fontSize: 13,
          color: C.ink,
          outline: "none",
        }}
      />
    </label>
  );
}

function FieldTextarea({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${C.borderSoft}`,
          background: "#fff",
          fontFamily: FONT,
          fontSize: 13,
          color: C.ink,
          outline: "none",
          resize: "vertical",
          minHeight: 80,
        }}
      />
    </label>
  );
}
