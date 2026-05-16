"use client";

// ============================================================================
// live-category-fields-editor.tsx — Write-mode editor for the DB-driven
// per-talent field catalog. Pairs with `getFieldsForTalent` (resolves which
// fields apply, grouped by field_group) and `setTalentFieldValue` (persists
// to talent_profile_field_values).
//
// Each field renders an input control matched to its `kind`
// (text / textarea / number / date / boolean / select / multiselect / chips).
// Writes happen on blur — there is no Save button. A small inline status
// pill confirms each save / surfaces errors.
//
// SUPPRESSED_FIELD_KEYS: fields that have a dedicated home elsewhere in the
// drawer (Identity / Location / Photos / About / Credits / etc.) are hidden
// from this editor to prevent the same datum from being asked for twice and
// diverging. The legacy accordion remains the single source of truth for
// those fields. Anything not in the list lives here.
// ============================================================================

import { useEffect, useMemo, useState, useRef } from "react";
import {
  getFieldsForTalent,
  type ResolvedField,
  type ResolvedFieldGroup,
} from "@/lib/server-actions/admin-taxonomy";
import {
  getTalentFieldValues,
  setTalentFieldValue,
  setTalentFieldVisibility,
} from "@/lib/server-actions/admin-talent-field-values";
import { LiveCategoryFieldsHistoryModal } from "./live-category-fields-history";

// Map of suppressed field_key → the drawer section that owns it. Used both
// to filter the editor (any key listed here is hidden) and to render the
// footer as an actionable list grouped by destination, with each entry
// clickable to jump to that accordion. `null` destination means there is
// no editable home (admin-only / auto-populated / onboarding consent).
const SUPPRESSION_DESTINATIONS: Record<string, string | null> = {
  // Identity accordion already collects these
  "identity.stageName":      "identity",
  "identity.legalName":      "identity",
  "identity.pronouns":       "identity",
  "identity.dob":            "identity",
  "identity.nationality":    "identity",
  "identity.home_country":   "identity",
  "identity.contactEmail":   "identity",
  "identity.contactPhone":   "identity",
  "identity.tagline":        "identity",
  "identity.response_time":  "identity",
  "emergency.contact":       "identity",

  // About accordion (BiosEditor)
  "bios":                    "about",

  // Languages now lives inside the About accordion
  "languages":               "about",

  // Location accordion
  "service.has_drivers_license": "location",
  "service.owns_vehicle":        "location",
  "travel.passports":            "location",
  "travel.work_authorization":   "location",

  // Visual accordions (Media / Albums / Polaroids)
  "media.polaroids":         "polaroids",
  "media.portfolio":         "albums",
  "media.showreel":          "media",
  "media.headshot":          "media",
  "media.cover_photo":       "media",
  "media.social_links":      "media",

  // Other dedicated accordions
  "credits":                 "credits",
  "documents":               "files",
  "rates":                   "rates",
  "limits":                  "limits",

  // Not editable here at all
  "consent.terms":           null,  // Onboarding flag
  "reviews":                 null,  // Auto-populated from booking reviews
};

const SUPPRESSED_FIELD_KEYS = new Set<string>(Object.keys(SUPPRESSION_DESTINATIONS));

// Phase 1 — GROUP-level suppression. Whole profile_field_groups whose
// concept already has a dedicated rail section. Without this, the editor
// renders a "Rates / Booking Terms" / "Availability" / "Service Area /
// Travel" card *next to* the dedicated Rates / Availability / Location
// rail items — the same word in two places with two different UIs ("the
// bleed"). Hiding the whole group (not just its individual fields) makes
// the editor strictly "specialty details that have no dedicated home."
// Maps group slug → the rail section that owns the concept (for the
// footer jump-link), mirroring SUPPRESSION_DESTINATIONS at group grain.
const SUPPRESSED_GROUP_SLUGS: Record<string, string> = {
  "rates-booking":           "rates",
  "availability":            "availability",
  "service-area-travel":     "logistics",
  "languages-communication": "about",
  "media-portfolio":         "media",
  "trust-verification":      "verifications",
  "certifications-documents": "files",
  "experience":              "credits",
};

// Phase 1c — NAMESPACE-level suppression. The resolver does not always
// populate field_group_slug (some service-area-travel / availability
// fields come back with a null slug), so group-slug suppression alone
// lets them fall into the editor's `_other` bucket where they re-render
// as "Travel preferences" / "Service area" / "Availability extras" cards
// next to the dedicated Location / Availability rail items — the same
// bleed, one layer down. Suppress by field_key namespace prefix too, for
// the namespaces that wholly belong to a dedicated section. Only includes
// namespaces with NO legitimate type-specific fields (consent/emergency/
// performer/ops/equipment are deliberately absent — they have no home).
const SUPPRESSED_NAMESPACES: Record<string, string> = {
  travel:       "logistics",
  serviceArea:  "logistics",
  service:      "logistics",
  availability: "availability",
};

/** A field is suppressed if its key has a dedicated home OR its whole
 *  group does OR its namespace wholly belongs to a dedicated section. */
function isFieldSuppressed(f: { field_key: string; field_group_slug: string | null }): boolean {
  if (SUPPRESSED_FIELD_KEYS.has(f.field_key)) return true;
  if (f.field_group_slug && SUPPRESSED_GROUP_SLUGS[f.field_group_slug]) return true;
  return !!SUPPRESSED_NAMESPACES[namespaceFor(f.field_key)];
}

