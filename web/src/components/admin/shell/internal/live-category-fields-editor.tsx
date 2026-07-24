"use client";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

// ============================================================================
// live-category-fields-editor.tsx — Write-mode editor for the DB-driven
// per-talent field catalog. Pairs with `getFieldsForTalent` (resolves which
// fields apply, grouped by field_group) and `setTalentFieldValue` (persists
// to talent_profile_field_values).
//
// Each field is rendered by the shared <FieldEditor> (components/fields/
// FieldEditor.tsx) — text / textarea / number / date / boolean / select /
// multiselect / chips. Writes happen on blur — there is no Save button. A
// small inline status pill confirms each save / surfaces errors. This file
// resolves which fields apply, groups them, and composes <FieldEditor> per
// field (Phase 4 strangler — behavior-identical to the prior inline editor).
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
import { isResolvedFieldPublishBlocking } from "@/lib/field-engine/profile-publish-requirements";
import {
  getTalentFieldValues,
  setTalentFieldValue,
  setTalentFieldVisibility,
} from "@/lib/server-actions/admin-talent-field-values";
import { useT } from "@/i18n/use-t";
import { interpolate, withPluralization } from "@/i18n/interpolate";
import { LiveCategoryFieldsHistoryModal } from "./live-category-fields-history";
import {
  FieldEditor,
  readLocale,
  fieldLabel,
  type VisChannel,
  type FieldEditorProps,
} from "@/components/fields/FieldEditor";
import { isDetailsSection } from "@/lib/profile-editor/section-field-mapping";

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

  // Services owns taxonomy-backed skills/strengths. The legacy `skills`
  // catalog row is a migration alias and must not render as a free-text
  // Details field, especially before any talent type is selected.
  "skills":                  "services",

  // fit_labels ("Best for …" markers) is a TAXONOMY field — its values live in
  // talent_profile_taxonomy (relationship_type='attribute', kind='fit_label')
  // and are edited via the Services taxonomy picker, NOT the generic
  // profile_field_definitions multiselect (whose `options` are null → the
  // "No options configured" bug). Suppress it here exactly like skills.
  "fit_labels":              "services",

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
// the namespaces that wholly belong to a dedicated section. This is also
// the fallback for global rows that have a platform field_group, but no
// active taxonomy group yet, so the resolver may return field_group_slug
// as null for an untyped profile. Only includes namespaces with NO
// legitimate type-specific fields (consent/emergency/performer/ops/
// equipment are deliberately absent — they have no home).
const SUPPRESSED_NAMESPACES: Record<string, string> = {
  travel:       "logistics",
  serviceArea:  "logistics",
  service:      "logistics",
  availability: "availability",
  creator:      "media",
  media:        "media",
  experience:   "credits",
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

type ScopeFilteredField = { field_key: string; field_group_slug: string | null; section: string | null };
export function filterLiveCategoryFieldsForScope<T extends ScopeFilteredField>(
  allFields: readonly T[],
  scope: "specialty" | "general",
): T[] {
  // SECTION GATE (the duplication fix): the catalog editor only ever renders
  // fields whose DB `section` belongs to the Services "Details" catch-all
  // (type-specific / refinement / skills / measurements / wardrobe — the
  // sections with no dedicated visible rail accordion). Any field tagged to a
  // dedicated rail section (identity / about / rates / logistics / …) is
  // rendered by that section's bespoke editor and must NOT also appear here —
  // otherwise it shows up as a sub-group that duplicates the rail section.
  // (`isFieldSuppressed` is kept as defense-in-depth for the in-catch-all
  // aliases like the taxonomy `skills` row.)
  return allFields.filter((f) =>
    scope === "general"
      // General mount: always-on global groups inside About — still gated to
      // catch-all sections so dedicated-section fields (media.*, etc.) don't
      // leak into About either.
      ? isGeneralField(f) && isDetailsSection(f.section) && !isFieldSuppressed(f)
      // Specialty mount: type-driven catch-all only — drop dedicated-section
      // fields, suppressed aliases, and the general groups (they live in About).
      : isDetailsSection(f.section) && !isFieldSuppressed(f) && !isGeneralField(f));
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

/** Catalog keys mirroring NAMESPACE_LABEL. English above stays the fallback. */
const NAMESPACE_LABEL_KEY: Record<string, string> = {
  model:        "dashboard.adminFieldsEditor.ns.model",
  chef:         "dashboard.adminFieldsEditor.ns.chef",
  performer:    "dashboard.adminFieldsEditor.ns.performer",
  music:        "dashboard.adminFieldsEditor.ns.music",
  creator:      "dashboard.adminFieldsEditor.ns.creator",
  security:     "dashboard.adminFieldsEditor.ns.security",
  transport:    "dashboard.adminFieldsEditor.ns.transport",
  photo:        "dashboard.adminFieldsEditor.ns.photo",
  event:        "dashboard.adminFieldsEditor.ns.event",
  hosp:         "dashboard.adminFieldsEditor.ns.hosp",
  wellness:     "dashboard.adminFieldsEditor.ns.wellness",
  host:         "dashboard.adminFieldsEditor.ns.host",
  singer:       "dashboard.adminFieldsEditor.ns.singer",
  equipment:    "dashboard.adminFieldsEditor.ns.equipment",
  ops:          "dashboard.adminFieldsEditor.ns.ops",
  travel:       "dashboard.adminFieldsEditor.ns.travel",
  service:      "dashboard.adminFieldsEditor.ns.service",
  serviceArea:  "dashboard.adminFieldsEditor.ns.serviceArea",
  availability: "dashboard.adminFieldsEditor.ns.availability",
  consent:      "dashboard.adminFieldsEditor.ns.consent",
  emergency:    "dashboard.adminFieldsEditor.ns.emergency",
};

function namespaceFor(fieldKey: string): string {
  const i = fieldKey.indexOf(".");
  return i === -1 ? "_misc" : fieldKey.slice(0, i);
}

function namespaceLabel(ns: string, t?: (key: string) => string): string {
  if (ns === "_misc") return t ? t("dashboard.adminFieldsEditor.ns.other") : "Other";
  if (NAMESPACE_LABEL_KEY[ns] && t) return t(NAMESPACE_LABEL_KEY[ns]);
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

// Palette mirrors the real app COLORS tokens (state.tsx) so the Details
// editor's greys match the New Inquiry / rest of the shell exactly:
// COOL border family rgba(24,24,27,*) and the neutral #F2F2EE alt
// surface. (A prior warm rgba(35,29,16,*) / #F2EDE2 palette here read
// as an ugly beige cast on row hover — that is the bug this fixes.)
const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  inkDim: "rgba(11,11,13,0.38)",
  surface: "#FFFFFF",
  surfaceAlt: "#F2F2EE",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  red: "#C82828",
  amber: "#B88731",
};

const F = "Inter, system-ui, sans-serif";

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
  /** Audit #6 — when the parent renders a single always-open group
   *  behind the sticky pill switcher, the pill already shows the group
   *  name + count. Drawing the accordion header again is a redundant
   *  double header. `chromeless` drops the header button + card border
   *  and just renders the fields. */
  chromeless?: boolean;
};

function isValueFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function GroupBlock({
  title, weight, fields, valuesByDefId, visibilityByDefId,
  onSave, onSaveVisibility, open, onToggle, chromeless,
}: GroupBlockProps) {
  const t = useT();
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
    return undefined;
  }, [open]);

  if (chromeless) {
    // Audit #6 — no header, no card border. The sticky pill switcher
    // above is the single source of the group name + fill count.
    return (
      <div ref={cardRef} style={{ fontFamily: F }}>
        {fields.map((f) => (
          <FieldEditor
            key={f.field_definition_id}
            field={f}
            initialValue={valuesByDefId.get(f.field_definition_id)}
            initialVisibility={visibilityByDefId.get(f.field_definition_id) ?? null}
            onSave={(v) => onSave(f.field_definition_id, v)}
            onSaveVisibility={(next) => onSaveVisibility(f.field_definition_id, next)}
          />
        ))}
      </div>
    );
  }

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
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, letterSpacing: 0.1 }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2 }}>
            {interpolate(t("dashboard.adminFieldsEditor.nOfMFilled"), {
              filled,
              total: fields.length,
            })}
            {missingRequired > 0 && (
              <span style={{ color: T.red, fontWeight: 600 }}>
                {" · "}
                {interpolate(t("dashboard.adminFieldsEditor.nRequiredMissing"), {
                  count: missingRequired,
                })}
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
            <FieldEditor
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

// ============================================================================
// Phase C — Details (scope="specialty") field-level disclosure.
// Render-only: same fields, same saved values, same write path. The
// active group's fields render as a compact, width-aware grid of
// COLLAPSIBLE FIELDS — each shows only its label + current value until
// clicked, then expands to the real FieldEditor (its options/input + inline
// visibility). No section accordions, no reclassification: fields keep
// their engine order; nothing is grouped, hidden, or moved. The
// horizontal group pills (Sales / Client Interaction · Physical /
// Casting · Host details · …) are kept exactly as-is — turning them into
// a nested left-nav is the logged next IA phase. FieldEditor + the
// visibility control are reused verbatim (no redesign). Used ONLY for
// the Details mount — About/general keeps GroupBlock unchanged.
// ============================================================================

type DetailsFieldGroupProps = {
  fields: ResolvedField[];
  valuesByDefId: Map<string, unknown>;
  visibilityByDefId: Map<string, string[] | null>;
  onSave: (fieldDefId: string, value: unknown) => Promise<{ ok: boolean; error?: string }>;
  onSaveVisibility: (fieldDefId: string, next: VisChannel[]) => Promise<{ ok: boolean; error?: string }>;
};

// Drawer width signal. Collapsed short-field cards are uniform-height
// stacked tiles (label over value), so two fit per row at ~300px+ — the
// DESKTOP drawer (~340-380px content) must be two-column too, not just
// mobile. Threshold is low (300) and a transient 0-width measure (before
// layout settles) is treated as wide so the desktop drawer never gets
// stuck single-column. Only a genuinely sub-300 sliver → one column.
// Long/text/open fields are full width regardless (fieldIsHalfEligible).
function useDrawerWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // w === 0 → not laid out yet; keep wide (don't flash to 1-col).
      setWide(w === 0 ? true : w >= 300);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, wide };
}

