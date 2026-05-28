// Phase-1f decomp — status pill / smart footer CTA / IdentityEditor
// + private SelectPicker / LockedHint / FieldLocksOverviewPanel.
// Cluster shipped together because IdentityEditor calls
// CollapsibleIdentityField + CountryAutocompleteInput (./profile-identity-fields)
// and LockedHint inline.
"use client";
import React, { useRef } from "react";
import {
  COLORS,
  ChannelVisibilityStrip,
  FONTS,
  FieldLockPath,
  FieldRow,
  GENDER_OPTIONS,
  PRONOUNS_OPTIONS,
  ProfileIdentity,
  SHARED_FIELD_INPUT_STYLE,
  ageRangeFor,
  deriveAge,
  useDashboardText,
} from "../../drawer-shared";
import {
  CollapsibleIdentityField,
  CountryAutocompleteInput,
} from "./profile-identity-fields";
import { CountryDialPicker } from "@/components/ui/country-dial-picker";
import { getAllowedProfileStatusOptions } from "@/lib/field-engine/profile-publish-requirements";

export function StatusPillDropdown({ status, onChange, role, canPublish }: {
  status: "draft" | "pending" | "published" | "hidden";
  onChange: (s: "draft" | "pending" | "published" | "hidden") => void;
  role: "admin" | "talent";
  canPublish?: boolean;
}) {
  const copy = useDashboardText();
  type Status = "draft" | "pending" | "published" | "hidden";
  const meta: Record<Status, { label: string; bg: string; fg: string }> = {
    draft:     { label: "Draft",     bg: "rgba(11,11,13,0.06)",    fg: COLORS.inkMuted },
    pending:   { label: "Pending",   bg: COLORS.amberSoft,         fg: COLORS.amberDeep },
    published: { label: "Published", bg: COLORS.successSoft,       fg: COLORS.successDeep },
    hidden:    { label: "Hidden",    bg: "rgba(91,107,160,0.10)",  fg: COLORS.indigoDeep },
  };
  const cur = meta[status];
  const allowed = getAllowedProfileStatusOptions({
    role,
    currentStatus: status,
    canPublish: canPublish ?? false,
  });
  // Stable popover id (one per render — fine since only one is open at a time)
  const popoverId = React.useId();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="relative">
      <button type="button"
        // Native popover trigger — browser handles open/close
        {...({ popoverTarget: popoverId } as Record<string, string>)}
        style={{
          padding: "5px 12px", borderRadius: 999, border: "none",
          background: cur.bg, color: cur.fg,
          fontSize: 11, fontWeight: 600, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 5,
          fontFamily: FONTS.body,
        }}>
        {copy.t(cur.label)}
        <span className="text-admin-10">▾</span>
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        // Native popover; auto-dismisses on outside click + Escape
        {...({ popover: "auto" } as Record<string, string>)}
        style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
          boxShadow: "0 10px 30px -8px rgba(11,11,13,0.18)",
          minWidth: 160, padding: 4, fontFamily: FONTS.body,
          // popover="auto" sets `display: none` until shown
          margin: 0, inset: "auto",
        }}>
        {allowed.map(s => (
          <button key={s} type="button" onClick={() => {
            onChange(s);
            // Close the popover via the API
            popoverRef.current?.hidePopover?.();
          }} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 6, border: "none",
            background: s === status ? "rgba(11,11,13,0.04)" : "transparent",
            cursor: "pointer", textAlign: "left",
            fontSize: 12.5, fontWeight: 500, color: COLORS.ink,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: meta[s].fg,
            }} />
            {copy.t(meta[s].label)}
          </button>
        ))}
      </div>
    </div>
  );
}


export function SmartFooterCTA({ status, mode, canPublish, onAction }: {
  status: "draft" | "pending" | "published" | "hidden";
  mode: "create" | "edit-admin" | "edit-self";
  canPublish: boolean;
  onAction: () => void;
}) {
  const copy = useDashboardText();
  const isSelf = mode === "edit-self";
  const cta = isSelf
    ? (status === "published" ? "Save changes" : "Submit for review")
    : (status === "published" ? "Update" : status === "hidden" ? "Unhide" : status === "pending" ? "Save" : "Publish");
  const enabled = isSelf || status === "published" || status === "hidden" || status === "pending" || canPublish;
  return (
    <button type="button" disabled={!enabled} onClick={onAction} style={{
      padding: "8px 16px", borderRadius: 999, border: "none",
      background: enabled ? COLORS.fill : "rgba(11,11,13,0.10)",
      color: enabled ? "#fff" : COLORS.inkDim,
      fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
      cursor: enabled ? "pointer" : "default",
      whiteSpace: "nowrap",
    }}>{copy.t(cta)}</button>
  );
}


