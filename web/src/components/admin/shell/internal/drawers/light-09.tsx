"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  DrawerShell,
  FIELD_PRIVACY_PLAN_RULES,
  FONTS,
  PrimaryButton,
  SecondaryButton,
  SettingToggleRow,
  getWorkspaceFieldCatalog,
  setWorkspaceFieldCatalog,
  setWorkspaceFieldGroup,
  useAdminShell
} from "./drawer-shared";
import { byLabel, byName } from "@/lib/field-engine/sort-comparators";

// Phase 1d (remediation §4): 1 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function WorkspaceFieldSettingsDrawer() {
  type WField = {
    field_definition_id: string; field_key: string; label: string;
    field_group_id: string | null; display_order: number; enabled: boolean;
    required_override: boolean | null; custom_label: string | null;
    custom_helper: string | null;
  };
  type WGroup = {
    id: string; name: string; sort_order: number;
    enabled: boolean; custom_label: string | null;
  };

  const { state, closeDrawer, openDrawer, toast } = useAdminShell();
  const rules = FIELD_PRIVACY_PLAN_RULES[state.plan as "free" | "studio" | "agency" | "network"]
    ?? FIELD_PRIVACY_PLAN_RULES.free;
  const canCustomize = rules.canFlipPublicInternal; // studio+: enable/disable + relabel
  const canRequire = rules.canSetRequired;          // agency+: required toggle

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<WGroup[]>([]);
  const [fields, setFields] = useState<WField[]>([]);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dragField, setDragField] = useState<{ id: string; groupKey: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getWorkspaceFieldCatalog();
    if (!res.ok) { setError(res.error); setLoading(false); return; }
    setGroups(res.groups as WGroup[]);
    setFields(res.fields as WField[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mark = (id: string, on: boolean) =>
    setSaving((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const patchField = (id: string, patch: Partial<WField>) =>
    setFields((fs) => fs.map((x) => x.field_definition_id === id ? { ...x, ...patch } : x));
  const patchGroup = (id: string, patch: Partial<WGroup>) =>
    setGroups((gs) => gs.map((x) => x.id === id ? { ...x, ...patch } : x));

  const save = async (
    f: WField,
    optimistic: Partial<WField>,
    payload: Parameters<typeof setWorkspaceFieldCatalog>[0],
    okMsg: string,
  ) => {
    const snap = fields;
    patchField(f.field_definition_id, optimistic);
    mark(f.field_definition_id, true);
    const res = await setWorkspaceFieldCatalog(payload);
    mark(f.field_definition_id, false);
    if (!res.ok) { setFields(snap); toast(res.error || "Couldn't save the field"); return; }
    toast(okMsg);
  };

  const toggleEnabled = (f: WField) => {
    if (!canCustomize) { toast("Upgrade to Studio to customize the field catalog"); return; }
    const next = !f.enabled;
    void save(f, { enabled: next }, { field_definition_id: f.field_definition_id, enabled: next },
      next ? "Field captured for this workspace" : "Field hidden from this workspace");
  };
  const toggleRequired = (f: WField) => {
    if (!canRequire) { toast("Upgrade to Agency to set required fields"); return; }
    if (!f.enabled) { toast("Enable the field before making it required"); return; }
    const next = !(f.required_override ?? false);
    void save(f, { required_override: next }, { field_definition_id: f.field_definition_id, required: next },
      next ? "Marked required to publish" : "No longer required");
  };
  const commitLabel = (f: WField, raw: string) => {
    if (!canCustomize) { toast("Upgrade to Studio to rename fields"); return; }
    const v = raw.trim();
    const next = v && v !== f.label ? v : null;
    if ((f.custom_label ?? null) === next) return;
    void save(f, { custom_label: next }, { field_definition_id: f.field_definition_id, custom_label: next },
      next ? "Renamed for your workspace" : "Reset to the network name");
  };
  const commitHelper = (f: WField, raw: string) => {
    if (!canCustomize) { toast("Upgrade to Studio to edit fields"); return; }
    const v = raw.trim();
    const next = v ? v : null;
    if ((f.custom_helper ?? null) === next) return;
    void save(f, { custom_helper: next }, { field_definition_id: f.field_definition_id, helper: next },
      next ? "Guidance text saved" : "Guidance text cleared");
  };
  const isOverridden = (f: WField) =>
    !f.enabled || f.required_override !== null || !!f.custom_label || !!f.custom_helper;
  const resetField = (f: WField) => {
    if (!canCustomize) { toast("Upgrade to Studio to reset fields"); return; }
    if (!isOverridden(f)) return;
    void save(
      f,
      { enabled: true, required_override: null, custom_label: null, custom_helper: null },
      { field_definition_id: f.field_definition_id, enabled: true, required: null, custom_label: null, helper: null },
      "Field reset to platform default",
    );
  };

  const persistGroupOrder = async (nextGroups: WGroup[], previousGroups: WGroup[]) => {
    mark("field-group-order", true);
    for (let index = 0; index < nextGroups.length; index += 1) {
      const group = nextGroups[index];
      const displayOrder = (index + 1) * 10;
      const res = await setWorkspaceFieldGroup({
        field_group_id: group.id,
        display_order: displayOrder,
      });
      if (!res.ok) {
        setGroups(previousGroups);
        mark("field-group-order", false);
        toast(res.error || "Couldn't save group order");
        return;
      }
    }
    mark("field-group-order", false);
    toast("Field group order saved");
  };

  const dropGroup = (target: WGroup | null) => {
    if (!target || !dragGroupId || dragGroupId === target.id || !canCustomize) return;
    const ordered = groups
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || byName(a, b));
    const from = ordered.findIndex((g) => g.id === dragGroupId);
    const to = ordered.findIndex((g) => g.id === target.id);
    if (from < 0 || to < 0 || from === to) {
      setDragGroupId(null);
      return;
    }
    const previous = groups;
    const next = [...ordered];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    const orderMap = new Map(next.map((g, index) => [g.id, (index + 1) * 10] as const));
    setGroups(groups.map((g) => ({ ...g, sort_order: orderMap.get(g.id) ?? g.sort_order })));
    setDragGroupId(null);
    void persistGroupOrder(next, previous);
  };

  const persistFieldOrder = async (nextFields: WField[], previousFields: WField[]) => {
    mark("field-order", true);
    for (let index = 0; index < nextFields.length; index += 1) {
      const field = nextFields[index];
      const displayOrder = (index + 1) * 10;
      const res = await setWorkspaceFieldCatalog({
        field_definition_id: field.field_definition_id,
        display_order: displayOrder,
      });
      if (!res.ok) {
        setFields(previousFields);
        mark("field-order", false);
        toast(res.error || "Couldn't save field order");
        return;
      }
    }
    mark("field-order", false);
    toast("Field order saved");
  };

  const dropField = (target: WField, groupKey: string) => {
    if (!dragField || dragField.id === target.field_definition_id || dragField.groupKey !== groupKey || !canCustomize) return;
    const groupFields = fields
      .filter((f) => (f.field_group_id ?? "__general__") === groupKey)
      .sort((a, b) => a.display_order - b.display_order || byLabel(a, b));
    const from = groupFields.findIndex((f) => f.field_definition_id === dragField.id);
    const to = groupFields.findIndex((f) => f.field_definition_id === target.field_definition_id);
    if (from < 0 || to < 0 || from === to) {
      setDragField(null);
      return;
    }
    const previous = fields;
    const nextGroupFields = [...groupFields];
    const [picked] = nextGroupFields.splice(from, 1);
    nextGroupFields.splice(to, 0, picked);
    const orderMap = new Map(
      nextGroupFields.map((field, index) => [field.field_definition_id, (index + 1) * 10] as const),
    );
    setFields(fields.map((field) => {
      const nextOrder = orderMap.get(field.field_definition_id);
      return nextOrder == null ? field : { ...field, display_order: nextOrder };
    }));
    setDragField(null);
    void persistFieldOrder(nextGroupFields, previous);
  };

  const q = search.trim().toLowerCase();
  const matches = (f: WField) =>
    !q || f.label.toLowerCase().includes(q) || f.field_key.toLowerCase().includes(q)
    || (f.custom_label ?? "").toLowerCase().includes(q);
  const shown = fields.filter(matches);
  const overrideCount = fields.filter(isOverridden).length;

  // group order by sort_order; ungrouped last
  const order: { key: string; group: WGroup | null; items: WField[] }[] = [];
  const byKey = new Map<string, { key: string; group: WGroup | null; items: WField[] }>();
  for (const f of shown) {
    const key = f.field_group_id ?? "__general__";
    let b = byKey.get(key);
    if (!b) {
      const group = f.field_group_id ? (groups.find((g) => g.id === f.field_group_id) ?? null) : null;
      b = { key, group, items: [] }; byKey.set(key, b); order.push(b);
    }
    b.items.push(f);
  }
  for (const b of order) {
    b.items.sort((a, bField) =>
      a.display_order - bField.display_order ||
      (a.custom_label ?? a.label).localeCompare(bField.custom_label ?? bField.label),
    );
  }
  order.sort((a, b) => {
    const ai = a.key === "__general__" ? 1e9 : (a.group?.sort_order ?? 0);
    const bi = b.key === "__general__" ? 1e9 : (b.group?.sort_order ?? 0);
    return ai - bi;
  });

  const resetAll = async () => {
    if (!canCustomize) { toast("Upgrade to Studio to reset fields"); return; }
    const targets = fields.filter(isOverridden);
    if (targets.length === 0) return;
    for (const f of targets) {
      mark(f.field_definition_id, true);
      const res = await setWorkspaceFieldCatalog({
        field_definition_id: f.field_definition_id,
        enabled: true, required: null, custom_label: null, custom_helper: null,
      } as Parameters<typeof setWorkspaceFieldCatalog>[0]);
      mark(f.field_definition_id, false);
      if (!res.ok) { toast(res.error || "Couldn't reset all"); await load(); return; }
    }
    toast("All workspace overrides cleared — fields back to platform defaults");
    await load();
  };

  const footerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    fontFamily: FONTS.body,
  };
  const resetAllButtonStyle: React.CSSProperties = {
    marginLeft: 10,
    padding: "4px 10px",
    borderRadius: 999,
    border: `1px solid ${COLORS.borderSoft}`,
    background: "#fff",
    color: COLORS.inkMuted,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: FONTS.body,
  };
  const searchWrapStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${COLORS.borderSoft}`,
  };
  const searchInputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 200,
    padding: "7px 11px",
    borderRadius: 8,
    border: `1px solid ${COLORS.borderSoft}`,
    background: "#fff",
    fontFamily: FONTS.body,
    fontSize: 12.5,
    color: COLORS.ink,
    outline: "none",
  };
  const planNoticeStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    background: "rgba(91,107,160,0.06)",
    border: "1px solid rgba(91,107,160,0.18)",
    fontSize: 11.5,
    lineHeight: 1.45,
    fontFamily: FONTS.body,
  };
  const loadingStyle: React.CSSProperties = {
    padding: 18,
    textAlign: "center",
    fontSize: 13,
    fontFamily: FONTS.body,
  };
  const errorStyle: React.CSSProperties = {
    padding: 14,
    borderRadius: 10,
    border: `1px solid ${COLORS.amber}`,
    fontFamily: FONTS.body,
    fontSize: 12.5,
  };
  const retryButtonStyle: React.CSSProperties = {
    marginLeft: 8,
    padding: "3px 9px",
    borderRadius: 999,
    border: "none",
    background: COLORS.amberDeep,
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  };
  const groupShellStyle = (isDragging: boolean): React.CSSProperties => ({
    opacity: isDragging ? 0.55 : 1,
  });
  const groupHeaderStyle: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
    paddingLeft: 4,
    display: "flex",
    alignItems: "center",
    gap: 6,
  };
  const dragHandleStyle: React.CSSProperties = {
    cursor: "grab",
  };
  const savingOrderStyle: React.CSSProperties = {
    fontSize: 9.5,
    fontWeight: 600,
  };
  const fieldCardStyle = (
    over: boolean,
    enabled: boolean,
    dimmed: boolean,
  ): React.CSSProperties => ({
    borderRadius: 10,
    border: `1px solid ${over ? COLORS.amber : COLORS.borderSoft}`,
    background: enabled ? "#fff" : "rgba(11,11,13,0.03)",
    fontFamily: FONTS.body,
    opacity: dimmed ? 0.7 : 1,
  });
  const fieldHeaderButtonStyle: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    border: "none",
    padding: "10px 12px",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 10,
  };
  const fieldDragHandleStyle: React.CSSProperties = {
    color: COLORS.inkDim,
    cursor: "grab",
    fontSize: 12,
    flexShrink: 0,
  };
  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
  const customizedBadgeStyle: React.CSSProperties = {
    marginLeft: 6,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  };
  const fieldKeyStyle: React.CSSProperties = {
    fontSize: 10.5,
    marginTop: 1,
    fontFamily: "ui-monospace, monospace",
  };
  const requiredPillStyle = (required: boolean): React.CSSProperties => ({
    padding: "1px 6px",
    borderRadius: 999,
    background: required ? "rgba(15,79,62,0.10)" : "rgba(11,11,13,0.05)",
    color: required ? COLORS.accent : COLORS.inkDim,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 0.4,
    flexShrink: 0,
  });
  const offPillStyle: React.CSSProperties = {
    padding: "1px 6px",
    borderRadius: 999,
    background: "rgba(11,11,13,0.06)",
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 0.4,
    flexShrink: 0,
  };
  const chevronStyle: React.CSSProperties = {
    color: COLORS.inkMuted,
    fontSize: 11,
  };
  const expandedBodyStyle: React.CSSProperties = {
    padding: "10px 14px 14px",
    borderTop: `1px solid ${COLORS.borderSoft}`,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
  const editGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 4,
  };
  const editLabelStyle: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  };
  const editInputStyle = (enabled: boolean): React.CSSProperties => ({
    marginTop: 4,
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 9px",
    borderRadius: 7,
    border: `1px solid ${COLORS.borderSoft}`,
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.ink,
    outline: "none",
    background: enabled ? "#fff" : "rgba(11,11,13,0.03)",
  });
  const resetFieldButtonStyle: React.CSSProperties = {
    alignSelf: "flex-start",
    padding: "5px 11px",
    borderRadius: 999,
    border: `1px solid ${COLORS.borderSoft}`,
    background: "#fff",
    color: COLORS.inkMuted,
    fontFamily: FONTS.body,
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Workspace field settings"
      description="Per-field control over what your roster captures: enable/disable, rename, set guidance text, and mark required. Talent + admin editors update automatically."
      width={720}
      footer={
        <div style={footerStyle}>
          <div className="text-admin-ink-muted text-xs">
            <strong className="text-admin-ink">{overrideCount}</strong> {overrideCount === 1 ? "override" : "overrides"} active
            {overrideCount > 0 && canCustomize && (
              <button type="button" onClick={() => void resetAll()} style={resetAllButtonStyle}>Reset all</button>
            )}
          </div>
          <div className="flex gap-2">
            <SecondaryButton onClick={() => openDrawer("field-privacy")}>Field privacy</SecondaryButton>
            <PrimaryButton onClick={closeDrawer}>Done</PrimaryButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div style={searchWrapStyle} className="bg-admin-surface-alt">
          <input
            type="text"
            placeholder="Search field by label or key…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInputStyle}
          />
        </div>

        {!canCustomize && (
          <div style={planNoticeStyle} className="text-admin-indigo-deep">
            Your plan can view the catalog. <strong>Studio</strong> unlocks enable/disable + rename;
            <strong> Agency</strong> adds required-field control. Visibility lives in <strong>Field privacy</strong>.
          </div>
        )}

        {loading && (
          <div style={loadingStyle} className="text-admin-ink-muted">
            Loading workspace field settings…
          </div>
        )}
        {error && !loading && (
          <div style={errorStyle} className="bg-admin-amber-soft text-admin-amber-deep">
            {error} <button type="button" onClick={() => void load()} style={retryButtonStyle}>Retry</button>
          </div>
        )}

        {!loading && !error && order.map(({ key, group, items }) => (
          <div
            key={key}
            draggable={!!group && canCustomize}
            onDragStart={(event) => {
              if (!group || !canCustomize) return;
              event.dataTransfer.effectAllowed = "move";
              setDragGroupId(group.id);
            }}
            onDragOver={(event) => {
              if (group && dragGroupId && dragGroupId !== group.id) event.preventDefault();
            }}
            onDrop={() => dropGroup(group)}
            onDragEnd={() => setDragGroupId(null)}
            style={groupShellStyle(Boolean(group && dragGroupId === group.id))}
          >
            <div style={groupHeaderStyle} className="text-admin-ink-muted">
              {group && canCustomize && (
                <span aria-hidden title="Drag to reorder field groups" style={dragHandleStyle}>⋮⋮</span>
              )}
              <span>{group ? (group.custom_label ?? group.name) : "General"}</span>
              {saving.has("field-group-order") && group && (
                <span style={savingOrderStyle}>saving order…</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {items.map((f) => {
                const open = expanded.has(f.field_definition_id);
                const busy = saving.has(f.field_definition_id);
                const required = f.required_override ?? false;
                const over = isOverridden(f);
                return (
                  <div
                    key={f.field_definition_id}
                    draggable={canCustomize}
                    onDragStart={(event) => {
                      if (!canCustomize) return;
                      event.dataTransfer.effectAllowed = "move";
                      setDragField({ id: f.field_definition_id, groupKey: key });
                    }}
                    onDragOver={(event) => {
                      if (dragField && dragField.groupKey === key && dragField.id !== f.field_definition_id) event.preventDefault();
                    }}
                    onDrop={() => dropField(f, key)}
                    onDragEnd={() => setDragField(null)}
                    style={fieldCardStyle(over, f.enabled, busy || dragField?.id === f.field_definition_id)}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => {
                        const n = new Set(s);
                        if (n.has(f.field_definition_id)) n.delete(f.field_definition_id);
                        else n.add(f.field_definition_id);
                        return n;
                      })}
                      style={fieldHeaderButtonStyle}
                    >
                      {canCustomize && (
                        <span
                          aria-hidden
                          title="Drag to reorder fields in this group"
                          style={fieldDragHandleStyle}
                        >
                          ⋮⋮
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div style={fieldLabelStyle} className="text-admin-ink">
                          {f.custom_label ?? f.label}
                          {over && (
                            <span style={customizedBadgeStyle} className="text-admin-amber-deep">· customized</span>
                          )}
                        </div>
                        <div style={fieldKeyStyle} className="text-admin-ink-dim">{f.field_key}</div>
                      </div>
                      <span style={requiredPillStyle(required)}>{required ? "REQUIRED" : "OPTIONAL"}</span>
                      {!f.enabled && (
                        <span style={offPillStyle} className="text-admin-ink-muted">OFF</span>
                      )}
                      <span aria-hidden style={chevronStyle}>{open ? "▾" : "▸"}</span>
                    </button>

                    {open && (
                      <div style={expandedBodyStyle}>
                        <SettingToggleRow
                          label="Enabled for your workspace"
                          hint={canCustomize ? "Off = not collected on any surface (talent + admin + public)." : "Upgrade to Studio to change this."}
                          value={f.enabled}
                          disabled={!canCustomize}
                          onChange={() => toggleEnabled(f)}
                          isOverridden={!f.enabled}
                        />
                        <SettingToggleRow
                          label="Required to publish"
                          hint={!canRequire ? "Agency tier sets required fields." : !f.enabled ? "Enable the field first." : "Talent must fill this before the profile can publish."}
                          value={required}
                          disabled={!canRequire || !f.enabled}
                          onChange={() => toggleRequired(f)}
                          isOverridden={f.required_override !== null}
                        />
                        <div style={editGridStyle}>
                          <div>
                            <label style={editLabelStyle} className="text-admin-ink-muted">
                              Custom label
                            </label>
                            <input
                              type="text"
                              defaultValue={f.custom_label ?? ""}
                              placeholder={f.label}
                              disabled={!canCustomize}
                              onBlur={(e) => commitLabel(f, e.target.value)}
                              style={editInputStyle(canCustomize)}
                            />
                          </div>
                          <div>
                            <label style={editLabelStyle} className="text-admin-ink-muted">
                              Custom helper text
                            </label>
                            <input
                              type="text"
                              defaultValue={f.custom_helper ?? ""}
                              placeholder="Guidance shown while editing this field"
                              disabled={!canCustomize}
                              onBlur={(e) => commitHelper(f, e.target.value)}
                              style={editInputStyle(canCustomize)}
                            />
                          </div>
                        </div>
                        {over && canCustomize && (
                          <button type="button" onClick={() => resetField(f)} style={resetFieldButtonStyle}>Reset to platform default</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!loading && !error && shown.length === 0 && (
          <div style={loadingStyle} className="text-admin-ink-muted">{fields.length === 0 ? "No catalog fields for this workspace." : "No fields match your search."}</div>
        )}
      </div>
    </DrawerShell>
  );
}