// Content-aware span (the binding layout rule). Open / text / textarea /
// date / multi-select / chips / long current value / anything unsure →
// FULL width. Compact pickers — select (any option count: chips wrap
// fine in a 50% column), number, boolean, toggle — may go half (the
// caller still gates on drawer width). "If unsure, full width" is the
// default branch.
function fieldIsHalfEligible(field: ResolvedField, v: unknown): boolean {
  const k = field.kind;
  if (k === "textarea" || k === "text" || k === "date") return false;
  if (k === "multiselect" || k === "chips") return false;
  // A long label would hard-truncate to a stub in a ~144px column
  // ("Tattoos · loca…") — keep those full width for legibility.
  if ((field.label?.length ?? 0) > 22) return false;
  if (k === "select" || k === "number" || k === "boolean" || k === "toggle") {
    const s = typeof v === "string" ? v : "";
    if (s.length > 24) return false; // a long current value forces full
    return true;
  }
  return false; // unsure → full width
}

// Collapsed-row value summary. Rules: empty → "Add"; bool → Yes/No;
// textarea / long / agency-sensitive-long → "Added" (never expose a long
// or sensitive preview); multi → first + "+N"; number → value + unit;
// else a short truncated value.
function detailsValueSummary(
  field: ResolvedField,
  v: unknown,
  t: (key: string) => string,
): { text: string; empty: boolean } {
  if (!isValueFilled(v)) return { text: t("dashboard.adminFieldsEditor.add"), empty: true };
  if (typeof v === "boolean") {
    return {
      text: t(v ? "dashboard.adminFieldsEditor.yes" : "dashboard.adminFieldsEditor.no"),
      empty: false,
    };
  }
  if (Array.isArray(v)) {
    const arr = v.filter(Boolean).map((x) => String(x));
    if (arr.length === 0) return { text: t("dashboard.adminFieldsEditor.add"), empty: true };
    return {
      text: arr.length > 1 ? `${arr[0]} +${arr.length - 1}` : arr[0],
      empty: false,
    };
  }
  const s = String(v).trim().replace(/\s+/g, " ");
  const isAgencyOnly = !(field.default_visibility ?? []).includes("public");
  // Agency / private free-text or long values stay opaque ("Added") so a
  // sensitive snippet isn't exposed at a glance in the collapsed tile.
  if (isAgencyOnly && (field.kind === "textarea" || s.length > 14)) {
    return { text: t("dashboard.adminFieldsEditor.added"), empty: false };
  }
  // Non-sensitive long / textarea: show a short SNIPPET of the actual
  // text instead of a bare "Added", so the user sees what's there. The
  // tile CSS still ellipsis-clamps to its width; we also hard-cap the
  // string so it never gets long.
  const SNIPPET_MAX = 48;
  if (field.kind === "textarea" || s.length > SNIPPET_MAX) {
    return {
      text: s.length > SNIPPET_MAX ? `${s.slice(0, SNIPPET_MAX).trimEnd()}…` : s,
      empty: false,
    };
  }
  if (field.unit && /^-?\d+(\.\d+)?$/.test(s)) {
    return { text: `${s} ${field.unit}`, empty: false };
  }
  return { text: s, empty: false };
}

