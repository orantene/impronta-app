"use client";

/**
 * CatalogRowTable — the Builder Lab Catalog's per-tab component table + its
 * inline override-edit accordion. Extracted from component-catalog.tsx (which
 * was over the max-lines cap) so the parent stays a focused controller: it owns
 * the data load, the overlay mutations, and ALL edit-form state, threading them
 * down here as props. Behavior-identical to the inlined version.
 *
 * Each group renders one `<section>` with a header (label + count) and a table
 * of rows. A row click (off any control) toggles its edit accordion; the
 * accordion groups the governance inputs under a "Governance" subhead.
 */

import { Fragment, useState } from "react";

import type {
  AddGalleryNativeVariant,
  CatalogAdminItem,
  CatalogSurfaceCell,
} from "@/lib/site-admin/add-gallery";
// Import the value (`deriveSurfaceMatrix`) directly from its module, NOT the
// add-gallery barrel — the barrel transitively pulls a `.css` side-effect import
// that the tsx test runner can't parse (it compiles CSS as JS). The types above
// are erased at compile, so the barrel path is safe for them.
import { deriveSurfaceMatrix } from "@/lib/site-admin/add-gallery/registry-db-merge";
import { AddGalleryIcon } from "@/components/edit-chrome/add-gallery/add-gallery-icons";
import { governanceChips } from "./catalog-governance";
import {
  LAB as T,
  fieldStyle,
  panelStyle,
  LabBadge,
  LabChip,
  LinkBtn,
  LabStatusDropdown,
  LAB_STATUS_LABEL,
  SectionLabel,
  type LabStatus,
  type LabStatusOption,
} from "./ui";

// C3 — selectable admin "default variant" values. The native preset variants the
// insert composer (applyNativeVariant) recognizes, sans "default" (= no variant).
// A free-form value still round-trips (only applied when it matches the node's
// kind), but the select keeps the common set one click away.
const DEFAULT_VARIANT_OPTIONS: ReadonlyArray<AddGalleryNativeVariant> = [
  "title",
  "subtitle",
  "intro",
  "caption",
  "badge",
  "quote",
  "text-link",
  "icon-button",
  "download-link",
  "cover-image",
  "logo",
  "stack",
  "row",
  "card-group",
  "grid",
  "image-card",
  "icon-card",
  "profile-card",
  "service-card",
  "testimonial-card",
  "cta-card",
  "breadcrumb",
  "youtube",
];

export function targetAllows(
  targetContext: CatalogAdminItem["targetContext"],
  surface: "talent" | "workspace",
): boolean {
  if (targetContext === "both") return true;
  return targetContext === surface;
}

const STATUS_ORDER: ReadonlyArray<LabStatus> = [
  "draft",
  "in_review",
  "published",
  "archived",
];

const CODE_DISABLED_TOOLTIP =
  "Code components ship live — only Published / Archived apply.";

/**
 * The four-status menu for one row, with `disabled` + `tooltip` set per the row
 * source's real transition rules. PRESENTATIONAL input to {@link LabStatusDropdown}
 * — the parent's `onSetStatus` performs the actual transition.
 *
 *  • Code rows: Published / Archived only (they map to the availability overlay).
 *    Draft + In-review are shown disabled (a code component has no draft state).
 *  • DB-template rows: only the legal next states for `current` are enabled,
 *    mirroring the guarded registry actions
 *    (draft→in_review/published/archived, in_review→draft/published/archived,
 *    published→draft/archived, archived→published).
 */
