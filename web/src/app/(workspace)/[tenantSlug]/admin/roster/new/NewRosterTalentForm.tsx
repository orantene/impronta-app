"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { type CreateRosterTalentState, createRosterTalent } from "./actions";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.72)",
  inkDim:     "rgba(11,11,13,0.38)",
  border:     "rgba(24,24,27,0.10)",
  borderFocus:"rgba(15,79,62,0.45)",
  surface:    "#FAFAF7",
  card:       "#ffffff",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  error:      "#c0392b",
  errorSoft:  "rgba(192,57,43,0.08)",
} as const;

const F = '"Inter", system-ui, sans-serif';

type TalentTypeOption = { id: string; name_en: string };

function inputStyle(fullWidth = true): React.CSSProperties {
  return {
    display: "block",
    width: fullWidth ? "100%" : undefined,
    background: "#fff",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "9px 11px",
    fontSize: 14,
    fontFamily: F,
    color: C.ink,
    outline: "none",
    boxSizing: "border-box",
  };
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          fontFamily: F,
          fontSize: 12,
          fontWeight: 600,
          color: C.inkMuted,
          letterSpacing: 0.2,
        }}
      >
        {label}
        {required && (
          <span style={{ color: C.error, marginLeft: 3 }}>*</span>
        )}
      </span>
      {children}
      {hint && (
        <span style={{ fontFamily: F, fontSize: 11.5, color: C.inkDim }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function NewRosterTalentForm({
  tenantSlug,
  talentTypes,
}: {
  tenantSlug: string;
  talentTypes: TalentTypeOption[];
}) {
  const boundAction = createRosterTalent.bind(null, tenantSlug);
  const [state, action, pending] = useActionState<
    CreateRosterTalentState,
    FormData
  >(boundAction, undefined);

  return (
    <form
      action={action}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 540,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 24,
      }}
    >
      {state?.error && (
        <div
          role="alert"
          style={{
            background: C.errorSoft,
            border: `1px solid rgba(192,57,43,0.20)`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: C.error,
            fontFamily: F,
          }}
        >
          {state.error}
        </div>
      )}

      {/* Display name — required */}
      <Field label="Display name" required>
        <input
          name="display_name"
          required
          placeholder="e.g. Sofía Herrera"
          autoComplete="off"
          style={inputStyle()}
        />
      </Field>

      {/* First / last */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="First name">
          <input
            name="first_name"
            autoComplete="off"
            style={inputStyle()}
          />
        </Field>
        <Field label="Last name">
          <input
            name="last_name"
            autoComplete="off"
            style={inputStyle()}
          />
        </Field>
      </div>

      {/* Talent type */}
      <Field
        label="Primary talent type"
        hint="You can change this later."
      >
        <select
          name="talent_type_term_id"
          defaultValue=""
          style={inputStyle()}
        >
          <option value="">— none —</option>
          {talentTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name_en}
            </option>
          ))}
        </select>
      </Field>

      {/* Short bio */}
      <Field label="Short bio">
        <textarea
          name="short_bio"
          rows={3}
          placeholder="One or two lines for clients. The full bio can be written from the talent profile."
          style={{ ...inputStyle(), resize: "vertical" }}
        />
      </Field>

      {/* Roster visibility */}
      <Field
        label="Roster visibility"
        hint="Profile starts in draft. Storefront visibility also requires workflow approval."
      >
        <select
          name="agency_visibility"
          defaultValue="roster_only"
          style={inputStyle()}
        >
          <option value="roster_only">Roster only (hidden from storefront)</option>
          <option value="site_visible">Site visible</option>
          <option value="featured">Featured</option>
        </select>
      </Field>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            background: C.accent,
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: F,
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Creating…" : "Create talent profile"}
        </button>
        <Link
          href={`/${tenantSlug}/admin/roster`}
          style={{
            fontSize: 13,
            color: C.inkMuted,
            fontFamily: F,
            textDecoration: "none",
          }}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