function DetailsFieldGroup({
  fields, valuesByDefId, visibilityByDefId, onSave, onSaveVisibility,
}: DetailsFieldGroupProps) {
  const t = useT();
  const { ref, wide } = useDrawerWidth();

  // One open field at a time per group. Seed to the first required-but-
  // empty field so the parent "Fill N required" jump lands on a VISIBLE
  // open control (the group remounts on pill change, re-seeding per group).
  const firstRequiredMissingId = useMemo(() => {
    const f = fields.find(
      (x) =>
        x.required_before_publish &&
        !isValueFilled(valuesByDefId.get(x.field_definition_id)),
    );
    return f?.field_definition_id ?? null;
  }, [fields, valuesByDefId]);
  const [openId, setOpenId] = useState<string | null>(firstRequiredMissingId);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Every empty field in THIS group (any unfilled, not only required) so
  // a 20/22 group doesn't force you to eyeball 22 tiles to find the gaps.
  const emptyIds = useMemo(
    () =>
      fields
        .filter((f) => !isValueFilled(valuesByDefId.get(f.field_definition_id)))
        .map((f) => f.field_definition_id),
    [fields, valuesByDefId],
  );
  const jumpToNextEmpty = () => {
    if (emptyIds.length === 0) return;
    const curIdx = openId
      ? fields.findIndex((f) => f.field_definition_id === openId)
      : -1;
    const next =
      emptyIds.find(
        (eid) => fields.findIndex((f) => f.field_definition_id === eid) > curIdx,
      ) ?? emptyIds[0];
    setOpenId(next);
    requestAnimationFrame(() => {
      cardRefs.current
        .get(next)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  // Parity is trivial: each input field renders exactly once, in engine
  // order — out === in by construction. Logged for QA continuity.
  useEffect(() => {
    const slug = fields[0]?.field_group_slug ?? "_other";
    void improntaLog("admin_live_category_fields_editor.info", {
      message: `[detailsGroup-ui] group=${slug} parity in=${fields.length} ` +
        `out=${fields.length} ok=true mode=per-field-collapsible-autospan`,
    });
  }, [fields]);

  return (
    // maxWidth keeps a comfortable reading measure on a very wide drawer
    // (long full-width cards / small groups don't stretch absurdly wide).
    <div ref={ref} style={{ fontFamily: F, maxWidth: 760 }}>
      {/* Status + jump-to-incomplete. Complete state is deliberately
          light (it's just confirmation); the wording says "in this
          category" so the green ✓ isn't mistaken for the whole profile. */}
      {emptyIds.length === 0 ? (
        <div style={{
          fontSize: 11, fontWeight: 600, color: T.inkDim,
          padding: "0 2px 9px",
        }}>
          {t("dashboard.adminFieldsEditor.allComplete")} ✓
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 8, padding: "0 2px 9px",
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.inkMuted }}>
            {withPluralization(t)("dashboard.adminFieldsEditor.nFieldsStillEmpty", emptyIds.length)}
          </span>
          <button
            type="button"
            onClick={jumpToNextEmpty}
            style={{
              fontSize: 11, fontWeight: 700, color: T.accent,
              background: "rgba(15,79,62,0.06)",
              border: `1px solid ${T.accent}`, borderRadius: 999,
              padding: "4px 12px", cursor: "pointer", fontFamily: F,
              letterSpacing: 0.2, flexShrink: 0,
            }}
          >
            {t("dashboard.adminFieldsEditor.jumpToNextEmpty")} →
          </button>
        </div>
      )}
      {/* Real 2-col CSS grid: columns stay aligned (no stretched lone
          cards). Full-width / open fields span both columns on their own
          row — `align-items:start` + uniform collapsed tiles + open-spans
          mean a tall open field never desyncs a short neighbour.
          minWidth:0 kills overflow; paddingBottom clears a bottom FAB. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: wide ? "1fr 1fr" : "1fr",
          gap: "8px 12px",
          alignItems: "start",
          // Faint cool ground so the white, bordered+lifted field cards
          // read as cards floating on a surface — the New Inquiry
          // relationship, recreated here because the section wrapper
          // itself is white (white-on-white otherwise).
          background: "rgba(11,11,13,0.028)",
          borderRadius: 14,
          padding: 14,
          paddingBottom: 72,
        }}
      >
        {fields.map((f) => {
          const id = f.field_definition_id;
          const isOpen = openId === id;
          const half =
            wide && !isOpen && fieldIsHalfEligible(f, valuesByDefId.get(id));
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) cardRefs.current.set(id, el);
                else cardRefs.current.delete(id);
              }}
              style={{
                minWidth: 0,
                gridColumn: half ? "auto" : "1 / -1",
              }}
            >
              <CollapsibleField
                field={f}
                initialValue={valuesByDefId.get(id)}
                initialVisibility={visibilityByDefId.get(id) ?? null}
                open={isOpen}
                onToggle={() => setOpenId((cur) => (cur === id ? null : id))}
                onSave={(v) => onSave(id, v)}
                onSaveVisibility={(next) => onSaveVisibility(id, next)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// One field as a card whose HEADER is the toggle in BOTH states — click
// the title to open, click it again to close (the prior bug: when open,
// only a tiny corner chevron closed it). The header always shows the
// label; when open, FieldEditor renders with `hideLabel` so the label is
// never duplicated, directly under the header (attached, no detached
// strip). Chevron flips ▸→▾. Real <button>, keyboard accessible,
// aria-expanded; Escape collapses; hover/focus state. No overflow:hidden
// so the visibility popover is never clipped. One-open-at-a-time is
// owned by the parent.
function CollapsibleField({
  field, initialValue, initialVisibility, open, onToggle, onSave, onSaveVisibility,
}: FieldEditorProps & { open: boolean; onToggle: () => void }) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const locale = readLocale();
  const label = fieldLabel(field, locale);
  const filled = isValueFilled(initialValue);
  const requiredMissing = field.required_before_publish && !filled;
  const summary = detailsValueSummary(field, initialValue, t);
  const isAgencyOnly = !(field.default_visibility ?? []).includes("public");
  // Empty optional fields recede a touch (faint fill) so they don't
  // out-shout filled cards; required-missing keeps its red prominence
  // and the green "Add" + jump bar keep them findable.
  const dim = !filled && !requiredMissing && !open;
  const restBg = dim ? "rgba(24,24,27,0.022)" : "#fff";

  return (
    <div
      style={{
        // Field cards sit on the white section card, so a 0.06 hairline
        // was invisible (white-on-white). A present cool border + a
        // hairline lift shadow give each card a real edge — the New
        // Inquiry "card on surface" read, recreated where the ground
        // can't change.
        border: `1px solid ${requiredMissing ? "rgba(200,40,40,0.32)" : T.border}`,
        borderRadius: 9, background: restBg, fontFamily: F, minWidth: 0,
        boxShadow: requiredMissing
          ? "0 0 0 1px rgba(200,40,40,0.08)"
          : "0 1px 2px rgba(11,11,13,0.05)",
      }}
      onKeyDown={open ? (e) => { if (e.key === "Escape") onToggle(); } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          // Settings-style row: label + value stacked on the left, an
          // explicit edit affordance vertically centered on the right.
          // Single-line label/value keep every collapsed card the same
          // height → clean uniform 2-up grid.
          width: "100%", display: "flex", flexDirection: "row",
          alignItems: "center", gap: 10,
          padding: "10px 12px", cursor: "pointer", textAlign: "left",
          fontFamily: F, border: "none",
          background: open || hover ? T.surfaceAlt : restBg,
          borderRadius: 9,
          borderBottomLeftRadius: open ? 0 : 9,
          borderBottomRightRadius: open ? 0 : 9,
          borderBottom: open ? `1px solid ${T.borderSoft}` : "none",
          transition: "background 120ms ease",
        }}
      >
        <div style={{
          flex: 1, minWidth: 0, display: "flex",
          flexDirection: "column", gap: 3,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 600, color: T.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {label}
          </span>
          {!open && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {/* "Agency" only when the value is intentionally hidden
                  ("Added"), so it isn't a repetitive chip down the list. */}
              {isAgencyOnly && summary.text === t("dashboard.adminFieldsEditor.added") && (
                <span style={{
                  flexShrink: 0, fontSize: 8.5, fontWeight: 700,
                  letterSpacing: 0.4, textTransform: "uppercase",
                  color: T.inkMuted, background: "rgba(24,24,27,0.06)",
                  padding: "1px 5px", borderRadius: 3,
                }}>
                  {t("dashboard.adminFieldsEditor.agencyChip")}
                </span>
              )}
              <span style={{
                flex: 1, minWidth: 0,
                fontSize: 12, fontWeight: summary.empty ? 700 : 500,
                color: summary.empty
                  ? (requiredMissing ? T.red : T.accent)
                  : T.inkMuted,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                letterSpacing: 0.1,
              }}>
                {summary.empty ? `+ ${summary.text}` : summary.text}
              </span>
            </div>
          )}
        </div>
        {/* Explicit, unmistakable affordance — not a bare triangle. Shows
            "Edit ›" on hover/focus (desktop) and a clear chevron at rest;
            opens to a down chevron. Becomes the canonical pattern. */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
          color: open || hover ? T.accent : T.inkDim,
          transition: "color 120ms ease",
        }}>
          {!open && hover && (
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3 }}>
              {t("dashboard.adminFieldsEditor.edit")}
            </span>
          )}
          <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 600 }}>
            {open ? "⌄" : "›"}
          </span>
        </div>
      </button>
      {open && (
        <div style={{ padding: "10px 12px 0" }}>
          <FieldEditor
            field={field}
            initialValue={initialValue}
            initialVisibility={initialVisibility}
            onSave={onSave}
            onSaveVisibility={onSaveVisibility}
            hideLabel
          />
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

export type LiveCategoryGroupNavItem = {
  key: string;
  label: string;
  filled: number;
  total: number;
  missing: number;
};

export type LiveCategoryRequiredMissingItem = {
  id: string;
  fieldDefinitionId: string;
  label: string;
  groupKey: string;
  groupLabel: string;
};

// P3-phase-2 — shared per-talent field/value resolver.
// Details and General both mount LiveCategoryFieldsEditor; `scope` is only
// a CLIENT-SIDE render filter, so getFieldsForTalent + getTalentFieldValues
// return the SAME payload for both mounts. Previously each mount fetched
// independently → 2× getFieldsForTalent + 2× getTalentFieldValues per open
// (the warm-open slowness). This memoizes one in-flight/result promise per
// (talentProfileId, refreshKey): the two mounts (and StrictMode's double
// invoke) share a single fetch. The key busts ONLY when refreshKey
// (taxonomyVersion) changes — i.e. the role/type actually changed — so
// section navigation never refetches. A failed/throwing fetch evicts the
// key so the next mount/refresh re-attempts (the un-memoized fetch is the
// fallback path; no sticky failures, old behaviour preserved).
// Generic over the fields/values result types so it accepts whatever the
// caller's action functions return (the `getFieldsForTalent` /
// `getTalentFieldValues` defaults OR an `EditorServerActions` override —
// these have structurally-equivalent but nominally-different value row
// types, which a fixed `_Lcfe*` signature rejected in the parameter
// position). Behaviour is unchanged: still one memoized/deduped fetch
// per (talentProfileId, refreshKey) with the un-memoized fetch as the
// fallback. The module cache is type-erased; each call site recovers its
// exact types via the inferred `F`/`V`.
const _lcfeShared = new Map<string, Promise<[unknown, unknown]>>();

function resolveTalentFieldsShared<F, V>(
  talentProfileId: string,
  refreshKey: string | number,
  getFieldsAction: (i: { talent_profile_id: string }) => Promise<F>,
  getValuesAction: (i: { talent_profile_id: string }) => Promise<V>,
): Promise<[F, V]> {
  const key = `${talentProfileId}::${String(refreshKey)}`;
  const existing = _lcfeShared.get(key);
  if (existing) {
    void improntaLog("admin_live_category_fields_editor.info", {
      message: `[lcfe] reuse shared payload key=${key}`,
    });
    return existing as Promise<[F, V]>;
  }
  // refreshKey changed → any older cached set for this talent is stale.
  for (const k of [..._lcfeShared.keys()]) {
    if (k.startsWith(`${talentProfileId}::`) && k !== key) _lcfeShared.delete(k);
  }
  const t0 = Date.now();
  void improntaLog("admin_live_category_fields_editor.info", {
    message: `[lcfe] fetch start key=${key}`,
  });
  const p = Promise.all([
    getFieldsAction({ talent_profile_id: talentProfileId }),
    getValuesAction({ talent_profile_id: talentProfileId }),
  ]) as Promise<[F, V]>;
  _lcfeShared.set(key, p as Promise<[unknown, unknown]>);
  void p.then(
    ([f]) => {
      const ok = (f as { ok?: boolean })?.ok !== false;
      void improntaLog("admin_live_category_fields_editor.info", {
        message: `[lcfe] fetch done key=${key} ms=${Date.now() - t0} ok=${ok}`,
      });
      if (!ok) _lcfeShared.delete(key); // don't cache a failure
    },
    (e) => {
      void improntaLog("admin_live_category_fields_editor.warn", {
        message: `[lcfe] fetch threw key=${key}: ${String(e)}`,
      });
      _lcfeShared.delete(key);
    },
  );
  return p;
}

export function LiveCategoryFieldsEditor({
  talentProfileId,
  onCountsChange,
  onGroupNavChange,
  onRequiredMissingChange,
  onResolvedFieldsChange,
  activeGroupKey,
  onActiveGroupChange,
  hideInlineCategoryNav = false,
  hasSelectedTalentType = false,
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
  /** Specialty-only: exposes the resolved category tabs to the parent rail
   *  so Details can own its dynamic child navigation without a second
   *  taxonomy resolver. */
  onGroupNavChange?: (groups: LiveCategoryGroupNavItem[]) => void;
  /** Specialty-only: exposes resolver-backed publish blockers to the parent
   *  drawer so "Add N to publish" is fed by the same visible field engine. */
  onRequiredMissingChange?: (items: LiveCategoryRequiredMissingItem[]) => void;
  /** Exposes the full resolved field set, including suppressed rows, so
   *  sibling drawer sections can be gated by the same tenant catalog truth. */
  onResolvedFieldsChange?: (fields: ResolvedField[]) => void;
  /** Specialty-only: controlled selected category key from the parent rail. */
  activeGroupKey?: string | null;
  /** Specialty-only: tells the parent rail when the editor changes groups. */
  onActiveGroupChange?: (key: string | null) => void;
  /** Hide the in-panel category nav on desktop when the parent rail renders
   *  the same categories as nested Details children. Mobile keeps it. */
  hideInlineCategoryNav?: boolean;
  /** Lets empty Specialty state distinguish "choose a type" from
   *  "this selected type has no extra configured fields." */
  hasSelectedTalentType?: boolean;
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
  const t = useT();
  const [allFields, setAllFields] = useState<ResolvedField[] | null>(null);
  const [groups, setGroups] = useState<ResolvedFieldGroup[]>([]);
  const [valuesByDefId, setValuesByDefId] = useState<Map<string, unknown>>(new Map());
  const [visibilityByDefId, setVisibilityByDefId] = useState<Map<string, string[] | null>>(new Map());
  const [error, setError] = useState<string | null>(null);
  // Switcher model — Specialty details renders one group at a time.
  // `activeTab` holds the selected group key; it's clamped to a real
  // tab at render time so a taxonomy change can't strand it.
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
    () => filterLiveCategoryFieldsForScope(allFields ?? [], scope),
    [allFields, scope],
  );

  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const [fieldsRes, valuesRes] = await resolveTalentFieldsShared(
          talentProfileId,
          refreshKey,
          getFieldsAction,
          getValuesAction,
        );
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
          if (!isDetailsSection(f.section) || isFieldSuppressed(f)) continue;
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
          void improntaLog("admin_live_category_fields_editor.warn", {
            message: "[LiveCategoryFieldsEditor] getTalentFieldValues:",
            valuesRes: valuesRes.error,
          });
        }
      } catch (err) {
        if (cancelled) return;
        logServerError("livecategoryfieldseditor", err);
        setError(err instanceof Error ? err.message : t("dashboard.adminFieldsEditor.failedToLoad"));
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
    // `t` is referentially stable per locale, so listing it cannot re-fire the
    // fetch; it joins the action getters in this effect's pre-existing
    // intentionally-narrow dep list (behaviour unchanged).
  }, [talentProfileId, refreshKey, t]);

  useEffect(() => {
    if (allFields === null) return;
    onResolvedFieldsChange?.(allFields);
  }, [allFields, onResolvedFieldsChange]);

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
      showToast(
        interpolate(t("dashboard.adminFieldsEditor.toastSavedField"), {
          label: def?.label ?? t("dashboard.adminFieldsEditor.fieldFallback"),
        }),
        "saved",
      );
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
      showToast(
        interpolate(t("dashboard.adminFieldsEditor.toastVisibilityUpdated"), {
          label: def?.label ?? t("dashboard.adminFieldsEditor.fieldFallback"),
        }),
        "saved",
      );
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

  const tabs = useMemo(() => {
    const sortedGroups = groups.slice().sort((a, b) => a.display_order - b.display_order);
    const otherFields = grouped.get("_other") ?? [];
    const nextTabs: { key: string; label: string; fields: ResolvedField[] }[] = [];

    for (const g of sortedGroups) {
      const list = grouped.get(g.group_slug) ?? [];
      if (list.length > 0) nextTabs.push({ key: g.group_slug, label: g.group_label_en, fields: list });
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
            || namespaceLabel(a, t).localeCompare(namespaceLabel(b, t)))[0];
        if (targetNs) { byNs.set(targetNs, [...(byNs.get(targetNs) ?? []), ...misc]); byNs.delete("_misc"); }
      }
      const sortedNs = Array.from(byNs.keys()).sort((a, b) => {
        if (a === "_misc") return 1;
        if (b === "_misc") return -1;
        return namespaceLabel(a, t).localeCompare(namespaceLabel(b, t));
      });
      for (const ns of sortedNs) {
        nextTabs.push({ key: `_other:${ns}`, label: namespaceLabel(ns, t), fields: byNs.get(ns) ?? [] });
      }
    }

    return nextTabs;
  }, [groups, grouped, t]);

  const activeKey = (activeGroupKey && tabs.some((t) => t.key === activeGroupKey))
    ? activeGroupKey
    : (activeTab && tabs.some((t) => t.key === activeTab))
      ? activeTab
      : (tabs[0]?.key ?? null);
  const activeTabData = tabs.find((t) => t.key === activeKey) ?? null;

  const selectTab = (key: string) => {
    setActiveTab(key);
    onActiveGroupChange?.(key);
  };

  useEffect(() => {
    if (allFields === null || scope !== "specialty" || !onGroupNavChange) return;
    onGroupNavChange(tabs.map((t) => {
      const filled = t.fields.reduce(
        (n, f) => (isValueFilled(valuesByDefId.get(f.field_definition_id)) ? n + 1 : n),
        0,
      );
      return {
        key: t.key,
        label: t.label,
        filled,
        total: t.fields.length,
        missing: Math.max(0, t.fields.length - filled),
      };
    }));
  }, [allFields, scope, tabs, valuesByDefId, onGroupNavChange]);

  useEffect(() => {
    if (allFields === null || scope !== "specialty" || !onRequiredMissingChange) return;
    const locale = readLocale();
    const missing: LiveCategoryRequiredMissingItem[] = [];
    for (const tab of tabs) {
      for (const field of tab.fields) {
        if (!isResolvedFieldPublishBlocking(field)) continue;
        if (isValueFilled(valuesByDefId.get(field.field_definition_id))) continue;
        missing.push({
          id: `field:${field.field_definition_id}`,
          fieldDefinitionId: field.field_definition_id,
          label: fieldLabel(field, locale),
          groupKey: tab.key,
          groupLabel: tab.label,
        });
      }
    }
    onRequiredMissingChange(missing);
  }, [allFields, scope, tabs, valuesByDefId, onRequiredMissingChange]);

  useEffect(() => {
    if (allFields === null || scope !== "specialty" || !onActiveGroupChange) return;
    if (activeGroupKey !== activeKey) onActiveGroupChange(activeKey);
  }, [allFields, scope, activeKey, activeGroupKey, onActiveGroupChange]);

  if (allFields === null) {
    return (
      <div style={{ padding: 12, fontFamily: F, fontSize: 12, color: T.inkMuted }}>
        {t("dashboard.adminFieldsEditor.loadingCategoryFields")}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: 12, borderRadius: 8, background: "rgba(200,40,40,0.08)",
        border: `1px solid ${T.red}`, color: T.red, fontFamily: F, fontSize: 12,
      }}>
        {interpolate(t("dashboard.adminFieldsEditor.couldNotLoadCategoryFields"), { error })}
      </div>
    );
  }

  if (fields.length === 0) {
    if (scope === "general") return null;
    return (
      <div style={{ padding: 12, fontFamily: F, fontSize: 12, color: T.inkMuted }}>
        {t(
          hasSelectedTalentType
            ? "dashboard.adminFieldsEditor.noExtraFields"
            : "dashboard.adminFieldsEditor.selectTalentType",
        )}
      </div>
    );
  }

  const totalFilled = fields.reduce((n, f) => {
    return isValueFilled(valuesByDefId.get(f.field_definition_id)) ? n + 1 : n;
  }, 0);
  const activeGroupFilled = activeTabData?.fields.reduce((n, f) => {
    return isValueFilled(valuesByDefId.get(f.field_definition_id)) ? n + 1 : n;
  }, 0);
  const progressFilled = scope === "specialty" && activeTabData ? activeGroupFilled ?? 0 : totalFilled;
  const progressTotal = scope === "specialty" && activeTabData ? activeTabData.fields.length : fields.length;

  // B9 — Fill-required wizard. Switch the active tab to the first group
  // that still has an unfilled required field.
  const slugForField = (f: ResolvedField): string =>
    f.field_group_slug ?? `_other:${namespaceFor(f.field_key)}`;
  const missingRequiredFields = fields.filter(
    (f) => isResolvedFieldPublishBlocking(f)
      && !isValueFilled(valuesByDefId.get(f.field_definition_id)),
  );
  const requiredMissing = missingRequiredFields.length;
  const jumpToNextRequired = () => {
    const keysWithMissing = new Set(missingRequiredFields.map(slugForField));
    const target = tabs.find((t) => keysWithMissing.has(t.key));
    if (target) selectTab(target.key);
  };

  return (
    <div className="mb-1">
      {hideInlineCategoryNav && (
        <style>{`
          @container pshell (min-width: 481px) {
            [data-lcfe-inline-category-nav="rail-owned"] { display: none !important; }
          }
          @supports not (container-type: inline-size) {
            @media (min-width: 481px) {
              [data-lcfe-inline-category-nav="rail-owned"] { display: none !important; }
            }
          }
        `}</style>
      )}
      {/* Audit #9 — progress/History bar + the group switcher stay
          pinned together while you scroll a long section, so you never
          lose where you are or the way out. */}
      <div style={{ position: "sticky", top: 0, zIndex: 7, background: "#fff" }}>
      <div style={{
        padding: "8px 4px 10px", fontFamily: F,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8,
      }}>
        <div style={{
          fontSize: 10.5, color: T.inkMuted, letterSpacing: 0.4,
          textTransform: "uppercase", fontWeight: 600, lineHeight: 1.35,
        }}>
          {scope === "general" ? `${t("dashboard.adminFieldsEditor.generalPrefix")} · ` : ""}
          {interpolate(t("dashboard.adminFieldsEditor.progressComplete"), {
            filled: progressFilled,
            total: progressTotal,
          })}
        </div>
        <div className="flex gap-1.5">
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
              {interpolate(t("dashboard.adminFieldsEditor.fillNRequired"), {
                count: requiredMissing,
              })}
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
              {t("dashboard.adminFieldsEditor.history")}
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
      </div>{/* /sticky — ONLY the thin status row stays pinned; the
          Categories selector below scrolls with content so the pinned
          header never eats the viewport on a short/mobile screen. */}
      {/* In-panel group selector remains as the narrow/mobile fallback.
          On desktop the profile shell owns these same resolved groups as
          nested child items under Details in the left rail, so this block
          is hidden when hideInlineCategoryNav is true. */}
      {tabs.length > 1 && (
        <div
          data-lcfe-inline-category-nav={hideInlineCategoryNav ? "rail-owned" : "inline"}
          style={{ padding: "2px 0 12px", borderBottom: `1px solid ${T.borderSoft}` }}
        >
          {/* Compact dropdown nav (mobile / inline fallback). The desktop
              rail owns category navigation when available. */}
          <div style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7,
            textTransform: "uppercase", color: T.inkMuted,
            padding: "0 2px 6px",
          }}>
            {t("dashboard.adminFieldsEditor.categories")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              aria-label={t("dashboard.adminFieldsEditor.selectCategoryAria")}
              value={activeKey}
              onChange={(event) => selectTab(event.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
                height: 36,
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                background: "#fff",
                color: T.ink,
                fontFamily: F,
                fontSize: 13,
                fontWeight: 600,
                padding: "0 10px",
                outline: "none",
              }}
            >
              {tabs.map((t) => {
                const filled = t.fields.reduce(
                  (n, f) => (isValueFilled(valuesByDefId.get(f.field_definition_id)) ? n + 1 : n),
                  0,
                );
                return (
                  <option key={t.key} value={t.key}>
                    {t.label} ({filled}/{t.fields.length})
                  </option>
                );
              })}
            </select>
            {activeTabData && (
              <span
                style={{
                  flexShrink: 0,
                  padding: "5px 8px",
                  borderRadius: 999,
                  border: `1px solid ${T.borderSoft}`,
                  background: T.surfaceAlt,
                  color: T.inkMuted,
                  fontFamily: F,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {activeGroupFilled}/{activeTabData.fields.length}
              </span>
            )}
          </div>
        </div>
      )}
      <div style={{ height: 10 }} />
      {activeTabData && (
        scope === "specialty" ? (
          <DetailsFieldGroup
            key={activeTabData.key}
            fields={activeTabData.fields}
            valuesByDefId={valuesByDefId}
            visibilityByDefId={visibilityByDefId}
            onSave={handleSave}
            onSaveVisibility={handleSaveVisibility}
          />
        ) : (
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
            chromeless
          />
        )
      )}
    </div>
  );
}
