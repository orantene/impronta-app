"use client";

import * as React from "react";
import { useActionState, useState } from "react";
import Link from "next/link";
import { type CreateRosterTalentState, createRosterTalent } from "./actions";
import { createTranslator } from "@/i18n/messages";

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
  amber:       "var(--color-admin-amber)",
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
  locale = "en",
}: {
  tenantSlug: string;
  talentTypes: TalentTypeOption[];
  seatUsage?: {
    used: number;
    limit: number | null;
    atLimit: boolean;
    message: string | null;
  };
  locale?: string;
}) {
  const t = createTranslator(locale);
  const [method, setMethod] = useState<ManagementMethod>("agency");
  const boundAction = createRosterTalent.bind(null, tenantSlug);
  const [state, action, pending] = useActionState<CreateRosterTalentState, FormData>(
    boundAction,
    undefined,
  );

  const ctaLabel =
    method === "agency"   ? t("admin.roster.new.ctaAgency") :
    method === "invited"  ? t("admin.roster.new.ctaInvited") :
                            t("admin.roster.new.ctaDraft");

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
          {t("admin.roster.new.seatUsage").replace("{used}", String(seatUsage.used)).replace("{limit}", String(seatUsage.limit))}
        </div>
      )}

      {/* ── Name ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label={t("admin.roster.new.firstName")} required>
          <input name="first_name" required autoComplete="off" placeholder="Sofia" style={inputStyle()} />
        </Field>
        <Field label={t("admin.roster.new.lastName")} required>
          <input name="last_name" required autoComplete="off" placeholder="Herrera" style={inputStyle()} />
        </Field>
      </div>

      <Field label={t("admin.roster.new.displayName")} hint={t("admin.roster.new.displayNameHint")}>
        <input name="display_name" autoComplete="off" placeholder="e.g. Sofía H." style={inputStyle()} />
      </Field>

      {/* ── Contact ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field
          label={t("admin.roster.new.email")}
          hint={method === "invited" ? t("admin.roster.new.emailHintInvited") : t("admin.roster.new.emailHintOptional")}
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
        <Field label={t("admin.roster.new.phone")} hint={t("admin.roster.new.phoneHint")}>
          <input name="phone" type="tel" autoComplete="off" placeholder="+1 555 000 0000" style={inputStyle()} />
        </Field>
      </div>

      {/* ── Talent type + city ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label={t("admin.roster.new.primaryType")} hint={t("admin.roster.new.primaryTypeHint")}>
          <select name="talent_type_term_id" defaultValue="" style={inputStyle()}>
            <option value="">{t("admin.roster.new.noneOption")}</option>
            {talentTypes.map((tt) => (
              <option key={tt.id} value={tt.id}>{tt.name_en}</option>
            ))}
          </select>
        </Field>
        <Field label={t("admin.roster.new.homeCity")} hint="e.g. Playa del Carmen">
          <input name="home_city_text" autoComplete="off" placeholder="City" style={inputStyle()} />
        </Field>
      </div>

      {/* ── Physical ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Field label={t("admin.roster.new.heightCm")} hint="e.g. 175">
          <input name="height_cm" type="number" min={50} max={280} step={0.5} placeholder="cm" style={inputStyle()} />
        </Field>
        <Field label={t("admin.roster.new.gender")}>
          {/* Canonical, inclusive gender option-set — values match
              talent_profiles.gender + profile_field_definitions(identity.gender).options
              + the directory facet config (Tier-C-tail, 2026-06-10). The four
              common values keep their translated labels; the rest are proper
              identity terms shown verbatim. */}
          <select name="gender" defaultValue="" style={inputStyle()}>
            <option value="">{t("admin.roster.new.noneOption")}</option>
            <option value="Woman">{t("admin.roster.new.genderWoman")}</option>
            <option value="Man">{t("admin.roster.new.genderMan")}</option>
            <option value="Non-binary">{t("admin.roster.new.genderNonBinary")}</option>
            <option value="Trans woman">Trans woman</option>
            <option value="Trans man">Trans man</option>
            <option value="Transgender">Transgender</option>
            <option value="Genderfluid">Genderfluid</option>
            <option value="Genderqueer">Genderqueer</option>
            <option value="Agender">Agender</option>
            <option value="Bigender">Bigender</option>
            <option value="Two-Spirit">Two-Spirit</option>
            <option value="Intersex">Intersex</option>
            <option value="Prefer to self-describe">Prefer to self-describe</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
        </Field>
        <Field label={t("admin.roster.new.rosterVisibility")}>
          <select name="agency_visibility" defaultValue="roster_only" style={inputStyle()}>
            <option value="roster_only">{t("admin.roster.new.visRosterOnly")}</option>
            <option value="site_visible">{t("admin.roster.new.visSiteVisible")}</option>
            <option value="featured">{t("admin.roster.new.visFeatured")}</option>
          </select>
        </Field>
      </div>

      {/* ── Short bio ── */}
      <Field label={t("admin.roster.new.shortBio")}>
        <textarea
          name="short_bio"
          rows={2}
          placeholder={t("admin.roster.new.shortBioPlaceholder")}
          style={{ ...inputStyle(), resize: "vertical" }}
        />
      </Field>

      {/* ── Management method ── */}
      <div>
        <div style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.2, marginBottom: 8 }}>
          {t("admin.roster.new.management")}
        </div>
        <div className="flex flex-col gap-2">
          <MethodCard
            value="agency"
            selected={method === "agency"}
            title={t("admin.roster.new.methodAgencyTitle")}
            desc={t("admin.roster.new.methodAgencyDesc")}
            onChange={setMethod}
          />
          <MethodCard
            value="invited"
            selected={method === "invited"}
            title={t("admin.roster.new.methodInvitedTitle")}
            desc={t("admin.roster.new.methodInvitedDesc")}
            onChange={setMethod}
          />
          <MethodCard
            value="draft"
            selected={method === "draft"}
            title={t("admin.roster.new.methodDraftTitle")}
            desc={t("admin.roster.new.methodDraftDesc")}
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
          {pending ? t("admin.roster.new.creating") : ctaLabel}
        </button>
        <Link href={`/${tenantSlug}/admin/roster`} style={{ fontSize: 13, color: C.inkMuted, fontFamily: F, textDecoration: "none" }}>
          {t("admin.roster.new.cancel")}
        </Link>
      </div>
    </form>
  );
}
