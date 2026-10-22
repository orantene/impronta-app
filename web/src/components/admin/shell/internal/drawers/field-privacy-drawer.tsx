"use client";

// TUL-1752: split out of light-10.tsx (which was over the 800-line cap) with no
// behaviour change; DrawerSwitch imports it from here.

import { useState, useEffect, useCallback } from "react";
import {
  COLORS,
  DrawerShell,
  FIELD_PRIVACY_PLAN_RULES,
  FieldPrivacyCount,
  FieldPrivacyRow,
  FieldVisibility,
  FONTS,
  getFieldPrivacyCatalog,
  meetsRole,
  PrimaryButton,
  resetWorkspaceFieldVisibility,
  SecondaryButton,
  setWorkspaceFieldVisibility,
  useAdminShell
} from "./drawer-shared";
import { byLabel } from "@/lib/field-engine/sort-comparators";
import { useDashboardText } from "../dashboard-i18n";

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
  // TUL-1708: setWorkspaceFieldVisibility/resetWorkspaceFieldVisibility now
  // require manage_field_catalog (admin+); intercept here the same way the
  // plan-tier rules above already do, so the control never round-trips to
  // a 403 for an editor/manager.
  const canManage = meetsRole(state.role, "admin");
  const roleGateMessage = tt("Only an admin or owner can change this.");

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
    if (!canManage) { toast(roleGateMessage); return; }
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
          icon="🔒" tone={COLORS.indigoDeep} bg={COLORS.indigoSoft} borderLeft />
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
        <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 12.5 }} className="bg-admin-surface-alt text-admin-ink">
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