function statusOptionsFor(
  source: "code" | "template",
  current: LabStatus,
): LabStatusOption[] {
  if (source === "code") {
    return STATUS_ORDER.map((value) => {
      const codeApplicable = value === "published" || value === "archived";
      return {
        value,
        label: LAB_STATUS_LABEL[value],
        disabled: !codeApplicable,
        tooltip: codeApplicable ? undefined : CODE_DISABLED_TOOLTIP,
      };
    });
  }
  // DB template — legal forward/back transitions per registry-actions guards.
  const legal: Record<LabStatus, ReadonlyArray<LabStatus>> = {
    draft: ["in_review", "published", "archived"],
    in_review: ["draft", "published", "archived"],
    published: ["draft", "archived"],
    archived: ["published"],
  };
  const allowed = new Set<LabStatus>([current, ...legal[current]]);
  return STATUS_ORDER.map((value) => ({
    value,
    label: LAB_STATUS_LABEL[value],
    disabled: !allowed.has(value),
    tooltip: allowed.has(value)
      ? undefined
      : `Can't move from ${LAB_STATUS_LABEL[current]} to ${LAB_STATUS_LABEL[value]} directly.`,
  }));
}

/** Coerce the (string) admin-view status to the LabStatus union. Code rows are
 *  already derived to published/archived; templates carry the real enum. */
function toLabStatus(status: string): LabStatus {
  return status === "draft" ||
    status === "in_review" ||
    status === "published" ||
    status === "archived"
    ? status
    : "published";
}

/** Props the parent threads into each row group's table. The edit-form value +
 *  setter pairs are owned by ComponentCatalog so save/cancel/reset stay there. */
export interface CatalogRowTableProps {
  groups: Array<{ key: string; label: string; rows: CatalogAdminItem[] }>;
  humanize: (id: string) => string;
  pendingId: string | null;
  editingId: string | null;
  confirmingResetId: string | null;
  // edit-form state (owned by parent)
  editLabel: string;
  setEditLabel: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editIcon: string;
  setEditIcon: (v: string) => void;
  editPlan: string;
  setEditPlan: (v: string) => void;
  editLockedProps: string;
  setEditLockedProps: (v: string) => void;
  editDefaultVariant: string;
  setEditDefaultVariant: (v: string) => void;
  editDefaultProps: string;
  setEditDefaultProps: (v: string) => void;
  editDefaultPropsError: string | null;
  setEditDefaultPropsError: (v: string | null) => void;
  editDataSourceDefaults: string;
  setEditDataSourceDefaults: (v: string) => void;
  editDataSourceDefaultsError: string | null;
  setEditDataSourceDefaultsError: (v: string | null) => void;
  // actions
  onRowClick: (item: CatalogAdminItem) => void;
  onToggleSurface: (item: CatalogAdminItem, surface: "talent" | "workspace") => void;
  /** Dispatch a lifecycle transition for the row (the parent maps it to the
   *  availability overlay for code rows / the registry actions for templates). */
  onSetStatus: (item: CatalogAdminItem, next: LabStatus) => void;
  onSaveEdit: (item: CatalogAdminItem) => void;
  onCancelEdit: () => void;
  onConfirmReset: (item: CatalogAdminItem) => void;
  onStartReset: (id: string) => void;
  onCancelReset: () => void;
  onPreview: (item: CatalogAdminItem) => void;
}