// "General" profile groups — global, always-on, NOT driven by talent
// type (the "Creator extras / Experience / Media" the user saw show up
// for an untyped talent). They render in a compact block inside About,
// never in the type-driven Specialty switcher. The specialty mount
// excludes them; the general mount shows only them.
const GENERAL_NAMESPACES = new Set(["creator", "experience", "media", "skills"]);
function isGeneralField(f: { field_key: string }): boolean {
  return GENERAL_NAMESPACES.has(namespaceFor(f.field_key));
}

// Friendly label for each field_key namespace prefix — used to sub-group
// the "Other" bucket into per-talent-type sub-blocks instead of one giant
// 22-field scroll. Anything not in this map falls back to title-casing the
// raw prefix.
const NAMESPACE_LABEL: Record<string, string> = {
  model:      "Model details",
  chef:       "Chef details",
  performer:  "Performer details",
  music:      "Music details",
  creator:    "Creator extras",
  security:   "Security details",
  transport:  "Transportation details",
  photo:      "Photo / Video details",
  event:      "Event staff details",
  hosp:       "Hospitality details",
  wellness:   "Wellness details",
  host:       "Host details",
  singer:     "Singer details",
  equipment:  "Equipment",
  ops:          "Operational",
  travel:       "Travel preferences",
  service:      "Service preferences",
  serviceArea:  "Service area",
  availability: "Availability extras",
  consent:      "Consent",
  emergency:    "Emergency",
};

function namespaceFor(fieldKey: string): string {
  const i = fieldKey.indexOf(".");
  return i === -1 ? "_misc" : fieldKey.slice(0, i);
}

function namespaceLabel(ns: string): string {
  if (ns === "_misc") return "Other";
  if (NAMESPACE_LABEL[ns]) return NAMESPACE_LABEL[ns];
  // Fallback: split camelCase, capitalize first word.
  const words = ns
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(" ");
  return words[0]
    ? words[0].charAt(0).toUpperCase() + words[0].slice(1)
      + (words.length > 1 ? " " + words.slice(1).join(" ") : "")
    : ns;
}

const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  inkDim: "rgba(11,11,13,0.38)",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F2EB",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  red: "#C82828",
  amber: "#B88731",
};

const F = "Inter, system-ui, sans-serif";

// C1/C2 — read the app's `locale` cookie client-side so the editor can
// show Spanish field labels without threading a locale prop through the
// drawer. Falls back to "en" on the server / when no cookie.
function readLocale(): string {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return m?.[1] === "es" ? "es" : "en";
}

/** Locale-aware field label — Spanish when locale=es AND label_es set. */
function fieldLabel(field: { label: string; label_es?: string | null }, locale: string): string {
  if (locale === "es" && field.label_es && field.label_es.trim()) {
    return field.label_es.trim();
  }
  return field.label;
}

type FieldStatus = "idle" | "saving" | "saved" | "error";

function StatusPill({ status, error }: { status: FieldStatus; error: string | null }) {
  if (status === "idle") return null;
  const label =
    status === "saving" ? "Saving…" :
    status === "saved" ? "Saved ✓" :
    error ?? "Error";
  const color =
    status === "saved" ? T.accent :
    status === "error" ? T.red :
    T.inkMuted;
  const bg =
    status === "saved" ? T.accentSoft :
    status === "error" ? "rgba(200,40,40,0.10)" :
    "rgba(11,11,13,0.05)";
  // B1 — pill is larger + tinted background for visibility. The 10px text
  // was easy to miss; 11.5px + colored background reads at a glance.
  return (
    <span
      role="status"
      aria-live="polite"
      style={{
        fontSize: 11.5, fontWeight: 700, color,
        marginLeft: 8, fontFamily: F,
        padding: "2px 8px", borderRadius: 999,
        background: bg, letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >{label}</span>
  );
}

// B1 — Editor-level save toast. Bottom-right floating pill that surfaces
// the most-recent save outcome across the whole editor (not just one
// field). Auto-dismisses after a short visible window.
function SaveToast({ message, kind }: { message: string | null; kind: "saved" | "error" }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 1100,
        padding: "10px 14px", borderRadius: 10, fontFamily: F,
        background: kind === "error" ? "rgba(200,40,40,0.95)" : "rgba(15,79,62,0.95)",
        color: "#fff", fontSize: 12.5, fontWeight: 600,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        maxWidth: 320,
      }}
    >
      {kind === "saved" ? "✓ " : "⚠ "}{message}
    </div>
  );
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function asNumber(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return v;
  return "";
}

function asBoolean(v: unknown): boolean {
  return v === true;
}

type ChipsControlProps = {
  values: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
};

function ChipsControl({ values, placeholder, onChange }: ChipsControlProps) {
  const [draft, setDraft] = useState("");
  const addChip = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  const removeChip = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {values.map((c, i) => (
          <span key={`${c}-${i}`} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 999,
            background: T.accentSoft, color: T.ink,
            fontFamily: F, fontSize: 12, fontWeight: 600,
          }}>
            {c}
            <button type="button" aria-label="Remove" onClick={() => removeChip(i)} style={{
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
              color: T.inkMuted, fontSize: 14, lineHeight: 1, fontWeight: 700,
            }}>×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addChip(draft);
          }
        }}
        onBlur={() => { if (draft.trim()) addChip(draft); }}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "8px 10px", borderRadius: 8,
          border: `1px solid ${T.border}`,
          fontFamily: F, fontSize: 13, color: T.ink,
          background: "#fff", outline: "none",
        }}
      />
    </div>
  );
}

// VisibilityChips — 3-state chip strip below each field. Multi-select:
// public + agency are sensible together; "private" is exclusive (clicking
// it clears the other two). Empty selection means "use default", which
// the editor renders as a softer neutral state. Saves are debounced
// implicitly by the click model — every click is a write.
type VisChannel = "public" | "agency" | "private";