export function IdentitySubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      gridColumn: "1 / -1",
      paddingTop: 4,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: "rgba(11,11,13,0.42)",
      fontFamily: FONTS.body,
    }}>
      {children}
    </div>
  );
}


// Hoisted from inside IdentityEditor (Q4). Closures over inputStyle and
// copy.t lifted to props; parent passes them per call site.
function SelectPicker({
  options, value, placeholder, onPick, inputStyle, translate = (s) => s,
}: {
  options: { id: string; label: string }[];
  value: string | null | undefined;
  placeholder?: string;
  onPick: (id: string | null) => void;
  inputStyle: React.CSSProperties;
  translate?: (s: string) => string;
}) {
  return (
    <div className="relative">
      <select
        value={value ?? ""}
        onChange={(e) => onPick(e.target.value === "" ? null : e.target.value)}
        style={{
          ...inputStyle,
          appearance: "none",
          paddingRight: 32,
          cursor: "pointer",
        }}
      >
        <option value="">{placeholder ?? translate("Select…")}</option>
        {options.map(opt => (
          <option key={opt.id} value={opt.id}>{translate(opt.label)}</option>
        ))}
      </select>
      <span aria-hidden style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
        pointerEvents: "none", fontSize: 10, color: COLORS.inkMuted,
      }}>▾</span>
    </div>
  );
}