export function CatalogRowTable(props: CatalogRowTableProps) {
  const {
    groups,
    humanize,
    pendingId,
    editingId,
    confirmingResetId,
    onRowClick,
    onToggleSurface,
    onSetStatus,
    onSaveEdit,
    onCancelEdit,
    onConfirmReset,
    onStartReset,
    onCancelReset,
    onPreview,
  } = props;

  return (
    <>
      {groups.map((group) => (
        <section key={group.key} style={{ ...panelStyle, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "11px 16px",
              borderBottom: `1px solid ${T.borderSoft}`,
              background: T.cardSoft,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
              {group.label}
            </span>
            <span style={{ fontSize: 11.5, color: T.inkMuted }}>
              {group.rows.length} component{group.rows.length === 1 ? "" : "s"}
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: T.inkDim }}>
                <Th>Component</Th>
                <Th>Category</Th>
                <Th>Source</Th>
                <Th
                  center
                  help="TALENT-MAX governs the talent profile page's + gallery."
                >
                  Talent-Max
                </Th>
                <Th
                  center
                  help="WORKSPACE governs both workspace pages AND the talent Max-site shell's + gallery."
                >
                  Workspace
                </Th>
                <Th
                  center
                  help="The 4 real builder surfaces this row resolves to. Today only 2 toggles govern them: talent shell is silently driven by the Workspace toggle (surfaceTarget:'workspace' in config.ts), not Talent-Max. Read-only — expand to see the truth."
                >
                  Surfaces
                </Th>
                <Th right>Manage</Th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => {
                const busy = pendingId === r.id;
                const editing = editingId === r.id;
                const isTemplate = r.source === "template";
                const chips = governanceChips(r.overlay);
                return (
                  <Fragment key={r.id}>
                    <tr
                      data-testid={`lab-catalog-row-${r.id}`}
                      onClick={(e) => {
                        // Click anywhere on the row (except an interactive control)
                        // to toggle its override accordion.
                        if (
                          (e.target as HTMLElement).closest(
                            "button, input, a, select, textarea",
                          )
                        )
                          return;
                        onRowClick(r);
                      }}
                      style={{
                        borderTop: `1px solid ${T.borderSoft}`,
                        opacity: busy ? 0.55 : 1,
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "9px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 7,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(93,211,160,0.10)",
                              color: T.accent,
                              flexShrink: 0,
                            }}
                          >
                            <AddGalleryIcon name={r.overlay?.icon_override ?? r.baseIcon} size="sm" tone="accent" />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                color: T.ink,
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                flexWrap: "wrap",
                              }}
                            >
                              {r.effectiveLabel}
                              {/* Governance chips — legible per-dimension flags
                                  (was a single ambiguous dot). */}
                              {chips.map((c) => (
                                <LabChip
                                  key={c.kind}
                                  tone={c.kind === "locked" ? "lock" : "accent"}
                                  title={c.title}
                                >
                                  {c.label}
                                </LabChip>
                              ))}
                            </div>
                            <div style={{ color: T.inkDim, fontSize: 10.5, fontFamily: "ui-monospace, monospace" }}>
                              {r.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "9px 16px", color: T.inkMuted }}>
                        {humanize(r.effectiveCategory)}
                      </td>
                      <td style={{ padding: "9px 16px" }}>
                        <LabBadge tone={isTemplate ? "accent" : "neutral"}>
                          {isTemplate ? "Template" : "Code"}
                        </LabBadge>
                        {isTemplate && r.status !== "published" ? (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: 0.4,
                              textTransform: "uppercase",
                              padding: "2px 6px",
                              borderRadius: 999,
                              color: r.status === "in_review" ? "#9BA8B7" : T.inkDim,
                              background: "rgba(255,255,255,0.06)",
                            }}
                          >
                            {r.status.replace("_", " ")}
                          </span>
                        ) : null}
                        {isTemplate ? (
                          <span style={{ marginLeft: 6, color: T.inkDim, fontSize: 10.5 }}>{r.targetContext}</span>
                        ) : null}
                      </td>
                      <ToggleCell
                        on={r.talentVisible}
                        disabled={busy || !targetAllows(r.targetContext, "talent")}
                        locked={!targetAllows(r.targetContext, "talent")}
                        onClick={() => onToggleSurface(r, "talent")}
                        label={r.effectiveLabel}
                        surface="Talent-Max"
                      />
                      <ToggleCell
                        on={r.workspaceVisible}
                        disabled={busy || !targetAllows(r.targetContext, "workspace")}
                        locked={!targetAllows(r.targetContext, "workspace")}
                        onClick={() => onToggleSurface(r, "workspace")}
                        label={r.effectiveLabel}
                        surface="Workspace"
                      />
                      <SurfacesCell item={r} />
                      <td style={{ padding: "9px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {editing ? (
                          <span style={{ display: "inline-flex", gap: 6 }}>
                            <LinkBtn label="Save" testId={`lab-catalog-row-save-${r.id}`} onClick={() => onSaveEdit(r)} disabled={busy} primary />
                            <LinkBtn label="Cancel" onClick={onCancelEdit} disabled={busy} />
                          </span>
                        ) : confirmingResetId === r.id ? (
                          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: T.inkMuted }}>Reset to default?</span>
                            <LinkBtn label="Yes" onClick={() => onConfirmReset(r)} disabled={busy} primary />
                            <LinkBtn label="No" onClick={onCancelReset} disabled={busy} />
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                            <LabStatusDropdown
                              testId={`lab-catalog-row-status-${r.id}`}
                              status={toLabStatus(r.status)}
                              options={statusOptionsFor(r.source, toLabStatus(r.status))}
                              busy={busy}
                              onSelect={(next) => onSetStatus(r, next)}
                            />
                            <LinkBtn label="Preview" onClick={() => onPreview(r)} disabled={busy} />
                            {r.overlay ? (
                              <LinkBtn label="Reset" onClick={() => onStartReset(r.id)} disabled={busy} />
                            ) : null}
                          </span>
                        )}
                      </td>
                    </tr>
                    {editing ? <EditAccordionRow item={r} {...props} /> : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}