function VisibilityChips({
  effective,
  isOverride,
  onChange,
}: {
  /** Current effective visibility — derived from override OR default. */
  effective: VisChannel[];
  /** True when the talent has set an override (vs the inherited default). */
  isOverride: boolean;
  /** Called with the new explicit visibility list, or `[]` to clear back
   *  to the inherited default. */
  onChange: (next: VisChannel[]) => void;
}) {
  const set = new Set(effective);
  const has = (c: VisChannel) => set.has(c);

  const click = (c: VisChannel) => {
    let next: VisChannel[];
    if (c === "private") {
      // Toggle private exclusively.
      next = has("private") ? [] : ["private"];
    } else if (has(c)) {
      next = effective.filter((x) => x !== c && x !== "private");
    } else {
      next = [...effective.filter((x) => x !== "private"), c];
    }
    onChange(next);
  };

  const reset = () => onChange([]);

  const chip = (c: VisChannel, label: string, dotColor: string) => {
    const active = has(c);
    return (
      <button
        key={c}
        type="button"
        onClick={() => click(c)}
        title={`Visible to ${c}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "1px 7px", borderRadius: 999,
          border: `1px solid ${active ? T.accent : "transparent"}`,
          background: active ? T.accentSoft : "transparent",
          color: active ? T.ink : T.inkDim,
          fontFamily: F, fontSize: 10, fontWeight: 600, cursor: "pointer",
          letterSpacing: 0.1, opacity: active ? 1 : 0.6,
        }}
      >
        <span aria-hidden style={{
          width: 5, height: 5, borderRadius: "50%",
          background: active ? dotColor : "rgba(11,11,13,0.18)",
        }} />
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {chip("public", "Public", "#2E7D5B")}
      {chip("agency", "Agency", "#5B6BA0")}
      {chip("private", "Private", "#C82828")}
      {isOverride && (
        <button
          type="button"
          onClick={reset}
          title="Clear override and inherit default visibility"
          style={{
            background: "transparent", border: "none", padding: "2px 4px",
            color: T.inkMuted, fontSize: 10, cursor: "pointer",
            fontFamily: F, textDecoration: "underline",
          }}
        >reset</button>
      )}
    </div>
  );
}

type FieldRowProps = {
  field: ResolvedField;
  initialValue: unknown;
  initialVisibility: string[] | null;
  onSave: (value: unknown) => Promise<{ ok: boolean; error?: string }>;
  onSaveVisibility: (next: VisChannel[]) => Promise<{ ok: boolean; error?: string }>;
};

function FieldRow({
  field, initialValue, initialVisibility, onSave, onSaveVisibility,
}: FieldRowProps) {
  const [draft, setDraft] = useState<unknown>(initialValue);
  const [status, setStatus] = useState<FieldStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Local visibility state — optimistically updated on chip click. The
  // parent owns the truth; we re-sync via prop change below.
  const [localOverride, setLocalOverride] = useState<string[] | null>(initialVisibility);
  useEffect(() => { setLocalOverride(initialVisibility); }, [initialVisibility]);

  // Reset when initial changes (e.g. external reload)
  useEffect(() => {
    setDraft(initialValue);
    setStatus("idle");
    setError(null);
  }, [initialValue]);

  const lastSavedRef = useRef<unknown>(initialValue);
  const isUnchanged = JSON.stringify(draft) === JSON.stringify(lastSavedRef.current);

  const commit = async (next: unknown) => {
    if (JSON.stringify(next) === JSON.stringify(lastSavedRef.current)) return;
    setStatus("saving");
    setError(null);
    const res = await onSave(next);
    if (res.ok) {
      lastSavedRef.current = next;
      setStatus("saved");
      setTimeout(() => setStatus(s => (s === "saved" ? "idle" : s)), 1500);
    } else {
      // P0: keep the user's draft so they can correct it. Don't reset to
      // lastSavedRef. Surface the error prominently below the input —
      // small status pill alone is too easy to miss.
      setStatus("error");
      setError(res.error ?? "Save failed.");
    }
  };

  // Clear any prior error the moment the user starts editing again, so
  // they get a clean slate on the next attempt.
  const setDraftAndClearError = (next: unknown) => {
    setDraft(next);
    if (status === "error") {
      setStatus("idle");
      setError(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${status === "error" ? T.red : T.border}`,
    fontFamily: F, fontSize: 13, color: T.ink,
    background: "#fff", outline: "none",
    boxShadow: status === "error" ? `0 0 0 2px rgba(200,40,40,0.10)` : "none",
  };

  let control: React.ReactNode = null;
  const opts = field.options ?? [];

  switch (field.kind) {
    case "text":
      control = (
        <input
          type="text"
          value={asString(draft)}
          onChange={(e) => setDraftAndClearError(e.target.value)}
          onBlur={() => commit(asString(draft).trim() || null)}
          placeholder={field.placeholder ?? ""}
          style={inputStyle}
        />
      );
      break;

    case "textarea": {
      // B4 — live char counter when validation_rules carry maxLength.
      const r = (field.validation_rules ?? {}) as Record<string, unknown>;
      const maxLen = (typeof r.maxLength === "number" ? r.maxLength : undefined)
        ?? (typeof r.max_length === "number" ? r.max_length : undefined)
        ?? (typeof r.max === "number" ? r.max : undefined)
        ?? null;
      const currentLen = asString(draft).length;
      control = (
        <div style={{ position: "relative" }}>
          <textarea
            value={asString(draft)}
            onChange={(e) => setDraftAndClearError(e.target.value)}
            onBlur={() => commit(asString(draft).trim() || null)}
            placeholder={field.placeholder ?? ""}
            rows={3}
            maxLength={maxLen ?? undefined}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }}
          />
          {maxLen !== null && (
            <div style={{
              position: "absolute", right: 8, bottom: 6,
              fontSize: 10, color: currentLen > maxLen * 0.9 ? T.amber : T.inkDim,
              fontFamily: F, fontWeight: 600, letterSpacing: 0.2,
              background: "rgba(255,255,255,0.85)", padding: "1px 4px", borderRadius: 3,
            }}>
              {currentLen} / {maxLen}
            </div>
          )}
        </div>
      );
      break;
    }

    case "number": {
      // B5 — show the unit suffix ("years", "guests") inside the field so
      // the number reads as a quantity, not a bare integer.
      const unit = field.unit?.trim();
      control = (
        <div style={{ position: "relative" }}>
          <input
            type="number"
            value={asNumber(draft)}
            onChange={(e) => setDraftAndClearError(e.target.value)}
            onBlur={() => {
              const s = asNumber(draft);
              commit(s === "" ? null : Number(s));
            }}
            placeholder={field.placeholder ?? ""}
            style={unit ? { ...inputStyle, paddingRight: 56 } : inputStyle}
          />
          {unit && (
            <span style={{
              position: "absolute", right: 10, top: "50%",
              transform: "translateY(-50%)",
              fontSize: 11.5, color: T.inkMuted, fontFamily: F,
              fontWeight: 600, pointerEvents: "none",
            }}>{unit}</span>
          )}
        </div>
      );
      break;
    }

    case "date":
      control = (
        <input
          type="date"
          value={asString(draft)}
          onChange={(e) => setDraftAndClearError(e.target.value)}
          onBlur={() => commit(asString(draft) || null)}
          style={inputStyle}
        />
      );
      break;

    case "boolean":
    case "toggle": {
      // B3 — chunky pill toggle matching the rest of the drawer instead
      // of a bare browser checkbox.
      const on = asBoolean(draft);
      control = (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => {
            const next = !on;
            setDraftAndClearError(next);
            commit(next);
          }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 5px 5px 12px", borderRadius: 999,
            border: `1.5px solid ${on ? T.accent : T.border}`,
            background: on ? T.accentSoft : "#fff",
            cursor: "pointer", fontFamily: F, fontSize: 12.5, fontWeight: 600,
            color: on ? T.ink : T.inkMuted,
          }}
        >
          {on ? "Yes" : "No"}
          <span style={{
            width: 30, height: 18, borderRadius: 999,
            background: on ? T.accent : "rgba(11,11,13,0.18)",
            position: "relative", transition: "background 0.15s",
            flexShrink: 0,
          }}>
            <span style={{
              position: "absolute", top: 2, left: on ? 14 : 2,
              width: 14, height: 14, borderRadius: "50%", background: "#fff",
              transition: "left 0.15s",
            }} />
          </span>
        </button>
      );
      break;
    }

    case "select": {
      // B2 — chip-row picker matching the drawer's other pickers instead
      // of a native <select>. Falls back to a scrolling row when there
      // are many options.
      const current = asString(draft);
      control = (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {opts.length === 0 && (
            <span style={{ fontSize: 11.5, color: T.inkMuted }}>No options configured.</span>
          )}
          {opts.map((o) => {
            const active = current === o;
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  const next = active ? null : o;
                  setDraftAndClearError(next ?? "");
                  commit(next);
                }}
                style={{
                  padding: "5px 11px", borderRadius: 999,
                  border: `1.5px solid ${active ? T.accent : T.border}`,
                  background: active ? T.accentSoft : "#fff",
                  color: active ? T.ink : T.inkMuted,
                  fontFamily: F, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >{o}</button>
            );
          })}
        </div>
      );
      break;
    }

    case "multiselect": {
      const arr = Array.isArray(draft) ? (draft as string[]) : [];
      const toggle = (opt: string) => {
        const has = arr.includes(opt);
        const next = has ? arr.filter((x) => x !== opt) : [...arr, opt];
        setDraftAndClearError(next);
        commit(next.length === 0 ? null : next);
      };
      control = (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {opts.length === 0 && (
            <span style={{ fontSize: 11.5, color: T.inkMuted }}>No options configured.</span>
          )}
          {opts.map((opt) => {
            const active = arr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                style={{
                  padding: "5px 11px", borderRadius: 999,
                  border: `1.5px solid ${active ? T.accent : T.border}`,
                  background: active ? T.accentSoft : "#fff",
                  color: active ? T.ink : T.inkMuted,
                  fontFamily: F, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >{opt}</button>
            );
          })}
        </div>
      );
      break;
    }

    case "chips": {
      const arr = Array.isArray(draft) ? (draft as string[]) : [];
      control = (
        <ChipsControl
          values={arr}
          placeholder={field.placeholder ?? "Type then press Enter"}
          onChange={(next) => {
            setDraftAndClearError(next);
            commit(next.length === 0 ? null : next);
          }}
        />
      );
      break;
    }

    default:
      // Unknown kind — render as plain text input as a safe fallback.
      control = (
        <input
          type="text"
          value={asString(draft)}
          onChange={(e) => setDraftAndClearError(e.target.value)}
          onBlur={() => commit(asString(draft).trim() || null)}
          placeholder={field.placeholder ?? ""}
          style={inputStyle}
        />
      );
  }

  // Compose the hint line under the input from validation_rules so users
  // see constraints up front instead of discovering them by hitting Save.
  const hint = buildValidationHint(field);
  const locale = readLocale();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>
          {fieldLabel(field, locale)}
        </label>
        {field.required_before_publish && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
            background: "rgba(200,40,40,0.10)", color: T.red,
            letterSpacing: 0.4, textTransform: "uppercase",
          }}>Required</span>
        )}
        {!isUnchanged && status === "idle" && (
          <span style={{ fontSize: 10, color: T.inkMuted, marginLeft: 4 }}>· unsaved</span>
        )}
        <StatusPill status={status} error={error} />
      </div>
      {/* Visibility on its own line under the label — identical
          placement to the hardcoded FieldRow so every section reads
          the same and it never collides in 2-column layouts. */}
      <VisibilityChips
        effective={(localOverride && localOverride.length > 0
          ? localOverride
          : (field.default_visibility ?? [])
        ).filter((c): c is VisChannel =>
          c === "public" || c === "agency" || c === "private",
        )}
        isOverride={Array.isArray(localOverride) && localOverride.length > 0}
        onChange={async (next) => {
          setLocalOverride(next);
          const res = await onSaveVisibility(next);
          if (!res.ok) {
            setLocalOverride(initialVisibility);
          }
        }}
      />
      {control}
      {/* Error wins over hint when both are present, so users see the
          actionable message first. Pre-edit hints + post-edit errors
          never overlap. */}
      {status === "error" && error ? (
        <div role="alert" style={{
          fontSize: 11.5, color: T.red, fontFamily: F, fontWeight: 500,
          background: "rgba(200,40,40,0.06)", borderLeft: `3px solid ${T.red}`,
          padding: "6px 10px", borderRadius: 4,
        }}>{error}</div>
      ) : hint ? (
        <div style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: F }}>{hint}</div>
      ) : null}
    </div>
  );
}

