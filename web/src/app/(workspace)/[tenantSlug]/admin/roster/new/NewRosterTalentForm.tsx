"use client";

import * as React from "react";
import { useActionState, useState } from "react";
import Link from "next/link";
import { type CreateRosterTalentState, createRosterTalent } from "./actions";

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.62)",
  inkDim:      "rgba(11,11,13,0.38)",
  border:      "rgba(24,24,27,0.10)",
  borderFocus: "rgba(15,79,62,0.45)",
  surface:     "#FAFAF7",
  card:        "#ffffff",
  accent:      "#0F4F3E",
  accentSoft:  "rgba(15,79,62,0.08)",
  accentBorder:"rgba(15,79,62,0.20)",
  amber:       "#8A6F1A",
  amberSoft:   "rgba(212,160,23,0.10)",
  amberBorder: "rgba(212,160,23,0.25)",
  error:       "#c0392b",
  errorSoft:   "rgba(192,57,43,0.08)",
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
      <span style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.2 }}>
        {label}
        {required && <span style={{ color: C.error, marginLeft: 3 }}>*</span>}
      </span>
      {children}
      {hint && (
        <span style={{ fontFamily: F, fontSize: 11.5, color: C.inkDim }}>{hint}</span>
      )}
    </label>
  );
}

type ManagementMethod = "agency" | "invited" | "draft";

function MethodCard({
  value,
  selected,
  title,
  desc,
  onChange,
}: {
  value: ManagementMethod;
  selected: boolean;
  title: string;
  desc: string;
  onChange: (v: ManagementMethod) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1.5px solid ${selected ? C.accent : C.border}`,
        background: selected ? C.accentSoft : "#fff",
        cursor: "pointer",
        transition: "border-color 0.12s, background 0.12s",
      }}
    >
      <input
        type="radio"
        name="management_method"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        style={{ marginTop: 2, accentColor: C.accent, flexShrink: 0 }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: F }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.45, fontFamily: F }}>{desc}</div>
      </div>
    </label>
  );
}

export function NewRosterTalentForm({
  tenantSlug,
  talentTypes,
  seatUsage,
}: {
  tenantSlug: string;
  talentTypes: TalentTypeOption[];
  seatUsage?: {
    used: number;
    limit: number | null;
    atLimit: boolean;
    message: string | null;
  };
}) {
  const [method, setMethod] = useState<ManagementMethod>("agency");
  const boundAction = createRosterTalent.bind(null, tenantSlug);
  const [state, action, pending] = useActionState<CreateRosterTalentState, FormData>(
    boundAction,
    undefined,
  );

  const ctaLabel =
    method === "agency"   ? "Create + open profile" :
    method === "invited"  ? "Save & mark as invited" :
                            "Save as draft";

  return (
    <form
      action={action}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 600,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 24,
      }}
    >
      {/* Hidden method field */}
      <input type="hidden" name="management_method" value={method} />

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

      {seatUsage?.limit != null && (
        <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, padding: "9px 12px", fontSize: 12.5, color: C.inkMuted, fontFamily: F }}>
          {seatUsage.used}/{seatUsage.limit} roster spots used
        </div>
      )}

      {/* ── Name ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="First name" required>
          <input name="first_name" required autoComplete="off" placeholder="Sofia" style={inputStyle()} />
        </Field>
        <Field label="Last name" required>
          <input name="last_name" required autoComplete="off" placeholder="Herrera" style={inputStyle()} />
        </Field>
      </div>

      <Field label="Display / stage name" hint="Defaults to First + Last if left blank.">
        <input name="display_name" autoComplete="off" placeholder="e.g. Sofía H." style={inputStyle()} />
      </Field>

      {/* ── Contact ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field
          label="Email"
          hint={method === "invited" ? "Required — used for the claim invite." : "Optional — for booking comms."}
          required={method === "invited"}
        >
          <input
            name="invitation_email"
            type="email"
            autoComplete="off"
            placeholder="talent@example.com"
            required={method === "invited"}
            style={inputStyle()}
          />
        </Field>
        <Field label="Phone" hint="Optional.">
          <input name="phone" type="tel" autoComplete="off" placeholder="+1 555 000 0000" style={inputStyle()} />
        </Field>
      </div>

      {/* ── Talent type + city ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Primary talent type" hint="You can change this later.">
          <select name="talent_type_term_id" defaultValue="" style={inputStyle()}>
            <option value="">— none —</option>
            {talentTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name_en}</option>
            ))}
          </select>
        </Field>
        <Field label="Home city" hint="e.g. Playa del Carmen">
          <input name="home_city_text" autoComplete="off" placeholder="City" style={inputStyle()} />
        </Field>
      </div>

      {/* ── Physical ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Field label="Height (cm)" hint="e.g. 175">
          <input name="height_cm" type="number" min={50} max={280} step={0.5} placeholder="cm" style={inputStyle()} />
        </Field>
        <Field label="Gender">
          <select name="gender" defaultValue="" style={inputStyle()}>
            <option value="">— none —</option>
            <option value="woman">Woman</option>
            <option value="man">Man</option>
            <option value="non_binary">Non-binary</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Roster visibility">
          <select name="agency_visibility" defaultValue="roster_only" style={inputStyle()}>
            <option value="roster_only">Roster only</option>
            <option value="site_visible">Site visible</option>
            <option value="featured">Featured</option>
          </select>
        </Field>
      </div>

      {/* ── Short bio ── */}
      <Field label="Short bio">
        <textarea
          name="short_bio"
          rows={2}
          placeholder="One or two lines for clients. The full bio can be written from the talent profile."
          style={{ ...inputStyle(), resize: "vertical" }}
        />
      </Field>

      {/* ── Management method ── */}
      <div>
        <div style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.2, marginBottom: 8 }}>
          Management
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MethodCard
            value="agency"
            selected={method === "agency"}
            title="Agency fills the profile"
            desc="You complete the full profile after this step. Profile starts as draft."
            onChange={setMethod}
          />
          <MethodCard
            value="invited"
            selected={method === "invited"}
            title="Mark as invited"
            desc="Talent gets a claim link to complete their own profile. Email required."
            onChange={setMethod}
          />
          <MethodCard
            value="draft"
            selected={method === "draft"}
            title="Save as draft"
            desc="Quietly adds to roster. Fill it in later — no notification sent."
            onChange={setMethod}
          />
        </div>
      </div>

      {/* ── Actions ── */}
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
          {pending ? "Creating…" : ctaLabel}
        </button>
        <Link href={`/${tenantSlug}/admin/roster`} style={{ fontSize: 13, color: C.inkMuted, fontFamily: F, textDecoration: "none" }}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
