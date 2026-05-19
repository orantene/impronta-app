"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AvailabilityCell,
  AvailabilityStatus,
  Avatar,
  BioTone,
  BridgeTalentSelfProfile,
  COLORS,
  CatalogChips,
  CategoryExpandPanel,
  ChannelVisibilityStrip,
  ChipsInput,
  DrawerSectionId,
  DrawerShell,
  EngineFieldVisibility,
  FIELD_CATALOG,
  FONTS,
  FieldLockPath,
  FieldRow,
  GENDER_OPTIONS,
  LOCALE_LABEL,
  LiveTaxonomyParent,
  LocaleBio,
  LocaleCode,
  MY_TALENT_PROFILE,
  MyTalentProfile,
  PROFICIENCY_META,
  PRONOUNS_OPTIONS,
  PROTO_TENANT_ID,
  PackageRate,
  PastClient,
  Personality,
  PhotoMeta,
  PrimaryButton,
  ProfileActivityEntry,
  ProfileDraft,
  ProfileIdentity,
  ProfileLanguage,
  ProfileRate,
  Pronouns,
  RateUnit,
  RecurringPattern,
  RegField,
  ResolvedField,
  Role,
  SHARED_FIELD_INPUT_STYLE,
  SKILL_CATALOG,
  SeasonalWindow,
  SecondaryButton,
  Section,
  ServiceArea,
  SkillEntry,
  SkillOverridesPanel,
  SkillProficiency,
  SkillSlotPanel,
  TALENT_PROFILES_BY_ID,
  TALENT_TRUST_META,
  TAXONOMY,
  TAXONOMY_FIELDS,
  TRANSITION,
  TYPE_RATE_UNIT,
  TaxonomyChild,
  TaxonomyParent,
  TaxonomyParentId,
  TextInput,
  Toggle,
  ToggleControl,
  TrustTier,
  VacationWindow,
  Verifications,
  VideoSlot,
  ViewerRole,
  WORKSPACE_TAXONOMY_DEFAULT,
  WorkspaceCustomField,
  actionDeleteMediaAssets,
  actionDeleteTalentDocument,
  actionGetTalentDocumentSignedUrl,
  actionLoadTalentMediaBundle,
  actionUploadAndAssignMedia,
  actionUploadTalentDocument,
  addTalentToRoster,
  ageRangeFor,
  applyWorkspaceFieldOverride,
  bulkAddTalentToRoster,
  canViewerSee,
  clearProfileDraft,
  deriveAge,
  effectiveFieldVisibility,
  getFieldsForTalent,
  getProfileById,
  getTalentProfileActivity,
  loadTalentProfileEditorData,
  parseTalentCsv,
  parseVideoUrl,
  patchProfileDraft,
  platformBaseVisibility,
  readProfileDraft,
  resolvedFieldsForMode,
  sectionAppliesToType,
  sendTalentClaimInvite,
  shortParentLabel,
  useAdminShell,
  useDashboardText,
  useLiveTaxonomy,
  useQueuedRouterRefresh,
  useWorkspaceFieldOverrideSubscription
} from "../drawer-shared";

// Phase 1d (remediation §4): TalentProfileShell ECO support cast (reducer/state
// + ~100 private editors), byte-for-byte from drawers.tsx. Irreducible-large;
// max-lines grandfathered via mandated scoped suppression regen (state/* precedent).

export type ResolvedGroupForUI = {
  group_slug: string;
  group_label_en: string;
  weight: string;
  display_order: number;
  field_count: number;
};

// ── Phase 4 truth-preview helpers (pure, read-only) ──────────────────
//
// The resolver (getFieldsForTalent) has ALREADY folded this tenant's
// workspace_profile_field_settings into `default_visibility` +
// `is_admin_only` before we ever see a ResolvedField. So here we must
// NOT re-apply a tenant override (that would double-restrict). We feed
// the *resolved* channels straight to the shared engine with NO tenant
// arg — it just canonicalises channels → public|admin|hidden and
// re-asserts the platform admin/sensitive floor. This guarantees the
// "view as public" indicator matches exactly what P3 renders publicly.

export function resolvedToVisInput(f: ResolvedField) {
  return {
    default_visibility: f.default_visibility,
    admin_only: f.is_admin_only,
    // is_sensitive / show_in_public aren't carried on ResolvedField; the
    // resolver already reflected them into default_visibility/is_admin_only.
  };
}


export const VIEW_AS_OPTIONS: { key: ViewerRole; label: string; labelEs: string }[] = [
  { key: "public", label: "Public client", labelEs: "Cliente público" },
  { key: "agency_admin", label: "Admin", labelEs: "Admin" },
  { key: "talent", label: "Talent", labelEs: "Talento" },
];


export function visMeta(v: EngineFieldVisibility): { label: string; bg: string; fg: string } {
  if (v === "public") return { label: "Public", bg: COLORS.successSoft, fg: COLORS.successDeep };
  if (v === "admin") return { label: "Admin-only", bg: COLORS.amberSoft, fg: COLORS.amberDeep };
  return { label: "Hidden", bg: COLORS.fillSoft, fg: COLORS.fillDeep };
}

/** "Why does this field appear" — tier + how it was brought in. */

export function sourceLabel(f: ResolvedField): string {
  const tier =
    f.tier === "universal" ? "Universal"
    : f.tier === "global" ? "Global"
    : "Type-specific";
  const b = f.brought_in_by;
  if (b.kind === "tier") return tier;
  if (b.kind === "group") {
    return `${tier} · via ${f.field_group_label ?? b.group_slug} group`;
  }
  return `${tier} · via talent-type recommendation`;
}

/** A small inline chip. */