export function IdentityEditor({ identity, onChange, isSelf, isFieldLocked, lockReasons, workspaceScopeTenantId, disabled }: {
  identity: ProfileIdentity;
  onChange: (next: ProfileIdentity) => void;
  isSelf: boolean;
  isFieldLocked: (path: string) => boolean;
  workspaceScopeTenantId?: string | null;
  /** Step 7 — per-path reason text. Surfaced through `LockedHint` so
   *  talent see why a field is greyed out, not just that it is. */
  lockReasons?: Record<string, string>;
  /** Phase 2b — blanket lock when the talent owns their identity AND
   *  the relationship is not 'confirmed' exclusivity. When true EVERY
   *  input renders disabled with reduced opacity, regardless of the
   *  per-path `isFieldLocked` matrix. The drawer banner explains why
   *  separately; this is the safety floor for editing affordances. */
  disabled?: boolean;
}) {
  const copy = useDashboardText();
  const age = deriveAge(identity.dob);
  const ageRange = ageRangeFor(age);
  const inputStyle: React.CSSProperties = { ...SHARED_FIELD_INPUT_STYLE };
  return (
    // Phase 2b — `<fieldset disabled>` semantically disables EVERY form
    // control nested inside (HTML spec: inputs/selects/textareas/buttons
    // all inherit the disabled state). This layers on top of the existing
    // per-path `isFieldLocked` matrix + `LockedHint`: that matrix greys out
    // individual fields for self-edit policy, while this blanket lock makes
    // the WHOLE editor read-only when the talent owns their identity AND the
    // relationship is not confirmed exclusivity (the drawer banner explains
    // why). Visual: opacity 0.65 dims the entire editor — labels included.
    // border/padding/margin:0 strip the fieldset's UA-default chrome so the
    // original grid layout is preserved.
    <fieldset
      disabled={!!disabled}
      style={{
        border: "none",
        padding: 0,
        margin: 0,
        opacity: disabled ? 0.65 : 1,
      }}
    >
    <div data-pshell-identity-grid style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "16px 18px",
      fontFamily: FONTS.body,
    }}>
      <style>{`
        @container pshell (max-width: 620px) {
          [data-pshell-identity-grid] { grid-template-columns: 1fr !important; }
        }
        [data-pshell-identity-grid] [data-pshell-identity-full] {
          grid-column: 1 / -1;
        }
      `}</style>

      {/* ── Profile name ────────────────────────────────────────────── */}
      <div data-pshell-identity-full>
        <FieldRow label={copy.t("Stage / professional name")} hint={copy.t("What clients see on the public profile.")}>
          <input data-pshell-field="stageName"
            placeholder="First Last"
            value={identity.stageName}
            onChange={(e) => onChange({ ...identity, stageName: e.target.value })}
            disabled={isFieldLocked("identity.stageName")}
            style={{
              ...inputStyle,
              padding: "12px 14px", fontSize: 16, fontWeight: 500,
              opacity: isFieldLocked("identity.stageName") ? 0.55 : 1,
            }}
          />
          {isFieldLocked("identity.stageName") && <LockedHint reason={lockReasons?.["identity.stageName"]} />}
        </FieldRow>
      </div>

      {/* ── First / Last name (required) ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow label={copy.t("First name")}>
          <input
            placeholder="Sofia"
            value={identity.firstName ?? ""}
            onChange={(e) => onChange({ ...identity, firstName: e.target.value })}
            style={inputStyle}
          />
        </FieldRow>
        <FieldRow label={copy.t("Last name")}>
          <input
            placeholder="García"
            value={identity.lastName ?? ""}
            onChange={(e) => onChange({ ...identity, lastName: e.target.value })}
            style={inputStyle}
          />
        </FieldRow>
      </div>

      {/* ── Legal name (optional, collapsible) ───────────────────── */}
      <CollapsibleIdentityField
        label={copy.t("Legal name")}
        filled={!!(identity.legalName && identity.legalName.trim())}
        summary={(identity.legalName && identity.legalName.trim()) || copy.t("Add legal name")}
      >
        <div className="flex flex-col gap-1.5">
          {/* ADMIN-ONLY pill + compact visibility chip. flexWrap + rowGap
              so they never collide / overflow on narrow widths. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 4 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", background: "rgba(11,11,13,0.06)", border: `1px solid rgba(11,11,13,0.1)`, borderRadius: 5, padding: "1px 6px" }} className="text-admin-ink-muted">
              {copy.t("Admin only")}
            </span>
            <div style={{ marginLeft: "auto" }}>
              <ChannelVisibilityStrip
                value={identity.visibility?.legalName ?? ["private"]}
                onChange={(next) => onChange({
                  ...identity,
                  visibility: { ...(identity.visibility ?? {}), legalName: next },
                })}
              />
            </div>
          </div>
          <input
            placeholder={`${identity.firstName ?? "Sofia"} ${identity.lastName ?? "García"}`.trim()}
            value={identity.legalName ?? ""}
            onChange={(e) => onChange({ ...identity, legalName: e.target.value })}
            disabled={isFieldLocked("identity.legalName")}
            style={{ ...inputStyle, opacity: isFieldLocked("identity.legalName") ? 0.55 : 1 }}
          />
          {isFieldLocked("identity.legalName") && <LockedHint reason={lockReasons?.["identity.legalName"]} />}
        </div>
      </CollapsibleIdentityField>

      {/* ── Demographics ────────────────────────────────────────────── */}
      <IdentitySubLabel>{copy.t("Demographics")}</IdentitySubLabel>

      <FieldRow
        label={copy.t("Pronouns")}
        optional
        visibility={identity.visibility?.pronouns ?? ["public", "agency"]}
        onVisibilityChange={(next) => onChange({
          ...identity,
          visibility: { ...(identity.visibility ?? {}), pronouns: next },
        })}
      >
        <SelectPicker
          inputStyle={inputStyle}
          translate={copy.t}
          options={PRONOUNS_OPTIONS}
          value={identity.pronouns}
          placeholder={copy.t("Select pronouns")}
          onPick={(id) => onChange({ ...identity, pronouns: id as typeof identity.pronouns })}
        />
        {identity.pronouns === "custom" && (
          <input
            placeholder="e.g. xe / xem"
            value={identity.pronounsCustom ?? ""}
            onChange={(e) => onChange({ ...identity, pronounsCustom: e.target.value })}
            style={{
              marginTop: 8, width: "100%", boxSizing: "border-box", padding: "8px 12px",
              borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}
          />
        )}
      </FieldRow>

      <FieldRow
        label={copy.t("Gender")}
        optional
        visibility={identity.visibility?.gender ?? ["agency"]}
        onVisibilityChange={(next) => onChange({
          ...identity,
          visibility: { ...(identity.visibility ?? {}), gender: next },
        })}
      >
        <SelectPicker
          inputStyle={inputStyle}
          translate={copy.t}
          options={GENDER_OPTIONS}
          value={identity.gender}
          placeholder={copy.t("Select gender")}
          onPick={(id) => onChange({ ...identity, gender: id as typeof identity.gender })}
        />
      </FieldRow>

      <FieldRow
        label={copy.t("Date of birth")}
        catalogId="identity.dob"
        tenantId={workspaceScopeTenantId}
        optional
        hint={copy.t("Used to compute age.")}
        visibility={identity.visibility?.dob ?? ["private"]}
        onVisibilityChange={(next) => onChange({
          ...identity,
          visibility: { ...(identity.visibility ?? {}), dob: next },
        })}
      >
        <input
          type="date"
          value={identity.dob ?? ""}
          onChange={(e) => onChange({ ...identity, dob: e.target.value || null })}
          style={inputStyle}
        />
      </FieldRow>

      {age != null && (
        <FieldRow label={copy.t("Show age as")} optional>
          <SelectPicker
          inputStyle={inputStyle}
          translate={copy.t}
            options={[
              { id: "exact",  label: `${copy.t("Exact")} (${age})` },
              { id: "range",  label: ageRange ? `${copy.t("Range")} (${ageRange})` : copy.t("Range") },
              { id: "hidden", label: copy.t("Hidden") },
            ]}
            value={identity.ageDisplay ?? "range"}
            onPick={(id) => onChange({ ...identity, ageDisplay: (id ?? "range") as typeof identity.ageDisplay })}
          />
        </FieldRow>
      )}

      {/* ── Origin & residence ──────────────────────────────────────── */}
      <IdentitySubLabel>{copy.t("Origin & residence")}</IdentitySubLabel>

      <CollapsibleIdentityField
        label={copy.t("Nationality")}
        filled={!!identity.nationality}
        summary={identity.nationality || copy.t("Add nationality")}
      >
        <FieldRow
          hideLabel
          label={copy.t("Nationality")}
          catalogId="identity.nationality"
          tenantId={workspaceScopeTenantId}
          optional
          hint={copy.t("Citizenship country.")}
          visibility={["agency"]}
        >
          <CountryAutocompleteInput
            value={identity.nationality ?? ""}
            placeholder={copy.t("Search country…")}
            onChange={(nameEn) => onChange({ ...identity, nationality: nameEn })}
          />
        </FieldRow>
      </CollapsibleIdentityField>

      <CollapsibleIdentityField
        label={copy.t("Country of residence")}
        filled={!!identity.homeCountry}
        summary={identity.homeCountry || copy.t("Add country of residence")}
      >
        <FieldRow
          hideLabel
          label={copy.t("Country of residence")}
          catalogId="identity.homeCountry"
          tenantId={workspaceScopeTenantId}
          optional
          hint={copy.t("Tax + payout routing.")}
          visibility={["agency"]}
        >
          <CountryAutocompleteInput
            value={identity.homeCountry ?? ""}
            placeholder={copy.t("Search country…")}
            onChange={(nameEn) => onChange({ ...identity, homeCountry: nameEn })}
          />
        </FieldRow>
      </CollapsibleIdentityField>

      <div data-pshell-identity-full style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(11,11,13,0.025)",
        fontSize: 11.5,
        color: COLORS.inkMuted,
        fontFamily: FONTS.body,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        width: "fit-content",
      }}>
        <span aria-hidden>ℹ️</span>
        <span>{copy.t("Passport, work eligibility & license live in Location & travel.")}</span>
      </div>

      {/* ── Contact ─────────────────────────────────────────────────── */}
      <IdentitySubLabel>{copy.t("Contact")}</IdentitySubLabel>

      {/* Email */}
      <CollapsibleIdentityField
        label={copy.t("Email")}
        filled={!!identity.contactEmail}
        summary={identity.contactEmail || copy.t("Add email")}
      >
      <FieldRow hideLabel label={copy.t("Email")} optional hint={copy.t("Direct contact. Never shown publicly.")} visibility={["agency"]}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: 12, fontSize: 14, lineHeight: 1, pointerEvents: "none" }} className="text-admin-ink-muted">✉️</span>
          <input
            type="email"
            placeholder="talent@example.com"
            value={identity.contactEmail ?? ""}
            onChange={(e) => onChange({ ...identity, contactEmail: e.target.value })}
            style={{
              ...inputStyle, paddingLeft: 36, width: "100%", boxSizing: "border-box",
            }}
          />
        </div>
      </FieldRow>
      </CollapsibleIdentityField>

      {/* Phone */}
      <CollapsibleIdentityField
        label={copy.t("Phone")}
        filled={!!identity.contactPhone}
        summary={identity.contactPhone
          ? `${identity.contactPhonePrefix ?? "+1"} ${identity.contactPhone}`
          : copy.t("Add phone")}
      >
      <FieldRow hideLabel label={copy.t("Phone")} optional visibility={["agency"]}>
        <div style={{
          display: "flex", borderRadius: 10,
          border: `1px solid ${COLORS.border}`,
          background: "#fff", overflow: "hidden",
        }}>
          <div style={{ borderRight: `1px solid ${COLORS.borderSoft}` }}>
            <CountryDialPicker
              value={identity.contactPhonePrefix ?? "+1"}
              onChange={(dial) => onChange({ ...identity, contactPhonePrefix: dial })}
              ariaLabel={copy.t("Phone country code")}
            />
          </div>
          <input
            type="tel"
            placeholder="555 000 0000"
            value={identity.contactPhone ?? ""}
            onChange={(e) => onChange({ ...identity, contactPhone: e.target.value })}
            style={{
              flex: 1, border: "none", outline: "none",
              padding: "10px 12px",
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
              background: "transparent",
            }}
          />
        </div>
      </FieldRow>
      </CollapsibleIdentityField>

      {/* WhatsApp */}
      <CollapsibleIdentityField
        label="WhatsApp"
        filled={!!identity.whatsapp}
        summary={identity.whatsapp
          ? `${identity.whatsappPrefix ?? identity.contactPhonePrefix ?? "+1"} ${identity.whatsapp}`
          : copy.t("Add WhatsApp")}
      >
      <FieldRow hideLabel label="WhatsApp" optional hint={copy.t("For direct client coordination.")} visibility={["agency"]}>
        <div style={{
          display: "flex", borderRadius: 10,
          border: "1px solid rgba(37,211,102,0.35)",
          background: "rgba(37,211,102,0.03)", overflow: "hidden",
        }}>
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: 2,
            paddingLeft: 10,
            borderRight: "1px solid rgba(37,211,102,0.2)",
            background: "rgba(37,211,102,0.06)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366" aria-hidden style={{ flexShrink: 0 }}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <CountryDialPicker
              value={identity.whatsappPrefix ?? identity.contactPhonePrefix ?? "+1"}
              onChange={(dial) => onChange({ ...identity, whatsappPrefix: dial })}
              ariaLabel="WhatsApp country code"
            />
          </div>
          <input
            type="tel"
            placeholder={copy.t("Same as phone or different")}
            value={identity.whatsapp ?? ""}
            onChange={(e) => onChange({ ...identity, whatsapp: e.target.value })}
            style={{
              flex: 1, border: "none", outline: "none",
              padding: "10px 12px",
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
              background: "transparent",
            }}
          />
        </div>
      </FieldRow>
      </CollapsibleIdentityField>

      {/* Business line / second contact */}
      <CollapsibleIdentityField
        label={copy.t("Business line")}
        filled={!!identity.businessLine}
        summary={identity.businessLine || copy.t("Add business line")}
      >
      <FieldRow hideLabel label={copy.t("Business line")} optional hint={copy.t("Secondary email, agency handle, or manager contact.")} visibility={["agency"]}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: 12, fontSize: 14, lineHeight: 1, pointerEvents: "none" }} className="text-admin-ink-muted">🏢</span>
          <input
            type="text"
            placeholder={copy.t("manager@agency.com or @handle")}
            value={identity.businessLine ?? ""}
            onChange={(e) => onChange({ ...identity, businessLine: e.target.value })}
            style={{ ...inputStyle, paddingLeft: 36, width: "100%", boxSizing: "border-box" }}
          />
        </div>
      </FieldRow>
      </CollapsibleIdentityField>

      {/* ── Service commitment ──────────────────────────────────────── */}
      <IdentitySubLabel>{copy.t("Service commitment")}</IdentitySubLabel>

      <div data-pshell-identity-full>
        <FieldRow
          label={copy.t("Reply time")}
          catalogId="identity.responseTime"
          tenantId={workspaceScopeTenantId}
          optional
          hint={copy.t("Surfaces on Discover as a chip.")}
          visibility={["public", "agency"]}
        >
          <select
            value={identity.responseTime ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                ...identity,
                responseTime: v === ""
                  ? undefined
                  : (v as "1h" | "4h" | "24h" | "48h"),
              });
            }}
            style={{
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 13,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              background: "#fff",
              color: COLORS.ink,
            }}
          >
            <option value="">{copy.t("— select —")}</option>
            <option value="1h">{copy.t("Within 1h")}</option>
            <option value="4h">{copy.t("Within 4h")}</option>
            <option value="24h">{copy.t("Within 24h")}</option>
            <option value="48h">{copy.t("48h+")}</option>
          </select>
        </FieldRow>
      </div>
    </div>
    </fieldset>
  );
}