/** The inline override-edit accordion row, shown under the editing row. Splits
 *  the 8 inputs into "Display" (cosmetic) + "Governance" (insert-time policy)
 *  groups with a subhead + helper text each. */
function EditAccordionRow({
  item: r,
  editLabel,
  setEditLabel,
  editCategory,
  setEditCategory,
  editIcon,
  setEditIcon,
  editPlan,
  setEditPlan,
  editLockedProps,
  setEditLockedProps,
  editDefaultVariant,
  setEditDefaultVariant,
  editDefaultProps,
  setEditDefaultProps,
  editDefaultPropsError,
  setEditDefaultPropsError,
  editDataSourceDefaults,
  setEditDataSourceDefaults,
  editDataSourceDefaultsError,
  setEditDataSourceDefaultsError,
}: CatalogRowTableProps & { item: CatalogAdminItem }) {
  return (
    <tr style={{ background: T.cardSoft }}>
      <td colSpan={7} style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Display group — cosmetic overrides */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel>Display</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
              <Field label="Display name (override)">
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder={r.baseLabel}
                  style={inputStyle}
                />
              </Field>
              <Field label="Category (override)">
                <input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder={r.baseCategory}
                  style={inputStyle}
                />
              </Field>
              <Field label="Icon (override)">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(93,211,160,0.10)",
                      color: T.accent,
                      flexShrink: 0,
                    }}
                  >
                    <AddGalleryIcon name={editIcon.trim() || r.baseIcon} size="sm" tone="accent" />
                  </span>
                  <input
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    placeholder={r.baseIcon}
                    style={{ ...inputStyle, width: 150 }}
                  />
                </div>
              </Field>
            </div>
            <span style={{ fontSize: 11, color: T.inkDim, lineHeight: 1.5 }}>
              Blank = built-in default. Icon names match the gallery icon set. Renames apply to both
              builders&apos; &quot;+&quot; gallery on next open.
            </span>
          </div>

          {/* Governance group — insert-time policy */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel>Governance</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
              <Field label="Required plan (tighten only)">
                <select
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  style={{ ...inputStyle, width: 150 }}
                >
                  <option value="">— default —</option>
                  <option value="free">free</option>
                  <option value="studio">studio</option>
                  <option value="agency">agency</option>
                  <option value="network">network</option>
                </select>
              </Field>
              <Field label="Locked props (tenant can't edit)">
                <input
                  data-testid="lab-catalog-edit-locked-props"
                  value={editLockedProps}
                  onChange={(e) => setEditLockedProps(e.target.value)}
                  placeholder="e.g. tone, style.textColor"
                  style={{ ...inputStyle, width: 260 }}
                />
              </Field>
              <Field label="Default variant">
                <select
                  value={editDefaultVariant}
                  onChange={(e) => setEditDefaultVariant(e.target.value)}
                  style={{ ...inputStyle, width: 170 }}
                >
                  <option value="">— default —</option>
                  {DEFAULT_VARIANT_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Default props (JSON)">
                <textarea
                  data-testid="lab-catalog-edit-default-props"
                  value={editDefaultProps}
                  onChange={(e) => {
                    setEditDefaultProps(e.target.value);
                    if (editDefaultPropsError) setEditDefaultPropsError(null);
                  }}
                  placeholder={'{\n  "tone": "primary"\n}'}
                  spellCheck={false}
                  rows={4}
                  style={{
                    ...inputStyle,
                    width: 300,
                    minHeight: 76,
                    fontFamily: "ui-monospace, monospace",
                    resize: "vertical",
                    borderColor: editDefaultPropsError ? T.red : undefined,
                  }}
                />
                {editDefaultPropsError ? (
                  <span style={{ fontSize: 10.5, color: T.red }}>
                    {editDefaultPropsError}
                  </span>
                ) : null}
              </Field>
              <Field label="Data-source defaults (JSON)">
                <textarea
                  value={editDataSourceDefaults}
                  onChange={(e) => {
                    setEditDataSourceDefaults(e.target.value);
                    if (editDataSourceDefaultsError) {
                      setEditDataSourceDefaultsError(null);
                    }
                  }}
                  placeholder={'{\n  "maxItems": 6\n}'}
                  spellCheck={false}
                  rows={4}
                  style={{
                    ...inputStyle,
                    width: 300,
                    minHeight: 76,
                    fontFamily: "ui-monospace, monospace",
                    resize: "vertical",
                    borderColor: editDataSourceDefaultsError ? T.red : undefined,
                  }}
                />
                {editDataSourceDefaultsError ? (
                  <span style={{ fontSize: 10.5, color: T.red }}>
                    {editDataSourceDefaultsError}
                  </span>
                ) : null}
              </Field>
            </div>
            <span style={{ fontSize: 11, color: T.inkDim, lineHeight: 1.5 }}>
              Plan only tightens (never widens). <strong>Locked props</strong> are dot-paths
              (comma-separated) the tenant can&apos;t change once inserted — the look stays
              on-brand, they still edit the copy. <strong>Default variant</strong> picks the
              native preset applied at insert (when the item has no built-in variant).{" "}
              <strong>Default props</strong> (a JSON object) are deep-merged over the
              component&apos;s defaults at insert (arrays replaced) — the admin&apos;s
              canonical starting content. <strong>Data-source defaults</strong> (a JSON
              object, e.g. <code>{"{ \"maxItems\": 6 }"}</code>) are merged into a connected
              component&apos;s <code>dataBinding</code> at insert. Reflected in both
              builders on next open.
            </span>
          </div>
        </div>
      </td>
    </tr>
  );
}