export function TruthChip({
  text,
  bg,
  fg,
  title,
  strong,
}: {
  text: string;
  bg: string;
  fg: string;
  title?: string;
  strong?: boolean;
}) {
  return (
    <span
      title={title}
      style={{
        fontSize: 9.5,
        fontWeight: strong ? 700 : 600,
        padding: "1px 6px",
        borderRadius: 4,
        background: bg,
        color: fg,
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

/** Renders one resolved group: title + field rows with the full
 *  read-only truth preview (source · effective visibility for the
 *  selected view-as role · required + origin · override · value). */

export function FieldGroupBlock({
  title,
  subtitle,
  fields,
  viewerRole,
}: {
  title: string;
  subtitle: string;
  fields: ResolvedField[];
  viewerRole: ViewerRole;
}) {
  return (
    <div>
      <div style={{
        fontSize: 11.5, fontWeight: 700, color: COLORS.ink,
        letterSpacing: 0.3, marginBottom: 2,
      }}>{title}</div>
      <div style={{
        fontSize: 10.5, color: COLORS.inkMuted, marginBottom: 6,
      }}>{subtitle}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {fields.map((f) => {
          // Canonical visibility (tenant override already baked into the
          // resolved channels — see resolvedToVisInput note).
          const eff = effectiveFieldVisibility(resolvedToVisInput(f));
          const viewerSees = canViewerSee(eff, viewerRole);
          const platformVis = platformBaseVisibility(resolvedToVisInput(f));
          const vm = visMeta(eff);
          // Required origin — best-effort, conservative. We can only
          // assert a *platform* origin when a recommendation flag set it;
          // a workspace `required_override` shows as a tenant override
          // chip. We never invent an "agency required" label otherwise.
          const platformRequired =
            f.required_before_publish ||
            f.required_at_registration ||
            f.required_before_verification;
          const hasValue = f.has_value === true;
          return (
            <div key={f.field_definition_id} style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "7px 10px", borderRadius: 6,
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.borderSoft}`,
              opacity: viewerSees ? 1 : 0.62,
            }}>
              {/* Value present/missing rail */}
              <span
                title={
                  hasValue
                    ? "A value is stored for this talent"
                    : "No value stored yet"
                }
                style={{
                  marginTop: 4,
                  width: 7, height: 7, borderRadius: 999,
                  flexShrink: 0,
                  background: hasValue ? COLORS.success : COLORS.borderStrong,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, color: COLORS.ink }}>
                {f.label}
                {f.required_before_publish && (
                  <span style={{ marginLeft: 6, color: COLORS.red, fontWeight: 700, fontSize: 10 }}
                    title="Required before publish">*</span>
                )}
                {f.required_at_registration && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 700,
                    padding: "1px 5px", borderRadius: 3,
                    background: COLORS.red, color: "#fff",
                    letterSpacing: 0.4,
                  }}>REG</span>
                )}
                {f.required_before_verification && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 700,
                    padding: "1px 5px", borderRadius: 3,
                    background: COLORS.indigoDeep, color: "#fff",
                    letterSpacing: 0.4,
                  }}>VERIFY</span>
                )}
                {f.is_admin_only && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 700,
                    padding: "1px 5px", borderRadius: 3,
                    background: COLORS.inkMuted, color: "#fff",
                    letterSpacing: 0.4,
                  }}>ADMIN</span>
                )}
                </span>
                {f.helper && (
                  <div style={{
                    fontSize: 10.5, color: COLORS.inkMuted,
                    marginTop: 2, lineHeight: 1.35,
                  }}>{f.helper}</div>
                )}
                {/* Truth-preview chip row */}
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 5,
                  marginTop: 5, alignItems: "center",
                }}>
                  <TruthChip
                    text={sourceLabel(f)}
                    bg={COLORS.indigoSoft}
                    fg={COLORS.indigoDeep}
                    title="Why this field appears for this talent"
                  />
                  <TruthChip
                    text={
                      viewerSees
                        ? `${VIEW_AS_OPTIONS.find((o) => o.key === viewerRole)?.label ?? "Viewer"} sees · ${vm.label}`
                        : `Hidden from ${VIEW_AS_OPTIONS.find((o) => o.key === viewerRole)?.label ?? "viewer"} · ${vm.label}`
                    }
                    bg={viewerSees ? vm.bg : COLORS.fillSoft}
                    fg={viewerSees ? vm.fg : COLORS.fillDeep}
                    title={`Effective visibility: ${vm.label}. ${viewerSees ? "This audience can see it." : "This audience cannot see it."}`}
                    strong
                  />
                  {f.is_required && (
                    <TruthChip
                      text={platformRequired ? "Required · platform" : "Required"}
                      bg={COLORS.coralSoft}
                      fg={COLORS.coralDeep}
                      title={
                        platformRequired
                          ? "Required by the platform catalog (recommendation flag)"
                          : "Required (origin not explicitly attributed; may be a workspace setting)"
                      }
                    />
                  )}
                  {f.tenant_override === true ? (
                    <TruthChip
                      text="Workspace override"
                      bg={COLORS.royalSoft}
                      fg={COLORS.royalDeep}
                      title="This workspace changed this field from the platform default (visibility / label / required / helper / order). Edit in the Details editor."
                    />
                  ) : (
                    <TruthChip
                      text="Platform default"
                      bg={COLORS.surfaceAlt}
                      fg={COLORS.inkMuted}
                      title={`Inherits the platform catalog (platform visibility: ${visMeta(platformVis).label}). No workspace override.`}
                    />
                  )}
                  <TruthChip
                    text={hasValue ? "Value present" : "No value yet"}
                    bg={hasValue ? COLORS.successSoft : COLORS.surfaceAlt}
                    fg={hasValue ? COLORS.successDeep : COLORS.inkMuted}
                    title={
                      hasValue
                        ? "A value is stored for this talent. The value itself is editable in the Details editor."
                        : "No value stored for this talent yet."
                    }
                  />
                </div>
              </div>
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: f.tier === "universal" ? COLORS.surfaceAlt
                  : f.tier === "global" ? COLORS.indigoSoft
                  : COLORS.accentSoft,
                color: f.tier === "universal" ? COLORS.inkMuted
                  : f.tier === "global" ? COLORS.indigoDeep
                  : COLORS.accent,
                textTransform: "uppercase", letterSpacing: 0.4,
                flexShrink: 0,
              }}>{f.tier}</span>
              <span style={{
                fontSize: 10.5, color: COLORS.inkMuted,
                fontFamily: "ui-monospace, monospace",
                flexShrink: 0,
              }}>{f.kind}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export function LiveCategoryFieldsPanel({
  talentProfileId,
  open,
  onToggle,
}: {
  talentProfileId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const copy = useDashboardText();
  const [fields, setFields] = useState<ResolvedField[] | null>(null);
  const [groups, setGroups] = useState<ResolvedGroupForUI[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Phase 4 — "view as" role. Pure client-side recompute: changing this
  // re-derives every row's effective-visibility chip from the SAME
  // already-loaded ResolvedField[] (no refetch).
  const [viewAs, setViewAs] = useState<ViewerRole>("public");

  useEffect(() => {
    if (!open || fields !== null || loading) return;
    setLoading(true);
    setError(null);
    getFieldsForTalent({ talent_profile_id: talentProfileId }).then((res) => {
      if (res.ok) {
        setFields(res.fields);
        setGroups(res.groups);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
  }, [open, talentProfileId, fields, loading]);

  // Group fields by their resolved field_group (Phase 6 architecture).
  // Universal/global fields without a group end up in a "Universal" bucket.
  const grouped = useMemo(() => {
    if (!fields) return new Map<string, ResolvedField[]>();
    const m = new Map<string, ResolvedField[]>();
    for (const f of fields) {
      const key = f.field_group_slug ?? (f.tier === "universal" || f.tier === "global" ? "_universal" : "_other");
      const list = m.get(key) ?? [];
      list.push(f);
      m.set(key, list);
    }
    // Sort each group internally by display_order
    for (const list of m.values()) {
      list.sort((a, b) => a.display_order - b.display_order);
    }
    return m;
  }, [fields]);

  // Required-by-publish completion stats.
  const completion = useMemo(() => {
    if (!fields) return { required: 0, total: 0 };
    const required = fields.filter((f) => f.required_before_publish).length;
    return { required, total: fields.length };
  }, [fields]);

  // Phase 4 — per-view-as summary. Pure recompute from already-loaded
  // fields; flipping `viewAs` changes ONLY this + the per-row chips, never
  // refetches. "visible" uses the SAME engine the public page uses, so
  // "view as: public client" mirrors exactly what /t/[code] would render.
  const viewSummary = useMemo(() => {
    if (!fields) return { visible: 0, hidden: 0, withValue: 0, overrides: 0 };
    let visible = 0;
    let withValue = 0;
    let overrides = 0;
    for (const f of fields) {
      const eff = effectiveFieldVisibility(resolvedToVisInput(f));
      if (canViewerSee(eff, viewAs)) visible += 1;
      if (f.has_value === true) withValue += 1;
      if (f.tenant_override === true) overrides += 1;
    }
    return {
      visible,
      hidden: fields.length - visible,
      withValue,
      overrides,
    };
  }, [fields, viewAs]);

  return (
    <div style={{
      border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12,
      background: "#fff", overflow: "hidden", marginBottom: 8,
      fontFamily: FONTS.body,
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", background: open ? COLORS.surfaceAlt : "#fff",
          border: "none", cursor: "pointer", textAlign: "left",
          borderBottom: open ? `1px solid ${COLORS.borderSoft}` : "none",
        }}
      >
        <span style={{ fontSize: 18 }}>🧬</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>
            {copy.t("Agency Fields")}
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
            {fields
              ? (copy.isSpanish
                ? `${fields.length} campo${fields.length === 1 ? "" : "s"} resuelto${fields.length === 1 ? "" : "s"} desde tipos principales y secundarios`
                : `${fields.length} field${fields.length === 1 ? "" : "s"} resolved from primary + secondary types`)
              : copy.t("DB-resolved field catalog for this talent's types")}
          </div>
        </div>
        <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ padding: "12px 14px" }}>
          {loading && (
            <div style={{ color: COLORS.inkMuted, fontSize: 12 }}>{copy.t("Loading…")}</div>
          )}
          {error && (
            <div style={{
              padding: 10, borderRadius: 8, background: COLORS.amberSoft,
              border: `1px solid ${COLORS.amber}`, fontSize: 12, color: COLORS.ink,
            }}>{error}</div>
          )}
          {fields && fields.length === 0 && (
            <div style={{ color: COLORS.inkMuted, fontSize: 12 }}>
              No category-specific fields yet. Set a primary type first.
            </div>
          )}
          {fields && fields.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Architecture summary header */}
              <div style={{
                padding: "10px 12px", borderRadius: 8,
                background: COLORS.indigoSoft, border: `1px solid rgba(91,107,160,0.18)`,
                fontSize: 11.5, color: COLORS.indigoDeep, lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {fields.length} fields across {groups.length} groups · {completion.required} required to publish
                </div>
                <div style={{ fontSize: 10.5 }}>
                  Groups auto-loaded from primary + secondary parent categories. Universal + global fields apply to everyone.
                </div>
                <div style={{ fontSize: 10.5, marginTop: 4, opacity: 0.85 }}>
                  This is the resolved truth: it already reflects this workspace&apos;s Field Catalog &amp; Field Privacy settings — fields you turned off are excluded, renamed fields show your workspace name, and an <strong>ADMIN</strong> tag means it&apos;s admin-only and never public.
                </div>
              </div>

              {/* Phase 4 — "View as" role selector + live per-view summary.
                  Read-only: recomputes from loaded data, never refetches,
                  never edits. Editing stays in the Details editor. */}
              <div style={{
                display: "flex", flexWrap: "wrap", alignItems: "center",
                gap: 10, padding: "9px 12px", borderRadius: 8,
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.borderSoft}`,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: COLORS.ink,
                  letterSpacing: 0.2,
                }}>
                  {copy.isSpanish ? "Ver como" : "View as"}
                </span>
                <div style={{ display: "inline-flex", gap: 4 }} role="group"
                  aria-label={copy.isSpanish ? "Ver como rol" : "View as role"}>
                  {VIEW_AS_OPTIONS.map((o) => {
                    const active = viewAs === o.key;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setViewAs(o.key)}
                        aria-pressed={active}
                        style={{
                          fontSize: 11, fontWeight: 600,
                          padding: "4px 10px", borderRadius: 999,
                          cursor: "pointer",
                          background: active ? COLORS.fill : "#fff",
                          color: active ? "#fff" : COLORS.inkMuted,
                          border: `1px solid ${active ? COLORS.fill : COLORS.border}`,
                          fontFamily: FONTS.body,
                          transition: TRANSITION.sm,
                        }}
                      >
                        {copy.isSpanish ? o.labelEs : o.label}
                      </button>
                    );
                  })}
                </div>
                <span style={{
                  fontSize: 10.5, color: COLORS.inkMuted, marginLeft: "auto",
                }}>
                  {copy.isSpanish
                    ? `${viewSummary.visible} visible${viewSummary.visible === 1 ? "" : "s"} · ${viewSummary.hidden} oculto${viewSummary.hidden === 1 ? "" : "s"} · ${viewSummary.withValue} con valor · ${viewSummary.overrides} override${viewSummary.overrides === 1 ? "" : "s"}`
                    : `${viewSummary.visible} visible · ${viewSummary.hidden} hidden · ${viewSummary.withValue} with a value · ${viewSummary.overrides} workspace override${viewSummary.overrides === 1 ? "" : "s"}`}
                </span>
              </div>

              {/* Render groups in display_order */}
              {groups
                .slice()
                .sort((a, b) => a.display_order - b.display_order)
                .map((g) => {
                  const list = grouped.get(g.group_slug) ?? [];
                  if (list.length === 0) return null;
                  return (
                    <FieldGroupBlock
                      key={g.group_slug}
                      title={g.group_label_en}
                      subtitle={`${list.length} field${list.length === 1 ? "" : "s"} · ${g.weight} weight`}
                      fields={list}
                      viewerRole={viewAs}
                    />
                  );
                })}

              {/* Universal/global bucket (no group) */}
              {(grouped.get("_universal") ?? []).length > 0 && (
                <FieldGroupBlock
                  title="Universal & global"
                  subtitle={`${(grouped.get("_universal") ?? []).length} field${(grouped.get("_universal") ?? []).length === 1 ? "" : "s"} · always shown`}
                  fields={grouped.get("_universal") ?? []}
                  viewerRole={viewAs}
                />
              )}

              {/* Recommendation-only bucket (no group, but has rec) */}
              {(grouped.get("_other") ?? []).length > 0 && (
                <FieldGroupBlock
                  title="Type-specific"
                  subtitle={`${(grouped.get("_other") ?? []).length} field${(grouped.get("_other") ?? []).length === 1 ? "" : "s"} · brought in by talent type`}
                  fields={grouped.get("_other") ?? []}
                  viewerRole={viewAs}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// CategoryExpandPanel — what an admin sees when they tap into a parent
// category in Settings → Roster. Three tabs:
//   • Sub-types    → category_groups + their talent_types (level 2 + 3)
//                    so you can see EVERYTHING that comes with this
//                    category. Custom sub-types live here too.
//   • Fields       → universal + global + type-specific fields, grouped
//                    by tier with source labels — answers "what data
//                    will my roster collect for this category?"
//   • Settings     → the 5 flag toggles (allow primary/secondary, show
//                    in registration/directory, require approval).
// ════════════════════════════════════════════════════════════════════


export function CustomWorkspaceFieldInput({ field, value, onChange }: {
  field: WorkspaceCustomField;
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const labelRow = (
    <label style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 5 }}>
      {field.name}
      {!field.required && <span style={{ fontSize: 10, fontWeight: 500, color: COLORS.inkDim }}>· optional</span>}
      {field.required && <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.amberDeep }}>· required</span>}
    </label>
  );
  const helper = field.helper && (
    <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginTop: 4 }}>{field.helper}</div>
  );

  if (field.kind === "Text" || field.kind === "Number" || field.kind === "Date") {
    return (
      <div>
        {labelRow}
        <input
          type={field.kind === "Number" ? "number" : field.kind === "Date" ? "date" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", padding: "11px 13px",
            borderRadius: 10, border: `1.5px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, outline: "none",
          }}
        />
        {helper}
      </div>
    );
  }
  if (field.kind === "Toggle") {
    const v = value === "true";
    return (
      <div>
        {labelRow}
        <button type="button" onClick={() => onChange(v ? "false" : "true")} aria-pressed={v}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: 0, background: "transparent", border: "none", cursor: "pointer",
            fontFamily: FONTS.body,
          }}>
          <span style={{
            width: 36, height: 22, borderRadius: 999,
            background: v ? COLORS.accent : "rgba(11,11,13,0.12)",
            position: "relative", flexShrink: 0,
          }}>
            <span style={{
              position: "absolute", top: 2, left: v ? 16 : 2,
              width: 18, height: 18, borderRadius: "50%",
              background: "#fff", transition: "left 0.15s",
            }} />
          </span>
          <span style={{ fontSize: 12.5, color: COLORS.ink }}>{v ? "Yes" : "No"}</span>
        </button>
        {helper}
      </div>
    );
  }
  // Select / Multi-select — for the prototype, free-text chips since
  // the Field Catalog doesn't yet capture an option list.
  const arr = Array.isArray(value) ? value : (value ? [value] : []);
  const isMulti = field.kind === "Multi-select";
  return (
    <ChipsInput
      label={field.name + (field.required ? "  ·  required" : "  ·  optional")}
      placeholder={isMulti ? "Add a value…" : "Type a value (single)"}
      values={arr}
      onChange={(v) => onChange(isMulti ? v : (v[v.length - 1] ?? ""))}
    />
  );
}

/** Required/Optional pill — consults the field catalog when a
 *  primaryType is provided (so "bust" can be REQUIRED for models +
 *  inapplicable for chefs); otherwise falls back to the field's
 *  static `optional` flag. */

export type ProfileShellPayload = {
  /** Mode controls header copy + which sections are gated. */
  mode?: "create" | "edit-admin" | "edit-self";
  /** Phase B — canonical talent id. When set, the drawer loads the
   *  talent's full profile from `TALENT_PROFILES_BY_ID[talentId]` and
   *  writes back through the override store keyed by the same id.
   *  Replaces the old "match by stage name" behavior so any talent
   *  (not just Marta) can be edited with the same shell. */
  talentId?: string;
  /** Section to land on. When set, the shell skips its default
   *  (identity for edit, services for create) and opens directly on
   *  this section. Used by the talent's MyProfilePage to deep-link
   *  from each dashboard card straight into the right section. */
  section?: string;
  /** Pre-filled fields handed off from NewTalentDrawer or approval queue. */
  seed?: {
    stageName?: string;
    primaryType?: string;
    homeBase?: string;
    /** Canonical talent code (TAL-NNNNN) — shown under the name in the
     *  drawer header so admins can reference the talent by stable id. */
    profileCode?: string;
    method?: "agency" | "invited" | "draft";
    contact?: string;
    // From approval queue (talent's submitted registration data):
    secondaryTypes?: string[];
    specialties?: string[];
    serviceCities?: string[];
    travelKm?: number;
    bio?: string;
    photoCount?: number;
    fields?: Record<string, string | string[]>;
    languages?: ProfileLanguage[];
    // New canonical fields — populated when the shell opens an existing
    // talent (e.g. workspace admin clicking a roster row). These let
    // the bridge from MY_TALENT_PROFILE.travel.{passports,workAuth}
    // hydrate cleanly into ProfileState.
    nationality?: string;
    homeCountry?: string;
    responseTime?: "1h" | "4h" | "24h" | "48h";
    passport?: "valid" | "expired" | "none";
    driversLicense?: "none" | "standard" | "commercial" | "international";
    ownsVehicle?: boolean;
    workEligibility?: string[];
    visaCountries?: string[];
  };
};


export function findChild(typeId: string | null) {
  if (!typeId) return null;
  for (const p of TAXONOMY) {
    const c = p.children.find(x => x.id === typeId);
    if (c) return { parent: p, child: c };
  }
  return null;
}

// ── Smart defaults per Talent Type ───────────────────────────────────
// When a primary type is picked, we pre-suggest specialties and a bio
// template so the talent doesn't stare at a blank canvas. Untouched if
// the talent has already typed something.

export type TypeDefaults = {
  defaultSpecialties: string[];
  bioTemplate: (vars: { stageName?: string; homeBase?: string; languages?: string[] }) => string;
};


export const TYPE_DEFAULTS: Record<string, TypeDefaults> = {
  fashion:      { defaultSpecialties: ["Editorial"],       bioTemplate: (v) => `Editorial fashion model${v.homeBase ? ` based in ${v.homeBase}` : ""}.${v.languages?.length ? ` ${v.languages.slice(0, 2).join(" · ")}.` : ""}` },
  promotional:  { defaultSpecialties: ["Brand activation"],bioTemplate: (v) => `Promotional model${v.homeBase ? ` working ${v.homeBase} and surrounds` : ""}.${v.languages?.length ? ` ${v.languages.slice(0, 2).join(" · ")}.` : ""}` },
  content:      { defaultSpecialties: ["UGC"],              bioTemplate: (v) => `Content model + UGC creator${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  commercial:   { defaultSpecialties: ["Print"],            bioTemplate: (v) => `Commercial model${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  vip_host:     { defaultSpecialties: ["Hotel"],            bioTemplate: (v) => `VIP host${v.homeBase ? ` based in ${v.homeBase}` : ""}.${v.languages?.length ? ` Speaks ${v.languages.slice(0, 2).join(" + ")}.` : ""}` },
  brand_amb:    { defaultSpecialties: ["Activation"],       bioTemplate: (v) => `Brand ambassador${v.homeBase ? ` covering ${v.homeBase}` : ""}.` },
  mc:           { defaultSpecialties: ["Wedding"],          bioTemplate: (v) => `MC for events${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  promoter:     { defaultSpecialties: ["Nightclub"],        bioTemplate: (v) => `Promoter${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  dj:           { defaultSpecialties: ["House"],            bioTemplate: (v) => `DJ${v.homeBase ? ` from ${v.homeBase}` : ""} — clubs, festivals, private events.` },
  singer:       { defaultSpecialties: ["Pop"],              bioTemplate: (v) => `Vocalist${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  band:         { defaultSpecialties: [],                   bioTemplate: (v) => `Live band${v.homeBase ? ` from ${v.homeBase}` : ""}.` },
  musician:     { defaultSpecialties: [],                   bioTemplate: (v) => `Musician${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  private_chef: { defaultSpecialties: ["Mediterranean"],    bioTemplate: (v) => `Private chef${v.homeBase ? ` in ${v.homeBase}` : ""}. Tasting menus 6–24 guests.` },
  mixologist:   { defaultSpecialties: ["Cocktail menu"],    bioTemplate: (v) => `Mixologist${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  fire:         { defaultSpecialties: ["Poi"],              bioTemplate: (v) => `Fire performer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  dancer:       { defaultSpecialties: [],                   bioTemplate: (v) => `Dancer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  belly_dancer: { defaultSpecialties: ["Egyptian"],         bioTemplate: (v) => `Belly dancer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  acrobat:      { defaultSpecialties: ["Silk"],             bioTemplate: (v) => `Aerial acrobat${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  chauffeur:    { defaultSpecialties: ["VIP"],              bioTemplate: (v) => `Professional chauffeur${v.homeBase ? ` covering ${v.homeBase}` : ""}.` },
  airport:      { defaultSpecialties: [],                   bioTemplate: (v) => `Airport transfer driver${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  massage:      { defaultSpecialties: ["Deep tissue"],      bioTemplate: (v) => `Massage therapist${v.homeBase ? ` in ${v.homeBase}` : ""}, mobile + studio.` },
  yoga:         { defaultSpecialties: ["Vinyasa"],          bioTemplate: (v) => `Yoga instructor${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  housekeeper:  { defaultSpecialties: ["Villa"],            bioTemplate: (v) => `Housekeeper${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  butler:       { defaultSpecialties: ["Service"],          bioTemplate: (v) => `Butler${v.homeBase ? ` in ${v.homeBase}` : ""}.` },
  photographer: { defaultSpecialties: [],                   bioTemplate: (v) => `Photographer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
  videographer: { defaultSpecialties: [],                   bioTemplate: (v) => `Videographer${v.homeBase ? ` based in ${v.homeBase}` : ""}.` },
};


export function getTypeDefaults(typeId: string | null): TypeDefaults {
  if (!typeId) return { defaultSpecialties: [], bioTemplate: () => "" };
  return TYPE_DEFAULTS[typeId] ?? {
    defaultSpecialties: [],
    bioTemplate: (v) => `${(findChild(typeId)?.child.label ?? "Talent")}${v.homeBase ? ` based in ${v.homeBase}` : ""}.`,
  };
}

// Common language combos — one tap adds 2-3 languages with sensible levels.

export const LANGUAGE_PRESETS: { id: string; label: string; langs: string[] }[] = [
  { id: "en-es",    label: "EN + ES",       langs: ["English", "Spanish"] },
  { id: "en-fr",    label: "EN + FR",       langs: ["English", "French"] },
  { id: "en-it",    label: "EN + IT",       langs: ["English", "Italian"] },
  { id: "en-de",    label: "EN + DE",       langs: ["English", "German"] },
  { id: "en-fr-it", label: "EN + FR + IT",  langs: ["English", "French", "Italian"] },
  { id: "rivmaya",  label: "Riviera Maya",  langs: ["Spanish", "English", "French"] },
];

// Section IDs — used by mobile tab nav and the active-section accordion.
// Identity is the first section ever — name, pronouns, gender, DOB.

export const PROFILE_SECTIONS = [
  "identity", "services", "location", "logistics", "media", "albums", "polaroids",
  "about", "profile_fields",
  "physical", "wardrobe", "details", "rates", "availability",
  "refinement", "credits", "limits", "files",
  "social_proof", "verifications", "agency_fields", "admin",
] as const;

export type ProfileSectionId = typeof PROFILE_SECTIONS[number] | "";


export const SECTION_META: Record<Exclude<ProfileSectionId, "">, { label: string; emoji: string }> = {
  identity:      { label: "Identity",      emoji: "👤" },
  services:      { label: "Services",      emoji: "🎯" },
  location:      { label: "Location",      emoji: "📍" },
  logistics:     { label: "Logistics",     emoji: "🧳" },
  media:         { label: "Media",         emoji: "📷" },
  albums:        { label: "Albums",        emoji: "🗂" },
  polaroids:     { label: "Polaroids",     emoji: "🪪" },
  about:         { label: "About",         emoji: "✏️" },
  profile_fields:{ label: "Details", emoji: "🧬" },
  physical:      { label: "Physical",      emoji: "📐" },
  wardrobe:      { label: "Wardrobe",      emoji: "👗" },
  details:       { label: "Details",       emoji: "📋" },
  rates:         { label: "Rates",         emoji: "💶" },
  availability:  { label: "Availability",  emoji: "📅" },
  refinement:    { label: "Extra details",  emoji: "✦" },
  credits:       { label: "Credits",       emoji: "🏆" },
  limits:        { label: "Restrictions",  emoji: "⊘" },
  files:         { label: "Files",         emoji: "📎" },
  social_proof:  { label: "Past clients",  emoji: "⭐" },
  verifications: { label: "Trust",         emoji: "🛡" },
  agency_fields: { label: "Agency Fields", emoji: "🧬" },
  admin:         { label: "Admin",         emoji: "🔒" },
};


export function ageString(d: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// ════════════════════════════════════════════════════════════════════
// Profile state — single reducer to support undo/redo (Phase 4 +20).
// ════════════════════════════════════════════════════════════════════


export type ProfileState = {
  // Identity (Phase 4 +30 — separated from Talent Type per spec)
  identity: ProfileIdentity;

  // Display
  stageName: string;
  tagline: string;
  bios: LocaleBio[];
  bioActiveLocale: LocaleCode;
  bioTone: BioTone;
  personality: Personality;

  // Services
  primaryType: string | null;
  secondaryTypes: string[];
  /** What the talent is growing into. Surfaced as "open to grow" in Discover. */
  aspirations: string[];
  specialties: string[];

  // Location
  serviceArea: ServiceArea;
  /** Seasonal "I'm here X months a year" windows. */
  seasonalWindows: SeasonalWindow[];

  // Media
  /** Albums now carry per-photo metadata (tag, alt, caption). */
  albumsPro: { id: string; name: string; items: PhotoMeta[] }[];
  activeAlbumId: string;
  videoLinks: string[];
  /** Per-album short video clip (15s preview). */
  videoClip: VideoSlot | null;
  /** 30-sec hello reel — top-of-profile intro. */
  helloReel: VideoSlot | null;
  /** Industry-standard polaroid set: front / side / back / smile / no makeup. */
  polaroids: { id: string; angle: string; url: string | null; mediaAssetId?: string | null }[];

  // Files — work documents (W-8BEN, NDA, model release, certifications, …).
  // When `storagePath` is set, the file lives in the private media-originals
  // bucket and can be downloaded via actionGetTalentDocumentSignedUrl.
  files: { id: string; name: string; kind: string; sizeBytes?: number; uploadedAt: string; storagePath?: string; bucketId?: string; mimeType?: string; uploading?: boolean }[];

  // Limits — hard/soft constraints (no nudity, no fur, etc.)
  limits: { id: string; category: string; label: string; enforcement: "hard" | "soft" }[];

  // Credits — past work (campaigns, editorials, runway, lookbooks)
  credits: { id: string; year: string; brand: string; type: string; credit?: string; role?: string; pinned?: boolean }[];

  // Type-specific dynamic fields
  dynFields: Record<string, string | string[]>;
  /** Per-dyn-field visibility overrides keyed by field id. Engine
   *  reads this per channel; falls back to RegField.defaultVisibility
   *  when not set. */
  dynFieldVisibility: Record<string, ReadonlyArray<"public" | "agency" | "private">>;

  // Rates (per-unit + packages + travel/lodging toggles)
  rates: ProfileRate[];
  /** Channel-tier overrides — direct vs agency vs hub. */
  rateTiers: { typeId: string; tier: "direct" | "agency" | "hub"; amount: number; currency: string; unit: RateUnit }[];
  packageRates: PackageRate[];
  travelIncluded: boolean;
  lodgingIncluded: boolean;
  askForQuote: boolean;

  // Availability
  availability: AvailabilityCell[];
  recurring: RecurringPattern;
  vacation: VacationWindow | null;

  // Languages
  languages: ProfileLanguage[];

  // Refinement (skills with proficiency + contexts)
  skillEntries: SkillEntry[];
  contexts: string[];

  // Social proof
  pastClients: PastClient[];

  // Verification
  verifications: Verifications;

  // Admin
  profileStatus: "draft" | "pending" | "published" | "hidden";
  featureInDirectory: boolean;
  /** Talent master switch for cross-tenant Discover catalog. Distinct from
   *  `featureInDirectory` which is the per-roster admin "boost on Discover"
   *  flag. See web/docs/discover-and-unified-inquiry-2026-05-14.md. */
  isDiscoverable: boolean;
  internalNotes: string;
  /** Emergency contact — masked on public, visible during active
   *  bookings only. Stored on the profile because it's tied to the
   *  talent's identity, not workspace settings. */
  emergencyContact: { name: string; relation: string; phone: string };
  /** Rate card visibility — public / agency-only / on-request.
   *  Drives whether clients see numbers on the public profile or
   *  have to inquire through the agency. */
  rateCardVisibility: "public" | "agency-only" | "on-request";
  /** Field paths the agency has locked from talent self-edit. */
  fieldLocks: FieldLockPath[];
  /** Step 7 — per-lock reason text. Sparse map keyed by path; an
   *  entry without a reason renders an editable "(no reason)" prompt
   *  in the locks-overview panel and shows nothing in-context. */
  fieldLockReasons: Record<string, string>;
};


export type ProfileAction =
  | { type: "PATCH"; patch: Partial<ProfileState> }
  | { type: "TOGGLE_SET"; field: "secondaryTypes" | "specialties" | "contexts" | "aspirations"; value: string }
  | { type: "SET_SKILL"; skillId: string; proficiency: SkillProficiency | null }
  | { type: "RESET"; state: ProfileState };


export function profileReducer(state: ProfileState, action: ProfileAction): ProfileState {
  switch (action.type) {
    case "PATCH":
      return { ...state, ...action.patch };
    case "TOGGLE_SET": {
      const cur = state[action.field];
      const next = cur.includes(action.value)
        ? cur.filter(x => x !== action.value)
        : [...cur, action.value];
      return { ...state, [action.field]: next };
    }
    case "SET_SKILL": {
      // proficiency=null removes the skill; otherwise upserts the entry.
      const cur = state.skillEntries;
      const without = cur.filter(s => s.skillId !== action.skillId);
      if (action.proficiency === null) return { ...state, skillEntries: without };
      return { ...state, skillEntries: [...without, { skillId: action.skillId, proficiency: action.proficiency }] };
    }
    case "RESET":
      return action.state;
    default:
      return state;
  }
}


export function makeInitialProfileState(
  payload: ProfileShellPayload,
  isSelf: boolean,
  bridgeProfile: BridgeTalentSelfProfile | null = null,
): ProfileState {
  const seed = payload.seed ?? {};
  // Phase B — resolve canonical profile by talentId. When the drawer
  // is opened from a roster row click, payload.talentId is set; we
  // look up the full profile in TALENT_PROFILES_BY_ID. Falls back to
  // MY_TALENT_PROFILE for legacy callers that don't pass talentId
  // (registration wizard, brand-new "create" flow).
  // For real DB talents (UUID not in the prototype fixture map) we want empty
  // defaults — DB hydration via getTalentProfileEditorData fills the real values
  // on open. Falling back to MY_TALENT_PROFILE makes fresh talents display
  // Marta's measurements / specialties / credits until the user overwrites them.
  const isFixtureTalent = !!payload.talentId && payload.talentId in TALENT_PROFILES_BY_ID;
  const canonicalProfile: MyTalentProfile = isFixtureTalent
    ? getProfileById(payload.talentId!)
    : MY_TALENT_PROFILE;
  // #4 — Hydrate from the shared draft store. QuickAdd writes here on
  // every input; the Shell reads on mount. So first/last/email/phone/
  // photo flow through cleanly without prop-drilling each field through
  // the seed payload.
  const draft: ProfileDraft = !isSelf && payload.mode === "create"
    ? readProfileDraft("default")
    : {};
  const items: PhotoMeta[] = (() => {
    if (draft.photoUrl) {
      return [{ url: draft.photoUrl, tag: "headshot" as const }];
    }
    const photos = Array.from({ length: seed.photoCount ?? 0 })
      .map((_, i) => ({
        url: `https://i.pravatar.cc/300?img=${(i * 11 + 5) % 70}`,
        tag: i === 0 ? ("headshot" as const) : i === 1 ? ("full_body" as const) : ("portfolio" as const),
      })) as PhotoMeta[];
    // Hydrate portfolio videos from the canonical profile (any talent,
    // not just Marta). Drawer opens with motion work already present
    // when the talent has any. Replaces the old name-matching path.
    const hasCanonical = !!payload.talentId;
    if (hasCanonical && canonicalProfile.portfolioVideos) {
      for (const v of canonicalProfile.portfolioVideos) {
        const parsed = parseVideoUrl(v.url);
        if (!parsed) continue;
        photos.push({
          url: parsed.thumbUrl ?? "",
          videoUrl: v.url,
          videoProvider: parsed.provider,
          videoDurationSec: v.durationSec,
          caption: v.caption,
        });
      }
    }
    return photos;
  })();
  const verifications: Verifications = {
    idSubmitted: true,
    payoutConnected: true,
    bookingsCount: isSelf ? 3 : 1,
    hasFundedClient: false,
    emailVerified: !!draft.email,
    phoneVerified: false,
  };
  // Display name resolution. Priority order:
  //   1. explicit seed.stageName (registration wizard)
  //   2. shared QuickAdd draft (admin → "Add talent" flow)
  //   3. real bridge profile displayName (talent self-edit on real DB row)
  //   4. fixture canonical profile name (prototype mock talents)
  //   5. fallback "Sofia Lupo"
  // Without #3 the drawer fell back to canonicalProfile.name = MY_TALENT_PROFILE.name
  // for any non-fixture talent — i.e. every real DB talent — and pre-filled
  // their identity field with "Marta Reyes".
  const draftDisplay = draft.displayName?.trim()
    || `${draft.firstName?.trim() ?? ""} ${draft.lastName?.trim() ?? ""}`.trim();
  const stageName = seed.stageName
    ?? (draftDisplay
      || (bridgeProfile && !isFixtureTalent ? bridgeProfile.displayName : null)
      || (payload.talentId ? canonicalProfile.name : "Sofia Lupo"));
  // Bridge MY_TALENT_PROFILE → ProfileState for the canonical demo
  // talent (Marta). When the workspace admin opens "her" or the talent
  // Phase B — bridge canonical profile → ProfileState. Works for any
  // talent whose record exists in TALENT_PROFILES_BY_ID, not just
  // Marta. Identity by `payload.talentId` (no name matching). Falls
  // back to empty defaults for fresh `create` mode.
  const hasCanonical = !!payload.talentId && payload.mode !== "create";
  // Only read travel/passport fixture data from the mock profile if this is
  // actually a fixture talent — otherwise these values come from the DB.
  const travelSeedPassports = isFixtureTalent ? (canonicalProfile.travel?.passports ?? []) : [];
  const travelSeedAuth = isFixtureTalent ? (canonicalProfile.travel?.workAuth ?? []) : [];
  const bridgeFromMyTalent = isFixtureTalent ? {
    nationality:    seed.nationality    ?? (travelSeedPassports[0] ?? ""),
    homeCountry:    seed.homeCountry    ?? (travelSeedPassports[0] ?? ""),
    responseTime:   seed.responseTime   ?? "4h" as const,
    passport:       seed.passport       ?? (travelSeedPassports.length ? "valid" as const : undefined),
    driversLicense: seed.driversLicense ?? "standard" as const,
    ownsVehicle:    seed.ownsVehicle    ?? false,
    workEligibility: seed.workEligibility ?? travelSeedAuth.map(w => w.split(" ")[0]),
    visaCountries:  seed.visaCountries  ?? [],
  } : {
    nationality:    seed.nationality    ?? "",
    homeCountry:    seed.homeCountry    ?? "",
    responseTime:   seed.responseTime,
    passport:       seed.passport,
    driversLicense: seed.driversLicense,
    ownsVehicle:    seed.ownsVehicle    ?? false,
    workEligibility: seed.workEligibility ?? [],
    visaCountries:  seed.visaCountries  ?? [],
  };
  return {
    identity: {
      stageName,
      firstName: "",
      lastName: "",
      legalName: "",
      pronouns: null,
      gender: null,
      dob: null,
      ageDisplay: "range",
      // New canonical fields — defaults are sensible, real seed data
      // hydrates via the bridge above when the shell opens an
      // existing talent.
      nationality: bridgeFromMyTalent.nationality,
      homeCountry: bridgeFromMyTalent.homeCountry,
      responseTime: bridgeFromMyTalent.responseTime,
      visibility: {
        legalName: ["private"],
        pronouns: ["public", "agency"],
        gender: ["agency"],
        dob: ["private"],
      },
    },
    stageName,
    tagline: "",
    bios: [{ locale: "en", text: seed.bio ?? "" }],
    bioActiveLocale: "en",
    bioTone: "professional",
    personality: { loves: [], avoids: [] },
    // Phase B/C — primary + secondary type from canonical profile
    // when available. The drawer's dynamic-fields renderer iterates
    // [primaryType, ...secondaryTypes] so multi-role profiles see
    // every relevant section.
    primaryType: seed.primaryType ?? draft.primaryType ?? (isFixtureTalent ? canonicalProfile.primaryType : null),
    secondaryTypes: seed.secondaryTypes ?? (isFixtureTalent ? [...canonicalProfile.secondaryTypes] : []),
    aspirations: [],
    specialties: seed.specialties ?? (isFixtureTalent ? [...canonicalProfile.specialties] : []),
    serviceArea: {
      // Same priority logic as stageName: bridge wins over fixture for
      // real talents so QA admin's drawer doesn't open with "Madrid".
      homeBase: seed.homeBase
        ?? draft.homeBase
        ?? (bridgeProfile && !isFixtureTalent ? (bridgeProfile.homeCity ?? "") : ""),
      serviceCities: seed.serviceCities ?? [],
      travelKm: seed.travelKm ?? 50,
      travelFee: false,
      remoteOnly: false,
      // New travel & work-eligibility fields. Empty on fresh creates;
      // seeded talents get populated via the bridge above.
      passport: bridgeFromMyTalent.passport,
      driversLicense: bridgeFromMyTalent.driversLicense,
      ownsVehicle: bridgeFromMyTalent.ownsVehicle,
      workEligibility: bridgeFromMyTalent.workEligibility,
      visaCountries: bridgeFromMyTalent.visaCountries,
    },
    seasonalWindows: [],
    albumsPro: [{ id: "main", name: "Main", items }],
    activeAlbumId: "main",
    videoLinks: [],
    videoClip: null,
    helloReel: null,
    polaroids: [
      { id: "p-front",    angle: "Front",     url: null },
      { id: "p-side",     angle: "Side",      url: null },
      { id: "p-back",     angle: "Back",      url: null },
      { id: "p-smile",    angle: "Smile",     url: null },
      { id: "p-no-makeup",angle: "No makeup", url: null },
    ],
    files: [],
    limits: [],
    credits: [],
    // Phase B — hydrate dynFields from the canonical profile's
    // structured fields (measurements + wardrobe) so opening any
    // talent's drawer shows their actual data, not blanks. Maps
    // MyTalentProfile.measurements.* → dynFields keys that match
    // the TAXONOMY_FIELDS["models"] field ids.
    dynFields: seed.fields ?? (isFixtureTalent ? {
      height: canonicalProfile.measurements.heightImperial,
      weight: canonicalProfile.measurements.weight ?? "",
      bust: canonicalProfile.measurements.bust,
      waist: canonicalProfile.measurements.waist,
      hips: canonicalProfile.measurements.hips,
      inseam: canonicalProfile.measurements.inseam ?? "",
      shoe: canonicalProfile.measurements.shoeEU,
      shoe_us: canonicalProfile.measurements.shoeUS,
      shoe_uk: canonicalProfile.measurements.shoeUK,
      dress_size: canonicalProfile.measurements.dress,
      suit_size: canonicalProfile.measurements.suit ?? "",
      hair: canonicalProfile.measurements.hairColor,
      hair_length: canonicalProfile.measurements.hairLength === "long" ? "Long"
        : canonicalProfile.measurements.hairLength === "short" ? "Short"
        : canonicalProfile.measurements.hairLength === "medium" ? "Medium"
        : "",
      eyes: canonicalProfile.measurements.eyeColor,
      skin_tone: canonicalProfile.measurements.skinTone,
      tattoos: canonicalProfile.measurements.hasTattoos
        ? (canonicalProfile.measurements.tattoosNote?.includes("cover") ? "Small (coverable)" : "Medium (visible)")
        : "None",
      tattoos_note: canonicalProfile.measurements.tattoosNote ?? "",
      piercings: canonicalProfile.measurements.hasPiercings
        ? (canonicalProfile.measurements.piercingsNote?.includes("Lobes") ? "Ears only" : "Face / body")
        : "None",
    } as Record<string, string | string[]> : {}),
    dynFieldVisibility: {},
    rates: [],
    rateTiers: [],
    packageRates: [],
    travelIncluded: false,
    lodgingIncluded: false,
    askForQuote: false,
    availability: [],
    recurring: { kind: "none" },
    vacation: null,
    // Languages: ProfileLanguage uses "conversational" while TalentLanguage
    // uses "intermediate". Map between them on hydrate.
    languages: seed.languages ?? (hasCanonical
      ? canonicalProfile.languages.map(l => ({
          language: l.language,
          level: (l.level === "intermediate" ? "conversational" : l.level) as ProfileLanguage["level"],
        }))
      : []),
    skillEntries: [],
    contexts: [],
    pastClients: [],
    verifications,
    // Default profile status. Self-edit drawer used to assume "published"
    // (matched the demo Marta who's already live), but that's wrong for a
    // freshly-provisioned talent — their workflow_status is "draft" until
    // they actually publish. Read the real value from the bridge when
    // available; fall back to the legacy default for fixture / standalone
    // demo mode.
    profileStatus:
      bridgeProfile?.workflowStatus === "published" || bridgeProfile?.workflowStatus === "approved"
        ? "published"
        : bridgeProfile?.workflowStatus === "pending" || bridgeProfile?.workflowStatus === "submitted" || bridgeProfile?.workflowStatus === "under_review"
        ? "pending"
        : bridgeProfile?.workflowStatus === "hidden" || bridgeProfile?.workflowStatus === "archived"
        ? "hidden"
        : bridgeProfile?.workflowStatus === "invited" || bridgeProfile?.workflowStatus === "draft"
        ? "draft"
        : (isSelf ? "published" : "draft"),
    featureInDirectory: false,
    isDiscoverable: false,
    internalNotes: "",
    // Bridge from canonical profile's emergencyContact when known.
    // Empty defaults for new profiles. No more name-matching.
    emergencyContact: hasCanonical
      ? { ...canonicalProfile.emergencyContact }
      : { name: "", relation: "", phone: "" },
    rateCardVisibility: hasCanonical
      ? canonicalProfile.rateCard.visibility
      : "agency-only",
    fieldLocks: [],
    fieldLockReasons: {},
  };
}

// ════════════════════════════════════════════════════════════════════
// Profile shell — main drawer
// ════════════════════════════════════════════════════════════════════

// P3 fix — StrictMode-proof hydration dedupe.
// React StrictMode (dev) double-invokes effects: mount→effect→cleanup
// →effect. The old `profileShellHydratedForRef` guard was nulled by the
// cleanup between the two invocations, so the loader fired TWICE per
// open. This module-level in-flight cache makes the 2nd invocation
// REUSE the first in-flight fetch (zero duplicate network calls) while
// the per-run `cancelled` flag still ensures the data is applied once.
// Entry is auto-evicted when both promises settle, so a genuine reopen
// after load refetches normally.

export type _HydrationInFlight = {
  media: ReturnType<typeof actionLoadTalentMediaBundle>;
  editor: ReturnType<typeof loadTalentProfileEditorData>;
};

export const _editorHydrationInFlight = new Map<string, _HydrationInFlight>();

export function _getEditorHydration(
  tid: string,
  isSelf: boolean,
): { entry: _HydrationInFlight; reused: boolean } {
  const existing = _editorHydrationInFlight.get(tid);
  if (existing) return { entry: existing, reused: true };
  const entry: _HydrationInFlight = {
    media: actionLoadTalentMediaBundle(tid),
    editor: loadTalentProfileEditorData({ talentProfileId: tid, isSelf }),
  };
  _editorHydrationInFlight.set(tid, entry);
  void Promise.allSettled([entry.media, entry.editor]).finally(() => {
    _editorHydrationInFlight.delete(tid);
  });
  return { entry, reused: false };
}

// P3-phase-2 — defer per-agency overrides behind a collapsed section.
// `SkillOverridesPanel` fetches getResolvedSkills + getAgencySkillOverrides
// ON MOUNT and shows "Loading skill overrides…". Mounting it inline on
// every Services/overview open made the Services view feel slow/technical
// and duplicated getResolvedSkills (SkillSlotPanel already fetches it).
// This wrapper keeps it OUT of the default Services view: collapsed by
// default, the panel only mounts (and only then fetches) when expanded.
// Behaviour is unchanged once opened. Narrow scope — no relabeling/
// restructuring of the rest of Services.

export function AdvancedAgencySettingsSection({
  talentProfileId,
}: {
  talentProfileId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: "0 24px", marginTop: 4 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`,
          background: open ? COLORS.surfaceAlt : "transparent",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONTS.body,
        }}
      >
        <span
          aria-hidden
          style={{ fontSize: 11, color: COLORS.inkMuted, width: 10 }}
        >
          {open ? "▾" : "▸"}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.ink,
            }}
          >
            Advanced agency settings
          </span>
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: COLORS.inkMuted,
              marginTop: 1,
            }}
          >
            Per-agency visibility, featured, display order & internal notes
          </span>
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <SkillOverridesPanel
            talentProfileId={talentProfileId}
            viewMode="admin"
          />
        </div>
      )}
    </div>
  );
}


export function ServicesEditor({
  allowedParents, primaryType, secondaryTypes, specialties, primaryRes, specialtyOptions,
  onPickPrimary, onClearPrimary, onToggleSecondary, onToggleSpecialty, hydrating,
}: {
  allowedParents: TaxonomyParent[];
  primaryType: string | null;
  secondaryTypes: string[];
  specialties: string[];
  primaryRes: { parent: TaxonomyParent; child: TaxonomyChild } | null;
  specialtyOptions: { typeId: string; typeLabel: string; items: string[] }[];
  onPickPrimary: (id: string) => void;
  onClearPrimary: () => void;
  onToggleSecondary: (id: string) => void;
  onToggleSpecialty: (s: string) => void;
  /** True while the talent profile is still hydrating from the server.
   *  Prevents flashing the "pick a primary type" grid (false "Not set")
   *  for a talent who actually has a persisted type still loading. */
  hydrating?: boolean;
}) {
  // 2026 — when a primary role is picked, default the "Also bookable as"
  // wall to siblings within the same parent_category. The cross-category
  // chips (e.g. picking a Performer when the primary is a Model) live
  // behind an explicit toggle so the picker isn't 80 random chips at once.
  const [showOtherCategories, setShowOtherCategories] = useState(false);
  const primaryParentId = primaryRes?.parent.id ?? null;
  const sameCategoryChildren = primaryParentId
    ? allowedParents.find(p => p.id === primaryParentId)?.children ?? []
    : allowedParents.flatMap(p => p.children);
  const otherCategories = primaryParentId
    ? allowedParents.filter(p => p.id !== primaryParentId)
    : [];
  return (
    <>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 4 }}>
          Booked as
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkDim, marginBottom: 8, lineHeight: 1.4 }}>
          What clients book this person as. Pick the main one.
        </div>
        {primaryRes ? (
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 12px", borderRadius: 999,
              background: "rgba(15,79,62,0.08)", color: COLORS.accentDeep,
              border: `1.5px solid ${COLORS.accent}`,
              fontSize: 13, fontWeight: 600,
            }}>
              <span style={{ fontSize: 14 }}>{primaryRes.parent.emoji}</span>
              {primaryRes.child.label}
              <button type="button" onClick={onClearPrimary} aria-label="Change main service"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: COLORS.accentDeep, fontSize: 14, lineHeight: 1, fontWeight: 700, padding: 0 }}>×</button>
            </div>
            {primaryRes.child.specialties && primaryRes.child.specialties.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginBottom: 4 }}>
                  Specialties under {primaryRes.child.label}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {primaryRes.child.specialties.map(s => {
                    const active = specialties.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => onToggleSpecialty(s)} style={{
                        padding: "5px 10px", borderRadius: 999,
                        border: `1px solid ${active ? COLORS.indigo : COLORS.borderSoft}`,
                        background: active ? COLORS.indigoSoft : "#fff",
                        color: active ? COLORS.indigoDeep : COLORS.ink,
                        fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                        fontFamily: FONTS.body,
                      }}>{s}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : hydrating ? (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 999,
            background: "rgba(11,11,13,0.04)", color: COLORS.inkMuted,
            border: `1px solid ${COLORS.borderSoft}`,
            fontSize: 12.5, fontWeight: 500, fontFamily: FONTS.body,
          }}>
            <span aria-hidden style={{
              width: 8, height: 8, borderRadius: "50%",
              background: COLORS.inkDim, display: "inline-block", opacity: 0.5,
            }} />
            Loading current role…
          </div>
        ) : (
          <PrimaryTalentTypeGrid parents={allowedParents} selected={primaryType} onPick={onPickPrimary} />
        )}
      </div>
      {primaryType && (
        <div style={{
          marginTop: 14, paddingTop: 14,
          borderTop: `1px solid ${COLORS.borderSoft}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 4 }}>
            Also bookable as
            {primaryRes && (
              <span style={{ marginLeft: 6, fontWeight: 500, color: COLORS.inkDim, letterSpacing: 0 }}>
                · within {shortParentLabel(primaryRes.parent)} · optional
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkDim, marginBottom: 8, lineHeight: 1.4 }}>
            Other things this person can be booked as. Pick any that apply.
          </div>
          <SiblingTopNPicker
            children={sameCategoryChildren}
            selected={secondaryTypes}
            onToggle={onToggleSecondary}
            parentLabel={primaryRes ? shortParentLabel(primaryRes.parent) : "this category"}
            excludeId={primaryType ?? null}
          />
          {otherCategories.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button type="button"
                onClick={() => setShowOtherCategories(v => !v)}
                aria-expanded={showOtherCategories}
                style={{
                  padding: "6px 12px", borderRadius: 999,
                  border: `1px dashed ${COLORS.border}`, background: "transparent",
                  color: COLORS.inkMuted, fontSize: 11.5, fontWeight: 500,
                  cursor: "pointer", fontFamily: FONTS.body,
                }}>
                {showOtherCategories ? "– Hide other categories" : `+ Also bookable in another category (${otherCategories.length})`}
              </button>
              {showOtherCategories && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
                  {otherCategories.map(p => (
                    <div key={p.id}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 6 }}>
                        <span style={{ marginRight: 4 }}>{p.emoji}</span>{shortParentLabel(p)}
                      </div>
                      <SiblingTopNPicker
                        children={p.children}
                        selected={secondaryTypes}
                        onToggle={onToggleSecondary}
                        parentLabel={shortParentLabel(p)}
                        excludeId={primaryType ?? null}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {specialtyOptions.filter(g => g.typeId !== primaryType).length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 6 }}>
            More specialties
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {specialtyOptions.filter(g => g.typeId !== primaryType).map(g => (
              <div key={g.typeId}>
                <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginBottom: 4 }}>Under {g.typeLabel}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {g.items.map(s => {
                    const active = specialties.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => onToggleSpecialty(s)} style={{
                        padding: "5px 10px", borderRadius: 999,
                        border: `1px solid ${active ? COLORS.indigo : COLORS.borderSoft}`,
                        background: active ? COLORS.indigoSoft : "#fff",
                        color: active ? COLORS.indigoDeep : COLORS.ink,
                        fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                        fontFamily: FONTS.body,
                      }}>{s}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Real photo gallery with file-picker, drag-reorder, crop modal ────

export type BiosEditorProps = {
  bios: LocaleBio[];
  activeLocale: LocaleCode;
  onActivateLocale: (l: LocaleCode) => void;
  onChange: (b: LocaleBio[]) => void;
  onRegenerate: () => void;
  primaryLabel?: string;
};

export const BiosEditor = React.memo(({ bios, activeLocale, onActivateLocale, onChange, onRegenerate, primaryLabel }: BiosEditorProps) => {
  const ALL_LOCALES: LocaleCode[] = ["en", "es", "fr", "it", "pt", "de"];
  const ensureLocale = (l: LocaleCode) => {
    if (bios.some(b => b.locale === l)) return;
    onChange([...bios, { locale: l, text: "" }]);
  };
  const setText = (l: LocaleCode, t: string) =>
    onChange(bios.map(b => b.locale === l ? { ...b, text: t } : b));
  const remove = (l: LocaleCode) => {
    if (l === "en") return; // english is the canonical
    const next = bios.filter(b => b.locale !== l);
    onChange(next);
    if (activeLocale === l) onActivateLocale("en");
  };
  const active = bios.find(b => b.locale === activeLocale) ?? bios[0];
  const charCount = active?.text.length ?? 0;
  const limit = 280;

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {bios.map(b => {
          const isActive = b.locale === activeLocale;
          return (
            <button key={b.locale} type="button" onClick={() => onActivateLocale(b.locale)} style={{
              padding: "5px 11px", borderRadius: 999,
              border: `1.5px solid ${isActive ? COLORS.accent : COLORS.borderSoft}`,
              background: isActive ? "rgba(15,79,62,0.08)" : "#fff",
              color: isActive ? COLORS.accentDeep : COLORS.ink,
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {LOCALE_LABEL[b.locale]}
              {b.locale !== "en" && (
                <span onClick={(e) => { e.stopPropagation(); remove(b.locale); }}
                  style={{ color: COLORS.inkMuted, fontSize: 12, lineHeight: 1, fontWeight: 700, cursor: "pointer" }}>×</span>
              )}
            </button>
          );
        })}
        <select value="" onChange={(e) => { if (e.target.value) ensureLocale(e.target.value as LocaleCode); }} style={{
          padding: "5px 10px", borderRadius: 999,
          border: `1px dashed ${COLORS.border}`, background: "transparent",
          fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, cursor: "pointer",
        }}>
          <option value="">+ Add language</option>
          {ALL_LOCALES.filter(l => !bios.some(b => b.locale === l)).map(l => (
            <option key={l} value={l}>{LOCALE_LABEL[l]}</option>
          ))}
        </select>
      </div>
      <textarea
        data-pshell-field="bio"
        value={active?.text ?? ""}
        onChange={(e) => setText(activeLocale, e.target.value)}
        placeholder={`Bio in ${LOCALE_LABEL[activeLocale]}…`}
        rows={4}
        maxLength={limit}
        style={{
          width: "100%", boxSizing: "border-box", padding: "10px 12px",
          borderRadius: 10, border: `1px solid ${COLORS.border}`,
          fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={onRegenerate} disabled={!primaryLabel} style={{
            padding: "5px 11px", borderRadius: 999,
            background: "transparent", border: `1px dashed ${COLORS.border}`,
            color: primaryLabel ? COLORS.inkMuted : COLORS.inkDim,
            fontSize: 11, fontWeight: 500,
            cursor: primaryLabel ? "pointer" : "default",
            fontFamily: FONTS.body,
          }}>↺ {primaryLabel ? `Regenerate from ${primaryLabel}` : "Pick a Talent Type to regenerate"}</button>
          {/* Audit fix #7 — paste-from-clipboard for talent who already
              wrote a bio in another tool (Notes, Notion, Instagram bio).
              Reads navigator.clipboard, falls back silently if blocked.
              Trims to the locale's char limit so we don't blow past it. */}
          <button
            type="button"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (!text) return;
                setText(activeLocale, text.slice(0, limit));
              } catch {
                // Browser blocked — silent. Talent can paste manually.
              }
            }}
            style={{
              padding: "5px 11px", borderRadius: 999,
              background: "transparent", border: `1px dashed ${COLORS.border}`,
              color: COLORS.inkMuted,
              fontSize: 11, fontWeight: 500,
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
            title="Paste a bio you already wrote elsewhere"
          >📋 Paste from clipboard</button>
        </div>
        <span style={{ fontSize: 10.5, color: charCount > limit * 0.9 ? COLORS.amberDeep : COLORS.inkDim }}>
          {charCount} / {limit}
        </span>
      </div>
    </div>
  );
});

// ── Rates editor ─────────────────────────────────────────────────────

export type RatesEditorProps = {
  rates: ProfileRate[];
  selectedTypeIds: string[];
  onChange: (r: ProfileRate[]) => void;
};

export const RatesEditor = React.memo(({ rates, selectedTypeIds, onChange }: RatesEditorProps) => {
  if (selectedTypeIds.length === 0) {
    return (
      <div style={{
        padding: 14, borderRadius: 10,
        background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`,
        fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body, lineHeight: 1.5,
      }}>
        Pick a Talent Type in Services first. Each type gets its own rate.
      </div>
    );
  }

  // Ensure a row exists for each selected type
  const rateRows = selectedTypeIds.map(tid => {
    const child = findChild(tid);
    if (!child) return null;
    const cur = rates.find(r => r.typeId === tid);
    if (cur) return { ...cur, parent: child.parent, child: child.child };
    const unit = TYPE_RATE_UNIT[child.parent.id];
    return { typeId: tid, amount: 0, currency: "EUR", unit, parent: child.parent, child: child.child };
  }).filter(Boolean) as (ProfileRate & { parent: TaxonomyParent; child: TaxonomyChild })[];

  const updateRow = (typeId: string, patch: Partial<ProfileRate>) => {
    const exists = rates.some(r => r.typeId === typeId);
    if (exists) {
      onChange(rates.map(r => r.typeId === typeId ? { ...r, ...patch } : r));
    } else {
      const child = findChild(typeId);
      if (!child) return;
      const unit = TYPE_RATE_UNIT[child.parent.id];
      onChange([...rates, { typeId, amount: 0, currency: "EUR", unit, ...patch } as ProfileRate]);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {rateRows.map(r => (
        <div key={r.typeId} style={{
          padding: 12, borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>{r.parent.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{r.child.label}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={r.currency} onChange={(e) => updateRow(r.typeId, { currency: e.target.value })} style={{
              padding: "9px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
              fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}>
              <option value="EUR">€ EUR</option>
              <option value="USD">$ USD</option>
              <option value="GBP">£ GBP</option>
              <option value="MXN">$ MXN</option>
            </select>
            <input type="number" min={0} value={r.amount}
              onChange={(e) => updateRow(r.typeId, { amount: Number(e.target.value) })}
              placeholder="0"
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 8,
                border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 13, color: COLORS.ink, outline: "none",
              }}
            />
            <select value={r.unit} onChange={(e) => updateRow(r.typeId, { unit: e.target.value as RateUnit })} style={{
              padding: "9px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
              fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}>
              <option value="hour">/ hour</option>
              <option value="day">/ day</option>
              <option value="set">/ set</option>
              <option value="event">/ event</option>
              <option value="session">/ session</option>
              <option value="month">/ month</option>
            </select>
          </div>
          <input type="text" value={r.conditions ?? ""}
            onChange={(e) => updateRow(r.typeId, { conditions: e.target.value })}
            placeholder="Conditions — e.g. min 4 hours, + tax, weekend uplift"
            style={{
              width: "100%", boxSizing: "border-box", marginTop: 6,
              padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 12, color: COLORS.ink, outline: "none",
            }}
          />
        </div>
      ))}
    </div>
  );
});

// ── Availability mini-grid (4 weeks) ────────────────────────────────

export function AvailabilityGrid({ cells, onToggle }: {
  cells: AvailabilityCell[];
  onToggle: (date: string) => void;
}) {
  // Build 28 days starting from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { date: string; label: string; isToday: boolean }[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: String(d.getDate()),
      isToday: i === 0,
    });
  }
  const cellMap = new Map(cells.map(c => [c.date, c.status]));

  const colorFor = (s?: AvailabilityStatus) => {
    if (s === "busy")    return { bg: COLORS.amberSoft,    fg: COLORS.amberDeep,   border: COLORS.amberDeep };
    if (s === "blocked") return { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink,        border: "rgba(11,11,13,0.20)" };
    return { bg: COLORS.successSoft, fg: COLORS.successDeep, border: "transparent" };
  };

  const counts = { open: 0, busy: 0, blocked: 0 };
  days.forEach(d => {
    const s = cellMap.get(d.date) ?? "open";
    counts[s] += 1;
  });

  const dowLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const startDow = today.getDay();

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", gap: 10, fontSize: 11, color: COLORS.inkMuted, marginBottom: 8 }}>
        <Legend dotColor={COLORS.green} label={`Open · ${counts.open}`} />
        <Legend dotColor={COLORS.amberDeep} label={`Busy · ${counts.busy}`} />
        <Legend dotColor="rgba(11,11,13,0.4)" label={`Blocked · ${counts.blocked}`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {dowLabels.map((d, i) => (
          <div key={i} style={{
            fontSize: 9.5, fontWeight: 600, color: COLORS.inkDim, textAlign: "center", letterSpacing: 0.4,
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map(d => {
          const s = cellMap.get(d.date) ?? "open";
          const c = colorFor(s);
          return (
            <button key={d.date} type="button" onClick={() => onToggle(d.date)} style={{
              aspectRatio: "1 / 1", borderRadius: 8,
              background: c.bg,
              border: d.isToday ? `2px solid ${COLORS.accent}` : `1px solid ${c.border}`,
              color: c.fg, cursor: "pointer",
              fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: FONTS.body,
            }}>{d.label}</button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 8, lineHeight: 1.4 }}>
        Tap a day to cycle: open → busy → blocked → open. Today highlighted in green.
      </div>
    </div>
  );
}


export function Legend({ dotColor, label }: { dotColor: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
      {label}
    </span>
  );
}

// ── Verifications editor (drives trust badge) ────────────────────────

export function VerificationsEditor({ verifications, tier, onChange, isSelf }: {
  verifications: Verifications;
  tier: TrustTier;
  onChange: (v: Verifications) => void;
  isSelf: boolean;
}) {
  const tierMeta = TALENT_TRUST_META[tier];
  const rows: { id: keyof Verifications; label: string; helper: string; readonly?: boolean }[] = [
    { id: "emailVerified",    label: "Email verified",     helper: "We sent a confirm link." },
    { id: "phoneVerified",    label: "Phone verified",     helper: "SMS or call." },
    { id: "idSubmitted",      label: "ID submitted",       helper: "Passport or government ID. Required for Verified." },
    { id: "payoutConnected",  label: "Payout connected",   helper: "Bank or PSP linked. Required for Verified." },
    { id: "hasFundedClient",  label: "Funded-account client", helper: "At least one client on Tulala with funds on hold. Required for Gold." },
  ];

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{
        padding: 14, borderRadius: 12,
        background: tierMeta.bg, border: `1px solid ${tierMeta.fg}30`,
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tierMeta.fg, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 18 }}>{tierMeta.emoji}</span>
          {tierMeta.label}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
          {tierMeta.helper}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ToggleControl
              value={!!verifications[r.id]}
              onChange={(v) => onChange({ ...verifications, [r.id]: v })}
              label={r.label}
            />
            <span style={{ fontSize: 11, color: COLORS.inkDim, flex: 1 }}>{r.helper}</span>
          </div>
        ))}
      </div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 14, padding: "10px 12px", borderRadius: 10,
        background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`,
      }}>
        <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
          Bookings completed on Tulala
        </span>
        <input type="number" min={0} value={verifications.bookingsCount}
          onChange={(e) => onChange({ ...verifications, bookingsCount: Number(e.target.value) })}
          disabled={isSelf}
          style={{
            width: 70, padding: "6px 10px", borderRadius: 6,
            border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink,
            textAlign: "right", outline: "none",
            opacity: isSelf ? 0.6 : 1,
          }}
        />
      </div>
      {isSelf && (
        <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginTop: 8, lineHeight: 1.4 }}>
          Verification status is managed by Tulala — toggle when you complete each step.
        </div>
      )}
    </div>
  );
}

// ── Invite-claim banner ──────────────────────────────────────────────

export function InviteClaimBanner({ stageName, onResend, onTakeOver }: {
  stageName: string;
  onResend: () => void;
  onTakeOver: () => void;
}) {
  return (
    <div style={{
      padding: "10px 18px",
      background: COLORS.amberSoft,
      borderBottom: `1px solid ${COLORS.amberDeep}30`,
      display: "flex", alignItems: "center", gap: 10,
      fontFamily: FONTS.body, flexShrink: 0,
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: "50%",
        background: COLORS.amberDeep, color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, flexShrink: 0,
      }}>📧</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.amberDeep }}>
          Waiting on {stageName || "talent"} to claim this profile
        </div>
        <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
          Invite sent 3 days ago. They'll review, edit, and approve before publish.
        </div>
      </div>
      <button type="button" onClick={onResend} style={{
        padding: "6px 12px", borderRadius: 999,
        border: `1px solid ${COLORS.amberDeep}40`, background: "#fff",
        color: COLORS.amberDeep, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
      }}>Resend</button>
      <button type="button" onClick={onTakeOver} style={{
        padding: "6px 12px", borderRadius: 999, border: "none",
        background: COLORS.amberDeep, color: "#fff",
        fontSize: 11.5, fontWeight: 600, cursor: "pointer",
      }}>Take over</button>
    </div>
  );
}

// ── View-as-client modal ─────────────────────────────────────────────

export function ViewAsClientModal({ stageName, tagline, primaryRes, secondaryTypes, specialties, serviceArea, photos, languages, trust, bios, onClose }: {
  stageName: string;
  tagline: string;
  primaryRes: { parent: TaxonomyParent; child: TaxonomyChild } | null;
  secondaryTypes: string[];
  specialties: string[];
  serviceArea: ServiceArea;
  photos: string[];
  languages: ProfileLanguage[];
  trust: TrustTier;
  bios: LocaleBio[];
  onClose: () => void;
}) {
  // Phase E follow-up — public preview honors catalog visibility +
  // workspace overrides. A field renders ONLY if its catalog entry's
  // resolved `defaultVisibility` includes "public" (or `showInPublic`
  // is true). Talent + admin can flip these via Workspace Field
  // Settings; this modal updates immediately via the subscription.
  useWorkspaceFieldOverrideSubscription();
  const isPublic = (catalogId: string, fallback = false): boolean => {
    const entry = FIELD_CATALOG.find(f => f.id === catalogId);
    if (!entry) return fallback;
    const resolved = applyWorkspaceFieldOverride(entry, PROTO_TENANT_ID);
    if (!resolved.enabled) return false;
    if (resolved.showInPublic === true) return true;
    if (resolved.showInPublic === false) return false;
    return resolved.defaultVisibility?.includes("public") ?? fallback;
  };
  const showTagline       = isPublic("identity.tagline", true);
  const showSecondaries   = isPublic("identity.tagline", true); // grouped under tagline gating
  const showSpecialties   = true; // specialties live on talent type taxonomy, not a single catalog field
  const showBio           = isPublic("bios", true);
  const showLanguages     = isPublic("languages", true);
  const showLocation      = isPublic("serviceArea.homeBase", true);

  const trustMeta = TALENT_TRUST_META[trust];
  const enBio = bios.find(b => b.locale === "en")?.text ?? "";
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 220,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, maxHeight: "95vh",
        background: "#fff", borderRadius: "20px 20px 0 0",
        boxShadow: "0 -10px 40px -8px rgba(11,11,13,0.35)",
        overflowY: "auto",
      }}>
        <div style={{ position: "relative" }}>
          <div style={{
            aspectRatio: "4 / 3.5",
            background: photos[0]
              ? `url(${photos[0]}) center/cover, ${COLORS.surfaceAlt}`
              : COLORS.surfaceAlt,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: COLORS.inkMuted, fontSize: 36,
          }}>{!photos[0] && "📷"}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            position: "absolute", top: 12, right: 12,
            width: 34, height: 34, borderRadius: "50%",
            background: "rgba(255,255,255,0.92)", border: "none", cursor: "pointer",
            color: COLORS.ink, fontSize: 16, lineHeight: 1, fontWeight: 600,
          }}>✕</button>
          <div style={{
            position: "absolute", top: 12, left: 12,
            padding: "5px 12px", borderRadius: 999,
            background: "rgba(11,11,13,0.65)", color: "#fff",
            backdropFilter: "blur(8px)",
            fontSize: 10.5, fontWeight: 600,
          }}>👁 Client preview</div>
        </div>
        <div style={{ padding: "16px 22px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <h2 style={{
              margin: 0,
              fontFamily: FONTS.display, fontSize: 22, fontWeight: 700,
              color: COLORS.ink, letterSpacing: -0.3, lineHeight: 1.1,
            }}>{stageName || "Untitled profile"}</h2>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
              background: trustMeta.bg, color: trustMeta.fg,
            }}>{trustMeta.emoji} {trustMeta.label}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.accentDeep, marginBottom: 4 }}>
            {primaryRes ? primaryRes.child.label : "—"}
          </div>
          {showTagline && tagline && (
            <div style={{ fontSize: 12.5, color: COLORS.inkMuted, fontStyle: "italic", marginBottom: 6 }}>
              {tagline}
            </div>
          )}
          {showLocation && (
            <div style={{ fontSize: 12, color: COLORS.inkMuted, marginBottom: 10 }}>
              📍 {[serviceArea.homeBase, ...serviceArea.serviceCities].filter(Boolean).slice(0, 4).join(" · ") || "—"}
            </div>
          )}
          {showSecondaries && secondaryTypes.length > 0 && (
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 8 }}>
              Also available as: {secondaryTypes.map(id => findChild(id)?.child.label).filter(Boolean).join(" · ")}
            </div>
          )}
          {showSpecialties && specialties.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
              {specialties.slice(0, 8).map(s => (
                <span key={s} style={{
                  fontSize: 10.5, fontWeight: 500, padding: "2px 9px", borderRadius: 999,
                  background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                }}>{s}</span>
              ))}
            </div>
          )}
          {showBio && enBio && (
            <p style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.55, marginTop: 8, marginBottom: 12 }}>
              {enBio}
            </p>
          )}
          {photos.length > 1 && (
            <div style={{
              display: "flex", gap: 6, marginRight: -22, paddingRight: 22, marginTop: 4,
              overflowX: "auto", scrollbarWidth: "none",
            }}>
              {photos.slice(1, 8).map((p, i) => (
                <div key={i} style={{
                  flexShrink: 0,
                  width: 96, aspectRatio: "3 / 4", borderRadius: 8,
                  background: `url(${p}) center/cover, ${COLORS.surfaceAlt}`,
                }} />
              ))}
            </div>
          )}
          {showLanguages && languages.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 11.5, color: COLORS.inkMuted }}>
              <strong style={{ color: COLORS.ink }}>Languages — </strong>
              {languages.map(l => `${l.language} (${l.level})`).join(" · ")}
            </div>
          )}
        </div>
        <div style={{
          padding: "12px 22px max(14px, env(safe-area-inset-bottom)) 22px",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex", gap: 8, alignItems: "center",
        }}>
          <button type="button" onClick={onClose} style={{
            padding: "11px 16px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "#fff",
            color: COLORS.ink,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Close preview</button>
          <div style={{ flex: 1, padding: "12px 18px", borderRadius: 999, background: COLORS.fill, color: "#fff", fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>
            Send inquiry
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ProfileDiffModal — used by both:
//   #15 Admin diff view (admin reviews talent's pending self-edit)
//   #18 Talent preview (talent sees own changes before submitting)
// ════════════════════════════════════════════════════════════════════


export type DiffEntry = { fieldId: string; fieldLabel: string; before: string; after: string };


export function ProfileDiffModal({ entries, mode, onClose, onApproveAll, onRejectAll, onApplyDecisions, onSubmit }: {
  entries: DiffEntry[];
  mode: "admin" | "talent";
  onClose: () => void;
  onApproveAll?: () => void;
  onRejectAll?: () => void;
  /** Per-field commit. Keys are field ids; missing entries are treated as approved.
   *  Called when admin presses "Apply decisions". */
  onApplyDecisions?: (rejected: Set<string>) => void;
  onSubmit?: () => void;
}) {
  const isAdmin = mode === "admin";
  // Per-field decisions tracked internally. "rejected" means revert to `before`,
  // "approved" / undecided means accept talent's submission.
  const [decisions, setDecisions] = useState<Map<string, "approved" | "rejected">>(new Map());
  const setDecision = (id: string, d: "approved" | "rejected") =>
    setDecisions(m => { const next = new Map(m); next.set(id, d); return next; });
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 250,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, maxHeight: "92vh",
        background: "#fff", borderRadius: 16,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 30px 60px -10px rgba(11,11,13,0.4)",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 700,
              color: COLORS.ink, letterSpacing: -0.2,
            }}>{isAdmin ? "Review changes" : "What you've changed"}</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.4 }}>
              {entries.length === 0
                ? "No changes since the last published version."
                : `${entries.length} field${entries.length === 1 ? "" : "s"} ${isAdmin ? "modified by talent" : "you've changed"}.`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            width: 28, height: 28, borderRadius: 8, border: "none",
            background: "transparent", color: COLORS.inkMuted,
            fontSize: 14, lineHeight: 1, cursor: "pointer",
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {entries.length === 0 ? (
            <div style={{ padding: "30px 20px", textAlign: "center", fontSize: 13, color: COLORS.inkMuted }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
              All clear — nothing has changed.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {entries.map(e => (
                <div key={e.fieldId} style={{
                  padding: 12, borderRadius: 10,
                  background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`,
                }}>
                  <div style={{
                    display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
                    marginBottom: 6,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, textTransform: "uppercase" }}>
                      {e.fieldLabel}
                    </div>
                    {isAdmin && (() => {
                      const d = decisions.get(e.fieldId);
                      return (
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          <button type="button" onClick={() => setDecision(e.fieldId, "rejected")}
                            aria-pressed={d === "rejected"}
                            style={{
                              padding: "3px 9px", borderRadius: 999,
                              border: `1px solid ${d === "rejected" ? COLORS.red : "rgba(176,48,58,0.30)"}`,
                              background: d === "rejected" ? COLORS.red : "rgba(176,48,58,0.06)",
                              color: d === "rejected" ? "#fff" : COLORS.red,
                              fontSize: 10.5, fontWeight: 600, cursor: "pointer",
                          }}>✕ Reject</button>
                          <button type="button" onClick={() => setDecision(e.fieldId, "approved")}
                            aria-pressed={d === "approved"}
                            style={{
                              padding: "3px 9px", borderRadius: 999,
                              border: `1px solid ${d === "approved" ? COLORS.successDeep : "rgba(46,125,91,0.30)"}`,
                              background: d === "approved" ? COLORS.successDeep : COLORS.successSoft,
                              color: d === "approved" ? "#fff" : COLORS.successDeep,
                              fontSize: 10.5, fontWeight: 600, cursor: "pointer",
                          }}>✓ Approve</button>
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {e.before && (
                      <div style={{
                        padding: "8px 10px", borderRadius: 8,
                        background: "rgba(176,48,58,0.06)",
                        borderLeft: `3px solid rgba(176,48,58,0.4)`,
                        fontSize: 12.5, lineHeight: 1.4,
                        color: COLORS.inkMuted, textDecoration: "line-through",
                      }}>{e.before}</div>
                    )}
                    {e.after && (
                      <div style={{
                        padding: "8px 10px", borderRadius: 8,
                        background: COLORS.successSoft,
                        borderLeft: `3px solid ${COLORS.successDeep}`,
                        fontSize: 12.5, lineHeight: 1.4,
                        color: COLORS.ink, fontWeight: 500,
                      }}>{e.after}</div>
                    )}
                    {!e.before && (
                      <div style={{ fontSize: 10.5, color: COLORS.inkDim, fontStyle: "italic", marginTop: -2 }}>
                        + new field
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{
          padding: "12px 20px",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end",
        }}>
          <button type="button" onClick={onClose} style={{
            padding: "9px 14px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink,
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{isAdmin ? "Close" : "Keep editing"}</button>
          {isAdmin && entries.length > 0 && (() => {
            const rejected = new Set([...decisions.entries()].filter(([, v]) => v === "rejected").map(([k]) => k));
            const approved = new Set([...decisions.entries()].filter(([, v]) => v === "approved").map(([k]) => k));
            const hasMixed = rejected.size > 0 || approved.size > 0;
            const allRejected = rejected.size === entries.length;
            const allApproved = approved.size === entries.length;
            // Mixed decisions → show "Apply N decisions"
            if (hasMixed && !allRejected && !allApproved) {
              return (
                <button type="button" onClick={() => onApplyDecisions?.(rejected)} style={{
                  padding: "9px 16px", borderRadius: 999, border: "none",
                  background: COLORS.fill, color: "#fff",
                  fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>Apply · approve {approved.size} · reject {rejected.size}{decisions.size < entries.length ? ` · ${entries.length - decisions.size} pending` : ""}</button>
              );
            }
            return (
              <>
                {onRejectAll && (
                  <button type="button" onClick={onRejectAll} style={{
                    padding: "9px 14px", borderRadius: 999,
                    border: `1px solid rgba(176,48,58,0.30)`, background: "#fff", color: COLORS.red,
                    fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>Reject all</button>
                )}
                {onApproveAll && (
                  <button type="button" onClick={onApproveAll} style={{
                    padding: "9px 16px", borderRadius: 999, border: "none",
                    background: COLORS.fill, color: "#fff",
                    fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>Approve all</button>
                )}
              </>
            );
          })()}
          {!isAdmin && onSubmit && entries.length > 0 && (
            <button type="button" onClick={onSubmit} style={{
              padding: "9px 16px", borderRadius: 999, border: "none",
              background: COLORS.fill, color: "#fff",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Submit for review</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Compute changes between two ProfileState snapshots.

export function computeProfileDiff(before: ProfileState | null, after: ProfileState): DiffEntry[] {
  if (!before) {
    const out: DiffEntry[] = [];
    if (after.identity.stageName) out.push({ fieldId: "stageName", fieldLabel: "Stage name", before: "", after: after.identity.stageName });
    if (after.primaryType) {
      const p = findChild(after.primaryType);
      out.push({ fieldId: "primaryType", fieldLabel: "Primary Talent Type", before: "", after: p?.child.label ?? after.primaryType });
    }
    return out;
  }
  const out: DiffEntry[] = [];
  if (before.identity.stageName !== after.identity.stageName) {
    out.push({ fieldId: "stageName", fieldLabel: "Stage name", before: before.identity.stageName, after: after.identity.stageName });
  }
  if (before.tagline !== after.tagline) {
    out.push({ fieldId: "tagline", fieldLabel: "Tagline", before: before.tagline, after: after.tagline });
  }
  if (before.primaryType !== after.primaryType) {
    const b = before.primaryType ? findChild(before.primaryType)?.child.label ?? before.primaryType : "—";
    const a = after.primaryType ? findChild(after.primaryType)?.child.label ?? after.primaryType : "—";
    out.push({ fieldId: "primaryType", fieldLabel: "Primary Talent Type", before: b, after: a });
  }
  if (JSON.stringify([...before.secondaryTypes].sort()) !== JSON.stringify([...after.secondaryTypes].sort())) {
    out.push({
      fieldId: "secondaryTypes", fieldLabel: "Secondary roles",
      before: before.secondaryTypes.map(id => findChild(id)?.child.label ?? id).join(" · "),
      after: after.secondaryTypes.map(id => findChild(id)?.child.label ?? id).join(" · "),
    });
  }
  const bBio = before.bios.find(b => b.locale === before.bioActiveLocale)?.text ?? "";
  const aBio = after.bios.find(b => b.locale === after.bioActiveLocale)?.text ?? "";
  if (bBio !== aBio) {
    out.push({ fieldId: "bio", fieldLabel: `Bio (${after.bioActiveLocale})`, before: bBio, after: aBio });
  }
  if (before.serviceArea.homeBase !== after.serviceArea.homeBase) {
    out.push({ fieldId: "homeBase", fieldLabel: "Home base", before: before.serviceArea.homeBase, after: after.serviceArea.homeBase });
  }
  if (JSON.stringify(before.serviceArea.serviceCities) !== JSON.stringify(after.serviceArea.serviceCities)) {
    out.push({
      fieldId: "serviceCities", fieldLabel: "Service cities",
      before: before.serviceArea.serviceCities.join(" · "),
      after: after.serviceArea.serviceCities.join(" · "),
    });
  }
  if (JSON.stringify(before.languages) !== JSON.stringify(after.languages)) {
    out.push({
      fieldId: "languages", fieldLabel: "Languages",
      before: before.languages.map(l => `${l.language} (${l.level})`).join(" · "),
      after: after.languages.map(l => `${l.language} (${l.level})`).join(" · "),
    });
  }
  const bPhotos = before.albumsPro.reduce((n, a) => n + a.items.length, 0);
  const aPhotos = after.albumsPro.reduce((n, a) => n + a.items.length, 0);
  if (bPhotos !== aPhotos) {
    out.push({ fieldId: "photos", fieldLabel: "Photos", before: `${bPhotos} photo${bPhotos === 1 ? "" : "s"}`, after: `${aPhotos} photo${aPhotos === 1 ? "" : "s"}` });
  }
  return out;
}

// #8 — Publish celebration modal. Pops the moment a profile goes live;
// gives the admin a share toolkit (copy link / QR / IG-story / PDF).

export function PublishCelebrationModal({ stageName, slug, tenantSlug, onClose, onCopyLink, onShare }: {
  stageName: string;
  slug: string;
  tenantSlug: string;
  onClose: () => void;
  onCopyLink: () => void;
  onShare: () => void;
}) {
  const { toast } = useAdminShell();
  const profileUrl = `https://tulala.digital/${tenantSlug}/t/${slug}`;
  // 2026 #8 — Web Share API. Triggers the native iOS / Android / desktop
  // share sheet (Messages, WhatsApp, AirDrop, Slack, etc). Falls back
  // to clipboard copy when the API isn't available (older browsers).
  const supportsShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const handleNativeShare = async () => {
    if (!supportsShare) {
      try { await navigator.clipboard.writeText(profileUrl); toast("Link copied — share API unavailable"); }
      catch { toast("Couldn't open share sheet"); }
      return;
    }
    try {
      await navigator.share({
        title: `${stageName} on Tulala`,
        text: `Check out ${stageName}'s profile`,
        url: profileUrl,
      });
      onShare();
    } catch (err) {
      // User canceled the share sheet — silent.
      if ((err as DOMException)?.name !== "AbortError") {
        toast("Share canceled");
      }
    }
  };
  // Web Share Files (level 2) — for the "model card PDF" CTA. Detected
  // separately because Files-level support is narrower than basic share.
  const supportsShareFiles = supportsShare
    && typeof navigator !== "undefined"
    && typeof (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare === "function";
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 240,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 420,
        background: "#fff", borderRadius: 18,
        padding: "26px 22px 20px",
        boxShadow: "0 30px 60px -10px rgba(11,11,13,0.4)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 42, lineHeight: 1, marginBottom: 8 }}>🎉</div>
        <h2 style={{
          margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 700,
          color: COLORS.ink, letterSpacing: -0.3, lineHeight: 1.15,
        }}>{stageName || "Profile"} is live</h2>
        <p style={{
          margin: "6px 0 16px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5,
        }}>Share the link, drop the QR in a deck, or send the model card.</p>
        {/* Link card */}
        <div style={{
          padding: "10px 14px", borderRadius: 10,
          background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`,
          fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink,
          marginBottom: 14,
          textAlign: "left", overflowX: "auto",
        }}>{profileUrl}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={() => {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(profileUrl).then(() => onCopyLink()).catch(() => onCopyLink());
            } else { onCopyLink(); }
          }} style={celebrationBtnStyle()}>📋 Copy link</button>
          <button type="button" onClick={handleNativeShare} style={celebrationBtnStyle()}
            title={supportsShare ? "Open share sheet" : "Share API unavailable — will copy link"}
          >
            📲 {supportsShare ? "Share" : "Copy"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <button type="button" onClick={onShare} style={celebrationBtnStyle()}>▦ QR code</button>
          <button type="button" onClick={onShare} style={celebrationBtnStyle()}
            title={supportsShareFiles ? "Share PDF via system sheet" : "Download PDF"}
          >📄 PDF model card</button>
        </div>
        <button type="button" onClick={onClose} style={{
          padding: "10px 18px", borderRadius: 999, border: "none",
          background: COLORS.fill, color: "#fff",
          fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
          width: "100%",
        }}>Done</button>
      </div>
    </div>
  );
}


export function celebrationBtnStyle(): React.CSSProperties {
  return {
    padding: "9px 12px", borderRadius: 10,
    border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink,
    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}

// Profile ownership panel — surfaced in the Profile Shell admin section.
// Drives the agency-managed → talent-claimed transition. Three states:
//   1. unclaimed (no invite sent) — admin has full control; offer to send
//   2. invited (claim email sent, not yet accepted) — show resent / cancel
//   3. claimed (talent owns it) — show co-edit settings + revoke option
//
// In production these states are stored on `talent_profiles.ownership`
// with timestamps. The prototype keeps it local for the demo.

export function ProfileOwnershipPanel({
  talentProfileId,
  talentName,
  contactEmail,
}: {
  talentProfileId?: string;
  talentName: string;
  contactEmail?: string;
}) {
  const { toast } = useAdminShell();
  type OwnershipState = "unclaimed" | "invited" | "claimed";
  const [state, setState] = useState<OwnershipState>("unclaimed");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [email, setEmail] = useState(contactEmail ?? "");
  const [phone, setPhone] = useState("");
  const [includePassword, setIncludePassword] = useState(false);

  // Co-edit permissions when claimed — admin still keeps oversight on
  // sensitive fields by default (rates, status).
  const [coEditPermissions, setCoEditPermissions] = useState({
    media: true,
    bio: true,
    languages: true,
    skills: true,
    rates: false,
    availability: true,
    status: false,
  });

  const sendInvite = async () => {
    if (!email.trim() && !phone.trim()) {
      toast("Add an email or phone first");
      return;
    }
    if (talentProfileId) {
      const res = await sendTalentClaimInvite({ talent_profile_id: talentProfileId, email: email.trim() || undefined, phone: phone.trim() || undefined });
      if (!res.ok) { toast("Failed to send invite — try again"); return; }
    }
    setState("invited");
    setShowInviteForm(false);
    toast(`Claim invite sent to ${email || phone}`);
  };
  const resendInvite = () => toast(`Resent claim invite to ${email || phone}`);
  const cancelInvite = () => {
    setState("unclaimed");
    toast("Claim invite cancelled");
  };
  const revoke = () => {
    setState("unclaimed");
    toast(`${talentName} ownership revoked — back to agency-managed`);
  };
  const simulateClaim = () => {
    setState("claimed");
    toast(`${talentName} accepted the invite — they now own this profile`);
  };

  if (state === "unclaimed") {
    return (
      <div style={{ fontFamily: FONTS.body }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 11px", borderRadius: 999,
          background: "rgba(11,11,13,0.04)",
          fontSize: 12, color: COLORS.inkMuted, marginBottom: 10,
          width: "fit-content",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: COLORS.inkMuted,
          }} />
          You own this profile · talent has no account yet
        </div>
        {!showInviteForm ? (
          <button type="button" onClick={() => setShowInviteForm(true)} style={{
            padding: "9px 14px", borderRadius: 999, border: "none",
            background: COLORS.fill, color: "#fff",
            fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}>
            ✉ Send claim invite to {talentName}
          </button>
        ) : (
          <div style={{
            background: "#fff", borderRadius: 12,
            border: `1.5px solid ${COLORS.accent}`,
            padding: 14,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.accentDeep, marginBottom: 10 }}>
              Send claim invite
            </div>
            <FieldRow label="Email" hint="Talent receives a one-tap claim link.">
              <TextInput type="email" placeholder="talent@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </FieldRow>
            <FieldRow label="Phone" optional hint="Backup channel — we'll SMS the link too.">
              <TextInput type="text" placeholder="+34 612 345 678"
                value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FieldRow>
            <FieldRow label="One-time password" optional>
              <ToggleControl value={includePassword} onChange={setIncludePassword}
                label="Send a 6-digit code instead of a link · for talent without email" />
            </FieldRow>
            <div style={{
              padding: "8px 11px", borderRadius: 8,
              background: COLORS.indigoSoft,
              fontSize: 11.5, color: COLORS.indigoDeep, marginBottom: 12,
              lineHeight: 1.5,
            }}>
              <strong>What happens next:</strong> {talentName} gets an email · clicks "Claim my profile" · creates a password · can edit any field you've enabled below. Your existing data stays — they just become the owner.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowInviteForm(false)} style={{
                padding: "8px 14px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
                background: "transparent", color: COLORS.ink,
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}>Cancel</button>
              <button type="button" onClick={sendInvite} style={{
                padding: "8px 14px", borderRadius: 999, border: "none",
                background: COLORS.fill, color: "#fff",
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}>Send invite</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (state === "invited") {
    return (
      <div style={{ fontFamily: FONTS.body }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 11px", borderRadius: 999,
          background: COLORS.amberSoft,
          fontSize: 12, color: COLORS.amberDeep, marginBottom: 10,
          width: "fit-content", fontWeight: 600,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: COLORS.amber,
          }} />
          Invite sent to {email || phone} · waiting for {talentName} to claim
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={resendInvite} style={{
            padding: "8px 13px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
            background: "transparent", color: COLORS.ink,
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>↺ Resend invite</button>
          <button type="button" onClick={cancelInvite} style={{
            padding: "8px 13px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
            background: "transparent", color: COLORS.inkMuted,
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>× Cancel invite</button>
          {/* Demo helper — simulates the talent accepting in real product */}
          <button type="button" onClick={simulateClaim} style={{
            padding: "8px 13px", borderRadius: 999, border: `1px dashed ${COLORS.border}`,
            background: "transparent", color: COLORS.inkDim,
            fontFamily: FONTS.body, fontSize: 11, fontWeight: 500, cursor: "pointer",
          }}>↗ Simulate talent accepting (demo)</button>
        </div>
        <div style={{ fontSize: 11, color: COLORS.inkDim, lineHeight: 1.5 }}>
          You can keep editing while the invite is pending. Talent's first edit will overwrite drafts in the fields they have permission for.
        </div>
      </div>
    );
  }

  // claimed
  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 11px", borderRadius: 999,
        background: COLORS.successSoft,
        fontSize: 12, color: COLORS.successDeep, marginBottom: 10,
        width: "fit-content", fontWeight: 600,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: COLORS.green,
        }} />
        ✓ {talentName} owns this profile
      </div>
      <div style={{
        background: "#fff", borderRadius: 10,
        border: `1px solid ${COLORS.borderSoft}`,
        padding: 12, marginBottom: 10,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
          color: COLORS.inkMuted, textTransform: "uppercase", marginBottom: 8,
        }}>What talent can edit</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {([
            { key: "media",        label: "Photos + albums" },
            { key: "bio",          label: "Bio + tagline" },
            { key: "languages",    label: "Languages + skills" },
            { key: "skills",       label: "Skills + contexts" },
            { key: "availability", label: "Availability calendar" },
            { key: "rates",        label: "Rates + pricing", admin: true },
            { key: "status",       label: "Profile status (publish / hide)", admin: true },
          ] as const).map((p) => {
            const v = coEditPermissions[p.key];
            return (
              <label key={p.key} style={{
                display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", fontSize: 12.5, color: COLORS.ink,
              }}>
                <button type="button" onClick={() => setCoEditPermissions(c => ({ ...c, [p.key]: !v }))}
                  aria-pressed={v}
                  style={{
                    width: 32, height: 18, borderRadius: 999, border: "none", cursor: "pointer", padding: 0,
                    background: v ? COLORS.accent : "rgba(11,11,13,0.12)",
                    position: "relative", flexShrink: 0,
                  }}>
                  <span style={{
                    position: "absolute", top: 2, left: v ? 16 : 2,
                    width: 14, height: 14, borderRadius: "50%", background: "#fff",
                  }} />
                </button>
                <span>{p.label}</span>
                {"admin" in p && p.admin && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: "#7A5A1F",
                    padding: "1px 6px", borderRadius: 999,
                    background: "rgba(184,135,49,0.14)",
                    textTransform: "uppercase", letterSpacing: 0.4,
                  }}>admin default</span>
                )}
              </label>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => toast(`Sent ${talentName} a notification`)} style={{
          padding: "8px 13px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
          background: "transparent", color: COLORS.ink,
          fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>✉ Message {talentName}</button>
        <button type="button" onClick={revoke} style={{
          padding: "8px 13px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
          background: "transparent", color: COLORS.red,
          fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>↶ Revoke ownership</button>
      </div>
      <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 8, lineHeight: 1.5 }}>
        Revoking returns the profile to agency-managed. Talent's account stays, but they lose edit access on this profile.
      </div>
    </div>
  );
}


export function ProfileActivityLog({ talentProfileId }: { talentProfileId?: string }) {
  const [entries, setEntries] = useState<ProfileActivityEntry[]>([]);
  const [loading, setLoading] = useState(!!talentProfileId);

  useEffect(() => {
    if (!talentProfileId) { setLoading(false); return; }
    setLoading(true);
    getTalentProfileActivity({ talent_profile_id: talentProfileId, limit: 8 })
      .then((res) => { if (res.ok) setEntries(res.entries); })
      .finally(() => setLoading(false));
  }, [talentProfileId]);

  if (loading) return (
    <div style={{ padding: "12px 0", color: COLORS.inkMuted, fontSize: 12, fontFamily: FONTS.body }}>Loading…</div>
  );
  if (entries.length === 0) return (
    <div style={{ padding: "12px 0", color: COLORS.inkDim, fontSize: 12, fontFamily: FONTS.body }}>No activity recorded yet.</div>
  );

  const relTime = (iso: string) => {
    const diff = Date.now() - Date.parse(iso);
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: FONTS.body }}>
      {entries.map((e, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 8,
          background: COLORS.surface,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: e.actorRole === "admin" ? COLORS.amberDeep
              : e.actorRole === "talent" ? COLORS.indigoDeep
              : COLORS.inkDim,
            flexShrink: 0,
          }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 12, color: COLORS.ink, lineHeight: 1.4 }}>
              <strong style={{ fontWeight: 600, textTransform: "capitalize" }}>{e.actorRole}</strong>{" · "}{e.action}
            </span>
            <span style={{ display: "block", fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>{relTime(e.createdAt)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Three-slot photo block (Phase 1) ─────────────────────────────────────────


export function ThreeSlotPhotoBlock({
  avatarUrl,
  heroUrl,
  galleryPhotos,
  onOpenSlot,
}: {
  avatarUrl: string | null;
  heroUrl: string | null;
  galleryPhotos: string[];
  onOpenSlot: (slot: "avatar" | "hero" | "gallery") => void;
}) {
  return (
    <div style={{
      padding: "14px 18px 10px",
      borderBottom: `1px solid ${COLORS.borderSoft}`,
      marginBottom: 14,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      {/* Cover photo — full-width at the top, tall preview */}
      <CoverPhotoSlot
        imageUrl={heroUrl}
        onClick={() => onOpenSlot("hero")}
      />
      {/* Avatar + gallery strip in a row below */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <PhotoSlot
          label="Profile"
          hint="1:1 square"
          imageUrl={avatarUrl}
          aspectRatio="1 / 1"
          onClick={() => onOpenSlot("avatar")}
          onRemove={avatarUrl ? () => onOpenSlot("avatar") : undefined}
        />
        <GalleryStrip
          photos={galleryPhotos}
          totalCount={galleryPhotos.length}
          onOpen={() => onOpenSlot("gallery")}
        />
      </div>
    </div>
  );
}


export function CoverPhotoSlot({
  imageUrl,
  onClick,
}: {
  imageUrl: string | null;
  onClick: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={imageUrl ? "Change cover photo" : "Set cover photo"}
        style={{
          width: "100%",
          height: 220,
          borderRadius: 10,
          overflow: "hidden",
          border: imageUrl
            ? `2px solid rgba(15,79,62,0.25)`
            : `2px dashed ${COLORS.borderSoft}`,
          background: imageUrl ? "transparent" : COLORS.surfaceAlt,
          cursor: "pointer",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Cover"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            color: COLORS.inkMuted, fontFamily: FONTS.body,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontSize: 11.5, fontWeight: 500 }}>Add cover photo</span>
          </div>
        )}
        {imageUrl && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0)",
            transition: "background 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
            className="pshell-cover-hover"
          />
        )}
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 2 }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 500, color: COLORS.inkMuted }}>
          Cover <span style={{ color: COLORS.inkDim }}>· 16:9 banner</span>
        </span>
        {imageUrl && (
          <button type="button" onClick={onClick} style={{
            fontFamily: FONTS.body, fontSize: 11, color: COLORS.accent, fontWeight: 500,
            border: "none", background: "none", cursor: "pointer", padding: 0,
          }}>Change</button>
        )}
      </div>
    </div>
  );
}


export function GalleryStrip({
  photos,
  totalCount,
  onOpen,
}: {
  photos: string[];
  totalCount: number;
  onOpen: () => void;
}) {
  // Show up to 8 thumbs; anything beyond gets a +N chip
  const MAX_THUMBS = 8;
  const shown = photos.slice(0, MAX_THUMBS);
  const extra = totalCount - shown.length;

  if (totalCount === 0) {
    return (
      <button type="button" onClick={onOpen} style={{
        flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center",
        gap: 6, padding: "10px 14px", borderRadius: 8,
        border: `1.5px dashed ${COLORS.borderSoft}`,
        background: COLORS.surfaceAlt, cursor: "pointer", minHeight: 86,
      }}>
        <span style={{ fontSize: 20, opacity: 0.35 }}>📷</span>
        <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, fontWeight: 500 }}>
          Add photos
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={onOpen} style={{
      flex: 1, minWidth: 0,
      padding: 6, borderRadius: 8,
      border: `1px solid ${COLORS.borderSoft}`,
      background: COLORS.surfaceAlt, cursor: "pointer",
      display: "grid",
      gridTemplateColumns: `repeat(auto-fill, minmax(62px, 1fr))`,
      gap: 4,
      alignItems: "stretch",
    }}>
      {shown.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={url} alt="" style={{
          width: "100%", aspectRatio: "3 / 4", objectFit: "cover",
          borderRadius: 5, display: "block",
        }} />
      ))}
      {extra > 0 && (
        <div style={{
          aspectRatio: "3 / 4", borderRadius: 5,
          background: "rgba(15,79,62,0.10)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONTS.body, fontSize: 12, fontWeight: 700, color: COLORS.accent,
        }}>+{extra}</div>
      )}
    </button>
  );
}


export function PhotoSlot({
  label,
  hint,
  imageUrl,
  aspectRatio,
  onClick,
  onRemove,
}: {
  label: string;
  hint: string;
  imageUrl: string | null;
  aspectRatio: string;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={onClick}
          aria-label={imageUrl ? `Change ${label}` : `Set ${label}`}
          style={{
            width: aspectRatio === "1 / 1" ? 72 : 58,
            height: 72,
            borderRadius: 8,
            overflow: "hidden",
            border: imageUrl
              ? `2px solid rgba(15,79,62,0.25)`
              : `1.5px dashed rgba(15,79,62,0.3)`,
            background: imageUrl ? "transparent" : COLORS.surfaceAlt,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            position: "relative",
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={label}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 22, opacity: 0.4 }}>📷</span>
          )}
          <span style={{
            position: "absolute", bottom: 2, left: 0, right: 0,
            background: "rgba(11,11,13,0.45)", color: "#fff",
            fontFamily: FONTS.body, fontSize: 9, fontWeight: 700,
            textAlign: "center", padding: "1px 0",
            opacity: 0,
            transition: "opacity 120ms",
          }} className="photo-slot-overlay">
            {imageUrl ? "Change" : "Set"}
          </span>
        </button>
        {imageUrl && onRemove && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label={`Remove ${label}`}
            style={{
              position: "absolute", top: 4, right: 4,
              width: 18, height: 18, borderRadius: "50%",
              background: "rgba(0,0,0,0.6)", border: "none",
              color: "#fff", fontSize: 11, lineHeight: 1,
              cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              padding: 0,
            }}
          >×</button>
        )}
      </div>
      <style>{`button:hover .photo-slot-overlay { opacity: 1 !important; }`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, color: COLORS.ink }}>{label}</div>
        <div style={{ fontFamily: FONTS.body, fontSize: 9.5, color: COLORS.inkDim }}>{hint}</div>
      </div>
    </div>
  );
}

// ── Cover photo editor ──────────────────────────────────────────────

export type PolaroidsEditorProps = {
  polaroids: { id: string; angle: string; url: string | null; mediaAssetId?: string | null }[];
  onChange: (p: { id: string; angle: string; url: string | null; mediaAssetId?: string | null }[]) => void;
  talentProfileId?: string;
};

export const PolaroidsEditor = React.memo(({ polaroids, onChange, talentProfileId }: PolaroidsEditorProps) => {
  const { toast } = useAdminShell();
  const fileRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const polaroidsRef = useRef(polaroids);
  polaroidsRef.current = polaroids;
  const filledCount = polaroids.filter(p => p.url).length;
  const setUrl = (id: string, url: string | null, mediaAssetId?: string | null) =>
    onChange(polaroidsRef.current.map(p => p.id === id ? { ...p, url, mediaAssetId: mediaAssetId === undefined ? p.mediaAssetId : mediaAssetId } : p));
  const handlePick = async (id: string, f: File) => {
    setUrl(id, URL.createObjectURL(f));
    if (!talentProfileId) return;
    const slot = polaroidsRef.current.find(p => p.id === id);
    // Soft-delete previous polaroid for this slot if any
    if (slot?.mediaAssetId) void actionDeleteMediaAssets([slot.mediaAssetId]);
    const fd = new FormData(); fd.append("file", f);
    const res = await actionUploadAndAssignMedia(fd, talentProfileId, "polaroid", { polaroidSlot: id });
    if (res.ok) setUrl(id, res.data.publicUrl, res.data.id);
    else { toast(res.error || "Upload failed"); setUrl(id, null, null); }
  };
  const handleClear = (id: string) => {
    const slot = polaroidsRef.current.find(p => p.id === id);
    if (talentProfileId && slot?.mediaAssetId) void actionDeleteMediaAssets([slot.mediaAssetId]);
    setUrl(id, null, null);
  };
  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
        {filledCount} of 5 polaroids set. Casting directors check this set first.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {polaroids.map(p => (
          <div key={p.id}>
            <button type="button" onClick={() => fileRefs.current.get(p.id)?.click()} style={{
              width: "100%", aspectRatio: "3 / 4", borderRadius: 8,
              background: p.url ? `url(${p.url}) center/cover, ${COLORS.surfaceAlt}` : COLORS.surfaceAlt,
              border: p.url ? `1.5px solid ${COLORS.accent}` : `1.5px dashed ${COLORS.borderSoft}`,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, color: COLORS.inkMuted, position: "relative", overflow: "hidden",
            }}>
              {!p.url && "+"}
              {p.url && (
                <span onClick={(e) => { e.stopPropagation(); handleClear(p.id); }} style={{
                  position: "absolute", top: 4, right: 4,
                  width: 20, height: 20, borderRadius: "50%",
                  background: "rgba(11,11,13,0.6)", color: "#fff",
                  fontSize: 11, lineHeight: 1, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>×</span>
              )}
            </button>
            <input ref={(el) => { if (el) fileRefs.current.set(p.id, el); }}
              type="file" accept="image/*" capture="user" style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handlePick(p.id, f);
                e.target.value = "";
              }}
            />
            <div style={{
              fontSize: 10, color: p.url ? COLORS.ink : COLORS.inkMuted,
              fontWeight: 600, textAlign: "center", marginTop: 4,
            }}>{p.angle}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Credits editor ──────────────────────────────────────────────────

export type CreditsEntry = { id: string; year: string; brand: string; type: string; credit?: string; role?: string; pinned?: boolean };

export type CreditsEditorProps = {
  credits: CreditsEntry[];
  onChange: (c: CreditsEntry[]) => void;
};

export const CreditsEditor = React.memo(({ credits, onChange }: CreditsEditorProps) => {
  const add = () => onChange([...credits, { id: `cr-${Date.now()}`, year: "", brand: "", type: "Editorial" }]);
  const update = (id: string, patch: Partial<typeof credits[number]>) =>
    onChange(credits.map(c => c.id === id ? { ...c, ...patch } : c));
  const remove = (id: string) => onChange(credits.filter(c => c.id !== id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {credits.length > 0 && (
        <div style={{ fontSize: 11, color: COLORS.inkDim, marginBottom: -2 }}>
          Pin up to 3 with the ★ — they show first on your public profile.
        </div>
      )}
      {credits.map(c => (
        <div key={c.id} style={{
          padding: 12, borderRadius: 10,
          border: `1px solid ${c.pinned ? COLORS.accent : COLORS.borderSoft}`,
          background: c.pinned ? "rgba(15,79,62,0.04)" : "#fff",
        }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input type="text" value={c.year} onChange={(e) => update(c.id, { year: e.target.value })}
              placeholder="2026 / S/S 25"
              style={{ width: 120, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none" }}
            />
            <input type="text" value={c.brand} onChange={(e) => update(c.id, { brand: e.target.value })}
              placeholder="Brand — e.g. Vogue Italia"
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink, outline: "none" }}
            />
            <button type="button" onClick={() => update(c.id, { pinned: !c.pinned })} aria-label={c.pinned ? "Unpin" : "Pin"} style={{
              width: 30, height: 30, borderRadius: 8, border: "none",
              background: c.pinned ? COLORS.accent : "transparent",
              color: c.pinned ? "#fff" : COLORS.inkMuted,
              fontSize: 13, cursor: "pointer",
            }}>★</button>
            <button type="button" onClick={() => remove(c.id)} aria-label="Remove" style={{
              width: 28, height: 28, borderRadius: 8, border: "none",
              background: "transparent", color: COLORS.inkMuted, fontSize: 14, cursor: "pointer",
            }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={c.type} onChange={(e) => update(c.id, { type: e.target.value })} style={{
              padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff", fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
            }}>
              <option value="Editorial">Editorial</option>
              <option value="Campaign">Campaign</option>
              <option value="Cover">Cover</option>
              <option value="Lookbook">Lookbook</option>
              <option value="Runway">Runway</option>
              <option value="Performance">Performance</option>
              <option value="Event">Event</option>
              <option value="Other">Other</option>
            </select>
            <input type="text" value={c.role ?? ""} onChange={(e) => update(c.id, { role: e.target.value })}
              placeholder="Role — e.g. Lead, Walk · 4 looks"
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none" }}
            />
          </div>
          <input type="text" value={c.credit ?? ""} onChange={(e) => update(c.id, { credit: e.target.value })}
            placeholder="Credit — e.g. Photo · Marco Russo"
            style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, outline: "none" }}
          />
        </div>
      ))}
      <button type="button" onClick={add} style={{
        padding: "9px 14px", borderRadius: 10,
        background: "transparent", border: `1.5px dashed ${COLORS.border}`,
        color: COLORS.inkMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
      }}>+ Add credit</button>
    </div>
  );
});

// ── Limits editor ──────────────────────────────────────────────────

export type LimitsEntry = { id: string; category: string; label: string; enforcement: "hard" | "soft" };

export type LimitsEditorProps = {
  limits: LimitsEntry[];
  onChange: (l: LimitsEntry[]) => void;
};

export const LimitsEditor = React.memo(({ limits, onChange }: LimitsEditorProps) => {
  const QUICK_LIMITS = [
    "No nudity", "No fur", "Lingerie · case-by-case", "No tobacco / vape",
    "No alcohol", "No religious imagery", "Vegan only",
  ];
  const add = (label?: string) => onChange([...limits, {
    id: `lim-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, category: "wardrobe", label: label ?? "", enforcement: "hard",
  }]);
  const update = (id: string, patch: Partial<typeof limits[number]>) =>
    onChange(limits.map(l => l.id === id ? { ...l, ...patch } : l));
  const remove = (id: string) => onChange(limits.filter(l => l.id !== id));
  const usedLabels = new Set(limits.map(l => l.label.toLowerCase()));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {limits.map(l => (
        <div key={l.id} style={{
          display: "flex", gap: 6, alignItems: "center",
          padding: "8px 10px", borderRadius: 10,
          border: `1px solid ${l.enforcement === "hard" ? "rgba(176,48,58,0.30)" : COLORS.borderSoft}`,
          background: l.enforcement === "hard" ? "rgba(176,48,58,0.04)" : "#fff",
        }}>
          <input type="text" value={l.label} onChange={(e) => update(l.id, { label: e.target.value })}
            placeholder="e.g. No nudity"
            style={{ flex: 1, padding: "6px 8px", border: "none", background: "transparent", fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none" }}
          />
          <select value={l.enforcement} onChange={(e) => update(l.id, { enforcement: e.target.value as "hard" | "soft" })} style={{
            padding: "5px 8px", borderRadius: 6,
            border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff", fontSize: 11, color: COLORS.ink, outline: "none",
          }}>
            <option value="hard">Hard · won't do</option>
            <option value="soft">Soft · case-by-case</option>
          </select>
          <button type="button" onClick={() => remove(l.id)} aria-label="Remove" style={{
            width: 26, height: 26, borderRadius: 6, border: "none",
            background: "transparent", color: COLORS.inkMuted, fontSize: 13, cursor: "pointer",
          }}>×</button>
        </div>
      ))}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 6 }}>Quick add</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {QUICK_LIMITS.filter(l => !usedLabels.has(l.toLowerCase())).map(l => (
            <button key={l} type="button" onClick={() => add(l)} style={{
              padding: "5px 11px", borderRadius: 999,
              border: `1px dashed ${COLORS.border}`,
              background: "transparent", color: COLORS.inkMuted,
              fontSize: 11, fontWeight: 500, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>+ {l}</button>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => add()} style={{
        alignSelf: "flex-start", padding: "7px 12px", borderRadius: 999,
        background: "transparent", border: `1.5px dashed ${COLORS.border}`,
        color: COLORS.inkMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
      }}>+ Custom limit</button>
    </div>
  );
});

// ── Files editor ───────────────────────────────────────────────────

export type FilesEditorEntry = { id: string; name: string; kind: string; sizeBytes?: number; uploadedAt: string; storagePath?: string; bucketId?: string; mimeType?: string; uploading?: boolean; uploadError?: string };

export type FilesEditorProps = {
  files: FilesEditorEntry[];
  onChange: (f: FilesEditorEntry[]) => void;
  /** When set, picked files are uploaded to the private media-originals
   *  bucket and the metadata list reflects the real storage path. */
  talentProfileId?: string;
};

export const FilesEditor = React.memo(({ files, onChange, talentProfileId }: FilesEditorProps) => {
  const { toast } = useAdminShell();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const ICON_FOR_KIND: Record<string, string> = {
    tax: "🧾", release: "📝", nda: "🔒", contract: "📃", cert: "🎓", id: "🪪", other: "📄",
  };
  const guessKind = (name: string) => {
    const lower = name.toLowerCase();
    return /tax|w8|w9|w-8|w-9/.test(lower) ? "tax"
      : /release/.test(lower) ? "release"
      : /nda/.test(lower) ? "nda"
      : /contract/.test(lower) ? "contract"
      : /cert|diploma/.test(lower) ? "cert"
      : "other";
  };
  const add = async (selectedFile: File) => {
    const id = `f-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
    const kind = guessKind(selectedFile.name);
    // Optimistic — show the file row immediately with `uploading: true`.
    const optimistic: FilesEditorEntry = {
      id,
      name: selectedFile.name,
      kind,
      sizeBytes: selectedFile.size,
      uploadedAt: new Date().toISOString(),
      mimeType: selectedFile.type || undefined,
      uploading: !!talentProfileId,
    };
    onChange([...filesRef.current, optimistic]);
    if (!talentProfileId) return;
    try {
      const fd = new FormData(); fd.append("file", selectedFile);
      const res = await actionUploadTalentDocument(fd, talentProfileId);
      const next = [...filesRef.current];
      const idx = next.findIndex(f => f.id === id);
      if (idx === -1) return;
      if (res.ok) {
        next[idx] = { ...next[idx], storagePath: res.data.storagePath, bucketId: res.data.bucketId, sizeBytes: res.data.sizeBytes, mimeType: res.data.mimeType, uploading: false, uploadError: undefined };
      } else {
        next[idx] = { ...next[idx], uploading: false, uploadError: res.error };
      }
      onChange(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[FilesEditor upload]", err);
      const next = [...filesRef.current];
      const idx2 = next.findIndex(f => f.id === id);
      if (idx2 !== -1) next[idx2] = { ...next[idx2], uploading: false, uploadError: "Upload failed — try again." };
      onChange(next);
    }
  };
  const update = (id: string, patch: Partial<FilesEditorEntry>) =>
    onChange(filesRef.current.map(f => f.id === id ? { ...f, ...patch } : f));
  const remove = async (id: string) => {
    const target = filesRef.current.find(f => f.id === id);
    onChange(filesRef.current.filter(f => f.id !== id));
    if (target?.storagePath && target.bucketId && talentProfileId) {
      await actionDeleteTalentDocument(target.bucketId, target.storagePath, talentProfileId, target.id);
    }
  };
  const download = async (entry: FilesEditorEntry) => {
    if (!entry.storagePath || !entry.bucketId || !talentProfileId) return;
    const res = await actionGetTalentDocumentSignedUrl(entry.bucketId, entry.storagePath, talentProfileId);
    if (res.ok) window.open(res.data.url, "_blank", "noopener,noreferrer");
    else toast(res.error);
  };
  const fmtSize = (b?: number) => {
    if (!b) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: FONTS.body }}>
      {files.length === 0 && (
        <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          Common files: W-8BEN tax form · NDA · model release · driving license · public-liability cert.
        </div>
      )}
      {files.map(f => (
        <div key={f.id} style={{
          display: "flex", gap: 10, alignItems: "center",
          padding: "10px 12px", borderRadius: 10,
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{ICON_FOR_KIND[f.kind] ?? ICON_FOR_KIND.other}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: f.uploadError ? "#C82828" : COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {f.name}{f.uploading ? " · uploading…" : ""}
            </div>
            {f.uploadError ? (
              <div style={{ fontSize: 10.5, color: "#C82828", marginTop: 1 }}>{f.uploadError}</div>
            ) : (
              <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>
                {fmtSize(f.sizeBytes)} · uploaded {new Date(f.uploadedAt).toLocaleDateString()}{f.storagePath ? " · saved" : (f.uploading ? "" : " · not saved")}
              </div>
            )}
          </div>
          {f.storagePath && (
            <button type="button" onClick={() => void download(f)} aria-label="Download" title="Download" style={{
              padding: "5px 9px", borderRadius: 6, border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff", color: COLORS.inkMuted, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: FONTS.body,
            }}>↓</button>
          )}
          <select value={f.kind} onChange={(e) => update(f.id, { kind: e.target.value })} style={{
            padding: "5px 8px", borderRadius: 6,
            border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
            fontSize: 11, color: COLORS.inkMuted, outline: "none",
          }}>
            <option value="tax">Tax form</option>
            <option value="release">Model release</option>
            <option value="nda">NDA</option>
            <option value="contract">Contract</option>
            <option value="cert">Certification</option>
            <option value="id">ID</option>
            <option value="other">Other</option>
          </select>
          <button type="button" onClick={() => void remove(f.id)} aria-label="Remove" style={{
            width: 26, height: 26, borderRadius: 6, border: "none",
            background: "transparent", color: COLORS.inkMuted, fontSize: 13, cursor: "pointer",
          }}>×</button>
        </div>
      ))}
      <button type="button" onClick={() => fileRef.current?.click()} style={{
        padding: "10px 14px", borderRadius: 10,
        border: `1.5px dashed ${COLORS.border}`,
        background: "transparent", color: COLORS.inkMuted,
        fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        <span style={{ fontSize: 16 }}>+</span> Upload file (PDF, JPG, PNG, DOC)
      </button>
      <input ref={fileRef} type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.heic" multiple style={{ display: "none" }}
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          fs.forEach(f => add(f));
          e.target.value = "";
        }}
      />
      <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginTop: 4 }}>
        🔒 Files are admin-visible by default. Talent sees but doesn't edit unless an admin shares.
      </div>
    </div>
  );
});



export function RequiredCoach({ missing, onJump }: {
  missing: { id: string; label: string; met: boolean }[];
  onJump: (id: string) => void;
}) {
  const copy = useDashboardText();
  return (
    <div style={{
      borderRadius: 12, border: `1px solid rgba(91,107,160,0.18)`,
      background: COLORS.indigoSoft, padding: 14, fontFamily: FONTS.body,
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.indigoDeep, marginBottom: 6 }}>
        {copy.addToPublish(missing.length)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {missing.map(m => (
          <button key={m.id} type="button" onClick={() => onJump(m.id)} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 8px", borderRadius: 8, border: "none",
            background: "rgba(255,255,255,0.6)", cursor: "pointer", textAlign: "left",
            fontFamily: FONTS.body,
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: "50%",
              border: `1.5px solid ${COLORS.indigoDeep}`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: COLORS.ink, flex: 1 }}>{copy.isSpanish ? `Agregar ${copy.t(m.label)}` : `Add ${m.label}`}</span>
            <span style={{ color: COLORS.indigoDeep, fontSize: 14 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Compact header chip — same data as RequiredCoach, but lives in the
// drawer header next to the title. Click opens a small popover anchored
// below with the missing items + jump-to actions. Replaces the bulky
// in-form banner that used to push the form down on every drawer open.

export function HeaderPublishCoach({ missing, onJump }: {
  missing: { id: string; label: string; met: boolean }[];
  onJump: (id: string) => void;
}) {
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (missing.length === 0) return null;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 10px", borderRadius: 999,
          border: `1px solid rgba(91,107,160,0.25)`,
          background: COLORS.indigoSoft, color: COLORS.indigoDeep,
          fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden style={{
          width: 6, height: 6, borderRadius: "50%", background: COLORS.indigoDeep,
        }} />
        {copy.addToPublish(missing.length)}
        <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div role="menu" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          minWidth: 240, zIndex: 20,
          background: "#fff", borderRadius: 12,
          border: `1px solid ${COLORS.borderSoft}`,
          boxShadow: "0 12px 32px -8px rgba(11,11,13,0.18)",
          padding: 6, fontFamily: FONTS.body,
        }}>
          {missing.map(m => (
            <button key={m.id} type="button" role="menuitem"
              onClick={() => { onJump(m.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", width: "100%",
                borderRadius: 8, border: "none",
                background: "transparent", cursor: "pointer", textAlign: "left",
                fontFamily: FONTS.body,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(11,11,13,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span aria-hidden style={{
                width: 14, height: 14, borderRadius: "50%",
                border: `1.5px solid ${COLORS.indigoDeep}`, flexShrink: 0,
              }} />
              <span style={{ fontSize: 12.5, color: COLORS.ink, flex: 1 }}>{copy.isSpanish ? `Agregar ${copy.t(m.label)}` : `Add ${m.label}`}</span>
              <span aria-hidden style={{ color: COLORS.indigoDeep, fontSize: 13 }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Mobile overflow menu — collapses Undo / Redo / Templates / View-as-
// client / Save & exit into one ••• button on screens ≤880px. Status,
// autosave, and Smart CTA already live in the bottom save bar; this
// menu carries the actions that don't deserve a permanent slot on mobile.

export function ProfileShellMobileMenu({
  adminVisible, isSelf, primaryTypeSet,
  onViewAsClient, onSaveAndExit,
  onOpenFullEditor, onRemoveFromRoster,
}: {
  adminVisible: boolean;
  isSelf: boolean;
  primaryTypeSet: boolean;
  onViewAsClient: () => void;
  onSaveAndExit: () => void;
  /** Phase 3 — admin-only escape hatch to the canonical /{slug}/admin/
   *  roster/[id] page. Provided as a callback so the menu doesn't need
   *  to know how URLs are built. */
  onOpenFullEditor?: () => void;
  /** Phase 3 — admin-only destructive action. Severs the agency
   *  relationship; talent keeps Tulala account. Confirmation handled
   *  by the parent component. */
  onRemoveFromRoster?: () => void;
}) {
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  // Native popover migration: browser handles outside-click + escape via
  // popover="auto". Position is computed against the trigger when the
  // toggle event fires, since top-layer elements don't inherit
  // containing-block positioning from their parent.
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId().replace(/:/g, "");
  const fullId = `pshell-menu-${popoverId}`;
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen && triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        // Option A — anchor the menu's right edge a few pixels OUTSIDE the
        // trigger's right edge so the trigger sits flush at the top-right
        // corner of the menu. Visually reads as "menu drops straight from
        // the dots", not "menu floats off to the left".
        const offsetRight = -2; // negative = menu extends further right
        setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right + offsetRight) });
      }
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);
  // Helper: close the native popover from inside (menu-item clicks).
  // Browser clears top-layer + fires the toggle event which clears React state.
  const close = () => {
    const el = popoverRef.current;
    if (el && typeof (el as HTMLElement & { hidePopover?: () => void }).hidePopover === "function") {
      try { (el as HTMLElement & { hidePopover: () => void }).hidePopover(); return; } catch {}
    }
    setOpen(false);
  };
  return (
    <div data-pshell-mobile-menu style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        {...({ popoverTarget: fullId, popoverTargetAction: "toggle" } as Record<string, string>)}
        aria-label={copy.t("More actions")}
        aria-expanded={open}
        aria-controls={fullId}
        style={{
          width: 28, height: 28, borderRadius: 8,
          border: "none",
          background: open ? "rgba(11,11,13,0.06)" : "transparent",
          color: COLORS.ink,
          fontSize: 18, lineHeight: 1, letterSpacing: 1, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONTS.body, padding: 0,
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(11,11,13,0.04)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >⋯</button>
      <div
        ref={popoverRef}
        id={fullId}
        role="menu"
        {...({ popover: "auto" } as Record<string, string>)}
        style={{
          // Native [popover] applies a default `left: 0` via UA stylesheet
          // which fights `right`. Override with `left: auto` so right-anchor
          // wins and the menu actually drops below the trigger.
          position: "fixed", top: pos.top, right: pos.right, left: "auto", bottom: "auto",
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12,
          boxShadow: "0 16px 40px -8px rgba(11,11,13,0.25)",
          minWidth: 200, padding: 4,
          margin: 0,
          fontFamily: FONTS.body,
        }}>
            <>
                <PMobileMenuItem
                  icon="👁" label="View as client"
                  onClick={() => { onViewAsClient(); close(); }}
                />
                {/* Apply template / Save as template were prototype-only —
                    no DB schema for templates exists yet. Hidden until
                    talent_profile_templates ships so we don't promise
                    persistence we can't deliver. */}
                {/* Phase 3 — admin-only Full editor escape hatch + Remove
                    from roster. Mirrors the desktop header-extras buttons
                    which are responsive-hidden at narrow drawer widths. */}
                {adminVisible && onOpenFullEditor && (
                  <>
                    <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 6px" }} />
                    <PMobileMenuItem
                      icon="↗" label="Open full editor"
                      onClick={() => { onOpenFullEditor(); close(); }}
                    />
                  </>
                )}
                <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 6px" }} />
                <PMobileMenuItem
                  icon="💾" label="Save & exit"
                  onClick={() => { onSaveAndExit(); close(); }}
                />
                {adminVisible && onRemoveFromRoster && (
                  <>
                    <div style={{ height: 1, background: "rgba(200,40,40,0.16)", margin: "4px 6px" }} />
                    <button
                      type="button"
                      onClick={() => { onRemoveFromRoster(); close(); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        width: "100%", padding: "9px 12px", borderRadius: 7,
                        border: "none", background: "transparent",
                        color: "#C82828", fontFamily: FONTS.body,
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(200,40,40,0.06)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span aria-hidden style={{ width: 16, fontSize: 14 }}>✕</span>
                      <span>{copy.t("Remove from roster")}</span>
                    </button>
                  </>
                )}
              </>
      </div>
    </div>
  );
}


export function PMobileMenuItem({ icon, label, onClick, disabled, shortcut, hasSubmenu }: {
  icon: string; label: string; onClick: () => void;
  disabled?: boolean; shortcut?: string; hasSubmenu?: boolean;
}) {
  const copy = useDashboardText();
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 8, border: "none",
      background: "transparent", cursor: disabled ? "not-allowed" : "pointer",
      textAlign: "left", fontFamily: FONTS.body,
      opacity: disabled ? 0.45 : 1,
    }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = COLORS.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{
        width: 22, fontSize: 14, color: COLORS.inkMuted, textAlign: "center", flexShrink: 0,
      }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>{copy.t(label)}</span>
      {shortcut && (
        <span style={{
          fontSize: 10, fontFamily: FONTS.mono, color: COLORS.inkDim,
          background: "rgba(11,11,13,0.04)", padding: "2px 6px", borderRadius: 4,
        }}>{shortcut}</span>
      )}
      {hasSubmenu && <span style={{ color: COLORS.inkDim, fontSize: 13 }}>›</span>}
    </button>
  );
}

// #2 — First-time hero on the Profile Shell. Shows below 35% to coach
// the talent through the 3 highest-leverage things to do first.

export function FirstTimeHero({ completeness, onStart, talentId }: {
  completeness: number;
  onStart: (sectionId: ProfileSectionId) => void;
  talentId: string;
}) {
  const [dismissed, setDismissed] = React.useState(false);
  const steps: { id: ProfileSectionId; label: string; helper: string; emoji: string }[] = [
    { id: "media",    label: "Add a photo",   helper: "One headshot is enough to start.", emoji: "📷" },
    { id: "services", label: "Pick what you do", helper: "What clients book you as.",     emoji: "🎯" },
    { id: "location", label: "Set your base", helper: "City + travel range.",              emoji: "📍" },
  ];
  if (dismissed) return null;
  return (
    <div style={{
      position: "relative",
      marginTop: 12, padding: 14, borderRadius: 12,
      background: "linear-gradient(135deg, rgba(15,79,62,0.06) 0%, rgba(91,107,160,0.06) 100%)",
      border: `1px solid ${COLORS.borderSoft}`,
      fontFamily: FONTS.body,
    }}>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem("tulala.welcome.dismissed." + talentId, "1");
          setDismissed(true);
        }}
        style={{
          position: "absolute", top: 8, right: 8,
          background: "none", border: "none", cursor: "pointer",
          color: COLORS.inkMuted, fontSize: 14, lineHeight: 1,
          padding: "2px 4px",
        }}
        aria-label="Dismiss"
      >×</button>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.ink, marginBottom: 4 }}>
        Welcome — let's start with 3 things
      </div>
      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
        Each takes about 30 seconds. You can polish the rest later.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {steps.map((s, i) => (
          <button key={s.id} type="button" onClick={() => onStart(s.id)} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 9, border: "none",
            background: "#fff", cursor: "pointer", textAlign: "left",
            fontFamily: FONTS.body,
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: "50%",
              background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`,
              fontSize: 11, fontWeight: 700, color: COLORS.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{s.emoji}  {s.label}</span>
              <span style={{ display: "block", fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>{s.helper}</span>
            </span>
            <span style={{ color: COLORS.inkDim, fontSize: 14 }}>›</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: COLORS.inkDim, marginTop: 8 }}>
        Profile is {completeness}% complete · publish at 100%
      </div>
    </div>
  );
}

// #19 — Profile growth metric. Shown to talent on a published profile.
// Mock-data for now (would pull from analytics in production).

export function ProfileGrowthMetric({ onJump }: { onJump: () => void }) {
  // Stable mock — would come from /analytics/talent/{id}/last-7d
  const views = 47;
  const inquiries = 3;
  const trend = +12; // percent change vs prior week
  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 12,
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
      fontFamily: FONTS.body,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, color: COLORS.inkMuted, textTransform: "uppercase" }}>Last 7 days</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: trend >= 0 ? COLORS.successDeep : COLORS.amberDeep }}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
        </span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.ink, letterSpacing: -0.3 }}>{views}</div>
          <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>Profile views</div>
        </div>
        <div style={{ width: 1, background: COLORS.borderSoft }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.ink, letterSpacing: -0.3 }}>{inquiries}</div>
          <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>Inquiries</div>
        </div>
      </div>
      <button type="button" onClick={onJump} style={{
        marginTop: 8, padding: "5px 10px", borderRadius: 999,
        background: "transparent", border: `1px dashed ${COLORS.border}`,
        color: COLORS.inkMuted,
        fontSize: 10.5, fontWeight: 500, cursor: "pointer",
        fontFamily: FONTS.body,
      }}>↑ Refresh photos to boost views</button>
    </div>
  );
}

// Click-to-open field card for the bespoke Identity section — visually
// 1:1 with the engine's Details CollapsibleField (cool border + lift
// shadow + surfaceAlt hover + chevron). Wraps an existing
// `<FieldRow hideLabel>` so visibility chips / hints / locks keep
// working; the card header owns the label + collapsed value summary.

export function CollapsibleIdentityField({
  label, summary, filled, children, defaultOpen,
}: {
  label: string;
  summary: React.ReactNode;
  filled: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const [hover, setHover] = React.useState(false);
  const restBg = "#fff";
  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 9,
        background: restBg,
        fontFamily: FONTS.body,
        minWidth: 0,
        boxShadow: "0 1px 2px rgba(11,11,13,0.05)",
      }}
      onKeyDown={open ? (e) => { if (e.key === "Escape") setOpen(false); } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          width: "100%", display: "flex", flexDirection: "row",
          alignItems: "center", gap: 10,
          padding: "10px 12px", cursor: "pointer", textAlign: "left",
          fontFamily: FONTS.body, border: "none",
          background: open || hover ? COLORS.surfaceAlt : restBg,
          borderRadius: 9,
          borderBottomLeftRadius: open ? 0 : 9,
          borderBottomRightRadius: open ? 0 : 9,
          borderBottom: open ? `1px solid ${COLORS.borderSoft}` : "none",
          transition: "background 120ms ease",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{
            fontSize: 12, fontWeight: 600, color: COLORS.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {label}
          </span>
          {!open && (
            <span style={{
              fontSize: 12, fontWeight: filled ? 500 : 700,
              color: filled ? COLORS.inkMuted : COLORS.accent,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              letterSpacing: 0.1,
            }}>
              {filled ? summary : <>+ {summary}</>}
            </span>
          )}
        </div>
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
          color: open || hover ? COLORS.accent : COLORS.inkDim,
          transition: "color 120ms ease",
        }}>
          {!open && hover && (
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3 }}>Edit</span>
          )}
          <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 600 }}>
            {open ? "⌄" : "›"}
          </span>
        </div>
      </button>
      {open && <div style={{ padding: "10px 12px 12px" }}>{children}</div>}
    </div>
  );
}


export function ProfileAccordionSection({ id, title, sub, complete, started, open, onToggle, accent, children, primaryType }: {
  id: string;
  title: string;
  sub?: string;
  complete: boolean;
  /** Optional 3rd state: section has SOME data but not enough to be
   *  considered complete. When omitted, the indicator is binary
   *  (empty circle vs green check). */
  started?: boolean;
  open: boolean;
  onToggle: () => void;
  accent?: "amber";
  children: ReactNode;
  /** When set, the section consults the field catalog to decide
   *  whether to render at all. Accepts a single type id, an array
   *  of role ids (primary + secondaries), or null. Sections that
   *  aren't catalog-mapped render unchanged regardless. */
  primaryType?: string | ReadonlyArray<string> | null;
}) {
  // Catalog-driven gating. Cast is safe — DrawerSectionId is a closed
  // union of string literals; passing an arbitrary id falls through
  // to "always-on" via sectionAppliesToType's unmapped branch.
  if (primaryType !== undefined) {
    const arg = (primaryType ?? null) as TaxonomyParentId | ReadonlyArray<TaxonomyParentId> | null;
    const applies = sectionAppliesToType(id as DrawerSectionId, arg);
    if (!applies) return null;
  }
  // Single-section pattern: with the rail handling navigation, only the
  // active section renders in the body. Closed sections return null —
  // the rail row already names the section, so an in-body header is
  // redundant and adds vertical noise.
  if (!open) return null;
  return (
    <section id={`pshell-${id}`} style={{
      // White card on the COLORS.surface page — matched 1:1 to the New
      // Inquiry ComposerSection (soft hairline + radius 10).
      background: "#FFFFFF",
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: 10,
      minHeight: "100%",
      boxSizing: "border-box",
    }}>
      {/* Compact section title row. Matches New Inquiry ComposerSection:
          13.5/700 ink title, 11.5 muted description. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "16px 16px 6px", textAlign: "left",
        fontFamily: FONTS.body,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: accent === "amber" ? COLORS.amberDeep : COLORS.ink, letterSpacing: -0.05 }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.5 }}>{sub}</div>}
        </div>
      </div>
      {(
        <div style={{ padding: "0 16px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
      )}
    </section>
  );
}

// ─── CountryAutocompleteInput ──────────────────────────────────────────────────
// Uses the existing /api/location-countries endpoint (Supabase + Google fallback).
// Stores the country name_en as the value (ISO2 shown in dropdown for context).


export type CountrySuggestion = {
  id?: string | null;
  iso2?: string | null;
  name_en: string;
  google_place_id?: string | null;
};


export function CountryAutocompleteInput({
  value, placeholder, onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (nameEn: string, iso2?: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const [suggestions, setSuggestions] = React.useState<CountrySuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { setDraft(value); }, [value]);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (text: string) => {
    setDraft(text);
    onChange(text, undefined);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 1) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/location-countries?query=${encodeURIComponent(text.trim())}`);
        if (!res.ok) return;
        const data = (await res.json()) as { countries?: CountrySuggestion[] };
        setSuggestions(data.countries ?? []);
        setOpen((data.countries ?? []).length > 0);
      } catch { /* ignore */ }
    }, 280);
  };

  const handleSelect = async (c: CountrySuggestion) => {
    let nameEn = c.name_en;
    let iso2 = c.iso2 ?? undefined;
    if (c.google_place_id && !iso2) {
      try {
        const res = await fetch(`/api/location-country-details?placeId=${encodeURIComponent(c.google_place_id)}`);
        const data = (await res.json()) as { ok?: boolean; iso2?: string; name_en?: string };
        if (data.ok && data.name_en) { nameEn = data.name_en; iso2 = data.iso2; }
      } catch { /* ignore */ }
    }
    setDraft(nameEn);
    onChange(nameEn, iso2);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        placeholder={placeholder ?? "Search country…"}
        value={draft}
        autoComplete="off"
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        style={SHARED_FIELD_INPUT_STYLE}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 999,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", overflow: "hidden",
        }}>
          {suggestions.map((c, i) => (
            <button key={`${c.google_place_id ?? c.iso2 ?? c.name_en}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); void handleSelect(c); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", textAlign: "left",
                padding: "9px 12px", background: "none", border: "none", cursor: "pointer",
                fontFamily: FONTS.body, borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, flex: 1 }}>{c.name_en}</span>
              {c.iso2 && (
                <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 600 }}>{c.iso2}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CityAutocompleteInput ─────────────────────────────────────────────────────
// Google Places autocomplete for a single city. Debounces 300ms, calls
// /api/admin/places-city-global, shows dropdown. Falls back to plain text if
// Places not configured (configured=false).


export type CityPrediction = { placeId: string; mainText: string; secondaryText: string };


export function CityAutocompleteInput({
  value, placeId: _placeId, placeholder, onChange,
}: {
  value: string;
  placeId?: string;
  placeholder?: string;
  onChange: (city: string, placeId?: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const [predictions, setPredictions] = React.useState<CityPrediction[]>([]);
  const [open, setOpen] = React.useState(false);
  const [configured, setConfigured] = React.useState(true);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Keep draft in sync when external value changes (e.g. load from server)
  React.useEffect(() => { setDraft(value); }, [value]);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (text: string) => {
    setDraft(text);
    onChange(text, undefined); // clear placeId while typing
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setPredictions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/places-city-global?q=${encodeURIComponent(text.trim())}`);
        if (!res.ok) return;
        const data = (await res.json()) as { predictions: CityPrediction[]; configured?: boolean };
        setConfigured(data.configured !== false);
        setPredictions(data.predictions ?? []);
        setOpen((data.predictions ?? []).length > 0);
      } catch { /* network error — silently ignore */ }
    }, 300);
  };

  const handleSelect = (p: CityPrediction) => {
    const label = p.secondaryText ? `${p.mainText}, ${p.secondaryText}` : p.mainText;
    setDraft(label);
    onChange(label, p.placeId);
    setPredictions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        data-pshell-field="homeBase"
        placeholder={placeholder ?? "e.g. Playa del Carmen"}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (predictions.length > 0) setOpen(true); }}
        style={SHARED_FIELD_INPUT_STYLE}
      />
      {!configured && (
        <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 4 }}>
          Google Places not configured — type any city name.
        </div>
      )}
      {open && predictions.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 999,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
          overflow: "hidden",
        }}>
          {predictions.map((p) => (
            <button key={p.placeId}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 12px", background: "none", border: "none", cursor: "pointer",
                fontFamily: FONTS.body, borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{p.mainText}</span>
              {p.secondaryText && (
                <span style={{ fontSize: 11.5, color: COLORS.inkMuted, marginLeft: 6 }}>{p.secondaryText}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── UpcomingVisitsEditor ──────────────────────────────────────────────────────
// List of city + optional date entries for upcoming travel.


export type VisitEntry = { id: string; city: string; placeId?: string; date?: string; dateEnd?: string };


export function UpcomingVisitsEditor({
  visits, onChange,
}: {
  visits: VisitEntry[];
  onChange: (visits: VisitEntry[]) => void;
}) {
  const add = () => {
    onChange([...visits, { id: crypto.randomUUID(), city: "", date: "" }]);
  };
  const remove = (id: string) => onChange(visits.filter((v) => v.id !== id));
  const update = (id: string, patch: Partial<VisitEntry>) =>
    onChange(visits.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {visits.map((v) => (
        <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <CityAutocompleteInput
              value={v.city}
              placeId={v.placeId}
              placeholder="City or destination…"
              onChange={(city, pid) => update(v.id, { city, placeId: pid })}
            />
          </div>
          <input
            type="date"
            value={v.date ?? ""}
            onChange={(e) => update(v.id, { date: e.target.value || undefined })}
            title="Start date (optional)"
            style={{
              padding: "9px 10px", borderRadius: 10, border: `1px solid ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
              width: 130, flexShrink: 0,
            }}
          />
          <button
            onClick={() => remove(v.id)}
            title="Remove"
            style={{
              padding: "9px 10px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`,
              background: "none", cursor: "pointer", color: COLORS.inkMuted,
              fontFamily: FONTS.body, fontSize: 13, flexShrink: 0,
            }}
          >×</button>
        </div>
      ))}
      <button
        onClick={add}
        style={{
          alignSelf: "flex-start", padding: "7px 14px", borderRadius: 999,
          border: `1px dashed ${COLORS.border}`, background: "none",
          cursor: "pointer", fontFamily: FONTS.body, fontSize: 12,
          color: COLORS.inkMuted, display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add destination
      </button>
    </div>
  );
}


export function ServiceAreaMap({ homeBase, travelKm, cities }: {
  homeBase: string; travelKm: number; cities: string[];
}) {
  const radius = Math.max(20, Math.min(70, travelKm / 12));
  return (
    <div style={{
      position: "relative",
      height: 130, borderRadius: 10,
      background: COLORS.surface,
      border: `1px solid ${COLORS.borderSoft}`,
      overflow: "hidden",
    }}>
      <svg width="100%" height="100%" viewBox="0 0 280 130" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="psgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 L0 0 0 20" fill="none" stroke="rgba(11,11,13,0.05)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="280" height="130" fill="url(#psgrid)" />
        <circle cx="140" cy="65" r={radius} fill="rgba(15,79,62,0.10)" stroke="rgba(15,79,62,0.4)" strokeWidth="1" strokeDasharray="3 2"/>
        <circle cx="140" cy="65" r="5" fill={COLORS.accent}/>
        <circle cx="140" cy="65" r="2.5" fill="#fff"/>
        {cities.slice(0, 4).map((c, i) => {
          const angle = (i / 4) * Math.PI * 2 + 0.4;
          const cx = 140 + Math.cos(angle) * (radius * 0.85);
          const cy = 65 + Math.sin(angle) * (radius * 0.85);
          return <circle key={c} cx={cx} cy={cy} r="3" fill={COLORS.indigoDeep}/>;
        })}
      </svg>
      <div style={{
        position: "absolute", bottom: 8, left: 10, right: 10,
        display: "flex", justifyContent: "space-between",
        fontSize: 10, color: COLORS.inkMuted, fontWeight: 500,
        fontFamily: FONTS.body,
      }}>
        <span>📍 {homeBase || "Set home base"}</span>
        <span>{travelKm === 999 ? "Anywhere" : `${travelKm} km`}</span>
      </div>
    </div>
  );
}


export function StatusPillDropdown({ status, onChange, role }: {
  status: "draft" | "pending" | "published" | "hidden";
  onChange: (s: "draft" | "pending" | "published" | "hidden") => void;
  role: "admin" | "talent";
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
  const allowed: Status[] = role === "admin"
    ? ["draft", "pending", "published", "hidden"]
    : status === "published" ? ["published", "pending"] : ["pending"];
  // Stable popover id (one per render — fine since only one is open at a time)
  const popoverId = React.useId();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  return (
    <div style={{ position: "relative" }}>
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
        <span style={{ fontSize: 10 }}>▾</span>
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


export function IdentityEditor({ identity, onChange, isSelf, isFieldLocked, lockReasons }: {
  identity: ProfileIdentity;
  onChange: (next: ProfileIdentity) => void;
  isSelf: boolean;
  isFieldLocked: (path: string) => boolean;
  /** Step 7 — per-path reason text. Surfaced through `LockedHint` so
   *  talent see why a field is greyed out, not just that it is. */
  lockReasons?: Record<string, string>;
}) {
  const copy = useDashboardText();
  const age = deriveAge(identity.dob);
  const ageRange = ageRangeFor(age);
  const inputStyle: React.CSSProperties = { ...SHARED_FIELD_INPUT_STYLE };
  // Single-pick dropdown — used for Pronouns / Gender / Reply time / Age
  // display. Native <select> styled to match the rest of the form so the
  // editor reads as one calm surface instead of a wall of choice chips.
  const SelectPicker = ({
    options, value, placeholder, onPick,
  }: {
    options: { id: string; label: string }[];
    value: string | null | undefined;
    placeholder?: string;
    onPick: (id: string | null) => void;
  }) => (
    <div style={{ position: "relative" }}>
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
        <option value="">{placeholder ?? copy.t("Select…")}</option>
        {options.map(opt => (
          <option key={opt.id} value={opt.id}>{copy.t(opt.label)}</option>
        ))}
      </select>
      <span aria-hidden style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
        pointerEvents: "none", fontSize: 10, color: COLORS.inkMuted,
      }}>▾</span>
    </div>
  );
  return (
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
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* ADMIN-ONLY pill + compact visibility chip. flexWrap + rowGap
              so they never collide / overflow on narrow widths. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 4 }}>
            <span style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: 0.4,
              textTransform: "uppercase",
              color: COLORS.inkMuted, background: "rgba(11,11,13,0.06)",
              border: `1px solid rgba(11,11,13,0.1)`,
              borderRadius: 5, padding: "1px 6px",
            }}>
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
          options={GENDER_OPTIONS}
          value={identity.gender}
          placeholder={copy.t("Select gender")}
          onPick={(id) => onChange({ ...identity, gender: id as typeof identity.gender })}
        />
      </FieldRow>

      <FieldRow
        label={copy.t("Date of birth")}
        catalogId="identity.dob"
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
          <span style={{
            position: "absolute", left: 12, fontSize: 14, lineHeight: 1, pointerEvents: "none",
            color: COLORS.inkMuted,
          }}>✉️</span>
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
          <select
            value={identity.contactPhonePrefix ?? "+1"}
            onChange={(e) => onChange({ ...identity, contactPhonePrefix: e.target.value })}
            style={{
              flexShrink: 0, padding: "10px 8px 10px 12px",
              border: "none", borderRight: `1px solid ${COLORS.borderSoft}`,
              background: "rgba(11,11,13,0.03)",
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
              outline: "none", cursor: "pointer", minWidth: 70,
            }}
          >
            {["+1","+44","+34","+52","+55","+33","+49","+39","+7","+86","+91"].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
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
            flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
            padding: "10px 10px 10px 12px",
            borderRight: "1px solid rgba(37,211,102,0.2)",
            background: "rgba(37,211,102,0.06)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <select
              value={identity.whatsappPrefix ?? identity.contactPhonePrefix ?? "+1"}
              onChange={(e) => onChange({ ...identity, whatsappPrefix: e.target.value })}
              style={{
                border: "none", background: "transparent",
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
                outline: "none", cursor: "pointer",
              }}
            >
              {["+1","+44","+34","+52","+55","+33","+49","+39","+7","+86","+91"].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
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
          <span style={{
            position: "absolute", left: 12, fontSize: 14, lineHeight: 1, pointerEvents: "none",
            color: COLORS.inkMuted,
          }}>🏢</span>
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
  );
}


export function LockedHint({ reason }: { reason?: string }) {
  const copy = useDashboardText();
  return (
    <div style={{
      marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10.5, color: COLORS.amberDeep, fontFamily: FONTS.body,
    }}>
      🔒 {copy.t("Locked by your agency")}
      {reason ? <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}> · {reason}</span> : null}
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
      <div style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px dashed ${COLORS.borderSoft}`,
        background: "rgba(11,11,13,0.02)",
        fontFamily: FONTS.body,
        fontSize: 12,
        color: COLORS.inkMuted,
      }}>
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
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 600, color: COLORS.amberDeep,
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={path}>
              <span aria-hidden>🔒</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
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
      <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 2, padding: "0 4px" }}>
        Tip: lock anything tied to a contract, payout setup, or trust signal — talent see the reason next to the field.
      </div>
    </div>
  );
}

// ── Skills Pro — 3-bucket proficiency ────────────────────────────────

export function SkillsProEditor({ entries, onChange }: {
  entries: SkillEntry[];
  onChange: (skillId: string, prof: SkillProficiency | null) => void;
}) {
  const profOf = (id: string): SkillProficiency | null =>
    entries.find(e => e.skillId === id)?.proficiency ?? null;
  const profCycle: Record<SkillProficiency, SkillProficiency | null> = {
    great:    "can_do",
    can_do:   "learning",
    learning: null,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {(["great", "can_do", "learning"] as SkillProficiency[]).map(p => {
        const meta = PROFICIENCY_META[p];
        const inThisBucket = entries.filter(e => e.proficiency === p);
        return (
          <div key={p}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6,
              fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
              color: meta.fg,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.fg }} />
              {meta.label}
              <span style={{ color: COLORS.inkDim, fontWeight: 500, letterSpacing: 0 }}>· {inThisBucket.length}</span>
            </div>
            <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginBottom: 6 }}>
              {meta.helper}
            </div>
            {inThisBucket.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                {inThisBucket.map(e => {
                  const item = SKILL_CATALOG.find(s => s.id === e.skillId);
                  if (!item) return null;
                  return (
                    <button key={e.skillId} type="button"
                      onClick={() => onChange(e.skillId, profCycle[p])}
                      style={{
                        padding: "5px 10px", borderRadius: 999,
                        border: `1.5px solid ${meta.fg}`,
                        background: meta.bg, color: meta.fg,
                        fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                      }}>{item.label}</button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div style={{
        borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 10,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 6 }}>
          Catalog · tap to start at "Great at" then cycle to lower tiers
        </div>
        <CatalogChips
          items={SKILL_CATALOG.filter(s => !entries.some(e => e.skillId === s.id))}
          selected={new Set([])}
          onToggle={(id) => onChange(id, "great")}
        />
      </div>
    </div>
  );
}

// ── Bio tone selector ────────────────────────────────────────────────
// ── Personality (love / avoid) ───────────────────────────────────────

export type PersonalityEditorProps = {
  value: Personality;
  onChange: (p: Personality) => void;
};

export const PersonalityEditor = React.memo(({ value, onChange }: PersonalityEditorProps) => {
  // Stable callbacks so the memoized ChipsInput children only re-render
  // when their `values` actually change.
  const valueRef = useRef(value);
  valueRef.current = value;
  const setLoves = React.useCallback((v: string[]) => onChange({ ...valueRef.current, loves: v }), [onChange]);
  const setAvoids = React.useCallback((v: string[]) => onChange({ ...valueRef.current, avoids: v }), [onChange]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 6 }}>
          ❤️  I love
        </div>
        <ChipsInput label="" placeholder="e.g. Champagne service, French villas, late-night gigs"
          values={value.loves} onChange={setLoves} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 6 }}>
          ⊘  I avoid
        </div>
        <ChipsInput label="" placeholder="e.g. Photoshoots before 10am, smoking environments"
          values={value.avoids} onChange={setAvoids} />
      </div>
    </div>
  );
});

// ── Hello reel + per-photo metadata ─────────────────────────────────

export type HelloReelEditorProps = {
  reel: VideoSlot | null;
  onChange: (r: VideoSlot | null) => void;
  /** Talent profile id — when present, the picked file is uploaded to
   *  Supabase storage as a media_assets row tagged with metadata.kind=
   *  'hello_reel' so it persists across sessions. */
  talentProfileId?: string;
};

export const HelloReelEditor = React.memo(({ reel, onChange, talentProfileId }: HelloReelEditorProps) => {
  const { toast } = useAdminShell();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const handleFile = async (f: File) => {
    // Optimistic preview so the user immediately sees the reel as picked.
    onChange({ url: URL.createObjectURL(f), durationSec: 30 });
    if (!talentProfileId) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await actionUploadAndAssignMedia(fd, talentProfileId, "reel");
      if (res.ok) {
        onChange({ url: res.data.publicUrl, durationSec: 30 });
      } else {
        toast(`Reel upload failed: ${res.error}`);
        onChange(null);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[HelloReelEditor upload]", err);
      toast("Reel upload failed");
      onChange(null);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div style={{ marginBottom: 12, fontFamily: FONTS.body }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 6 }}>
        ✦  Hello reel · 30 sec intro
      </div>
      {reel ? (
        <div style={{
          padding: 12, borderRadius: 12,
          background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            width: 36, height: 36, borderRadius: 10,
            background: COLORS.accent, color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>▶</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
              {uploading ? "Uploading reel…" : "Reel uploaded"}
            </div>
            <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
              {reel.durationSec ? `~${reel.durationSec}s` : "Ready"} · {reel.url.startsWith("blob:") ? (uploading ? "saving…" : "local preview") : "saved"}
            </div>
          </div>
          <button type="button" onClick={() => onChange(null)} style={{
            padding: "5px 10px", borderRadius: 8, border: "none",
            background: "transparent", color: COLORS.inkMuted,
            fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>Replace</button>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} style={{
          width: "100%", padding: "16px 12px", borderRadius: 12,
          border: `1.5px dashed ${COLORS.borderSoft}`,
          background: "#fff", cursor: "pointer",
          fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, fontWeight: 500,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>+</span>
          Drop or pick a 30-sec hello reel
        </button>
      )}
      <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
});


export function AlbumsEditorPro({ albums, activeId, onActivate, onChange, loading }: {
  albums: { id: string; name: string; items: PhotoMeta[] }[];
  activeId: string;
  onActivate: (id: string) => void;
  onChange: (a: { id: string; name: string; items: PhotoMeta[] }[]) => void;
  loading?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const addAlbum = () => {
    const name = newName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-").slice(0, 30) + "-" + Math.random().toString(36).slice(2, 6);
    onChange([...albums, { id, name, items: [] }]);
    setNewName("");
  };
  const renameAlbum = (id: string, name: string) =>
    onChange(albums.map(a => a.id === id ? { ...a, name } : a));
  const deleteAlbum = (id: string) => {
    if (albums.length <= 1) return;
    onChange(albums.filter(a => a.id !== id));
    if (activeId === id) onActivate(albums[0].id);
  };

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {albums.map(a => {
          const active = a.id === activeId;
          return (
            <button key={a.id} type="button" onClick={() => onActivate(a.id)} style={{
              padding: "6px 11px", borderRadius: 999,
              border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              background: active ? "rgba(15,79,62,0.08)" : "#fff",
              color: active ? COLORS.accentDeep : COLORS.ink,
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {a.name} <span style={{ color: COLORS.inkDim, fontWeight: 500 }}>· {loading ? "…" : a.items.length}</span>
            </button>
          );
        })}
      </div>
      <div style={{
        background: COLORS.surface, padding: 14, borderRadius: 10,
        border: `1px solid ${COLORS.borderSoft}`,
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink, marginBottom: 8 }}>
          Manage albums
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {albums.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="text" value={a.name}
                onChange={(e) => renameAlbum(a.id, e.target.value)}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 8,
                  border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                  fontSize: 12.5, color: COLORS.ink, outline: "none", background: "#fff",
                }}
              />
              <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{loading ? "…" : `${a.items.length} photo${a.items.length === 1 ? "" : "s"}`}</span>
              {albums.length > 1 && (
                <button type="button" onClick={() => deleteAlbum(a.id)} aria-label="Delete album" style={{
                  width: 24, height: 24, borderRadius: 6,
                  border: "none", background: "transparent", color: COLORS.inkMuted,
                  fontSize: 14, cursor: "pointer", padding: 0,
                }}>×</button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="text" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlbum(); } }}
            placeholder="e.g. Editorial, Lookbook, Behind-the-scenes…"
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 8,
              border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}
          />
          <button type="button" onClick={addAlbum} disabled={!newName.trim()} style={{
            padding: "0 14px", borderRadius: 8, border: "none",
            background: newName.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: newName.trim() ? "#fff" : COLORS.inkDim,
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
            cursor: newName.trim() ? "pointer" : "default",
          }}>Add album</button>
        </div>
      </div>
    </div>
  );
}

// ── Aspirations editor ───────────────────────────────────────────────

export function AspirationsEditor({ allowedParents, primaryType, secondaryTypes, value, onToggle }: {
  allowedParents: TaxonomyParent[];
  primaryType: string | null;
  secondaryTypes: string[];
  value: string[];
  onToggle: (id: string) => void;
}) {
  const exclude = new Set([primaryType, ...secondaryTypes].filter(Boolean) as string[]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, fontFamily: FONTS.body }}>
      {allowedParents.flatMap(p => p.children).filter(c => !exclude.has(c.id)).map(c => {
        const active = value.includes(c.id);
        return (
          <button key={c.id} type="button" onClick={() => onToggle(c.id)} style={{
            padding: "5px 11px", borderRadius: 999,
            border: `1px ${active ? "solid" : "dashed"} ${active ? COLORS.indigo : COLORS.border}`,
            background: active ? COLORS.indigoSoft : "transparent",
            color: active ? COLORS.indigoDeep : COLORS.inkMuted,
            fontSize: 11, fontWeight: 500, cursor: "pointer",
          }}>{c.label}</button>
        );
      })}
    </div>
  );
}

// ── Seasonal availability ────────────────────────────────────────────

export function SeasonalEditor({ windows, onChange }: {
  windows: SeasonalWindow[];
  onChange: (w: SeasonalWindow[]) => void;
}) {
  const [draft, setDraft] = useState<{ city: string; startMonth: number; endMonth: number }>({ city: "", startMonth: 11, endMonth: 4 });
  const monthName = (m: number) => ["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m] ?? String(m);
  return (
    <div style={{ fontFamily: FONTS.body }}>
      {windows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {windows.map(w => (
            <div key={w.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 10,
              background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, flex: 1 }}>
                {w.city} · {monthName(w.startMonth)}–{monthName(w.endMonth)}
              </span>
              <button type="button" onClick={() => onChange(windows.filter(x => x.id !== w.id))} aria-label="Remove" style={{
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                color: COLORS.inkMuted, fontSize: 14, lineHeight: 1, fontWeight: 700, width: 20,
              }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" value={draft.city} onChange={(e) => setDraft(d => ({ ...d, city: e.target.value }))}
          placeholder="City — e.g. Tulum"
          style={{
            flex: 1, minWidth: 140, padding: "8px 12px", borderRadius: 8,
            border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
            fontSize: 12.5, color: COLORS.ink, outline: "none",
          }}
        />
        <select value={draft.startMonth} onChange={(e) => setDraft(d => ({ ...d, startMonth: Number(e.target.value) }))}
          style={{ padding: "8px 8px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12, color: COLORS.ink, background: "#fff" }}>
          {Array.from({ length: 12 }).map((_, i) => <option key={i+1} value={i+1}>{monthName(i+1)}</option>)}
        </select>
        <span style={{ color: COLORS.inkDim, fontSize: 11 }}>→</span>
        <select value={draft.endMonth} onChange={(e) => setDraft(d => ({ ...d, endMonth: Number(e.target.value) }))}
          style={{ padding: "8px 8px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12, color: COLORS.ink, background: "#fff" }}>
          {Array.from({ length: 12 }).map((_, i) => <option key={i+1} value={i+1}>{monthName(i+1)}</option>)}
        </select>
        <button type="button" onClick={() => {
          if (!draft.city.trim()) return;
          onChange([...windows, { id: `season-${Date.now()}`, ...draft }]);
          setDraft({ city: "", startMonth: 11, endMonth: 4 });
        }} disabled={!draft.city.trim()} style={{
          padding: "8px 14px", borderRadius: 8, border: "none",
          background: draft.city.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
          color: draft.city.trim() ? "#fff" : COLORS.inkDim,
          fontSize: 12, fontWeight: 600, cursor: draft.city.trim() ? "pointer" : "default",
        }}>Add</button>
      </div>
    </div>
  );
}

// ── Recurring + vacation ─────────────────────────────────────────────

export function RecurringPatternEditor({ value, vacation, onChange, onVacationChange }: {
  value: RecurringPattern;
  vacation: VacationWindow | null;
  onChange: (r: RecurringPattern) => void;
  onVacationChange: (v: VacationWindow | null) => void;
}) {
  const dows = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 6 }}>
          Recurring pattern
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {([
            { id: "none" as const,           label: "No pattern" },
            { id: "weekends-only" as const,  label: "Weekends only" },
            { id: "weekdays-only" as const,  label: "Weekdays only" },
            { id: "weekly-busy" as const,    label: "Weekly busy days" },
          ]).map(o => {
            const active = value.kind === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onChange({ kind: o.id, busyDays: o.id === "weekly-busy" ? value.busyDays ?? [] : undefined })} style={{
                padding: "6px 11px", borderRadius: 999,
                border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                background: active ? "rgba(15,79,62,0.08)" : "#fff",
                color: active ? COLORS.accentDeep : COLORS.ink,
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              }}>{o.label}</button>
            );
          })}
        </div>
        {value.kind === "weekly-busy" && (
          <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
            {dows.map((d, i) => {
              const active = value.busyDays?.includes(i) ?? false;
              return (
                <button key={i} type="button" onClick={() => {
                  const cur = value.busyDays ?? [];
                  const next = active ? cur.filter(x => x !== i) : [...cur, i];
                  onChange({ kind: "weekly-busy", busyDays: next });
                }} style={{
                  width: 32, height: 32, borderRadius: "50%", border: "none",
                  background: active ? COLORS.amberDeep : COLORS.surface,
                  color: active ? "#fff" : COLORS.inkMuted,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>{d}</button>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, marginBottom: 6 }}>
          Vacation mode
        </div>
        {vacation ? (
          <div style={{
            padding: "10px 12px", borderRadius: 10,
            background: COLORS.indigoSoft, border: `1px solid rgba(91,107,160,0.18)`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.indigoDeep, flex: 1 }}>
              Out {vacation.start} → {vacation.end}
            </span>
            <button type="button" onClick={() => onVacationChange(null)} style={{
              padding: "5px 10px", borderRadius: 8, border: "none",
              background: "#fff", color: COLORS.indigoDeep,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="date" id="vacstart" style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12 }} />
            <span style={{ color: COLORS.inkDim, fontSize: 11 }}>→</span>
            <input type="date" id="vacend"   style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12 }} />
            <button type="button" onClick={() => {
              const s = (document.getElementById("vacstart") as HTMLInputElement)?.value;
              const e = (document.getElementById("vacend") as HTMLInputElement)?.value;
              if (s && e) onVacationChange({ start: s, end: e });
            }} style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: COLORS.fill, color: "#fff",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Set vacation</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Package rates ────────────────────────────────────────────────────

export function PackageRatesEditor({ packages, onChange }: {
  packages: PackageRate[];
  onChange: (p: PackageRate[]) => void;
}) {
  const add = () => onChange([...packages, {
    id: `pkg-${Date.now()}`, name: "", description: "", amount: 0, currency: "EUR",
  }]);
  const update = (id: string, p: Partial<PackageRate>) =>
    onChange(packages.map(x => x.id === id ? { ...x, ...p } : x));
  const remove = (id: string) => onChange(packages.filter(x => x.id !== id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {packages.map(p => (
        <div key={p.id} style={{
          padding: 12, borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
        }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input type="text" value={p.name} onChange={(e) => update(p.id, { name: e.target.value })}
              placeholder="Package name — e.g. 1-day shoot + social repost"
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 8,
                border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 13, fontWeight: 600, color: COLORS.ink, outline: "none",
              }}
            />
            <button type="button" onClick={() => remove(p.id)} aria-label="Remove" style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: "transparent", color: COLORS.inkMuted, fontSize: 16, cursor: "pointer",
            }}>×</button>
          </div>
          <textarea value={p.description} onChange={(e) => update(p.id, { description: e.target.value })}
            placeholder="What's included — e.g. 1 day on set + 1 Instagram repost within 7 days"
            rows={2}
            style={{
              width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 12, color: COLORS.ink, outline: "none", resize: "vertical",
              marginBottom: 6,
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={p.currency} onChange={(e) => update(p.id, { currency: e.target.value })} style={{
              padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff", fontSize: 12, color: COLORS.ink,
            }}>
              <option value="EUR">€ EUR</option>
              <option value="USD">$ USD</option>
              <option value="GBP">£ GBP</option>
              <option value="MXN">$ MXN</option>
            </select>
            <input type="number" min={0} value={p.amount} onChange={(e) => update(p.id, { amount: Number(e.target.value) })}
              placeholder="0"
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8,
                border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 13, color: COLORS.ink, outline: "none",
              }}
            />
            <input type="text" value={p.conditions ?? ""} onChange={(e) => update(p.id, { conditions: e.target.value })}
              placeholder="Conditions"
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 12, color: COLORS.ink, outline: "none",
              }}
            />
          </div>
        </div>
      ))}
      <button type="button" onClick={add} style={{
        padding: "9px 14px", borderRadius: 10,
        background: "transparent", border: `1.5px dashed ${COLORS.border}`,
        color: COLORS.inkMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}>+ Add package</button>
    </div>
  );
}

// ── Past clients + testimonials ──────────────────────────────────────

export type PastClientsEditorProps = {
  clients: PastClient[];
  onChange: (c: PastClient[]) => void;
};

export const PastClientsEditor = React.memo(({ clients, onChange }: PastClientsEditorProps) => {
  const add = () => onChange([...clients, { id: `pc-${Date.now()}`, name: "", testimonial: "", testimonialBy: "" }]);
  const update = (id: string, p: Partial<PastClient>) =>
    onChange(clients.map(x => x.id === id ? { ...x, ...p } : x));
  const remove = (id: string) => onChange(clients.filter(x => x.id !== id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {clients.map(c => (
        <div key={c.id} style={{
          padding: 12, borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
        }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input type="text" value={c.name} onChange={(e) => update(c.id, { name: e.target.value })}
              placeholder="Client name — e.g. Mango"
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 8,
                border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 13, fontWeight: 600, color: COLORS.ink, outline: "none",
              }}
            />
            {c.verified && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                background: COLORS.successSoft, color: COLORS.successDeep,
              }}>✓ Verified booking</span>
            )}
            <button type="button" onClick={() => remove(c.id)} aria-label="Remove" style={{
              width: 28, height: 28, borderRadius: 8, border: "none",
              background: "transparent", color: COLORS.inkMuted, fontSize: 14, cursor: "pointer",
            }}>×</button>
          </div>
          <textarea value={c.testimonial ?? ""} onChange={(e) => update(c.id, { testimonial: e.target.value })}
            placeholder="One-line testimonial…"
            rows={2}
            style={{
              width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 12, color: COLORS.ink, outline: "none", resize: "vertical",
              marginBottom: 6,
            }}
          />
          <input type="text" value={c.testimonialBy ?? ""} onChange={(e) => update(c.id, { testimonialBy: e.target.value })}
            placeholder="By — e.g. Marco Russo, photographer"
            style={{
              width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 11.5, color: COLORS.inkMuted, outline: "none",
            }}
          />
        </div>
      ))}
      <button type="button" onClick={add} style={{
        padding: "9px 14px", borderRadius: 10,
        background: "transparent", border: `1.5px dashed ${COLORS.border}`,
        color: COLORS.inkMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}>+ Add client</button>
    </div>
  );
});

// ── Next-tier coach (in trust section) ──────────────────────────────

export function NextTierCoach({ tier, verifications }: {
  tier: TrustTier;
  verifications: Verifications;
}) {
  if (tier === "gold") {
    return (
      <div style={{
        padding: 12, borderRadius: 10, marginTop: 12,
        background: "rgba(184,135,49,0.10)",
        border: "1px solid rgba(184,135,49,0.25)",
        fontSize: 12, color: "#7A5A1F", fontFamily: FONTS.body, lineHeight: 1.5,
      }}>★ You've reached the top tier. Keep delivering on bookings to stay there.</div>
    );
  }
  let nextSteps: string[] = [];
  if (tier === "basic") {
    if (!verifications.idSubmitted)     nextSteps.push("Submit a government ID");
    if (!verifications.payoutConnected) nextSteps.push("Connect a payout method");
  } else if (tier === "verified") {
    nextSteps.push("Complete 1 booking on Tulala to reach Silver");
  } else if (tier === "silver") {
    if (verifications.bookingsCount < 5) {
      nextSteps.push(`${5 - verifications.bookingsCount} more bookings`);
    }
    if (!verifications.hasFundedClient) {
      nextSteps.push("1 funded-account client booking");
    }
  }
  if (nextSteps.length === 0) return null;
  const targetTier: TrustTier = tier === "basic" ? "verified" : tier === "verified" ? "silver" : "gold";
  const targetMeta = TALENT_TRUST_META[targetTier];
  return (
    <div style={{
      padding: 12, borderRadius: 10, marginTop: 12,
      background: targetMeta.bg, border: `1px solid ${targetMeta.fg}30`,
      fontFamily: FONTS.body,
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: targetMeta.fg, marginBottom: 6 }}>
        Reach {targetMeta.label} {targetMeta.emoji}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: COLORS.ink, lineHeight: 1.55 }}>
        {nextSteps.map(s => <li key={s}>{s}</li>)}
      </ul>
    </div>
  );
}


// ── Field-lock toggle (admin) ────────────────────────────────────────

export function FieldLockToggle({ path, locks, onChange, fieldLabel }: {
  path: FieldLockPath;
  locks: FieldLockPath[];
  onChange: (next: FieldLockPath[]) => void;
  /** Audit #5 — when the toggle is rendered away from its field (e.g.
   *  the admin lock cluster), pass the field's friendly name so the
   *  pill says WHICH field it controls instead of being an orphan. */
  fieldLabel?: string;
}) {
  const copy = useDashboardText();
  const isLocked = locks.includes(path);
  return (
    <button
      type="button"
      title={copy.t(isLocked ? "Talent can't edit this. Tap to unlock." : "Talent can edit this. Tap to lock.")}
      onClick={() => onChange(isLocked ? locks.filter(x => x !== path) : [...locks, path])}
      style={{
        padding: "4px 9px", borderRadius: 999,
        border: `1px solid ${isLocked ? COLORS.amberDeep : COLORS.borderSoft}`,
        background: isLocked ? COLORS.amberSoft : "#fff",
        color: isLocked ? COLORS.amberDeep : COLORS.inkMuted,
        fontSize: 10.5, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
        display: "inline-flex", alignItems: "center", gap: 4,
      }}
    >
      {fieldLabel && (
        <span style={{ fontWeight: 700, color: COLORS.ink }}>
          {copy.t(fieldLabel)} ·
        </span>
      )}
      {isLocked ? `🔒 ${copy.t("Talent can't edit")}` : `🔓 ${copy.t("Talent can edit")}`}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// Branding
// ════════════════════════════════════════════════════════════════════

// ── Watermark position grid ──────────────────────────────────────────────────

export function NewTalentDrawer() {
  const { state, closeDrawer, openDrawer, toast, bulkAddTalent, tenantSlug, effectiveTenant } = useAdminShell();
  const router = useRouter();
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [isPending, startTransition] = useTransition();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // Hold the actual File so we can upload it as a `card` variant after
  // addTalentToRoster returns the new talentProfileId. The blob URL above
  // is only for preview.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("+34");
  const [primaryType, setPrimaryType] = useState<string | null>(null);
  // A6 — multi-role parity. Wizard + edit drawer collect secondary
  // types; admin add couldn't, forcing a 2-step process (add + open
  // shell + add secondaries). Now NewTalentDrawer carries secondaries
  // through the seed handoff so the talent's roster card + dashboard
  // immediately reflect "Model + Host" on first save.
  const [secondaryTypes, setSecondaryTypes] = useState<string[]>([]);
  const [homeBase, setHomeBase] = useState("");
  // Default to "agency" so the most-used path (admin fills full profile)
  // is the visible default — the field-list preview spells out exactly
  // what the admin will get on the next screen.
  const [method, setMethod] = useState<"agency" | "invited" | "draft">("agency");
  const [showMore, setShowMore] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // #12 — Tab between single-talent quick-add and CSV bulk import.
  const [addMode, setAddMode] = useState<"single" | "csv">("single");

  // Live taxonomy (PR-A) — picker source.
  const live = useLiveTaxonomy();
  const planRank = (p: "free" | "studio" | "agency" | "network") =>
    ({ free: 0, studio: 1, agency: 2, network: 3 } as const)[p];
  const currentRank = planRank(state.plan as "free" | "studio" | "agency" | "network");
  const allowedParentIds = new Set(
    WORKSPACE_TAXONOMY_DEFAULT
      .filter(s => s.isEnabled && s.showInRegistration)
      .map(s => s.parentId as string)
  );
  const filterByWorkspace = (lp: LiveTaxonomyParent) =>
    allowedParentIds.has(lp.raw.slug) || lp.display.id === lp.raw.slug;
  const visibleParentsLP = live.visibleParents.filter(filterByWorkspace).filter(lp => planRank(lp.display.minPlan) <= currentRank);
  const restParentsLP = live.restParents.filter(filterByWorkspace).filter(lp => planRank(lp.display.minPlan) <= currentRank);
  const allowedParents = (showMore ? [...visibleParentsLP, ...restParentsLP] : visibleParentsLP).map(lp => lp.display);

  const computedDisplayName = displayName.trim() || `${firstName.trim()} ${lastName.trim()}`.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const minimumValid = firstName.trim().length > 0 && lastName.trim().length > 0 && !!primaryType && homeBase.trim().length > 0;
  const inviteValid = minimumValid && emailValid;

  // #4 — Sync QuickAdd state into the shared draft store (debounced).
  // Shell reads from this on mount so first/last/email/phone/photo flow
  // through without lossy seed-data prop-drilling.
  useEffect(() => {
    const t = setTimeout(() => {
      patchProfileDraft("default", {
        firstName, lastName, displayName,
        email, phone, phoneCountry,
        primaryType, homeBase, method,
        photoUrl, photoCount: photoUrl ? 1 : 0,
      } as Partial<ProfileDraft>, "quick-add");
    }, 350);
    return () => clearTimeout(t);
  }, [firstName, lastName, displayName, email, phone, phoneCountry, primaryType, homeBase, method, photoUrl]);

  const seedForShell = () => ({
    stageName: computedDisplayName,
    primaryType: primaryType ?? undefined,
    secondaryTypes,
    homeBase,
    method,
    contact: email,
  });

  // ── CTA handlers — use real server action in production, mock in prototype ──
  const runAdd = (managementMethod: "agency" | "invited" | "draft", afterOk: (id?: string) => void) => {
    if (!tenantSlug) {
      // Prototype / preview mode — local mock only
      toast(managementMethod === "invited" ? `Invite sent to ${email}` : `${computedDisplayName || "Talent"} saved`);
      clearProfileDraft("default");
      closeDrawer();
      return;
    }
    startTransition(async () => {
      const result = await addTalentToRoster({
        tenantSlug: tenantSlug!,
        firstName,
        lastName,
        displayName,
        email,
        phone: phoneCountry && phone ? `${phoneCountry} ${phone}` : phone,
        homeBase,
        primaryTypeSlugorId: primaryType ?? undefined,
        secondaryTypeSlugorIds: secondaryTypes,
        managementMethod,
      });
      if (!result.ok) {
        toast(result.error, { tone: "error" });
        return;
      }

      // Upload the optional avatar file as the talent's `card` variant
      // (the public roster card photo). Best-effort — surface a toast on
      // failure but don't block the add flow.
      if (result.talentProfileId && photoFile) {
        try {
          const fd = new FormData();
          fd.append("file", photoFile);
          const upRes = await actionUploadAndAssignMedia(fd, result.talentProfileId, "card");
          if (!upRes.ok) toast(`Photo upload failed: ${upRes.error}`, { tone: "error" });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[NewTalentDrawer photo upload]", err);
          toast("Photo upload failed — talent created without photo", { tone: "error" });
        }
      }

      if (result.warnings?.length) {
        result.warnings.forEach(w => toast(w, { tone: "error" }));
      }
      clearProfileDraft("default");
      queueRouterRefresh();
      afterOk(result.talentProfileId);
    });
  };

  const sendInvite = () => {
    if (!inviteValid) return;
    runAdd("invited", () => {
      toast(`Invite sent to ${email}`);
      closeDrawer();
    });
  };
  const continueEditing = () => {
    if (!minimumValid) return;
    if (!tenantSlug) {
      // Prototype mode — open profile shell directly without persisting
      closeDrawer();
      openDrawer("talent-profile-shell", { mode: "create", seed: seedForShell() });
      return;
    }
    runAdd("agency", (talentProfileId) => {
      closeDrawer();
      if (talentProfileId) {
        // Navigate to the real edit page for this newly-created talent
        router.push(`/${tenantSlug}/admin/roster/${talentProfileId}`);
      } else {
        openDrawer("talent-profile-shell", { mode: "create", seed: seedForShell() });
      }
    });
  };
  const saveDraft = () => {
    if (!minimumValid) return;
    runAdd("draft", () => {
      toast(`${computedDisplayName || "Talent"} saved as draft`);
      closeDrawer();
    });
  };

  // Primary CTA copy is intentionally explicit so admins know what
  // happens next. Invited → email goes out and talent finishes their
  // own profile. Agency-managed → drawer hands off to the full Profile
  // Shell where admin completes everything. Draft → quietly saves.
  const primaryAction = method === "invited"
    ? { label: isPending ? "Sending…" : "Send claim invite", run: sendInvite, enabled: inviteValid && !isPending }
    : method === "draft"
    ? { label: isPending ? "Saving…" : "Save as draft", run: saveDraft, enabled: minimumValid && !isPending }
    : { label: isPending ? "Creating…" : "Create + open full profile", run: continueEditing, enabled: minimumValid && !isPending };

  // #11 — Paste a vCard / Instagram handle / LinkedIn URL / plain text
  // contact. Parser detects shape and autofills first name + last name +
  // email + phone. Saves admins ~30 seconds per add when they're working
  // from a contact card or social page.
  const [pasteOpen, setPasteOpen] = useState(false);
  const applyPaste = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    let firstParsed = "", lastParsed = "", emailParsed = "", phoneParsed = "";
    // 1. vCard
    if (/BEGIN:VCARD/i.test(text)) {
      const fnLine = /(?:^|\n)FN[:;].*?:(.+)/i.exec(text);
      if (fnLine) {
        const parts = fnLine[1].trim().split(/\s+/);
        firstParsed = parts[0] ?? "";
        lastParsed = parts.slice(1).join(" ");
      }
      const emailLine = /(?:^|\n)EMAIL[:;].*?:([^\s\n]+)/i.exec(text);
      if (emailLine) emailParsed = emailLine[1];
      const telLine = /(?:^|\n)TEL[:;].*?:([+\d\s()-]+)/i.exec(text);
      if (telLine) phoneParsed = telLine[1].trim();
    } else if (/@[\w.]+|instagram\.com|linkedin\.com/i.test(text)) {
      // 2. IG handle / LinkedIn URL — extract handle as a hint, no email.
      const igMatch = /(?:instagram\.com\/|^@)([\w.]+)/i.exec(text);
      if (igMatch) {
        const handle = igMatch[1];
        // Best-effort: capitalize handle as a name guess
        firstParsed = handle.split(".")[0].replace(/^\w/, c => c.toUpperCase());
      }
      const liMatch = /linkedin\.com\/in\/([\w-]+)/i.exec(text);
      if (liMatch) {
        const slug = liMatch[1];
        const parts = slug.split("-");
        firstParsed = (parts[0] ?? "").replace(/^\w/, c => c.toUpperCase());
        lastParsed = parts.slice(1).map(p => p.replace(/^\w/, c => c.toUpperCase())).join(" ");
      }
    } else {
      // 3. Plain text — pull email + phone + first non-email-or-phone line as name
      const emailHit = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text);
      if (emailHit) emailParsed = emailHit[0];
      const phoneHit = /(\+?\d[\d\s().-]{7,})/.exec(text);
      if (phoneHit) phoneParsed = phoneHit[1].trim();
      const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
      const nameLine = lines.find(l => l !== emailParsed && !l.includes(phoneParsed) && !/[@+]/.test(l));
      if (nameLine) {
        const parts = nameLine.split(/\s+/);
        firstParsed = parts[0] ?? "";
        lastParsed = parts.slice(1).join(" ");
      }
    }
    if (firstParsed) setFirstName(firstParsed);
    if (lastParsed) setLastName(lastParsed);
    if (emailParsed) setEmail(emailParsed);
    if (phoneParsed) setPhone(phoneParsed.replace(/^\+\d+\s?/, ""));
    setPasteOpen(false);
    const filled: string[] = [];
    if (firstParsed || lastParsed) filled.push("name");
    if (emailParsed) filled.push("email");
    if (phoneParsed) filled.push("phone");
    toast(filled.length ? `Pasted: ${filled.join(", ")}` : "No fields recognized");
  };
  const handlePasteFromClipboard = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        applyPaste(text);
      } catch {
        setPasteOpen(true);
      }
    } else {
      setPasteOpen(true);
    }
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Add talent"
      description="Just the essentials here. Everything else — bio, photos, location, type-specific fields, languages, rates — lives in the full profile, opened next."
      width={620}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          {method !== "invited" && method !== "agency" && (
            <SecondaryButton onClick={continueEditing}>Continue editing</SecondaryButton>
          )}
          <span
            title={!primaryAction.enabled && !isPending ? "Pick a primary type and home base to continue" : undefined}
            style={{ display: "inline-flex" }}
          >
            <PrimaryButton
              onClick={primaryAction.run}
              disabled={!primaryAction.enabled}
            >
              {primaryAction.label}
            </PrimaryButton>
          </span>
        </>
      }
    >
      {/* #12 — Tab strip: Single talent / Bulk via CSV. Single tab keeps
          the existing form; CSV tab shows a paste/upload area + preview
          table + bulk-create CTA. */}
      <div style={{
        display: "inline-flex", padding: 3, borderRadius: 999,
        background: "rgba(11,11,13,0.04)", marginBottom: 14,
        fontFamily: FONTS.body,
      }}>
        {([
          { id: "single" as const, label: "Single talent" },
          { id: "csv" as const,    label: "Bulk via CSV" },
        ]).map(t => {
          const active = addMode === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setAddMode(t.id)} style={{
              padding: "6px 14px", borderRadius: 999, border: "none",
              background: active ? "#fff" : "transparent",
              color: active ? COLORS.ink : COLORS.inkMuted,
              fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
              cursor: "pointer",
              boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
            }}>{t.label}</button>
          );
        })}
      </div>

      {addMode === "csv" && (
        <CsvBulkAddPanel
          allowedParents={allowedParents}
          onComplete={async (rows, defaultType) => {
            // Map CSV "type" column → taxonomy slug. Falls back to defaultType.
            const allTypes = allowedParents.flatMap(p => p.children);
            const matchType = (label: string): string | undefined => {
              if (!label) return undefined;
              const norm = label.toLowerCase().replace(/[\s_-]+/g, "-");
              return allTypes.find(c =>
                c.id === norm
                || c.label.toLowerCase().replace(/[\s_-]+/g, "-") === norm
                || c.label.toLowerCase().includes(label.toLowerCase())
              )?.id;
            };

            // Live mode — fire the real bulk action that writes each row to
            // talent_profiles + agency_talent_roster. Per-row errors don't
            // abort the batch; the toast surfaces created vs failed counts.
            if (tenantSlug) {
              const liveRows = rows.map(r => ({
                firstName: r.firstName,
                lastName: r.lastName,
                email: r.email,
                homeBase: r.city,
                primaryTypeSlugorId: matchType(r.type) ?? defaultType ?? undefined,
              }));
              startTransition(async () => {
                const res = await bulkAddTalentToRoster(tenantSlug, liveRows);
                if (!res.ok) {
                  toast(res.error, { tone: "error" });
                  return;
                }
                if (res.failed > 0) {
                  // eslint-disable-next-line no-console
                  console.warn("[bulk-add talent] failures:", res.errors);
                  toast(`Created ${res.created} of ${res.created + res.failed}. ${res.failed} failed — see console.`, { tone: res.created > 0 ? undefined : "error" });
                } else {
                  toast(`Created ${res.created} talent profile${res.created === 1 ? "" : "s"}`);
                }
                if (res.created > 0) {
                  queueRouterRefresh();
                  closeDrawer();
                }
              });
              return;
            }

            // Mock mode (no tenant) — fall back to the prototype's local
            // pending-talent queue so the prototype demo path still works.
            const enriched = rows.map(r => ({
              firstName: r.firstName,
              lastName: r.lastName,
              email: r.email,
              primaryType: matchType(r.type) ?? defaultType ?? undefined,
              city: r.city,
            }));
            const created = bulkAddTalent(enriched);
            if (created > 0) {
              toast(`Created ${created} draft${created === 1 ? "" : "s"} · review in Approvals`);
              closeDrawer();
              openDrawer("talent-approvals");
            } else {
              toast("No valid rows — each row needs first name + email");
            }
          }}
        />
      )}

      {addMode === "single" && (
        <>
      {/* Power-user shortcut bar */}
      <div style={{
        display: "flex", gap: 6, alignItems: "center", marginBottom: 14,
        flexWrap: "wrap", fontFamily: FONTS.body,
      }}>
        <button type="button" onClick={handlePasteFromClipboard} title="Paste vCard / IG handle / LinkedIn URL / plain text" style={{
          padding: "6px 12px", borderRadius: 999,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink,
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>📋 Paste contact</button>
        <span style={{ fontSize: 11, color: COLORS.inkDim }}>
          vCard · @handle · linkedin.com/in/… · plain text
        </span>
      </div>

      {/* Hero — photo + name + display + pronunciation */}
      <div style={{
        display: "flex", gap: 14, alignItems: "flex-start",
        padding: 14, borderRadius: 14,
        background: COLORS.surface,
        border: `1px solid ${COLORS.borderSoft}`,
        marginBottom: 16,
      }}>
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Upload photo" style={{
          width: 88, height: 88, flexShrink: 0,
          borderRadius: 14,
          background: photoUrl
            ? `url(${photoUrl}) center/cover, ${COLORS.surfaceAlt}`
            : COLORS.surfaceAlt,
          border: photoUrl ? "none" : `1.5px dashed ${COLORS.borderSoft}`,
          cursor: "pointer", color: COLORS.inkMuted,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          fontFamily: FONTS.body, fontSize: 10, fontWeight: 600,
          position: "relative", overflow: "hidden",
        }}>
          {!photoUrl && (<>
            <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
            <span>Photo</span>
          </>)}
          {photoUrl && (
            <span style={{
              position: "absolute", bottom: 4, right: 4,
              padding: "2px 6px", borderRadius: 999,
              background: "rgba(11,11,13,0.65)", color: "#fff",
              fontSize: 9, fontWeight: 600,
            }}>Replace</span>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setPhotoUrl(URL.createObjectURL(f));
              setPhotoFile(f);
            }
            e.target.value = "";
          }}
        />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
              style={qaInputStyle()}
            />
            <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)}
              style={qaInputStyle()}
            />
          </div>
          <input type="text"
            placeholder={firstName || lastName ? `Display name · defaults to ${computedDisplayName}` : "Display name (optional)"}
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            style={qaInputStyle()}
          />
        </div>
      </div>

      {/* Contact */}
      <Section title="Contact" framed>
        <FieldRow label="Email"
          hint={method === "invited" ? "Required — they'll receive a claim link." : "Optional — used for booking comms."}
        >
          <div style={{ position: "relative" }}>
            <input type="email" placeholder="talent@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 90px 10px 12px", borderRadius: 10,
                border: `1px solid ${email && !emailValid ? COLORS.amberDeep : COLORS.border}`,
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
                background: "#fff",
              }}
            />
            {email && (
              <span style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                fontSize: 10.5, fontWeight: 600,
                color: emailValid ? COLORS.successDeep : COLORS.amberDeep,
              }}>{emailValid ? "✓ valid" : "check format"}</span>
            )}
          </div>
        </FieldRow>
        <FieldRow label="Phone" optional hint="Used for SMS verification + day-of booking comms.">
          <div style={{ display: "flex", gap: 6 }}>
            <select value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)} style={{
              padding: "10px 10px", borderRadius: 10,
              border: `1px solid ${COLORS.border}`, background: "#fff",
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
              flexShrink: 0,
            }}>
              <option value="+34">🇪🇸 +34</option>
              <option value="+52">🇲🇽 +52</option>
              <option value="+1">🇺🇸 +1</option>
              <option value="+44">🇬🇧 +44</option>
              <option value="+33">🇫🇷 +33</option>
              <option value="+39">🇮🇹 +39</option>
              <option value="+49">🇩🇪 +49</option>
              <option value="+351">🇵🇹 +351</option>
            </select>
            <input type="tel" placeholder="612 345 678"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              style={qaInputStyle()}
            />
          </div>
        </FieldRow>
      </Section>

      {/* Talent Type */}
      <Section title="Primary Talent Type" framed>
        {/* Sticky confirmation — shows immediately after picking so the
            operator knows the selection registered without needing to scroll */}
        {primaryType && (() => {
          const match = allowedParents.flatMap(p => p.children.map(c => ({ parent: p, child: c }))).find(x => x.child.id === primaryType);
          return match ? (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 10px 5px 7px", borderRadius: 999,
              background: "rgba(11,11,13,0.06)", border: `1px solid ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: COLORS.ink,
              marginBottom: 10,
            }}>
              <span style={{ color: COLORS.green, fontSize: 11 }}>✓</span>
              <span>{match.child.label}</span>
              <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>under {match.parent.label}</span>
              <button type="button" onClick={() => setPrimaryType(null)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.inkMuted, fontSize: 13, padding: 0, lineHeight: 1,
              }} title="Clear selection">×</button>
            </div>
          ) : null;
        })()}
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 8, lineHeight: 1.5 }}>
          What clients book this person as. Add secondary roles below — this matches what registration collects.
        </div>
        <PrimaryTalentTypeGrid parents={allowedParents} selected={primaryType} onPick={(id) => setPrimaryType(id)} />
        {restParentsLP.length > 0 && (
          <button type="button" onClick={() => setShowMore(s => !s)} style={{
            marginTop: 10, padding: "6px 12px", borderRadius: 999,
            background: "transparent", border: `1px dashed ${COLORS.border}`,
            color: COLORS.inkMuted, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
            fontFamily: FONTS.body,
          }}>
            {showMore ? `– Hide ${restParentsLP.length} more` : `+ More… (${restParentsLP.length})`}
          </button>
        )}
        <div style={{ marginTop: 6, fontSize: 10.5, color: COLORS.inkDim }}>
          {live.source === "live" ? "Live taxonomy ·" : "Local fixture ·"} {visibleParentsLP.length} visible · {restParentsLP.length} more
        </div>
      </Section>

      {/* A6 — Secondary talent types. Multi-role parity with the
          wizard. Renders only after a primary is picked so the
          options stay focused. The hint links the user back to the
          parent grid for rare combinations. */}
      {primaryType && (() => {
        // Build candidate parents EXCLUDING the parent of the primary
        // — secondary should add NEW capabilities, not duplicate.
        const primaryParent = TAXONOMY.find(p => p.children.some(c => c.id === primaryType))?.id;
        const candidates = TAXONOMY
          .filter(p => p.id !== primaryParent)
          .filter(p => allowedParentIds.has(p.id))
          .filter(p => planRank((WORKSPACE_TAXONOMY_DEFAULT.find(s => s.parentId === p.id)?.parentId
            ? "free" : "free") as "free" | "studio" | "agency" | "network") <= currentRank);
        return (
          <Section title="Secondary talent types" framed>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
              Optional. Pick categories this talent ALSO works in — e.g. a model who also hosts, or a host who also drives. Multi-role profiles surface in more searches.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {candidates.map(p => {
                const active = secondaryTypes.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSecondaryTypes(prev =>
                      active ? prev.filter(x => x !== p.id) : [...prev, p.id]
                    )}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "6px 12px", borderRadius: 999,
                      border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                      background: active ? "rgba(15,79,62,0.08)" : "#fff",
                      color: active ? COLORS.accentDeep : COLORS.ink,
                      fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 13 }}>{p.emoji}</span>
                    <span>+ {p.label}</span>
                  </button>
                );
              })}
            </div>
            {secondaryTypes.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 10.5, color: COLORS.inkDim }}>
                {secondaryTypes.length} secondary {secondaryTypes.length === 1 ? "role" : "roles"} selected.
              </div>
            )}
          </Section>
        );
      })()}

      {/* A4 + A5 — Catalog-driven peek at what the talent will need
          to fill (or what admin should fill on their behalf) once
          they reach the full profile shell. Sourced from
          resolvedFieldsForMode("registration", primaryType) so
          workspace required-overrides are honored. Shows the top
          required + recommendedFor fields per selected role.
          Pure preview — admin doesn't fill them here, just sees
          what's coming. */}
      {primaryType && (() => {
        const allRoles = primaryType ? [primaryType, ...secondaryTypes] : secondaryTypes;
        // Map child id → parent id (catalog applicability is keyed by parent).
        const parentIds = allRoles
          .map(id => TAXONOMY.find(p => p.children.some(c => c.id === id))?.id)
          .filter((x): x is TaxonomyParentId => !!x);
        if (parentIds.length === 0) return null;
        const fields = resolvedFieldsForMode("registration", PROTO_TENANT_ID, parentIds)
          .filter(f => f.tier === "type-specific" && f.id.includes("."))
          .filter(f => parentIds.some(p => f.appliesTo?.includes(p)));
        if (fields.length === 0) return null;
        // Required first, then recommended.
        const required = fields.filter(f => parentIds.some(p => f.requiredFor?.includes(p)) || f.optional === false);
        const recommended = fields.filter(f =>
          !required.includes(f)
          && parentIds.some(p => f.recommendedFor?.includes(p))
        );
        return (
          <Section title="What's collected next" framed>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
              After save, the full profile shell asks for these fields. Catalog-driven — workspace overrides apply.
            </div>
            {required.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
                  color: COLORS.accentDeep ?? COLORS.accent, marginBottom: 4,
                }}>
                  Required ({required.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {required.slice(0, 12).map(f => (
                    <span key={f.id} style={{
                      padding: "2px 8px", borderRadius: 999,
                      background: "rgba(15,79,62,0.08)",
                      color: COLORS.accentDeep ?? COLORS.accent,
                      fontSize: 11, fontWeight: 600,
                      fontFamily: FONTS.body,
                    }}>{f.label}</span>
                  ))}
                  {required.length > 12 && (
                    <span style={{ fontSize: 10.5, color: COLORS.inkMuted, alignSelf: "center" }}>
                      +{required.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}
            {recommended.length > 0 && (
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
                  color: COLORS.inkMuted, marginBottom: 4,
                }}>
                  Recommended ({recommended.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {recommended.slice(0, 8).map(f => (
                    <span key={f.id} style={{
                      padding: "2px 8px", borderRadius: 999,
                      background: "rgba(11,11,13,0.04)",
                      color: COLORS.inkMuted,
                      fontSize: 11, fontWeight: 500,
                      fontFamily: FONTS.body,
                    }}>{f.label}</span>
                  ))}
                  {recommended.length > 8 && (
                    <span style={{ fontSize: 10.5, color: COLORS.inkDim, alignSelf: "center" }}>
                      +{recommended.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </Section>
        );
      })()}

      {/* Home base */}
      <Section title="Home base" framed>
        <FieldRow label="Where is this talent based?" hint="Service areas + travel radius are set in the full profile.">
          <input type="text" placeholder="e.g. Playa del Carmen"
            value={homeBase} onChange={(e) => setHomeBase(e.target.value)}
            style={qaInputStyle()}
          />
        </FieldRow>
      </Section>

      {/* Management */}
      <Section title="Management method">
        <ManagementMethodPicker value={method} onChange={setMethod} />
      </Section>

      {/* Power-user: registration link */}
      <Section title="Or send the registration link" framed>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          fontFamily: FONTS.body,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
              Mobile-first self-registration
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.4 }}>
              The talent fills out their own profile. Goes to your approval queue.
            </div>
          </div>
          <button type="button" onClick={() => openDrawer("talent-registration")} style={{
            padding: "9px 14px", borderRadius: 999,
            background: COLORS.fill, color: "#fff", border: "none",
            fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}>Preview</button>
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => {
              const url = `https://tulala.digital/${effectiveTenant.slug}/join`;
              void navigator.clipboard
                .writeText(url)
                .then(() => toast("Registration link copied"))
                .catch(() => toast("Couldn't copy — copy manually"));
            }}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10,
              background: "transparent", color: COLORS.ink,
              border: `1px dashed ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 12, fontWeight: 500, cursor: "pointer",
              textAlign: "left",
            }}
          >
            tulala.digital/{effectiveTenant.slug}/join · copy link
          </button>
        </div>
      </Section>
        </>
      )}

      {/* Inline hint when required fields aren't filled yet */}
      {addMode === "single" && !minimumValid && (firstName.trim() || lastName.trim()) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 8,
          background: "rgba(11,11,13,0.04)",
          fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted,
          marginTop: 4,
        }}>
          <span style={{ flexShrink: 0 }}>ℹ</span>
          <span>
            {!primaryType && !homeBase.trim()
              ? "Pick a primary type and home base to continue"
              : !primaryType
                ? "Pick a primary type to continue"
                : "Enter a home base to continue"}
          </span>
        </div>
      )}

      {/* #11 — Paste-anywhere fallback when clipboard.readText is denied */}
      {pasteOpen && (
        <PasteContactModal
          onClose={() => setPasteOpen(false)}
          onApply={applyPaste}
        />
      )}
    </DrawerShell>
  );
}

// #12 — CSV bulk add panel. Paste OR upload a CSV; preview the first
// rows; Create N talents at once. Header parsing is heuristic — looks
// for first/last/email/phone/type/city columns case-insensitively.

export function CsvBulkAddPanel({ allowedParents, onComplete }: {
  allowedParents: TaxonomyParent[];
  onComplete: (rows: { firstName: string; lastName: string; email: string; phone: string; type: string; city: string }[], defaultType: string | null) => void;
}) {
  const [raw, setRaw] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [defaultType, setDefaultType] = useState<string | null>(null);
  const parsed = useMemo(() => parseTalentCsv(raw), [raw]);
  const valid = parsed.filter(r => r.firstName.trim() && r.email.trim()).length;
  const sample = `firstName,lastName,email,phone,type,city
Sofia,Lupo,sofia@example.com,+34 612 345 678,Fashion model,Madrid
Carlos,Pérez,carlos@example.com,+52 555 123 4567,DJ,Tulum
Yuna,Park,yuna@example.com,+44 7700 900123,VIP host,London`;

  const handleFile = async (f: File) => {
    const text = await f.text();
    setRaw(text);
  };

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{
        padding: 14, borderRadius: 12,
        background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`,
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink, marginBottom: 4 }}>
          Paste or upload a CSV
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
          Headers we recognize: <code style={{ fontFamily: FONTS.mono }}>firstName, lastName, email, phone, type, city</code>.
          Other column orders work too.
        </div>
        <textarea value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={sample}
          rows={6}
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px",
            borderRadius: 10, border: `1px solid ${COLORS.border}`,
            fontFamily: FONTS.mono, fontSize: 11.5, color: COLORS.ink, outline: "none",
            resize: "vertical", background: "#fff",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={{
            padding: "7px 12px", borderRadius: 999,
            border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>📎 Upload .csv file</button>
          <button type="button" onClick={() => setRaw(sample)} style={{
            padding: "7px 12px", borderRadius: 999,
            border: `1px dashed ${COLORS.border}`, background: "transparent",
            color: COLORS.inkMuted,
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>Use sample</button>
          {raw && (
            <button type="button" onClick={() => setRaw("")} style={{
              padding: "7px 12px", borderRadius: 999, border: "none",
              background: "transparent", color: COLORS.inkMuted,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>Clear</button>
          )}
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>
      </div>

      {parsed.length > 0 && (
        <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.inkMuted, textTransform: "uppercase" }}>
              Preview · {parsed.length} row{parsed.length === 1 ? "" : "s"} ({valid} valid)
            </div>
            <select value={defaultType ?? ""} onChange={(e) => setDefaultType(e.target.value || null)} style={{
              padding: "5px 9px", borderRadius: 6,
              border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
              fontSize: 11, color: COLORS.ink, outline: "none", fontFamily: FONTS.body,
            }}>
              <option value="">Default type · skip</option>
              {allowedParents.flatMap(p => p.children).map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div style={{
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
            overflow: "hidden", marginBottom: 14,
            background: "#fff",
          }}>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONTS.body, fontSize: 12 }}>
                <thead>
                  <tr style={{ background: COLORS.surface }}>
                    <th style={csvCellStyle(true)}>Name</th>
                    <th style={csvCellStyle(true)}>Email</th>
                    <th style={csvCellStyle(true)}>Phone</th>
                    <th style={csvCellStyle(true)}>Type</th>
                    <th style={csvCellStyle(true)}>City</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((r, i) => {
                    const isValid = !!(r.firstName && r.email);
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${COLORS.borderSoft}`, opacity: isValid ? 1 : 0.55 }}>
                        <td style={csvCellStyle(false)}>
                          {`${r.firstName} ${r.lastName}`.trim() || <span style={{ color: COLORS.amberDeep }}>missing name</span>}
                        </td>
                        <td style={csvCellStyle(false)}>
                          {r.email || <span style={{ color: COLORS.amberDeep }}>missing email</span>}
                        </td>
                        <td style={csvCellStyle(false)}>{r.phone || "—"}</td>
                        <td style={csvCellStyle(false)}>{r.type || (defaultType && allowedParents.flatMap(p => p.children).find(c => c.id === defaultType)?.label) || <span style={{ color: COLORS.inkDim }}>—</span>}</td>
                        <td style={csvCellStyle(false)}>{r.city || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {parsed.length > 200 && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: COLORS.amberSoft, color: COLORS.amberDeep, fontSize: 12, marginBottom: 8 }}>
              {parsed.length} rows detected — imports are capped at 200. Trim your CSV to continue.
            </div>
          )}
          <button type="button" onClick={() => onComplete(parsed.slice(0, 200), defaultType)} disabled={valid === 0 || parsed.length > 200} style={{
            width: "100%", padding: "11px 18px", borderRadius: 10, border: "none",
            background: valid > 0 && parsed.length <= 200 ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: valid > 0 && parsed.length <= 200 ? "#fff" : COLORS.inkDim,
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
            cursor: valid > 0 && parsed.length <= 200 ? "pointer" : "default",
          }}>{valid === 0 ? "Add a name + email per row to continue" : parsed.length > 200 ? `Trim to ≤ 200 rows first (${parsed.length} detected)` : `Create ${valid} talent${valid === 1 ? "" : "s"}`}</button>
        </>
      )}

      {parsed.length === 0 && raw.trim() && (
        <div style={{
          padding: 12, borderRadius: 10,
          background: COLORS.amberSoft, color: COLORS.amberDeep,
          fontSize: 12, lineHeight: 1.5,
        }}>
          Couldn't parse this. The first row should be column headers (firstName, lastName, email, …).
        </div>
      )}
    </div>
  );
}


export function csvCellStyle(isHeader: boolean): React.CSSProperties {
  return {
    padding: isHeader ? "8px 10px" : "9px 10px",
    fontSize: isHeader ? 10.5 : 11.5,
    fontWeight: isHeader ? 600 : 500,
    letterSpacing: isHeader ? 0.4 : 0,
    textTransform: isHeader ? "uppercase" : "none",
    color: isHeader ? COLORS.inkMuted : COLORS.ink,
    textAlign: "left",
    whiteSpace: "nowrap",
    maxWidth: 180,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}


export function PasteContactModal({ onClose, onApply }: {
  onClose: () => void;
  onApply: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 250,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480,
        background: "#fff", borderRadius: 14, padding: 20,
        boxShadow: "0 30px 60px -10px rgba(11,11,13,0.4)",
      }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.ink }}>Paste a contact</h3>
        <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          vCard · Instagram handle (@user) · linkedin.com/in/slug · or just paste a name + email + phone.
          We'll extract what we can.
        </p>
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)}
          placeholder="Sofia Lupo&#10;sofia@example.com&#10;+34 612 345 678&#10;@sofia.lupo"
          rows={6}
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px",
            borderRadius: 10, border: `1px solid ${COLORS.border}`,
            fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink, outline: "none",
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose} style={{
            padding: "9px 14px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Cancel</button>
          <button type="button" onClick={() => onApply(text)} disabled={!text.trim()} style={{
            padding: "9px 16px", borderRadius: 999, border: "none",
            background: text.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: text.trim() ? "#fff" : COLORS.inkDim,
            fontSize: 13, fontWeight: 600, cursor: text.trim() ? "pointer" : "default",
          }}>Apply</button>
        </div>
      </div>
    </div>
  );
}


export function qaInputStyle(): React.CSSProperties {
  return {
    flex: 1, width: "100%", boxSizing: "border-box",
    padding: "10px 12px", borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
    background: "#fff",
  };
}

// Talent Type picker — grouped by parent, mobile-first chip grid.
// Used in NewTalentDrawer + (later) TalentProfileShell.
// ════════════════════════════════════════════════════════════════════
// SmartTalentTypePicker — replaces the old "show every type, all the
// time" grid. New shape:
//   1. Search bar with autocomplete across all child types
//   2. "Popular" row — top 8 most-picked (mock frequency for prototype)
//   3. Per-parent collapsed columns; parent header shows count + click
//      to expand the full child list of that parent only
//   4. "Show all" button to reveal every type at once
//
// Performance + cognitive load fix: instead of 200 chips on screen,
// admin sees ~8 popular + a search bar. Power-users type to find.
// ════════════════════════════════════════════════════════════════════

/** Mock popularity score per type id. Higher = more frequently picked. */

export const TYPE_POPULARITY: Record<string, number> = {
  fashion: 95, vip_host: 88, dj: 82, promotional: 78, private_chef: 70,
  fire: 65, dancer: 62, photographer: 58, content: 55, commercial: 52,
  brand_amb: 48, mc: 44, chauffeur: 38, massage: 36, singer: 34,
  belly_dancer: 32, swimwear: 30, yoga: 26, videographer: 24, housekeeper: 20,
  trade_show: 18, butler: 14, airport: 12, mixologist: 10, pastry: 8,
};

// 2026 reset — short parent labels for the prototype UI live in the
// shared module @/lib/taxonomy/parent-labels so the storefront facet,
// the admin drawer, and the prototype all render the same friendly
// names ("Hosts" / "Music" / "Chefs") while the schema preserves the
// canonical full names ("Hosts & Promo" / "Music & DJs" / "Chefs &
// Culinary") for internal lookups.


export function PrimaryTalentTypeGrid({ parents, selected, onPick }: {
  parents: TaxonomyParent[];
  selected: string | null;
  onPick: (id: string) => void;
}) {
  // 2026 reset — UI rule: parent category first, specific talent type second.
  // No flat "Popular · top 8" row of specific types here. No 425-chip
  // show-all wall. The user must drill into a parent to see the types
  // inside it. Search is the escape hatch for power users who already
  // know exactly which type they want.
  const [query, setQuery] = useState("");
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Build flat list of all (parent, child) pairs — used ONLY for the
  // search-typeahead dropdown. Never rendered as a top-level wall.
  type FlatType = { parent: TaxonomyParent; child: TaxonomyChild; popularity: number };
  const flatTypes: FlatType[] = parents.flatMap(p =>
    p.children.map(c => ({
      parent: p,
      child: c,
      popularity: TYPE_POPULARITY[c.id] ?? 5,
    }))
  );

  const q = query.trim().toLowerCase();
  const matched = q.length === 0 ? [] : flatTypes
    .filter(t =>
      t.child.label.toLowerCase().includes(q) ||
      t.parent.label.toLowerCase().includes(q) ||
      (t.child.specialties ?? []).some(s => s.toLowerCase().includes(q))
    )
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 12);

  // If something is selected, show ONLY its pill (matches existing parent-cleared UI)
  const selectedPair = selected ? flatTypes.find(t => t.child.id === selected) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
      {/* Search */}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search talent types — e.g. fashion, host, DJ, chef…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 36px 10px 36px", borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
            fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
            background: "#fff",
          }}
        />
        <span aria-hidden style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: COLORS.inkMuted, fontSize: 14, pointerEvents: "none",
        }}>🔍</span>
        {query && (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            aria-label="Clear search"
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              width: 22, height: 22, borderRadius: "50%", border: "none",
              background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted,
              fontSize: 12, lineHeight: 1, fontWeight: 600, cursor: "pointer",
            }}>×</button>
        )}
        {/* Autocomplete dropdown */}
        {q.length > 0 && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
            background: "#fff", borderRadius: 12,
            border: `1px solid ${COLORS.borderSoft}`,
            boxShadow: "0 14px 36px -10px rgba(11,11,13,0.18)",
            maxHeight: 320, overflowY: "auto",
            padding: 4,
          }}>
            {matched.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 12, color: COLORS.inkMuted }}>
                No matches. Try a broader search.
              </div>
            ) : (
              matched.map(t => {
                const active = selected === t.child.id;
                return (
                  <button key={t.child.id} type="button"
                    onClick={() => { onPick(t.child.id); setQuery(""); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 8,
                      background: active ? "rgba(15,79,62,0.06)" : "transparent",
                      border: "none", width: "100%", textAlign: "left",
                      cursor: "pointer", fontFamily: FONTS.body,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = COLORS.surfaceAlt; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{t.parent.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                        {t.child.label}
                      </span>
                      <span style={{ display: "block", fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>
                        {t.parent.label}{t.child.specialties && t.child.specialties.length > 0 ? ` · ${t.child.specialties.slice(0, 3).join(", ")}` : ""}
                      </span>
                    </span>
                    {t.popularity >= 50 && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 999,
                        background: COLORS.amberSoft, color: COLORS.amberDeep, flexShrink: 0,
                      }}>★ Popular</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* When search is empty: parent categories only. Drill in to see
          the specific talent types under each. No flat wall of specific
          types at the top level — that's the V1 reset rule. */}
      {q.length === 0 && (
        <>
          <div style={{ fontSize: 11.5, color: COLORS.inkDim, lineHeight: 1.4 }}>
            Choose a category to see the specific roles inside it.
          </div>

          {/* Per-parent rolled-up rows */}
          <div style={{
            background: COLORS.surface, borderRadius: 12,
            border: `1px solid ${COLORS.borderSoft}`,
            overflow: "hidden",
          }}>
            {parents.map((parent, i) => {
              const isOpen = expandedParentId === parent.id;
              return (
                <div key={parent.id} style={{
                  borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                }}>
                  <button type="button" onClick={() => setExpandedParentId(isOpen ? null : parent.id)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", border: "none",
                    background: "transparent", cursor: "pointer", textAlign: "left",
                    fontFamily: FONTS.body,
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{parent.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                        {shortParentLabel(parent)}
                      </div>
                      <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>
                        {parent.children.length} type{parent.children.length === 1 ? "" : "s"} · {parent.helper}
                      </div>
                    </div>
                    <span style={{
                      color: COLORS.inkMuted, fontSize: 14,
                      transform: isOpen ? "rotate(90deg)" : "none",
                      transition: "transform .15s",
                    }}>›</span>
                  </button>
                  {isOpen && (
                    <ParentExpandedView
                      parent={parent}
                      selected={selected}
                      onPick={onPick}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 10.5, color: COLORS.inkDim, fontStyle: "italic" }}>
            Looking for something specific? Use the search above.
          </div>
        </>
      )}

      {/* Selection acknowledgment */}
      {selectedPair && (
        <div style={{ fontSize: 11, color: COLORS.inkDim }}>
          ✓ Selected: <strong style={{ color: COLORS.ink, fontWeight: 600 }}>{selectedPair.child.label}</strong> under {selectedPair.parent.label}
        </div>
      )}
    </div>
  );
}

/**
 * 2026 reset — when a parent_category is expanded in PrimaryTalentTypeGrid,
 * we don't dump all its children as a flat chip wall. Instead:
 *   1. Show the TOP N most-popular types (default 6) immediately.
 *   2. Offer a per-parent search input — filters within THIS parent only.
 *   3. Offer a "Show all N more in {parent}" button to reveal the rest.
 *
 * State (search text, show-all toggle) is local to each instance, so each
 * expanded parent has its own scoped UI without leaking into siblings.
 */

export function ParentExpandedView({
  parent,
  selected,
  onPick,
}: {
  parent: TaxonomyParent;
  selected: string | null;
  onPick: (id: string) => void;
}) {
  const TOP_N = 6;
  const [localQuery, setLocalQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const popSorted = useMemo(
    () =>
      [...parent.children].sort(
        (a, b) => (TYPE_POPULARITY[b.id] ?? 0) - (TYPE_POPULARITY[a.id] ?? 0),
      ),
    [parent.children],
  );

  const lq = localQuery.trim().toLowerCase();
  const filtered = lq.length > 0
    ? parent.children.filter(c =>
        c.label.toLowerCase().includes(lq) ||
        (c.specialties ?? []).some(s => s.toLowerCase().includes(lq)),
      )
    : null;

  const visible: TaxonomyChild[] = filtered ?? (showAll ? popSorted : popSorted.slice(0, TOP_N));
  const hidden = filtered ? 0 : Math.max(0, popSorted.length - TOP_N);
  const shortLabel = shortParentLabel(parent);

  return (
    <div style={{ padding: "4px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Per-parent search — only when there are enough children to warrant one */}
      {parent.children.length > TOP_N && (
        <div style={{ position: "relative" }}>
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder={`Search in ${shortLabel}…`}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "7px 28px 7px 28px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
              background: "#fff",
            }}
          />
          <span aria-hidden style={{
            position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
            color: COLORS.inkMuted, fontSize: 12, pointerEvents: "none",
          }}>🔍</span>
          {localQuery && (
            <button type="button" onClick={() => setLocalQuery("")}
              aria-label="Clear search"
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 18, height: 18, borderRadius: "50%", border: "none",
                background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted,
                fontSize: 11, lineHeight: 1, fontWeight: 600, cursor: "pointer",
              }}>×</button>
          )}
        </div>
      )}

      {/* "Top in {parent}" or "All N types" header */}
      {!filtered && (
        <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginTop: 2 }}>
          {showAll
            ? `All ${popSorted.length} types in ${shortLabel}`
            : `Top in ${shortLabel}`}
        </div>
      )}
      {filtered && (
        <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginTop: 2 }}>
          {filtered.length === 0
            ? "No matches in this category."
            : `${filtered.length} match${filtered.length === 1 ? "" : "es"} in ${shortLabel}`}
        </div>
      )}

      {/* Chip list */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {visible.map(c => {
          const active = selected === c.id;
          return (
            <button key={c.id} type="button" onClick={() => onPick(c.id)} style={{
              padding: "6px 11px", borderRadius: 999,
              border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              background: active ? "rgba(15,79,62,0.08)" : "#fff",
              color: active ? COLORS.accentDeep : COLORS.ink,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
              {c.label}
              {(TYPE_POPULARITY[c.id] ?? 0) >= 50 && (
                <span style={{ marginLeft: 5, fontSize: 9, color: COLORS.amberDeep }}>★</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Show-all toggle — only when there are hidden types AND no active filter */}
      {!filtered && hidden > 0 && (
        <button type="button" onClick={() => setShowAll(v => !v)} style={{
          alignSelf: "flex-start", padding: "5px 10px", borderRadius: 999,
          background: "transparent", border: `1px dashed ${COLORS.border}`,
          color: COLORS.inkMuted, fontSize: 11, fontWeight: 500, cursor: "pointer",
          fontFamily: FONTS.body,
        }}>
          {showAll ? `– Show fewer` : `+ Show all ${hidden} more in ${shortLabel}`}
        </button>
      )}
    </div>
  );
}

/**
 * 2026 reset — multi-select sibling picker. Used for "Other roles within
 * {parent}" and for cross-category expanded sections in the Services
 * section. Same Top-N + per-parent search + Show-all UX as ParentExpandedView,
 * but supports MULTI selection (toggling chips).
 *
 * The wall problem: Models has ~40 children. Showing all 40 as chips is
 * overwhelming. This component shows the top 6 by popularity, lets the user
 * search within the parent, and offers an explicit "+ Show all N more"
 * expander for the rest.
 */

export function SiblingTopNPicker({
  children: childTypes,
  selected,
  onToggle,
  parentLabel,
  excludeId,
}: {
  children: TaxonomyChild[];
  selected: string[];
  onToggle: (id: string) => void;
  parentLabel: string;
  excludeId?: string | null;
}) {
  const TOP_N = 6;
  const [localQuery, setLocalQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Filter out the excluded id (typically the primary role).
  const pool = useMemo(
    () => childTypes.filter((c) => !excludeId || c.id !== excludeId),
    [childTypes, excludeId],
  );
  // Always-on rule: any selected chip should also be in the visible set
  // so the user can see what's currently picked. Sort selected first, then
  // popularity-desc.
  const popSorted = useMemo(() => {
    const sel = new Set(selected);
    return [...pool].sort((a, b) => {
      const aSel = sel.has(a.id) ? 1 : 0;
      const bSel = sel.has(b.id) ? 1 : 0;
      if (aSel !== bSel) return bSel - aSel;
      return (TYPE_POPULARITY[b.id] ?? 0) - (TYPE_POPULARITY[a.id] ?? 0);
    });
  }, [pool, selected]);

  const lq = localQuery.trim().toLowerCase();
  const filtered = lq.length > 0
    ? pool.filter((c) =>
        c.label.toLowerCase().includes(lq) ||
        (c.specialties ?? []).some((s) => s.toLowerCase().includes(lq)),
      )
    : null;

  const visible: TaxonomyChild[] = filtered ?? (showAll ? popSorted : popSorted.slice(0, TOP_N));
  const hidden = filtered ? 0 : Math.max(0, popSorted.length - TOP_N);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Per-parent search — only when there are enough siblings to warrant one */}
      {pool.length > TOP_N && (
        <div style={{ position: "relative" }}>
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder={`Search in ${parentLabel}…`}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "7px 28px 7px 28px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
              background: "#fff",
            }}
          />
          <span aria-hidden style={{
            position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
            color: COLORS.inkMuted, fontSize: 12, pointerEvents: "none",
          }}>🔍</span>
          {localQuery && (
            <button type="button" onClick={() => setLocalQuery("")}
              aria-label="Clear search"
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 18, height: 18, borderRadius: "50%", border: "none",
                background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted,
                fontSize: 11, lineHeight: 1, fontWeight: 600, cursor: "pointer",
              }}>×</button>
          )}
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <div style={{ fontSize: 11, color: COLORS.inkDim, fontStyle: "italic" }}>
          No matches in {parentLabel}.
        </div>
      )}

      {/* Chip list */}
      {visible.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {visible.map((c) => {
            const active = selected.includes(c.id);
            return (
              <button key={c.id} type="button" onClick={() => onToggle(c.id)} style={{
                padding: "6px 11px", borderRadius: 999,
                border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                background: active ? "rgba(15,79,62,0.08)" : "#fff",
                color: active ? COLORS.accentDeep : COLORS.ink,
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
              }}>{c.label}</button>
            );
          })}
        </div>
      )}

      {/* Show-all toggle — only when there are hidden types AND no active filter */}
      {!filtered && hidden > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} style={{
          alignSelf: "flex-start", padding: "5px 10px", borderRadius: 999,
          background: "transparent", border: `1px dashed ${COLORS.border}`,
          color: COLORS.inkMuted, fontSize: 11, fontWeight: 500, cursor: "pointer",
          fontFamily: FONTS.body,
        }}>
          {showAll ? `– Show fewer` : `+ Show all ${hidden} more in ${parentLabel}`}
        </button>
      )}
    </div>
  );
}


export function ManagementMethodPicker({
  value, onChange,
}: {
  value: "agency" | "invited" | "draft";
  onChange: (v: "agency" | "invited" | "draft") => void;
}) {
  // Each method spells out what happens next + which fields are coming.
  // Eliminates the "wait, do I lose data if I switch?" ambiguity.
  const options: {
    id: "agency" | "invited" | "draft";
    title: string;
    desc: string;
    cta: string;
    nextFields: string[];
    emoji: string;
  }[] = [
    {
      id: "agency", emoji: "✍️",
      title: "Agency-managed",
      desc: "You fill in the full profile right now. Talent can claim ownership of it later — when they're ready, or when you decide they should self-edit.",
      cta: "Opens the full Profile Builder next",
      nextFields: [
        "Cover photo + portfolio gallery (up to 8 + albums)",
        "Service areas + travel radius",
        "Bio in any language",
        "Type-specific fields (height, measurements, vehicle, cuisine, etc.)",
        "Languages with levels + role flags",
        "Skills + best-for contexts",
        "Rates + availability calendar",
        "Files (comp cards, contracts, certifications)",
        "Custom workspace fields",
        "Status + admin controls",
        "↗ Send claim invite later — talent takes ownership any time",
      ],
    },
    {
      id: "invited", emoji: "📧",
      title: "Invite talent to claim",
      desc: "Email them a claim link. They edit and approve their own profile.",
      cta: "Sends a claim email · talent fills the rest",
      nextFields: [
        "Talent receives email with claim link",
        "They complete their profile via Talent Registration wizard",
        "Submission lands in your Pending Approvals queue",
        "You approve or request changes",
      ],
    },
    {
      id: "draft", emoji: "💾",
      title: "Save as draft",
      desc: "Not published. Pick this back up later.",
      cta: "Quietly saves what you've entered",
      nextFields: [
        "Lives in Roster as a Draft",
        "Open any time to continue editing",
        "Never visible on the storefront until published",
      ],
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} style={{
            background: active ? "rgba(15,79,62,0.04)" : "#fff",
            border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
            borderRadius: 12, padding: 14, cursor: "pointer",
            fontFamily: FONTS.body, textAlign: "left",
            display: "flex", flexDirection: "column", gap: active ? 10 : 0,
            transition: `border-color ${TRANSITION.micro}, background ${TRANSITION.micro}`,
          }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{
                width: 20, height: 20, borderRadius: "50%",
                border: `1.5px solid ${active ? COLORS.accent : "rgba(11,11,13,0.18)"}`,
                background: active ? COLORS.fill : "transparent",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 1,
              }}>
                {active && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 14 }}>{o.emoji}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{o.title}</span>
                </div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>{o.desc}</div>
              </div>
            </div>
            {active && (
              <div style={{
                marginLeft: 32, paddingTop: 10,
                borderTop: `1px solid ${COLORS.borderSoft}`,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
                  color: COLORS.accentDeep, marginBottom: 8, textTransform: "uppercase",
                }}>
                  ↗ {o.cta}
                </div>
                <ul style={{
                  margin: 0, paddingLeft: 14,
                  display: "flex", flexDirection: "column", gap: 4,
                  fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.5,
                  listStyle: "disc",
                }}>
                  {o.nextFields.map((f) => (<li key={f}>{f}</li>))}
                </ul>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

