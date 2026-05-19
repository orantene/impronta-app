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
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 1 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function WorkspaceFieldSettingsDrawer() {
  type WField = {
    field_definition_id: string; field_key: string; label: string;
    field_group_id: string | null; enabled: boolean;
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

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Workspace field settings"
      description="Per-field control over what your roster captures: enable/disable, rename, set guidance text, and mark required. Talent + admin editors update automatically."
      width={720}
      footer={
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
          fontFamily: FONTS.body,
        }}>
          <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
            <strong style={{ color: COLORS.ink }}>{overrideCount}</strong> {overrideCount === 1 ? "override" : "overrides"} active
            {overrideCount > 0 && canCustomize && (
              <button type="button" onClick={() => void resetAll()} style={{
                marginLeft: 10,
                padding: "4px 10px", borderRadius: 999,
                border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
                color: COLORS.inkMuted, fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
              }}>Reset all</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <SecondaryButton onClick={() => openDrawer("field-privacy")}>Field privacy</SecondaryButton>
            <PrimaryButton onClick={closeDrawer}>Done</PrimaryButton>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "10px 12px", borderRadius: 10,
          background: COLORS.surfaceAlt, border: `1px solid ${COLORS.borderSoft}`,
        }}>
          <input
            type="text"
            placeholder="Search field by label or key…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 200,
              padding: "7px 11px",
              borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
              fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}
          />
        </div>

        {!canCustomize && (
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            background: "rgba(91,107,160,0.06)", border: `1px solid rgba(91,107,160,0.18)`,
            fontSize: 11.5, color: COLORS.indigoDeep, lineHeight: 1.45, fontFamily: FONTS.body,
          }}>
            Your plan can view the catalog. <strong>Studio</strong> unlocks enable/disable + rename;
            <strong> Agency</strong> adds required-field control. Visibility lives in <strong>Field privacy</strong>.
          </div>
        )}

        {loading && (
          <div style={{ padding: 18, textAlign: "center", fontSize: 13, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
            Loading workspace field settings…
          </div>
        )}
        {error && !loading && (
          <div style={{
            padding: 14, borderRadius: 10, background: COLORS.amberSoft,
            border: `1px solid ${COLORS.amber}`, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.amberDeep,
          }}>
            {error} <button type="button" onClick={() => void load()} style={{
              marginLeft: 8, padding: "3px 9px", borderRadius: 999, border: "none",
              background: COLORS.amberDeep, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>Retry</button>
          </div>
        )}

        {!loading && !error && order.map(({ key, group, items }) => (
          <div key={key}>
            <div style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6,
              textTransform: "uppercase", color: COLORS.inkMuted,
              marginBottom: 6, paddingLeft: 4,
            }}>{group ? (group.custom_label ?? group.name) : "General"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((f) => {
                const open = expanded.has(f.field_definition_id);
                const busy = saving.has(f.field_definition_id);
                const required = f.required_override ?? false;
                const over = isOverridden(f);
                return (
                  <div key={f.field_definition_id} style={{
                    borderRadius: 10,
                    border: `1px solid ${over ? COLORS.amber : COLORS.borderSoft}`,
                    background: f.enabled ? "#fff" : "rgba(11,11,13,0.03)",
                    fontFamily: FONTS.body, opacity: busy ? 0.7 : 1,
                  }}>
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => {
                        const n = new Set(s);
                        if (n.has(f.field_definition_id)) n.delete(f.field_definition_id);
                        else n.add(f.field_definition_id);
                        return n;
                      })}
                      style={{
                        width: "100%", textAlign: "left", border: "none",
                        padding: "10px 12px", background: "transparent", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: COLORS.ink,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {f.custom_label ?? f.label}
                          {over && (
                            <span style={{
                              marginLeft: 6, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                              color: COLORS.amberDeep, textTransform: "uppercase",
                            }}>· customized</span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 10.5, color: COLORS.inkDim, marginTop: 1,
                          fontFamily: "ui-monospace, monospace",
                        }}>{f.field_key}</div>
                      </div>
                      <span style={{
                        padding: "1px 6px", borderRadius: 999,
                        background: required ? "rgba(15,79,62,0.10)" : "rgba(11,11,13,0.05)",
                        color: required ? COLORS.accent : COLORS.inkDim,
                        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, flexShrink: 0,
                      }}>{required ? "REQUIRED" : "OPTIONAL"}</span>
                      {!f.enabled && (
                        <span style={{
                          padding: "1px 6px", borderRadius: 999,
                          background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted,
                          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, flexShrink: 0,
                        }}>OFF</span>
                      )}
                      <span aria-hidden style={{ color: COLORS.inkMuted, fontSize: 11 }}>{open ? "▾" : "▸"}</span>
                    </button>

                    {open && (
                      <div style={{
                        padding: "10px 14px 14px",
                        borderTop: `1px solid ${COLORS.borderSoft}`,
                        display: "flex", flexDirection: "column", gap: 10,
                      }}>
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                          <div>
                            <label style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.inkMuted, letterSpacing: 0.3, textTransform: "uppercase" }}>
                              Custom label
                            </label>
                            <input
                              type="text"
                              defaultValue={f.custom_label ?? ""}
                              placeholder={f.label}
                              disabled={!canCustomize}
                              onBlur={(e) => commitLabel(f, e.target.value)}
                              style={{
                                marginTop: 4, width: "100%", boxSizing: "border-box",
                                padding: "6px 9px", borderRadius: 7, border: `1px solid ${COLORS.borderSoft}`,
                                fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
                                background: canCustomize ? "#fff" : "rgba(11,11,13,0.03)",
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.inkMuted, letterSpacing: 0.3, textTransform: "uppercase" }}>
                              Custom helper text
                            </label>
                            <input
                              type="text"
                              defaultValue={f.custom_helper ?? ""}
                              placeholder="Guidance shown while editing this field"
                              disabled={!canCustomize}
                              onBlur={(e) => commitHelper(f, e.target.value)}
                              style={{
                                marginTop: 4, width: "100%", boxSizing: "border-box",
                                padding: "6px 9px", borderRadius: 7, border: `1px solid ${COLORS.borderSoft}`,
                                fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
                                background: canCustomize ? "#fff" : "rgba(11,11,13,0.03)",
                              }}
                            />
                          </div>
                        </div>
                        {over && canCustomize && (
                          <button type="button" onClick={() => resetField(f)} style={{
                            alignSelf: "flex-start",
                            padding: "5px 11px", borderRadius: 999,
                            border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
                            color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600,
                            cursor: "pointer",
                          }}>Reset to platform default</button>
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
          <div style={{
            padding: 18, textAlign: "center",
            fontSize: 13, color: COLORS.inkMuted, fontFamily: FONTS.body,
          }}>{fields.length === 0 ? "No catalog fields for this workspace." : "No fields match your search."}</div>
        )}
      </div>
    </DrawerShell>
  );
}