export function LockedHint({ reason }: { reason?: string }) {
  const copy = useDashboardText();
  return (
    <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontFamily: FONTS.body }} className="text-admin-amber-deep">
      🔒 {copy.t("Locked by your agency")}
      {reason ? <span style={{ fontWeight: 400 }} className="text-admin-ink-muted"> · {reason}</span> : null}
    </div>
  );
}

// ── Field locks overview (Step 7) ────────────────────────────────────
// Single panel inside the admin section that lists every locked path
// with a reason input + unlock button. Replaces "go hunt for the lock
// chip in each section" with a flat audit view. The reason text rides
// alongside the field everywhere `LockedHint` renders so the talent
// understands the rule, not just that they're blocked.

export function FieldLocksOverviewPanel({
  locks,
  reasons,
  onUnlock,
  onSetReason,
}: {
  locks: FieldLockPath[];
  reasons: Record<string, string>;
  onUnlock: (path: FieldLockPath) => void;
  onSetReason: (path: FieldLockPath, reason: string) => void;
}) {
  const copy = useDashboardText();
  if (locks.length === 0) {
    return (
      <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px dashed ${COLORS.borderSoft}`, background: "rgba(11,11,13,0.02)", fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
        {copy.t("No locked fields. Open a section and tap \"🔓 Talent can edit\" next to a field to lock it.")}
      </div>
    );
  }
  // Compact path → label map. Falls back to the raw path when a
  // section we haven't named yet shows up.
  const PATH_LABEL: Record<string, string> = {
    "identity.legalName":   "Legal name",
    "identity.stageName":   "Stage name",
    "identity.pronouns":    "Pronouns",
    "identity.gender":      "Gender",
    "identity.dob":         "Date of birth",
    "rates":                "Rate card",
    "serviceArea.homeBase": "Home base",
    "serviceArea.travelKm": "Travel range",
    "primaryType":          "Primary type",
    "specialties":          "Specialties",
    "languages":            "Languages",
  };
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: 10, borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`,
      background: "#fff", fontFamily: FONTS.body,
    }}>
      {locks.map((path) => {
        const label = PATH_LABEL[path] ?? path;
        const reason = reasons[path] ?? "";
        return (
          <div key={path} style={{
            display: "grid",
            gridTemplateColumns: "minmax(120px, 0.6fr) 1fr auto",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 8,
            background: "rgba(184,128,38,0.05)",
          }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", }} title={path}>
              <span aria-hidden>🔒</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-amber-deep">{label}</span>
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => onSetReason(path, e.target.value)}
              placeholder="Reason (e.g. set by contract)"
              aria-label={`Reason for locking ${label}`}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "5px 9px",
                borderRadius: 6,
                border: `1px solid ${COLORS.borderSoft}`,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                color: COLORS.ink,
                background: "#fff",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => onUnlock(path)}
              aria-label={`Unlock ${label}`}
              title="Unlock"
              style={{
                padding: "4px 9px",
                borderRadius: 999,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Unlock
            </button>
          </div>
        );
      })}
      <div style={{ fontSize: 10.5, marginTop: 2, padding: "0 4px" }} className="text-admin-ink-muted">
        Tip: lock anything tied to a contract, payout setup, or trust signal — talent see the reason next to the field.
      </div>
    </div>
  );
}
