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

// Phase 1d (remediation §4): 2 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function FieldCatalogDrawer() {
  type CatField = {
    field_definition_id: string; field_key: string; label: string;
    field_group_id: string | null; enabled: boolean;
    required_override: boolean | null; custom_label: string | null;
    custom_helper: string | null;
  };
  type CatGroup = {
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
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [fields, setFields] = useState<CatField[]>([]);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [renameHelperVal, setRenameHelperVal] = useState("");

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

  // ── field ops ──────────────────────────────────────────────────────
  const toggleField = async (f: CatField) => {
    if (!canCustomize) { toast("Upgrade to Studio to customize the field catalog"); return; }
    const next = !f.enabled;
    const snap = fields;
    setFields((fs) => fs.map((x) => x.field_definition_id === f.field_definition_id ? { ...x, enabled: next } : x));
    mark(f.field_definition_id, true);
    const res = await setWorkspaceFieldCatalog({ field_definition_id: f.field_definition_id, enabled: next });
    mark(f.field_definition_id, false);
    if (!res.ok) { setFields(snap); toast(res.error || "Couldn't save the field"); return; }
    toast(next ? "Field captured for this workspace" : "Field hidden from this workspace");
  };

  const toggleRequired = async (f: CatField) => {
    if (!canRequire) { toast("Upgrade to Agency to set required fields"); return; }
    if (!f.enabled) { toast("Enable the field before making it required"); return; }
    const next = !(f.required_override ?? false);
    const snap = fields;
    setFields((fs) => fs.map((x) => x.field_definition_id === f.field_definition_id ? { ...x, required_override: next } : x));
    mark(f.field_definition_id, true);
    const res = await setWorkspaceFieldCatalog({ field_definition_id: f.field_definition_id, required: next });
    mark(f.field_definition_id, false);
    if (!res.ok) { setFields(snap); toast(res.error || "Couldn't save the field"); return; }
    toast(next ? "Marked required to publish" : "No longer required");
  };

  const commitFieldLabel = async (f: CatField) => {
    if (!canCustomize) { toast("Upgrade to Studio to edit fields"); setRenaming(null); return; }
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
    if (!res.ok) { setFields(snap); toast(res.error || "Couldn't save the field"); return; }
    toast(
      helperChanged && !labelChanged
        ? (nextHelper ? "Guidance text saved" : "Guidance text cleared")
        : (nextLabel ? "Saved for your workspace" : "Reset to the network name"),
    );
  };

  // ── group ops ──────────────────────────────────────────────────────
  const toggleGroup = async (g: CatGroup) => {
    if (!canCustomize) { toast("Upgrade to Studio to customize the field catalog"); return; }
    const next = !g.enabled;
    const snap = groups;
    setGroups((gs) => gs.map((x) => x.id === g.id ? { ...x, enabled: next } : x));
    mark(g.id, true);
    const res = await setWorkspaceFieldGroup({ field_group_id: g.id, is_enabled: next });
    mark(g.id, false);
    if (!res.ok) { setGroups(snap); toast(res.error || "Couldn't save the section"); return; }
    toast(next ? "Section enabled" : "Section hidden from this workspace");
  };

  const commitGroupLabel = async (g: CatGroup) => {
    if (!canCustomize) { toast("Upgrade to Studio to rename sections"); setRenaming(null); return; }
    const v = renameVal.trim();
    const nextLabel = v && v !== g.name ? v : null;
    if ((g.custom_label ?? null) === nextLabel) { setRenaming(null); return; }
    const snap = groups;
    setGroups((gs) => gs.map((x) => x.id === g.id ? { ...x, custom_label: nextLabel } : x));
    setRenaming(null);
    mark(g.id, true);
    const res = await setWorkspaceFieldGroup({ field_group_id: g.id, custom_label: nextLabel });
    mark(g.id, false);
    if (!res.ok) { setGroups(snap); toast(res.error || "Couldn't rename the section"); return; }
    toast(nextLabel ? "Section renamed for your workspace" : "Reset to the network name");
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
      title="Field catalog"
      description="Resolved Tulala engine fields for this workspace. Toggle what you collect, rename for your team, and mark what is required within platform safety rules."
      width={680}
      footer={
        <>
          <SecondaryButton onClick={() => openDrawer("field-privacy")}>Field privacy</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Done</PrimaryButton>
        </>
      }
    >
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12, overflow: "hidden", marginBottom: 16, fontFamily: FONTS.body,
      }}>
        <FieldPrivacyCount label="Captured" count={enabledCount}
          icon="✓" tone={COLORS.successDeep} bg={COLORS.successSoft} />
        <FieldPrivacyCount label="Sections" count={groups.length}
          icon="▦" tone={COLORS.inkMuted} bg="rgba(11,11,13,0.04)" borderLeft />
        <FieldPrivacyCount label="Off" count={offCount}
          icon="–" tone={COLORS.inkMuted} bg="rgba(11,11,13,0.04)" borderLeft />
      </div>

      {!canCustomize && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(91,107,160,0.10)", border: "1px solid rgba(91,107,160,0.18)",
          fontFamily: FONTS.body, fontSize: 12.5, color: "#3B4A75",
          marginBottom: 16, lineHeight: 1.5,
        }}>
          <strong>The network catalog is read-only on Free.</strong> Upgrade to Studio to choose which fields your workspace captures and rename them for your team. Agency tier adds required-field control.
          <button type="button" onClick={() => openDrawer("plan-billing")} style={{
            marginLeft: 8, padding: "4px 10px", borderRadius: 999,
            background: "#3B4A75", color: "#fff", border: "none",
            fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>Compare plans</button>
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
          Loading the field catalog…
        </div>
      )}
      {error && !loading && (
        <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.amber}`, fontFamily: FONTS.body, fontSize: 12.5 }} className="bg-admin-amber-soft text-admin-ink">
          {error}{" "}
          <button type="button" onClick={() => void load()} style={{
            marginLeft: 6, textDecoration: "underline", background: "none",
            border: "none", cursor: "pointer", color: COLORS.ink, fontFamily: FONTS.body,
          }}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-3.5">
          {order.map((bucket) => {
            const g = bucket.group;
            const groupKey = g ? `g:${g.id}` : "g:__general__";
            const groupName = g ? (g.custom_label ?? g.name) : "General";
            const groupOff = g ? !g.enabled : false;
            const groupBusy = g ? saving.has(g.id) : false;
            return (
              <div key={bucket.key}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 6, paddingLeft: 4,
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
                      }}>Save</button>
                      <button type="button" onClick={() => setRenaming(null)} style={{
                        padding: "5px 9px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
                        background: "transparent", color: COLORS.inkMuted,
                        fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>Cancel</button>
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
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }} className="bg-admin-indigo-soft text-admin-indigo-deep">renamed</span>
                      )}
                      {g && canCustomize && (
                        <>
                          <button type="button" onClick={() => startRename(groupKey, g.custom_label ?? g.name)} style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 10.5,
                            textDecoration: "underline", padding: 0,
                          }}>rename</button>
                          <button type="button" disabled={groupBusy} onClick={() => void toggleGroup(g)} style={{
                            marginLeft: "auto", padding: "3px 10px", borderRadius: 999,
                            border: `1px solid ${groupOff ? COLORS.border : COLORS.successDeep}`,
                            background: groupOff ? "transparent" : COLORS.successSoft,
                            color: groupOff ? COLORS.inkMuted : COLORS.successDeep,
                            fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600,
                            cursor: groupBusy ? "wait" : "pointer", opacity: groupBusy ? 0.6 : 1,
                          }}>{groupOff ? "Section off" : "Section on"}</button>
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
                    const fieldName = f.custom_label ?? f.label;
                    const required = f.required_override ?? false;
                    const busy = saving.has(f.field_definition_id);
                    return (
                      <div key={f.field_definition_id} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px",
                        borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                        fontFamily: FONTS.body,
                        opacity: f.enabled ? 1 : 0.6,
                      }}>
                        <div className="flex-1 min-w-0">
                          {renaming === fieldKey ? (
                            <div className="flex flex-col gap-1.5">
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }} className="text-admin-ink-muted">
                                  Label
                                </div>
                                <TextInput
                                  autoFocus
                                  value={renameVal}
                                  placeholder={f.label}
                                  onChange={(e) => setRenameVal(e.target.value)}
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }} className="text-admin-ink-muted">
                                  Guidance text <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— shown to whoever fills this field</span>
                                </div>
                                <TextInput
                                  value={renameHelperVal}
                                  placeholder="e.g. Use the agency-approved spelling"
                                  onChange={(e) => setRenameHelperVal(e.target.value)}
                                />
                              </div>
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => void commitFieldLabel(f)} style={{
                                  padding: "5px 11px", borderRadius: 999, border: "none",
                                  background: COLORS.fill, color: "#fff",
                                  fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                }}>Save</button>
                                <button type="button" onClick={() => setRenaming(null)} style={{
                                  padding: "5px 9px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
                                  background: "transparent", color: COLORS.inkMuted,
                                  fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="text-admin-ink text-admin-12h font-medium">{fieldName}</span>
                                {f.custom_label && (
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }} className="bg-admin-indigo-soft text-admin-indigo-deep">renamed</span>
                                )}
                                {required && (
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }} className="bg-admin-amber-soft text-admin-amber-deep">required</span>
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
                                  >edit</button>
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
                              title={!canRequire ? "Agency tier sets required fields" : !f.enabled ? "Enable the field first" : required ? "Required to publish" : "Optional"}
                              style={{
                                padding: "4px 10px", borderRadius: 999,
                                border: `1px solid ${required ? COLORS.amberDeep : COLORS.border}`,
                                background: required ? COLORS.amberSoft : "transparent",
                                color: required ? COLORS.amberDeep : COLORS.inkDim,
                                fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600,
                                cursor: (busy || !canRequire || !f.enabled) ? "not-allowed" : "pointer",
                                opacity: (!canRequire || !f.enabled) ? 0.45 : 1,
                              }}
                            >Required</button>
                            <button
                              type="button"
                              disabled={busy || !canCustomize}
                              onClick={() => void toggleField(f)}
                              title={!canCustomize ? "Studio tier customizes the catalog" : f.enabled ? "Captured — tap to stop collecting" : "Off — tap to start collecting"}
                              style={{
                                padding: "5px 12px", borderRadius: 999,
                                border: `1px solid ${f.enabled ? COLORS.successDeep : COLORS.border}`,
                                background: f.enabled ? COLORS.successSoft : "transparent",
                                color: f.enabled ? COLORS.successDeep : COLORS.inkMuted,
                                fontFamily: FONTS.body, fontSize: 11, fontWeight: 600,
                                cursor: (busy || !canCustomize) ? "not-allowed" : "pointer",
                                opacity: !canCustomize ? 0.5 : (busy ? 0.6 : 1),
                              }}
                            >{f.enabled ? "On" : "Off"}</button>
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
              No catalog fields for this workspace yet.
            </div>
          )}

          {/* Custom workspace fields — honest "not yet" state. No fake add flow. */}
          <div style={{ padding: 14, borderRadius: 12, border: `1px dashed ${COLORS.borderSoft}`, fontFamily: FONTS.body }} className="bg-admin-surface">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className="text-admin-ink text-admin-12h font-semibold">
                Workspace-specific custom fields
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "rgba(11,11,13,0.06)", letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">coming soon</span>
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {rules.canCreateCustom
                ? "Defining brand-new fields (beyond the network catalog) is included in your plan and is being built into the Catalog Studio. For now you can fully customize which network fields you capture, rename them, and set what's required above."
                : "Brand-new custom fields are an Agency-tier capability and are being built into the Catalog Studio. Every workspace can already customize the network catalog above — enable, rename, and require the fields you actually use."}
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
    field_group_id: string | null; effective: EngVis;
    platform_default: EngVis; floored: boolean; has_override: boolean;
  };
  type Grp = { id: string; slug: string; name: string; sort_order: number };

  const { state, closeDrawer, openDrawer, toast } = useAdminShell();
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
      toast("Upgrade to Studio to change field visibility"); return;
    }
    if (target === "hidden" && !rules.canHide) {
      toast("Upgrade to Agency to hide fields entirely"); return;
    }
    if (target === "public" && f.floored) {
      toast("This field is platform-restricted and can't be public"); return;
    }
    setPending(p => ({ ...p, [f.field_definition_id]: target }));
    const res = target === f.platform_default
      ? await resetWorkspaceFieldVisibility({ field_definition_id: f.field_definition_id })
      : await setWorkspaceFieldVisibility({ field_definition_id: f.field_definition_id, visibility: target });
    if (!res.ok) {
      setPending(p => { const n = { ...p }; delete n[f.field_definition_id]; return n; });
      toast(res.error || "Couldn't save the field setting"); return;
    }
    setFields(fs => fs.map(x => x.field_definition_id === f.field_definition_id
      ? { ...x, effective: target, has_override: target !== x.platform_default }
      : x));
    setPending(p => { const n = { ...p }; delete n[f.field_definition_id]; return n; });
    toast("Saved");
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
  order.sort((a, b) => {
    const ai = a.key === "__general__" ? 1e9 : (groups.find(g => g.id === a.key)?.sort_order ?? 0);
    const bi = b.key === "__general__" ? 1e9 : (groups.find(g => g.id === b.key)?.sort_order ?? 0);
    return ai - bi;
  });

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Field privacy"
      description="The same effective visibility used by the profile editor, registration, public profile, and directory."
      width={680}
      footer={
        <>
          <SecondaryButton onClick={() => openDrawer("field-catalog")}>Field catalog</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Done</PrimaryButton>
        </>
      }
    >
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12, overflow: "hidden", marginBottom: 16, fontFamily: FONTS.body,
      }}>
        <FieldPrivacyCount label="On storefront" count={counts.public}
          icon="🌐" tone={COLORS.successDeep} bg={COLORS.successSoft} />
        <FieldPrivacyCount label="Admin-only" count={counts.internal}
          icon="🔒" tone={COLORS.amberDeep} bg={COLORS.amberSoft} borderLeft />
        <FieldPrivacyCount label="Hidden" count={counts.hidden}
          icon="–" tone={COLORS.inkMuted} bg="rgba(11,11,13,0.04)" borderLeft />
      </div>

      {!rules.canFlipPublicInternal && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(91,107,160,0.10)", border: "1px solid rgba(91,107,160,0.18)",
          fontFamily: FONTS.body, fontSize: 12.5, color: "#3B4A75",
          marginBottom: 16, lineHeight: 1.5,
        }}>
          <strong>Free plan defaults are locked.</strong> Upgrade to Studio to flip fields between public and admin-only. Agency tier unlocks hiding fields entirely.
          <button type="button" onClick={() => openDrawer("plan-billing")} style={{
            marginLeft: 8, padding: "4px 10px", borderRadius: 999,
            background: "#3B4A75", color: "#fff", border: "none",
            fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>Compare plans</button>
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
          Loading the field catalog…
        </div>
      )}
      {error && !loading && (
        <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.amber}`, fontFamily: FONTS.body, fontSize: 12.5 }} className="bg-admin-amber-soft text-admin-ink">
          {error}{" "}
          <button type="button" onClick={() => void load()} style={{
            marginLeft: 6, textDecoration: "underline", background: "none",
            border: "none", cursor: "pointer", color: COLORS.ink, fontFamily: FONTS.body,
          }}>Retry</button>
        </div>
      )}
      {!loading && !error && (
        <div className="flex flex-col gap-3.5">
          {order.map((bucket) => (
            <div key={bucket.key}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, paddingLeft: 4 }} className="text-admin-ink-muted">{bucket.name}</div>
              <div style={{
                background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 12, overflow: "hidden",
              }}>
                {bucket.items.map((f, i) => (
                  <FieldPrivacyRow
                    key={f.field_definition_id}
                    isFirst={i === 0}
                    label={f.label}
                    description={f.field_key + (f.floored ? " · platform-restricted" : "")}
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
              No catalog fields for this workspace yet.
            </div>
          )}
        </div>
      )}
    </DrawerShell>
  );
}
