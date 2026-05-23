"use client";

// Inline-edit row used on the client Settings page. View state: label +
// value + small "Edit" affordance. Edit state: input + Save / Cancel.
// Persistent save state is required per the [admin-edit-ux feedback rule]:
// every async state must be visible — no silent waits, no toast-and-vanish.

import { useState, useTransition } from "react";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.10)",
  surface:    "rgba(11,11,13,0.02)",
  blue:       "#1D4ED8",
  blueSoft:   "rgba(29,78,216,0.08)",
  green:      "#0F766E",
  red:        "#B91C1C",
} as const;

type Result = { ok: true } | { ok: false; error: string };

export function EditableTextRow({
  label,
  hint,
  value,
  placeholder,
  emptyLabel,
  onSave,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  emptyLabel?: string;
  onSave: (next: string) => Promise<Result>;
  type?: "text" | "email";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function begin() {
    setDraft(value);
    setError(null);
    setJustSaved(false);
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setError(null);
  }
  function save() {
    const trimmed = draft.trim();
    if (trimmed === value.trim()) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await onSave(trimmed);
      if (res.ok) {
        setEditing(false);
        setJustSaved(true);
        // Don't auto-hide — visible confirmation per the no-silent-state rule.
        // The check stays until the next edit.
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: editing ? "flex-start" : "center",
        gap: 16,
        padding: "14px 0",
        borderBottom: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
      }}
    >
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{label}</div>
          {justSaved && !editing && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: C.green,
                background: "rgba(15,118,110,0.10)",
                padding: "2px 7px",
                borderRadius: 999,
                letterSpacing: 0.2,
              }}
            >
              ✓ Saved
            </span>
          )}
        </div>
        {hint && <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>{hint}</div>}

        {editing && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <input
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              autoFocus
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); save(); }
                if (e.key === "Escape") { e.preventDefault(); cancel(); }
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${error ? C.red : C.borderSoft}`,
                fontFamily: FONT,
                fontSize: 13,
                color: C.ink,
                background: "#fff",
                outline: "none",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = error ? C.red : C.blue; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = error ? C.red : C.borderSoft; }}
            />
            {error && (
              <div style={{ fontSize: 11.5, color: C.red }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "none",
                  background: C.ink,
                  color: "#fff",
                  cursor: pending ? "default" : "pointer",
                  opacity: pending ? 0.6 : 1,
                  fontFamily: FONT,
                }}
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: `1px solid ${C.borderSoft}`,
                  background: "transparent",
                  color: C.inkMuted,
                  cursor: pending ? "default" : "pointer",
                  fontFamily: FONT,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div
            style={{
              fontSize: 13,
              color: value ? C.inkMuted : "rgba(11,11,13,0.35)",
              maxWidth: 260,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontStyle: value ? "normal" : "italic",
            }}
          >
            {value || emptyLabel || "—"}
          </div>
          <button
            type="button"
            onClick={begin}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              padding: "5px 10px",
              borderRadius: 7,
              border: `1px solid ${C.borderSoft}`,
              background: C.surface,
              color: C.ink,
              cursor: "pointer",
              fontFamily: FONT,
              letterSpacing: 0.1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.blueSoft; e.currentTarget.style.color = C.blue; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.ink; }}
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
