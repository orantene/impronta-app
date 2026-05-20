// Phase-1f decomp of profile-shell-internal.tsx — truth-preview helpers
// (visibility chips · field group block · live catalog panel) + the
// catalog-driven CustomWorkspaceFieldInput.  Public surface preserved
// byte-for-byte; re-exported from profile-shell-internal.tsx (the
// thin barrel) so TalentProfileShellDrawer.tsx + the index re-export
// continue to resolve via the same module specifier.
"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  COLORS,
  ChipsInput,
  EngineFieldVisibility,
  FONTS,
  ResolvedField,
  TRANSITION,
  ViewerRole,
  WorkspaceCustomField,
  canViewerSee,
  effectiveFieldVisibility,
  getFieldsForTalent,
  platformBaseVisibility,
  useDashboardText,
} from "../../drawer-shared";

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
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, marginBottom: 2 }} className="text-admin-ink">{title}</div>
      <div style={{ fontSize: 10.5, marginBottom: 6 }} className="text-admin-ink-muted">{subtitle}</div>
      <div className="flex flex-col gap-1">
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
              <div className="flex-1 min-w-0">
                <span className="text-admin-ink text-admin-12h">
                {f.label}
                {f.required_before_publish && (
                  <span style={{ marginLeft: 6, fontWeight: 700, fontSize: 10 }}
                    title="Required before publish">*</span>
                )}
                {f.required_at_registration && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, color: "#fff", letterSpacing: 0.4 }} className="text-admin-red bg-admin-red">REG</span>
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
                  <div style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.35 }} className="text-admin-ink-muted">{f.helper}</div>
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
              <span style={{ fontSize: 10.5, fontFamily: "ui-monospace, monospace", flexShrink: 0 }} className="text-admin-ink-muted">{f.kind}</span>
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
        <span className="text-lg">🧬</span>
        <div className="flex-1">
          <div className="text-admin-ink text-admin-13h font-semibold">
            {copy.t("Agency Fields")}
          </div>
          <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
            {fields
              ? (copy.isSpanish
                ? `${fields.length} campo${fields.length === 1 ? "" : "s"} resuelto${fields.length === 1 ? "" : "s"} desde tipos principales y secundarios`
                : `${fields.length} field${fields.length === 1 ? "" : "s"} resolved from primary + secondary types`)
              : copy.t("DB-resolved field catalog for this talent's types")}
          </div>
        </div>
        <span className="text-admin-ink-muted text-admin-11">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ padding: "12px 14px" }}>
          {loading && (
            <div className="text-admin-ink-muted text-xs">{copy.t("Loading…")}</div>
          )}
          {error && (
            <div style={{ padding: 10, borderRadius: 8, border: `1px solid ${COLORS.amber}`, fontSize: 12 }} className="bg-admin-amber-soft text-admin-ink">{error}</div>
          )}
          {fields && fields.length === 0 && (
            <div className="text-admin-ink-muted text-xs">
              No category-specific fields yet. Set a primary type first.
            </div>
          )}
          {fields && fields.length > 0 && (
            <div className="flex flex-col gap-3.5">
              {/* Architecture summary header */}
              <div style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid rgba(91,107,160,0.18)`, fontSize: 11.5, lineHeight: 1.5 }} className="bg-admin-indigo-soft text-admin-indigo-deep">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {fields.length} fields across {groups.length} groups · {completion.required} required to publish
                </div>
                <div className="text-admin-10h">
                  Groups auto-loaded from primary + secondary parent categories. Universal + global fields apply to everyone.
                </div>
                <div style={{ fontSize: 10.5, marginTop: 4, opacity: 0.85 }}>
                  This is the resolved truth: it already reflects this workspace&apos;s Field Catalog &amp; Field Privacy settings — fields you turned off are excluded, renamed fields show your workspace name, and an <strong>ADMIN</strong> tag means it&apos;s admin-only and never public.
                </div>
              </div>

              {/* Phase 4 — "View as" role selector + live per-view summary.
                  Read-only: recomputes from loaded data, never refetches,
                  never edits. Editing stays in the Details editor. */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface-alt">
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }} className="text-admin-ink">
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
                <span style={{ fontSize: 10.5, marginLeft: "auto" }} className="text-admin-ink-muted">
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
export function CustomWorkspaceFieldInput({ field, value, onChange }: {
  field: WorkspaceCustomField;
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const labelRow = (
    <label style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 5 }} className="text-admin-ink-muted">
      {field.name}
      {!field.required && <span className="text-admin-ink-dim text-admin-10 font-medium">· optional</span>}
      {field.required && <span className="text-admin-amber-deep text-admin-10 font-bold">· required</span>}
    </label>
  );
  const helper = field.helper && (
    <div style={{ fontSize: 10.5, marginTop: 4 }} className="text-admin-ink-dim">{field.helper}</div>
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
            <span style={{ position: "absolute", top: 2, left: v ? 16 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.15s", }} />
          </span>
          <span className="text-admin-ink text-admin-12h">{v ? "Yes" : "No"}</span>
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