// Build a one-line constraint hint from a field's validation_rules + kind.
// Returns null when nothing useful to show.
function buildValidationHint(field: ResolvedField): string | null {
  const r = (field.validation_rules ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null =>
    typeof r[k] === "number" ? (r[k] as number) : null;
  const parts: string[] = [];

  switch (field.kind) {
    case "number": {
      const lo = num("min");
      const hi = num("max");
      if (lo !== null && hi !== null) parts.push(`${lo}–${hi}`);
      else if (lo !== null) parts.push(`min ${lo}`);
      else if (hi !== null) parts.push(`max ${hi}`);
      break;
    }
    case "text":
    case "textarea": {
      const minL = num("minLength") ?? num("min_length");
      const maxL = num("maxLength") ?? num("max_length");
      if (maxL !== null) parts.push(`max ${maxL} chars`);
      if (minL !== null) parts.push(`min ${minL} chars`);
      if (typeof r.pattern === "string") parts.push("pattern enforced");
      break;
    }
    case "chips": {
      const maxItems = num("maxItems") ?? num("max_items");
      if (maxItems !== null) parts.push(`up to ${maxItems} entries`);
      break;
    }
    case "multiselect": {
      const opts = field.options ?? [];
      if (opts.length > 0) parts.push(`pick from ${opts.length}`);
      break;
    }
    case "select": {
      const opts = field.options ?? [];
      if (opts.length > 0) parts.push(`${opts.length} options`);
      break;
    }
  }
  return parts.length === 0 ? null : parts.join(" · ");
}

type GroupBlockProps = {
  title: string;
  weight: string;
  fields: ResolvedField[];
  valuesByDefId: Map<string, unknown>;
  visibilityByDefId: Map<string, string[] | null>;
  onSave: (fieldDefId: string, value: unknown) => Promise<{ ok: boolean; error?: string }>;
  onSaveVisibility: (fieldDefId: string, next: VisChannel[]) => Promise<{ ok: boolean; error?: string }>;
  open: boolean;
  onToggle: () => void;
};

function isValueFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function GroupBlock({
  title, weight, fields, valuesByDefId, visibilityByDefId,
  onSave, onSaveVisibility, open, onToggle,
}: GroupBlockProps) {
  const filled = fields.reduce((n, f) => {
    return isValueFilled(valuesByDefId.get(f.field_definition_id)) ? n + 1 : n;
  }, 0);
  // B8 — count required fields that are NOT yet filled, so the badge tells
  // the user what's actionable (vs. just "3 required" which doesn't say
  // whether they're done).
  const missingRequired = fields.filter(
    (f) => f.required_before_publish && !isValueFilled(valuesByDefId.get(f.field_definition_id)),
  ).length;
  const dotColor = filled === fields.length
    ? T.accent
    : filled > 0
      ? "#B88731"
      : "rgba(11,11,13,0.20)";

  // B7 — when the card transitions to open, scroll its content into view
  // so the user sees the fields they just expanded (otherwise the new
  // content can be off-screen below the fold). Uses a ref + useEffect
  // gated on the `open` transition.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current && cardRef.current) {
      // Defer one tick so the layout has expanded before the scroll fires.
      const t = setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
      wasOpen.current = true;
      return () => clearTimeout(t);
    }
    if (!open) wasOpen.current = false;
  }, [open]);

  return (
    <div ref={cardRef} style={{
      border: `1px solid ${T.borderSoft}`, borderRadius: 12,
      background: "#fff", marginBottom: 8, fontFamily: F, overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", background: open ? T.surfaceAlt : "#fff",
          border: "none", cursor: "pointer", textAlign: "left",
          borderBottom: open ? `1px solid ${T.borderSoft}` : "none",
          fontFamily: F,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, letterSpacing: 0.1 }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2 }}>
            {filled} of {fields.length} filled
            {missingRequired > 0 && (
              <span style={{ color: T.red, fontWeight: 600 }}>
                {" · "}{missingRequired} required missing
              </span>
            )}
            {weight !== "default" && ` · ${weight}`}
          </div>
        </div>
        <span style={{ fontSize: 11, color: T.inkMuted, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ padding: "14px 14px 6px" }}>
          {fields.map((f) => (
            <FieldRow
              key={f.field_definition_id}
              field={f}
              initialValue={valuesByDefId.get(f.field_definition_id)}
              initialVisibility={visibilityByDefId.get(f.field_definition_id) ?? null}
              onSave={(v) => onSave(f.field_definition_id, v)}
              onSaveVisibility={(next) => onSaveVisibility(f.field_definition_id, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * `viewMode` switches the editor between the admin-side server actions
 * (`requireStaffTenantAction` / mirror writes / unrestricted) and the
 * talent-side server actions (`requireTalent` / strict ownership /
 * `editable_by_talent` gate). Caller passes the matching pair via
 * `serverActions`. Default is admin so existing callers don't break.
 *
 * Talent-self callers must pass all 4 actions; admin callers can rely on
 * defaults (legacy server actions imported above).
 */
export type EditorServerActions = {
  getFields?: (input: { talent_profile_id: string }) =>
    Promise<{ ok: true; fields: ResolvedField[]; groups: ResolvedFieldGroup[] } | { ok: false; error: string }>;
  getValues?: (input: { talent_profile_id: string }) =>
    Promise<{ ok: true; values: Array<{ field_definition_id: string; value: unknown; visibility_override: string[] | null }> } | { ok: false; error: string }>;
  setValue: (input: { talent_profile_id: string; field_definition_id: string; value: unknown }) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  setVisibility: (input: { talent_profile_id: string; field_definition_id: string; visibility: VisChannel[] }) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
};

export function LiveCategoryFieldsEditor({
  talentProfileId,
  onCountsChange,
  serverActions,
  viewMode = "admin",
  scope = "specialty",
  refreshKey = "",
}: {
  talentProfileId: string;
  /** Fires whenever the visible field counts change (initial load + every
   *  save). Lets the parent drawer surface a completeness dot in the rail
   *  without duplicating the data fetch. */
  onCountsChange?: (counts: { filled: number; total: number }) => void;
  /** Optional override for the value/visibility server actions. Defaults to
   *  the admin pair. Talent-self callers pass the talent pair so writes go
   *  through `requireTalent` + ownership + editable_by_talent gate. */
  serverActions?: EditorServerActions;
  /** Affects: hides the suppression-jump footer (talent has no access to
   *  legacy accordions) and the "history" button. */
  viewMode?: "admin" | "talent-self";
  /** "specialty" (default): the type-driven switcher; excludes the
   *  always-on general groups. "general": a compact block that shows
   *  ONLY those global groups (Creator / Experience / Media) — mounted
   *  inside About so Specialty stays purely type-driven. */
  scope?: "specialty" | "general";
  /** Bump this when the talent's taxonomy/type assignment changes so the
   *  editor re-resolves the field set in the same drawer session (the
   *  fetch is keyed only to talentProfileId otherwise). Re-fetch is
   *  debounced so the picker's assign write commits server-side first. */
  refreshKey?: string | number;
}) {
  const setValueAction = serverActions?.setValue
    ?? (((input) => setTalentFieldValue(input)) as EditorServerActions["setValue"]);
  const setVisibilityAction = serverActions?.setVisibility
    ?? (((input) => setTalentFieldVisibility(input)) as EditorServerActions["setVisibility"]);
  const getFieldsAction = serverActions?.getFields
    ?? ((input) => getFieldsForTalent(input));
  const getValuesAction = serverActions?.getValues
    ?? ((input) => getTalentFieldValues(input));
  const [allFields, setAllFields] = useState<ResolvedField[] | null>(null);
  const [groups, setGroups] = useState<ResolvedFieldGroup[]>([]);
  const [valuesByDefId, setValuesByDefId] = useState<Map<string, unknown>>(new Map());
  const [visibilityByDefId, setVisibilityByDefId] = useState<Map<string, string[] | null>>(new Map());
  const [error, setError] = useState<string | null>(null);
  // Switcher model — Specialty details is a sticky top-nav of group
  // pills (one group shown at a time) instead of a vertical stack of
  // accordions. `activeTab` holds the selected group key; it's clamped
  // to a real tab at render time so a taxonomy change can't strand it.
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // B1 — Floating toast across the editor. Last save's outcome shows for
  // ~2.2s then auto-clears. Field-level pill covers per-field detail; the
  // toast is the global "did anything just save?" reassurance.
  const [toast, setToast] = useState<{ message: string; kind: "saved" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string, kind: "saved" | "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // Suppressed = duplicates of fields already managed by an existing
  // accordion (Identity, Location, Photos, About, Credits, etc.). They are
  // hidden from the editor and listed in a footer note. Their saved values
  // (if any exist in talent_profile_field_values from earlier writes) are
  // preserved on the row and remain readable via the legacy accordion or
  // by querying the table directly.
  const fields = useMemo(
    () => (allFields ?? []).filter((f) =>
      scope === "general"
        // General mount: only the always-on global groups (these have
        // their own home here, so group-slug suppression doesn't apply).
        ? isGeneralField(f)
        // Specialty mount: type-driven only — drop suppressed AND the
        // general groups (they live in About now).
        : !isFieldSuppressed(f) && !isGeneralField(f)),
    [allFields, scope],
  );

  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const [fieldsRes, valuesRes] = await Promise.all([
          getFieldsAction({ talent_profile_id: talentProfileId }),
          getValuesAction({ talent_profile_id: talentProfileId }),
        ]);
        if (cancelled) return;
        if (!fieldsRes.ok) {
          setError(fieldsRes.error);
          setAllFields([]);
          return;
        }
        setAllFields(fieldsRes.fields);
        setGroups(fieldsRes.groups);
        // Default: open the first group + any group with at least one filled
        // (visible) field, so the editor doesn't open as a wall of empty
        // headers. Suppressed fields don't influence the auto-open heuristic.
        const sortedSlugs = fieldsRes.groups
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((g) => g.group_slug);
        const valuesMap = new Map<string, unknown>();
        if (valuesRes.ok) {
          for (const v of valuesRes.values) valuesMap.set(v.field_definition_id, v.value);
        }
        const filledGroupSlugs = new Set<string>();
        for (const f of fieldsRes.fields) {
          if (isFieldSuppressed(f)) continue;
          if (f.field_group_slug && isValueFilled(valuesMap.get(f.field_definition_id))) {
            filledGroupSlugs.add(f.field_group_slug);
          }
        }
        // Default the switcher to the first group that already has data
        // (so it opens on something meaningful), else the first group.
        const firstFilled = sortedSlugs.find((s) => filledGroupSlugs.has(s));
        setActiveTab(firstFilled ?? sortedSlugs[0] ?? null);
        if (valuesRes.ok) {
          const m = new Map<string, unknown>();
          const vm = new Map<string, string[] | null>();
          for (const v of valuesRes.values) {
            m.set(v.field_definition_id, v.value);
            vm.set(v.field_definition_id, v.visibility_override);
          }
          setValuesByDefId(m);
          setVisibilityByDefId(vm);
        } else {
          // Non-fatal: editor still works, just starts blank.
          // eslint-disable-next-line no-console
          console.warn("[LiveCategoryFieldsEditor] getTalentFieldValues:", valuesRes.error);
        }
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[LiveCategoryFieldsEditor] load threw:", err);
        setError(err instanceof Error ? err.message : "Failed to load.");
        setAllFields([]);
      }
    };
    if (!initialLoadDoneRef.current) {
      // First mount — load immediately, no debounce lag.
      initialLoadDoneRef.current = true;
      void load();
    } else {
      // Taxonomy changed mid-session. refreshKey (taxonomyVersion) is
      // bumped by the drawer ONLY after the assign/remove server action
      // resolves, so the write is already committed — the short debounce
      // just coalesces rapid multi-select clicks, no race to cover.
      timer = setTimeout(() => { void load(); }, 150);
    }
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [talentProfileId, refreshKey]);

  // Surface the visible filled / total to the parent (rail dot, etc.).
  // Fires on initial load and after every save (because both `fields` and
  // `valuesByDefId` change). Guarded against the loading state.
  useEffect(() => {
    if (allFields === null || !onCountsChange) return;
    const filled = fields.reduce((n, f) => {
      return isValueFilled(valuesByDefId.get(f.field_definition_id)) ? n + 1 : n;
    }, 0);
    onCountsChange({ filled, total: fields.length });
  }, [allFields, fields, valuesByDefId, onCountsChange]);

  const handleSave = async (fieldDefId: string, value: unknown) => {
    const res = await setValueAction({
      talent_profile_id: talentProfileId,
      field_definition_id: fieldDefId,
      value,
    });
    if (res.ok) {
      setValuesByDefId((prev) => {
        const next = new Map(prev);
        if (value === null || value === undefined || value === "") next.delete(fieldDefId);
        else next.set(fieldDefId, value);
        return next;
      });
      // Look up the field label for a more useful toast (e.g. "Saved
      // Years of experience" instead of "Saved").
      const def = (allFields ?? []).find((f) => f.field_definition_id === fieldDefId);
      showToast(`Saved ${def?.label ?? "field"}`, "saved");
      return { ok: true };
    }
    showToast(res.error, "error");
    return { ok: false, error: res.error };
  };

  const handleSaveVisibility = async (fieldDefId: string, next: VisChannel[]) => {
    const res = await setVisibilityAction({
      talent_profile_id: talentProfileId,
      field_definition_id: fieldDefId,
      visibility: next,
    });
    if (res.ok) {
      setVisibilityByDefId((prev) => {
        const m = new Map(prev);
        if (next.length === 0) m.set(fieldDefId, null);
        else m.set(fieldDefId, next);
        return m;
      });
      const def = (allFields ?? []).find((f) => f.field_definition_id === fieldDefId);
      showToast(`Visibility updated · ${def?.label ?? "field"}`, "saved");
      return { ok: true };
    }
    showToast(res.error, "error");
    return { ok: false, error: res.error };
  };

  const grouped = useMemo(() => {
    const m = new Map<string, ResolvedField[]>();
    for (const f of fields) {
      const key = f.field_group_slug ?? "_other";
      const list = m.get(key) ?? [];
      list.push(f);
      m.set(key, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.display_order - b.display_order);
    return m;
  }, [fields]);

  if (allFields === null) {
    return (
      <div style={{ padding: 12, fontFamily: F, fontSize: 12, color: T.inkMuted }}>
        Loading category fields…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: 12, borderRadius: 8, background: "rgba(200,40,40,0.08)",
        border: `1px solid ${T.red}`, color: T.red, fontFamily: F, fontSize: 12,
      }}>
        Couldn't load category fields: {error}
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div style={{ padding: 12, fontFamily: F, fontSize: 12, color: T.inkMuted }}>
        No category-specific fields yet. Pick a primary type in Services.
      </div>
    );
  }

  const sortedGroups = groups.slice().sort((a, b) => a.display_order - b.display_order);
  const otherFields = grouped.get("_other") ?? [];

  const totalFilled = fields.reduce((n, f) => {
    return isValueFilled(valuesByDefId.get(f.field_definition_id)) ? n + 1 : n;
  }, 0);

  // ── Switcher tabs ────────────────────────────────────────────────
  // One ordered list combining the DB-driven groups and the namespace
  // sub-buckets of the orphan "Other" fields (same _misc-fold + sort
  // the legacy accordions used). Each entry is one specialty group; the
  // sticky pill switcher shows exactly one at a time.
  const tabs: { key: string; label: string; fields: ResolvedField[] }[] = [];
  for (const g of sortedGroups) {
    const list = grouped.get(g.group_slug) ?? [];
    if (list.length > 0) tabs.push({ key: g.group_slug, label: g.group_label_en, fields: list });
  }
  if (otherFields.length > 0) {
    const byNs = new Map<string, ResolvedField[]>();
    for (const f of otherFields) {
      const ns = namespaceFor(f.field_key);
      const l = byNs.get(ns) ?? [];
      l.push(f);
      byNs.set(ns, l);
    }
    // B10 — fold a singleton "_misc" into the largest real bucket.
    if (byNs.size > 1 && (byNs.get("_misc")?.length ?? 0) <= 1) {
      const misc = byNs.get("_misc") ?? [];
      const targetNs = Array.from(byNs.keys())
        .filter((n) => n !== "_misc")
        .sort((a, b) => (byNs.get(b)?.length ?? 0) - (byNs.get(a)?.length ?? 0)
          || namespaceLabel(a).localeCompare(namespaceLabel(b)))[0];
      if (targetNs) { byNs.set(targetNs, [...(byNs.get(targetNs) ?? []), ...misc]); byNs.delete("_misc"); }
    }
    const sortedNs = Array.from(byNs.keys()).sort((a, b) => {
      if (a === "_misc") return 1;
      if (b === "_misc") return -1;
      return namespaceLabel(a).localeCompare(namespaceLabel(b));
    });
    for (const ns of sortedNs) {
      tabs.push({ key: `_other:${ns}`, label: namespaceLabel(ns), fields: byNs.get(ns) ?? [] });
    }
  }
  const activeKey = (activeTab && tabs.some((t) => t.key === activeTab))
    ? activeTab
    : (tabs[0]?.key ?? null);
  const activeTabData = tabs.find((t) => t.key === activeKey) ?? null;

  // B9 — Fill-required wizard. Switch the active tab to the first group
  // that still has an unfilled required field.
  const slugForField = (f: ResolvedField): string =>
    f.field_group_slug ?? `_other:${namespaceFor(f.field_key)}`;
  const missingRequiredFields = fields.filter(
    (f) => f.required_before_publish
      && !isValueFilled(valuesByDefId.get(f.field_definition_id)),
  );
  const requiredMissing = missingRequiredFields.length;
  const jumpToNextRequired = () => {
    const keysWithMissing = new Set(missingRequiredFields.map(slugForField));
    const target = tabs.find((t) => keysWithMissing.has(t.key));
    if (target) setActiveTab(target.key);
  };

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        padding: "8px 4px 10px", fontFamily: F,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8,
      }}>
        <div style={{
          fontSize: 10.5, color: T.inkMuted, letterSpacing: 0.4,
          textTransform: "uppercase", fontWeight: 600,
        }}>
          {scope === "general" ? "General profile" : "Specialty details"} · {totalFilled} of {fields.length} filled · saves on blur
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {requiredMissing > 0 && (
            <button
              type="button"
              onClick={jumpToNextRequired}
              style={{
                padding: "4px 12px", borderRadius: 999,
                border: `1px solid ${T.red}`,
                background: "rgba(200,40,40,0.08)",
                fontFamily: F, fontSize: 10.5, fontWeight: 700, color: T.red,
                cursor: "pointer", letterSpacing: 0.3,
              }}
            >
              Fill {requiredMissing} required
            </button>
          )}
          {viewMode === "admin" && (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              style={{
                padding: "4px 10px", borderRadius: 999,
                border: `1px solid ${T.borderSoft}`, background: "transparent",
                fontFamily: F, fontSize: 10.5, fontWeight: 600, color: T.inkMuted,
                cursor: "pointer", letterSpacing: 0.3,
              }}
            >
              History
            </button>
          )}
        </div>
      </div>
      <LiveCategoryFieldsHistoryModal
        talentProfileId={talentProfileId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
      <SaveToast message={toast?.message ?? null} kind={toast?.kind ?? "saved"} />
      {/* Sticky top-nav switcher — one pill per specialty group; the
          active group's fields render below. Replaces the old vertical
          stack of collapsible accordions: the rail stays stable while
          the deep type-driven content flexes behind a horizontal nav. */}
      {tabs.length > 0 && (
        <div style={{
          position: "sticky", top: 0, zIndex: 6, background: "#fff",
          display: "flex", gap: 6, overflowX: "auto",
          padding: "4px 0 10px", marginBottom: 10,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}>
          {tabs.map((t) => {
            const filled = t.fields.reduce(
              (n, f) => (isValueFilled(valuesByDefId.get(f.field_definition_id)) ? n + 1 : n),
              0,
            );
            const on = t.key === activeKey;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                style={{
                  flexShrink: 0, padding: "6px 12px", borderRadius: 999,
                  border: `1.5px solid ${on ? T.accent : T.borderSoft}`,
                  background: on ? "rgba(15,79,62,0.08)" : "#fff",
                  color: on ? T.ink : T.inkMuted,
                  fontFamily: F, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {t.label}{" "}
                <span style={{ opacity: 0.6, fontWeight: 500 }}>
                  {filled}/{t.fields.length}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {activeTabData && (
        <GroupBlock
          key={activeTabData.key}
          title={activeTabData.label}
          weight="default"
          fields={activeTabData.fields}
          valuesByDefId={valuesByDefId}
          visibilityByDefId={visibilityByDefId}
          onSave={handleSave}
          onSaveVisibility={handleSaveVisibility}
          open={true}
          onToggle={() => {}}
        />
      )}
    </div>
  );
}
