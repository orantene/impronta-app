"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  DrawerShell,
  FIELD_PRIVACY_PLAN_RULES,
  FONTS,
  FieldPrivacyCount,
  FieldPrivacyRow,
  FieldVisibility,
  Plan,
  PrimaryButton,
  SecondaryButton,
  Section,
  TextInput,
  Toggle,
  getFieldPrivacyCatalog,
  getWorkspaceFieldCatalog,
  resetWorkspaceFieldVisibility,
  setWorkspaceFieldCatalog,
  setWorkspaceFieldGroup,
  setWorkspaceFieldVisibility,
  useAdminShell
} from "./drawer-shared";
import { byLabel, byName } from "@/lib/field-engine/sort-comparators";
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 2 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function FieldCatalogDrawer() {
  type CatField = {
    field_definition_id: string; field_key: string; label: string;
    field_group_id: string | null; display_order: number; enabled: boolean;
    required_override: boolean | null; custom_label: string | null;
    custom_helper: string | null;
  };
  type CatGroup = {
    id: string; name: string; sort_order: number;
    enabled: boolean; custom_label: string | null;
  };

  const { state, closeDrawer, openDrawer, toast } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const rules = FIELD_PRIVACY_PLAN_RULES[state.plan as "free" | "studio" | "agency" | "network"]
    ?? FIELD_PRIVACY_PLAN_RULES.free;
  const canCustomize = rules.canFlipPublicInternal; // studio+: enable/disable + relabel
  const canRequire = rules.canSetRequired;          // agency+: required toggle

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [fields, setFields] = useState<CatField[]>([]);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [renameHelperVal, setRenameHelperVal] = useState("");
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getWorkspaceFieldCatalog();
    if (!res.ok) { setError(res.error); setLoading(false); return; }
    setGroups(res.groups as CatGroup[]);
    setFields(res.fields as CatField[]);
    setRenaming(null);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mark = (id: string, on: boolean) =>
    setSaving((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const bucketKeyFor = (f: Pick<CatField, "field_group_id">) => f.field_group_id ?? "__general__";

  // ── field ops ──────────────────────────────────────────────────────
  const toggleField = async (f: CatField) => {
    if (!canCustomize) { toast(tt("Upgrade to Studio to customize the field catalog")); return; }
    const next = !f.enabled;
    const snap = fields;
    setFields((fs) => fs.map((x) => x.field_definition_id === f.field_definition_id ? { ...x, enabled: next } : x));
    mark(f.field_definition_id, true);
    const res = await setWorkspaceFieldCatalog({ field_definition_id: f.field_definition_id, enabled: next });
    mark(f.field_definition_id, false);
    if (!res.ok) { setFields(snap); toast(res.error || tt("Couldn't save the field")); return; }
    toast(next ? tt("Field captured for this workspace") : tt("Field hidden from this workspace"));
  };

  const toggleRequired = async (f: CatField) => {
    if (!canRequire) { toast(tt("Upgrade to Agency to set required fields")); return; }
    if (!f.enabled) { toast(tt("Enable the field before making it required")); return; }
    const next = !(f.required_override ?? false);
    const snap = fields;
    setFields((fs) => fs.map((x) => x.field_definition_id === f.field_definition_id ? { ...x, required_override: next } : x));
    mark(f.field_definition_id, true);
    const res = await setWorkspaceFieldCatalog({ field_definition_id: f.field_definition_id, required: next });
    mark(f.field_definition_id, false);
    if (!res.ok) { setFields(snap); toast(res.error || tt("Couldn't save the field")); return; }
    toast(next ? tt("Marked required to publish") : tt("No longer required"));
  };

  const commitFieldLabel = async (f: CatField) => {
    if (!canCustomize) { toast(tt("Upgrade to Studio to edit fields")); setRenaming(null); return; }
    const v = renameVal.trim();
    const nextLabel = v && v !== f.label ? v : null;
    const h = renameHelperVal.trim();
    const nextHelper = h ? h : null;
    const labelChanged = (f.custom_label ?? null) !== nextLabel;
    const helperChanged = (f.custom_helper ?? null) !== nextHelper;
    if (!labelChanged && !helperChanged) { setRenaming(null); return; }
    const snap = fields;
    setFields((fs) => fs.map((x) => x.field_definition_id === f.field_definition_id
      ? { ...x, custom_label: nextLabel, custom_helper: nextHelper } : x));
    setRenaming(null);
    mark(f.field_definition_id, true);
    const res = await setWorkspaceFieldCatalog({
      field_definition_id: f.field_definition_id,
      ...(labelChanged ? { custom_label: nextLabel } : {}),
      ...(helperChanged ? { helper: nextHelper } : {}),
    });
    mark(f.field_definition_id, false);
    if (!res.ok) { setFields(snap); toast(res.error || tt("Couldn't save the field")); return; }
    toast(
      helperChanged && !labelChanged
        ? (nextHelper ? tt("Guidance text saved") : tt("Guidance text cleared"))
        : (nextLabel ? tt("Saved for your workspace") : tt("Reset to the network name")),
    );
  };

  const persistFieldOrder = async (nextItems: CatField[], previousFields: CatField[], groupKey: string) => {
    if (!canCustomize) { toast(tt("Upgrade to Studio to reorder fields")); return; }
    mark(`order:${groupKey}`, true);
    for (let index = 0; index < nextItems.length; index += 1) {
      const field = nextItems[index];
      const displayOrder = (index + 1) * 10;
      const res = await setWorkspaceFieldCatalog({
        field_definition_id: field.field_definition_id,
        display_order: displayOrder,
      });
      if (!res.ok) {
        setFields(previousFields);
        mark(`order:${groupKey}`, false);
        toast(res.error || tt("Couldn't save the field order"));
        return;
      }
    }
    mark(`order:${groupKey}`, false);
    toast(tt("Field order saved"));
  };

  const dropField = (target: CatField) => {
    if (!draggingFieldId || draggingFieldId === target.field_definition_id) return;
    const dragged = fields.find((f) => f.field_definition_id === draggingFieldId);
    if (!dragged || bucketKeyFor(dragged) !== bucketKeyFor(target)) {
      setDraggingFieldId(null);
      return;
    }
    const groupKey = bucketKeyFor(target);
    const previous = fields;
    const currentBucket = fields
      .filter((f) => bucketKeyFor(f) === groupKey)
      .sort((a, b) => a.display_order - b.display_order || byLabel(a, b));
    const from = currentBucket.findIndex((f) => f.field_definition_id === draggingFieldId);
    const to = currentBucket.findIndex((f) => f.field_definition_id === target.field_definition_id);
    if (from < 0 || to < 0 || from === to) {
      setDraggingFieldId(null);
      return;
    }
    const nextBucket = [...currentBucket];
    const [picked] = nextBucket.splice(from, 1);
    nextBucket.splice(to, 0, picked);
    const orderMap = new Map(nextBucket.map((field, index) => [field.field_definition_id, (index + 1) * 10] as const));
    setFields((fs) => fs.map((field) => {
      const nextOrder = orderMap.get(field.field_definition_id);
      return nextOrder ? { ...field, display_order: nextOrder } : field;
    }));
    setDraggingFieldId(null);
    void persistFieldOrder(nextBucket, previous, groupKey);
  };

  // ── group ops ──────────────────────────────────────────────────────
  const toggleGroup = async (g: CatGroup) => {
    if (!canCustomize) { toast(tt("Upgrade to Studio to customize the field catalog")); return; }
    const next = !g.enabled;
    const snap = groups;
    setGroups((gs) => gs.map((x) => x.id === g.id ? { ...x, enabled: next } : x));
    mark(g.id, true);
    const res = await setWorkspaceFieldGroup({ field_group_id: g.id, is_enabled: next });
    mark(g.id, false);
    if (!res.ok) { setGroups(snap); toast(res.error || tt("Couldn't save the section")); return; }
    toast(next ? tt("Section enabled") : tt("Section hidden from this workspace"));
  };

  const commitGroupLabel = async (g: CatGroup) => {
    if (!canCustomize) { toast(tt("Upgrade to Studio to rename sections")); setRenaming(null); return; }
    const v = renameVal.trim();
    const nextLabel = v && v !== g.name ? v : null;
    if ((g.custom_label ?? null) === nextLabel) { setRenaming(null); return; }
    const snap = groups;
    setGroups((gs) => gs.map((x) => x.id === g.id ? { ...x, custom_label: nextLabel } : x));
    setRenaming(null);
    mark(g.id, true);
    const res = await setWorkspaceFieldGroup({ field_group_id: g.id, custom_label: nextLabel });
    mark(g.id, false);
    if (!res.ok) { setGroups(snap); toast(res.error || tt("Couldn't rename the section")); return; }
    toast(nextLabel ? tt("Section renamed for your workspace") : tt("Reset to the network name"));
  };

  const persistGroupOrder = async (nextGroups: CatGroup[], previousGroups: CatGroup[]) => {
    if (!canCustomize) { toast(tt("Upgrade to Studio to reorder sections")); return; }
    mark("order:groups", true);
    for (let index = 0; index < nextGroups.length; index += 1) {
      const group = nextGroups[index];
      const displayOrder = (index + 1) * 10;
      const res = await setWorkspaceFieldGroup({
        field_group_id: group.id,
        display_order: displayOrder,
      });
      if (!res.ok) {
        setGroups(previousGroups);
        mark("order:groups", false);
        toast(res.error || tt("Couldn't save the section order"));
        return;
      }
    }
    mark("order:groups", false);
    toast(tt("Section order saved"));
  };

  const dropGroup = (target: CatGroup) => {
    if (!draggingGroupId || draggingGroupId === target.id) return;
    const previous = groups;
    const orderedGroups = groups
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || byName(a, b));
    const from = orderedGroups.findIndex((g) => g.id === draggingGroupId);
    const to = orderedGroups.findIndex((g) => g.id === target.id);
    if (from < 0 || to < 0 || from === to) {
      setDraggingGroupId(null);
      return;
    }
    const nextGroups = [...orderedGroups];
    const [picked] = nextGroups.splice(from, 1);
    nextGroups.splice(to, 0, picked);
    const orderMap = new Map(nextGroups.map((group, index) => [group.id, (index + 1) * 10] as const));
    setGroups((gs) => gs.map((group) => {
      const nextOrder = orderMap.get(group.id);
      return nextOrder ? { ...group, sort_order: nextOrder } : group;
    }));
    setDraggingGroupId(null);
    void persistGroupOrder(nextGroups, previous);
  };

  const startRename = (key: string, current: string) => {
    setRenameVal(current); setRenaming(key);
  };

  // ── bucket assembly (group order by sort_order, ungrouped last) ─────
  const order: { key: string; group: CatGroup | null; items: CatField[] }[] = [];
  const byKey = new Map<string, { key: string; group: CatGroup | null; items: CatField[] }>();
  for (const f of fields) {
    const key = f.field_group_id ?? "__general__";
    let b = byKey.get(key);
    if (!b) {
      const group = f.field_group_id ? (groups.find((g) => g.id === f.field_group_id) ?? null) : null;
      b = { key, group, items: [] }; byKey.set(key, b); order.push(b);
    }
    b.items.push(f);
  }
  for (const bucket of order) {
    bucket.items.sort((a, b) => a.display_order - b.display_order || byLabel(a, b));
  }
  order.sort((a, b) => {
    const ai = a.key === "__general__" ? 1e9 : (a.group?.sort_order ?? 0);
    const bi = b.key === "__general__" ? 1e9 : (b.group?.sort_order ?? 0);
    return ai - bi;
  });

  const enabledCount = fields.filter((f) => f.enabled).length;
  const offCount = fields.length - enabledCount;

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Field catalog")}
      description={tt("Fields available to this workspace's enabled talent categories. Toggle what you collect, rename for your team, and mark what is required within platform safety rules.")}
      width={680}
      footer={
        <>
          <SecondaryButton onClick={() => openDrawer("field-privacy")}>{tt("Field privacy")}</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>{tt("Done")}</PrimaryButton>
        </>
      }
    >
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12, overflow: "hidden", marginBottom: 16, fontFamily: FONTS.body,
      }}>
        <FieldPrivacyCount label={tt("Captured")} count={enabledCount}
          icon="✓" tone={COLORS.successDeep} bg={COLORS.successSoft} />
        <FieldPrivacyCount label={tt("Sections")} count={groups.length}
          icon="▦" tone={COLORS.inkMuted} bg="rgba(11,11,13,0.04)" borderLeft />
        <FieldPrivacyCount label={copy.isSpanish ? "Desactivados" : "Off"} count={offCount}
          icon="–" tone={COLORS.inkMuted} bg="rgba(11,11,13,0.04)" borderLeft />
      </div>

      {!canCustomize && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(91,107,160,0.10)", border: "1px solid rgba(91,107,160,0.18)",
          fontFamily: FONTS.body, fontSize: 12.5, color: "#3B4A75",
          marginBottom: 16, lineHeight: 1.5,
        }}>
          <strong>{tt("The network catalog is read-only on Free.")}</strong> {tt("Upgrade to Studio to choose which fields your workspace captures and rename them for your team. Agency tier adds required-field control.")}
          <button type="button" onClick={() => openDrawer("plan-billing")} style={{
            marginLeft: 8, padding: "4px 10px", borderRadius: 999,
            background: "#3B4A75", color: "#fff", border: "none",
            fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>{tt("Compare plans")}</button>
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
          {tt("Loading the field catalog…")}
        </div>
      )}
      {error && !loading && (
        <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.amber}`, fontFamily: FONTS.body, fontSize: 12.5 }} className="bg-admin-amber-soft text-admin-ink">
          {error}{" "}
          <button type="button" onClick={() => void load()} style={{
            marginLeft: 6, textDecoration: "underline", background: "none",
            border: "none", cursor: "pointer", color: COLORS.ink, fontFamily: FONTS.body,
          }}>{tt("Retry")}</button>
        </div>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-3.5">
          {order.map((bucket) => {
            const g = bucket.group;
            const groupKey = g ? `g:${g.id}` : "g:__general__";
            const groupName = g ? (g.custom_label ?? tt(g.name)) : tt("General");
            const groupOff = g ? !g.enabled : false;
            const groupBusy = g ? saving.has(g.id) : false;
            return (
              <div key={bucket.key}>
                <div
                  draggable={!!g && canCustomize}
                  onDragStart={() => { if (g && canCustomize) setDraggingGroupId(g.id); }}
                  onDragOver={(event) => { if (g && canCustomize) event.preventDefault(); }}
                  onDrop={() => { if (g && canCustomize) dropGroup(g); }}
                  onDragEnd={() => setDraggingGroupId(null)}
                  style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 6, paddingLeft: 4,
                  cursor: g && canCustomize ? "grab" : "default",
                }}>
                  {renaming === groupKey && g ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                      <TextInput
                        autoFocus
                        value={renameVal}
                        placeholder={g.name}
                        onChange={(e) => setRenameVal(e.target.value)}
                      />
                      <button type="button" onClick={() => void commitGroupLabel(g)} style={{
                        padding: "5px 11px", borderRadius: 999, border: "none",
                        background: COLORS.fill, color: "#fff",
                        fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>{tt("Save")}</button>
                      <button type="button" onClick={() => setRenaming(null)} style={{
                        padding: "5px 9px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
                        background: "transparent", color: COLORS.inkMuted,
                        fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>{tt("Cancel")}</button>
                    </div>
                  ) : (
                    <>
                      <span style={{
                        fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
                        color: groupOff ? COLORS.inkDim : COLORS.inkMuted,
                        textTransform: "uppercase",
                        textDecoration: groupOff ? "line-through" : "none",
                      }}>{groupName}</span>
                      {g && g.custom_label && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }} className="bg-admin-indigo-soft text-admin-indigo-deep">{tt("renamed")}</span>
                      )}
                      {g && canCustomize && (
                        <>
                          <span
                            title={tt("Drag to reorder sections")}
                            className="select-none text-admin-ink-dim text-admin-11 font-bold"
                          >
                            ⋮⋮
                          </span>
                          <button type="button" onClick={() => startRename(groupKey, g.custom_label ?? g.name)} style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 10.5,
                            textDecoration: "underline", padding: 0,
                          }}>{tt("rename")}</button>
                          <button type="button" disabled={groupBusy} onClick={() => void toggleGroup(g)} style={{
                            marginLeft: "auto", padding: "3px 10px", borderRadius: 999,
                            border: `1px solid ${groupOff ? COLORS.border : COLORS.successDeep}`,
                            background: groupOff ? "transparent" : COLORS.successSoft,
                            color: groupOff ? COLORS.inkMuted : COLORS.successDeep,
                            fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600,
                            cursor: groupBusy ? "wait" : "pointer", opacity: groupBusy ? 0.6 : 1,
                          }}>{groupOff ? tt("Section off") : tt("Section on")}</button>
                        </>
                      )}
                    </>
                  )}
                </div>
                <div style={{
                  background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 12, overflow: "hidden",
                  opacity: groupOff ? 0.55 : 1,
                }}>
                  {bucket.items.map((f, i) => {
                    const fieldKey = `f:${f.field_definition_id}`;
                    const fieldName = f.custom_label ?? tt(f.label);
                    const required = f.required_override ?? false;
                    const busy = saving.has(f.field_definition_id);
                    return (
                      <div
                        key={f.field_definition_id}
                        draggable={canCustomize && renaming !== fieldKey}
                        onDragStart={() => { if (canCustomize) setDraggingFieldId(f.field_definition_id); }}
                        onDragOver={(event) => { if (canCustomize) event.preventDefault(); }}
                        onDrop={() => { if (canCustomize) dropField(f); }}
                        onDragEnd={() => setDraggingFieldId(null)}
                        style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px",
                        borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                        fontFamily: FONTS.body,
                        opacity: f.enabled ? 1 : 0.6,
                        cursor: canCustomize && renaming !== fieldKey ? "grab" : "default",
                      }}>
                        {renaming !== fieldKey && canCustomize && (
                          <span
                            aria-hidden
                            title={tt("Drag to reorder fields in this section")}
                            className="shrink-0 select-none text-admin-ink-dim text-admin-12 font-bold leading-none"
                          >
                            ⋮⋮
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          {renaming === fieldKey ? (
                            <div className="flex flex-col gap-1.5">
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }} className="text-admin-ink-muted">
                                  {tt("Label")}
                                </div>
                                <TextInput
                                  autoFocus
                                  value={renameVal}
                                  placeholder={tt(f.label)}
                                  onChange={(e) => setRenameVal(e.target.value)}
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }} className="text-admin-ink-muted">
                                  {tt("Guidance text")} <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· {tt("shown to whoever fills this field")}</span>
                                </div>
                                <TextInput
                                  value={renameHelperVal}
                                  placeholder={tt("e.g. Use the agency-approved spelling")}
                                  onChange={(e) => setRenameHelperVal(e.target.value)}
                                />
                              </div>
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => void commitFieldLabel(f)} style={{
                                  padding: "5px 11px", borderRadius: 999, border: "none",
                                  background: COLORS.fill, color: "#fff",
                                  fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                }}>{tt("Save")}</button>
                                <button type="button" onClick={() => setRenaming(null)} style={{
                                  padding: "5px 9px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
                                  background: "transparent", color: COLORS.inkMuted,
                                  fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                }}>{tt("Cancel")}</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="text-admin-ink text-admin-12h font-medium">{fieldName}</span>
                                {f.custom_label && (
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }} className="bg-admin-indigo-soft text-admin-indigo-deep">{tt("renamed")}</span>
                                )}
                                {required && (
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }} className="bg-admin-amber-soft text-admin-amber-deep">{tt("required")}</span>
                                )}
                              </div>
                              <div style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.4 }} className="text-admin-ink-muted">
                                {f.field_key}
                                {canCustomize && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRenameVal(f.custom_label ?? f.label);
                                      setRenameHelperVal(f.custom_helper ?? "");
                                      setRenaming(fieldKey);
                                    }}
                                    style={{
                                      marginLeft: 8, background: "none", border: "none", cursor: "pointer",
                                      color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 10.5,
                                      textDecoration: "underline", padding: 0,
                                    }}
                                  >{tt("edit")}</button>
                                )}
                              </div>
                              {f.custom_helper && (
                                <div style={{ fontSize: 10.5, marginTop: 3, lineHeight: 1.35, fontStyle: "italic" }} className="text-admin-indigo-deep">“{f.custom_helper}”</div>
                              )}
                            </>
                          )}
                        </div>
                        {renaming !== fieldKey && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy || !canRequire || !f.enabled}
                              onClick={() => void toggleRequired(f)}
                              title={!canRequire ? tt("Agency tier sets required fields") : !f.enabled ? tt("Enable the field first") : required ? tt("Required to publish") : tt("Optional")}
                              style={{
                                padding: "4px 10px", borderRadius: 999,
                                border: `1px solid ${required ? COLORS.amberDeep : COLORS.border}`,
                                background: required ? COLORS.amberSoft : "transparent",
                                color: required ? COLORS.amberDeep : COLORS.inkDim,
                                fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600,
                                cursor: (busy || !canRequire || !f.enabled) ? "not-allowed" : "pointer",
                                opacity: (!canRequire || !f.enabled) ? 0.45 : 1,
                              }}
                            >{tt("Required")}</button>
                            <button
                              type="button"
                              disabled={busy || !canCustomize}
                              onClick={() => void toggleField(f)}
                              title={!canCustomize ? tt("Studio tier customizes the catalog") : f.enabled ? tt("Captured. Tap to stop collecting.") : tt("Off. Tap to start collecting.")}
                              style={{
                                padding: "5px 12px", borderRadius: 999,
                                border: `1px solid ${f.enabled ? COLORS.successDeep : COLORS.border}`,
                                background: f.enabled ? COLORS.successSoft : "transparent",
                                color: f.enabled ? COLORS.successDeep : COLORS.inkMuted,
                                fontFamily: FONTS.body, fontSize: 11, fontWeight: 600,
                                cursor: (busy || !canCustomize) ? "not-allowed" : "pointer",
                                opacity: !canCustomize ? 0.5 : (busy ? 0.6 : 1),
                              }}
                            >{f.enabled ? tt("On") : tt("Off")}</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {fields.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
              {tt("No catalog fields for this workspace yet.")}
            </div>
          )}

          {/* Custom workspace fields — honest "not yet" state. No fake add flow. */}
          <div style={{ padding: 14, borderRadius: 12, border: `1px dashed ${COLORS.borderSoft}`, fontFamily: FONTS.body }} className="bg-admin-surface">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className="text-admin-ink text-admin-12h font-semibold">
                {tt("Workspace-specific custom fields")}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "rgba(11,11,13,0.06)", letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">{tt("coming soon")}</span>
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {rules.canCreateCustom
                ? tt("Defining brand-new fields (beyond the network catalog) is included in your plan and is being built into the Catalog Studio. For now you can fully customize which network fields you capture, rename them, and set what's required above.")
                : tt("Brand-new custom fields are an Agency-tier capability and are being built into the Catalog Studio. Every workspace can already customize the network catalog above: enable, rename, and require the fields you actually use.")}
            </div>
          </div>
        </div>
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Field Privacy — what's public on your storefront, what admins see,
// what's hidden entirely. Per-workspace overrides on built-in fields,
// plus visibility toggles for custom fields. Plan-tier gated.
// ════════════════════════════════════════════════════════════════════


export function FieldPrivacyDrawer() {
  type EngVis = "public" | "admin" | "hidden";
  type Entry = {
    field_definition_id: string; field_key: string; label: string;
    field_group_id: string | null; display_order: number; effective: EngVis;
    platform_default: EngVis; floored: boolean; has_override: boolean;
  };
  type Grp = { id: string; slug: string; name: string; sort_order: number };

  const { state, closeDrawer, openDrawer, toast } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const rules = FIELD_PRIVACY_PLAN_RULES[state.plan as "free" | "studio" | "agency" | "network"]
    ?? FIELD_PRIVACY_PLAN_RULES.free;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Grp[]>([]);
  const [fields, setFields] = useState<Entry[]>([]);
  const [pending, setPending] = useState<Record<string, EngVis>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getFieldPrivacyCatalog();
    if (!res.ok) { setError(res.error); setLoading(false); return; }
    setGroups(res.groups as Grp[]);
    setFields(res.fields as Entry[]);
    setPending({});
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // FieldPrivacyRow speaks the proto tri-state ("internal" = admin).
  const toProto = (v: EngVis): FieldVisibility => (v === "admin" ? "internal" : v);
  const toEng = (v: FieldVisibility): EngVis => (v === "internal" ? "admin" : v);
  const effOf = (f: Entry): EngVis => pending[f.field_definition_id] ?? f.effective;

  const onChange = async (f: Entry, protoVis: FieldVisibility) => {
    const target = toEng(protoVis);
    if (target === effOf(f)) return;
    if (!rules.canFlipPublicInternal && target !== f.platform_default) {
      toast(tt("Upgrade to Studio to change field visibility")); return;
    }
    if (target === "hidden" && !rules.canHide) {
      toast(tt("Upgrade to Agency to hide fields entirely")); return;
    }
    if (target === "public" && f.floored) {
      toast(tt("This field is platform-restricted and can't be public")); return;
    }
    setPending(p => ({ ...p, [f.field_definition_id]: target }));
    const res = target === f.platform_default
      ? await resetWorkspaceFieldVisibility({ field_definition_id: f.field_definition_id })
      : await setWorkspaceFieldVisibility({ field_definition_id: f.field_definition_id, visibility: target });
    if (!res.ok) {
      setPending(p => { const n = { ...p }; delete n[f.field_definition_id]; return n; });
      toast(res.error || tt("Couldn't save the field setting")); return;
    }
    setFields(fs => fs.map(x => x.field_definition_id === f.field_definition_id
      ? { ...x, effective: target, has_override: target !== x.platform_default }
      : x));
    setPending(p => { const n = { ...p }; delete n[f.field_definition_id]; return n; });
    toast(tt("Saved"));
  };

  const counts = {
    public: fields.filter(f => effOf(f) === "public").length,
    internal: fields.filter(f => effOf(f) === "admin").length,
    hidden: fields.filter(f => effOf(f) === "hidden").length,
  };

  const order: { key: string; name: string; items: Entry[] }[] = [];
  const byKey = new Map<string, { key: string; name: string; items: Entry[] }>();
  for (const f of fields) {
    const key = f.field_group_id ?? "__general__";
    let b = byKey.get(key);
    if (!b) {
      const name = f.field_group_id
        ? (groups.find(g => g.id === f.field_group_id)?.name ?? "Other")
        : "General";
      b = { key, name, items: [] }; byKey.set(key, b); order.push(b);
    }
    b.items.push(f);
  }
  for (const bucket of order) {
    bucket.items.sort((a, b) => a.display_order - b.display_order || byLabel(a, b));
  }
  order.sort((a, b) => {
    const ai = a.key === "__general__" ? 1e9 : (groups.find(g => g.id === a.key)?.sort_order ?? 0);
    const bi = b.key === "__general__" ? 1e9 : (groups.find(g => g.id === b.key)?.sort_order ?? 0);
    return ai - bi;
  });

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Field privacy")}
      description={tt("Effective visibility for fields available to this workspace's enabled talent categories.")}
      width={680}
      footer={
        <>
          <SecondaryButton onClick={() => openDrawer("field-catalog")}>{tt("Field catalog")}</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>{tt("Done")}</PrimaryButton>
        </>
      }
    >
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12, overflow: "hidden", marginBottom: 16, fontFamily: FONTS.body,
      }}>
        <FieldPrivacyCount label={tt("On storefront")} count={counts.public}
          icon="🌐" tone={COLORS.successDeep} bg={COLORS.successSoft} />
        <FieldPrivacyCount label={tt("Admin-only")} count={counts.internal}
          icon="🔒" tone={COLORS.amberDeep} bg={COLORS.amberSoft} borderLeft />
        <FieldPrivacyCount label={copy.isSpanish ? "Ocultos" : "Hidden"} count={counts.hidden}
          icon="–" tone={COLORS.inkMuted} bg="rgba(11,11,13,0.04)" borderLeft />
      </div>

      {!rules.canFlipPublicInternal && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(91,107,160,0.10)", border: "1px solid rgba(91,107,160,0.18)",
          fontFamily: FONTS.body, fontSize: 12.5, color: "#3B4A75",
          marginBottom: 16, lineHeight: 1.5,
        }}>
          <strong>{tt("Free plan defaults are locked.")}</strong> {tt("Upgrade to Studio to flip fields between public and admin-only. Agency tier unlocks hiding fields entirely.")}
          <button type="button" onClick={() => openDrawer("plan-billing")} style={{
            marginLeft: 8, padding: "4px 10px", borderRadius: 999,
            background: "#3B4A75", color: "#fff", border: "none",
            fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>{tt("Compare plans")}</button>
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
          {tt("Loading the field catalog…")}
        </div>
      )}
      {error && !loading && (
        <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.amber}`, fontFamily: FONTS.body, fontSize: 12.5 }} className="bg-admin-amber-soft text-admin-ink">
          {error}{" "}
          <button type="button" onClick={() => void load()} style={{
            marginLeft: 6, textDecoration: "underline", background: "none",
            border: "none", cursor: "pointer", color: COLORS.ink, fontFamily: FONTS.body,
          }}>{tt("Retry")}</button>
        </div>
      )}
      {!loading && !error && (
        <div className="flex flex-col gap-3.5">
          {order.map((bucket) => (
            <div key={bucket.key}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, paddingLeft: 4 }} className="text-admin-ink-muted">{bucket.name === "Other" ? (copy.isSpanish ? "Otros" : "Other") : tt(bucket.name)}</div>
              <div style={{
                background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 12, overflow: "hidden",
              }}>
                {bucket.items.map((f, i) => (
                  <FieldPrivacyRow
                    key={f.field_definition_id}
                    isFirst={i === 0}
                    label={tt(f.label)}
                    description={f.field_key + (f.floored ? ` · ${tt("platform-restricted")}` : "")}
                    defaultVis={toProto(f.platform_default)}
                    current={toProto(effOf(f))}
                    onChange={(v) => void onChange(f, v)}
                    canFlip={rules.canFlipPublicInternal}
                    canHide={rules.canHide}
                  />
                ))}
              </div>
            </div>
          ))}
          {fields.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
              {tt("No catalog fields for this workspace yet.")}
            </div>
          )}
        </div>
      )}
    </DrawerShell>
  );
}