const inputStyle: React.CSSProperties = { ...fieldStyle, width: 220 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: T.inkMuted, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({
  children,
  center,
  right,
  help,
}: {
  children: React.ReactNode;
  center?: boolean;
  right?: boolean;
  /** When set, the header carries a hover note (native title) + a small "?"
   *  affordance — used on the Talent-Max / Workspace columns to explain the real
   *  surface mapping the audit documented. */
  help?: string;
}) {
  return (
    <th
      title={help}
      style={{
        padding: "9px 16px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        textAlign: center ? "center" : right ? "right" : "left",
        cursor: help ? "help" : undefined,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          justifyContent: center ? "center" : right ? "flex-end" : "flex-start",
        }}
      >
        {children}
        {help ? (
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 12,
              height: 12,
              borderRadius: 999,
              border: `1px solid ${T.border}`,
              fontSize: 8,
              fontWeight: 700,
              color: T.inkMuted,
              lineHeight: 1,
            }}
          >
            ?
          </span>
        ) : null}
      </span>
    </th>
  );
}

function ToggleCell({
  on,
  disabled,
  locked,
  onClick,
  label,
  surface,
}: {
  on: boolean;
  disabled: boolean;
  locked: boolean;
  onClick: () => void;
  label: string;
  surface: string;
}) {
  const title = locked
    ? "Not targeted to this surface"
    : on
      ? "Visible — click to hide"
      : "Hidden — click to show";
  return (
    <td style={{ padding: "9px 16px", textAlign: "center" }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-pressed={on}
        aria-label={`${label} on ${surface}: ${locked ? "not available" : on ? "visible" : "hidden"}`}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
        style={{
          cursor: disabled ? "default" : "pointer",
          border: `1px solid ${on ? "rgba(93,211,160,0.45)" : T.border}`,
          background: on ? "rgba(93,211,160,0.16)" : "transparent",
          color: locked ? T.no : on ? T.yes : T.inkMuted,
          borderRadius: 999,
          padding: "3px 11px",
          fontSize: 11,
          fontWeight: 700,
          minWidth: 52,
        }}
      >
        {locked ? "—" : on ? "On" : "Off"}
      </button>
    </td>
  );
}

/**
 * SurfacesCell (X1) — a READ-ONLY projection of the row's effective visibility
 * onto the FOUR real builder surfaces, derived purely from the existing 2-toggle
 * overlay state via {@link deriveSurfaceMatrix}. It adds no write path — that is
 * X4. Its purpose is to make the lossy reality visible: the talent Max-site
 * SHELL is governed by the *Workspace* toggle (not Talent-Max), so three of the
 * four surfaces collapse onto `workspace_enabled`.
 *
 * Collapsed: four compact dots (green = visible, dim = hidden) the admin can
 * read at a glance. Click expands an inline 4-row legend naming each surface,
 * its state, and which toggle governs it — exposing the "Talent shell ⇐
 * Workspace" surprise explicitly.
 */
function SurfacesCell({ item }: { item: CatalogAdminItem }) {
  const [open, setOpen] = useState(false);
  const cells = deriveSurfaceMatrix(item);
  const summary = cells
    .map((c) => `${c.label}: ${c.visible ? "visible" : "hidden"}`)
    .join(" · ");
  return (
    <td style={{ padding: "9px 16px", textAlign: "center", verticalAlign: "top" }}>
      <button
        type="button"
        data-testid={`lab-catalog-surfaces-${item.id}`}
        aria-expanded={open}
        aria-label={`4-surface visibility for ${item.effectiveLabel}: ${summary}. Click to ${open ? "collapse" : "expand"}.`}
        title={summary}
        onClick={() => setOpen((v) => !v)}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
        style={{
          cursor: "pointer",
          border: `1px solid ${T.border}`,
          background: "transparent",
          borderRadius: 999,
          padding: "3px 9px",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {cells.map((c) => (
          <SurfaceDot key={c.key} cell={c} />
        ))}
      </button>
      {open ? (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 5,
            textAlign: "left",
            minWidth: 188,
          }}
        >
          {cells.map((c) => (
            <div
              key={c.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 11,
                color: T.inkMuted,
              }}
            >
              <SurfaceDot cell={c} />
              <span style={{ color: T.ink, fontWeight: 600 }}>{c.label}</span>
              <span style={{ color: c.visible ? T.yes : T.inkDim }}>
                {c.visible ? "visible" : "hidden"}
              </span>
              <span style={{ color: T.inkDim, fontSize: 10 }}>
                ({c.governedBy === "talent_enabled" ? "Talent-Max" : "Workspace"})
              </span>
            </div>
          ))}
          <span style={{ fontSize: 10, color: T.inkDim, lineHeight: 1.5, maxWidth: 220 }}>
            Read-only. Talent shell follows the <strong>Workspace</strong> toggle,
            not Talent-Max — hiding from Workspace also hides it from the talent&apos;s
            own Max-site header/footer.
          </span>
        </div>
      ) : null}
    </td>
  );
}

function SurfaceDot({ cell }: { cell: CatalogSurfaceCell }) {
  return (
    <span
      aria-hidden
      title={`${cell.label}: ${cell.visible ? "visible" : "hidden"}`}
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        flexShrink: 0,
        background: cell.visible ? T.yes : "transparent",
        border: `1px solid ${cell.visible ? T.yes : T.no}`,
      }}
    />
  );
}

