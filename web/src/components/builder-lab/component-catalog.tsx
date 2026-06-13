"use client";

/**
 * ComponentCatalog (P2 read-only → P3 control-plane).
 *
 * The Builder Lab's inventory of EVERY page-builder component the "+" gallery
 * can offer — built-in code items ∪ published templates — grouped by gallery
 * tab. P3 makes it the control surface: per-surface (Talent-Max / Workspace)
 * visibility toggles + inline label/category overrides, persisted to
 * `builder_catalog_overlay` and reflected in BOTH live builders on next open.
 *
 * Data comes from `loadCatalogAdminView` (the FULL ungated universe + overlay
 * state) so hidden items remain listed and re-enable-able. Mutations go through
 * `setComponentOverlay` / `clearComponentOverlay`, then we reload — the same
 * round-trip the live galleries see.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ADD_GALLERY_CATEGORIES,
  type AddGalleryTab,
  type CatalogAdminItem,
} from "@/lib/site-admin/add-gallery";
import { loadCatalogAdminView } from "@/lib/site-admin/add-gallery/catalog-admin-view-action";
import {
  clearComponentOverlay,
  setComponentOverlay,
} from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";
import { AddGalleryIcon } from "@/components/edit-chrome/add-gallery/add-gallery-icons";

const T = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  accent: "#5DD3A0",
  yes: "#5DD3A0",
  no: "rgba(245,242,235,0.28)",
  field: "#0F0F11",
};

const ALL_TABS: ReadonlyArray<AddGalleryTab> = [
  "layout",
  "elements",
  "sections",
  "connected",
  "page_templates",
];

const TAB_LABEL: Record<AddGalleryTab, string> = {
  layout: "Layout",
  elements: "Elements",
  sections: "Sections",
  connected: "Connected",
  page_templates: "Page Templates",
};

const CATEGORY_LABEL = new Map(
  ADD_GALLERY_CATEGORIES.map((c) => [c.id, c.label] as const),
);

function humanize(id: string): string {
  return (
    CATEGORY_LABEL.get(id) ??
    id
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function targetAllows(
  targetContext: CatalogAdminItem["targetContext"],
  surface: "talent" | "workspace",
): boolean {
  if (targetContext === "both") return true;
  return targetContext === surface;
}

export function ComponentCatalog() {
  const [items, setItems] = useState<CatalogAdminItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const reload = useCallback(async () => {
    const data = await loadCatalogAdminView();
    setItems(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCatalogAdminView()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load the component catalog.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mutate = useCallback(
    async (id: string, run: () => Promise<{ ok: boolean; error?: string }>) => {
      setPendingId(id);
      setError(null);
      try {
        const res = await run();
        if (!res.ok) setError(res.error ?? "Update failed.");
        await reload();
      } catch {
        setError("Update failed.");
      } finally {
        setPendingId(null);
      }
    },
    [reload],
  );

  const toggleSurface = useCallback(
    (item: CatalogAdminItem, surface: "talent" | "workspace") => {
      const enabledNow =
        surface === "talent"
          ? item.overlay?.talent_enabled ?? true
          : item.overlay?.workspace_enabled ?? true;
      const field = surface === "talent" ? "talent_enabled" : "workspace_enabled";
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          [field]: !enabledNow,
        }),
      );
    },
    [mutate],
  );

  const startEdit = useCallback((item: CatalogAdminItem) => {
    setEditingId(item.id);
    setEditLabel(item.overlay?.label_override ?? "");
    setEditCategory(item.overlay?.category_override ?? "");
  }, []);

  const saveEdit = useCallback(
    (item: CatalogAdminItem) => {
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          label_override: editLabel.trim() || null,
          category_override: editCategory.trim() || null,
        }),
      ).then(() => setEditingId(null));
    },
    [mutate, editLabel, editCategory],
  );

  const resetOverlay = useCallback(
    (item: CatalogAdminItem) => {
      void mutate(item.id, () => clearComponentOverlay(item.id));
    },
    [mutate],
  );

  const groups = useMemo(() => {
    if (!items) return null;
    return ALL_TABS.map((tab) => ({
      tab,
      rows: items
        .filter((r) => r.tab === tab)
        .sort(
          (a, b) =>
            a.effectiveCategory.localeCompare(b.effectiveCategory) ||
            a.effectiveLabel.localeCompare(b.effectiveLabel),
        ),
    })).filter((g) => g.rows.length > 0);
  }, [items]);

  if (error && !items) {
    return <div style={{ color: "#ff8585", fontSize: 13 }}>{error}</div>;
  }
  if (!items || !groups) {
    return (
      <div style={{ color: T.inkMuted, fontSize: 13, padding: "8px 0" }}>
        Loading the component catalog…
      </div>
    );
  }

  const total = items.length;
  const templates = items.filter((r) => r.source === "template").length;
  const overridden = items.filter((r) => r.overlay).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12.5, alignItems: "flex-end" }}>
        <Stat label="Components" value={total} />
        <Stat label="Built-in (code)" value={total - templates} />
        <Stat label="Published templates" value={templates} />
        <Stat label="Customized" value={overridden} />
        {error ? (
          <span style={{ color: "#ff8585", fontSize: 12 }}>{error}</span>
        ) : null}
      </div>

      {groups.map((g) => (
        <section
          key={g.tab}
          style={{
            background: T.card,
            border: `1px solid ${T.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
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
              {TAB_LABEL[g.tab]}
            </span>
            <span style={{ fontSize: 11.5, color: T.inkMuted }}>
              {g.rows.length} component{g.rows.length === 1 ? "" : "s"}
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: T.inkDim }}>
                <Th>Component</Th>
                <Th>Category</Th>
                <Th>Source</Th>
                <Th center>Talent-Max</Th>
                <Th center>Workspace</Th>
                <Th right>Manage</Th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => {
                const busy = pendingId === r.id;
                const editing = editingId === r.id;
                const isTemplate = r.source === "template";
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${T.borderSoft}`, opacity: busy ? 0.55 : 1 }}>
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
                          <AddGalleryIcon name={r.baseIcon} size="sm" tone="accent" />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: T.ink, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                            {r.effectiveLabel}
                            {r.overlay ? (
                              <span title="Has admin overrides" style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, flexShrink: 0 }} />
                            ) : null}
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
                      <Badge text={isTemplate ? "Template" : "Code"} tone={isTemplate ? "accent" : "neutral"} />
                      {isTemplate ? (
                        <span style={{ marginLeft: 6, color: T.inkDim, fontSize: 10.5 }}>{r.targetContext}</span>
                      ) : null}
                    </td>
                    <ToggleCell
                      on={r.talentVisible}
                      disabled={busy || !targetAllows(r.targetContext, "talent")}
                      locked={!targetAllows(r.targetContext, "talent")}
                      onClick={() => toggleSurface(r, "talent")}
                    />
                    <ToggleCell
                      on={r.workspaceVisible}
                      disabled={busy || !targetAllows(r.targetContext, "workspace")}
                      locked={!targetAllows(r.targetContext, "workspace")}
                      onClick={() => toggleSurface(r, "workspace")}
                    />
                    <td style={{ padding: "9px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {editing ? (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <LinkBtn label="Save" onClick={() => saveEdit(r)} disabled={busy} primary />
                          <LinkBtn label="Cancel" onClick={() => setEditingId(null)} disabled={busy} />
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 10 }}>
                          <LinkBtn label="Edit" onClick={() => startEdit(r)} disabled={busy} />
                          {r.overlay ? (
                            <LinkBtn label="Reset" onClick={() => resetOverlay(r)} disabled={busy} />
                          ) : null}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {g.rows.map((r) =>
                editingId === r.id ? (
                  <tr key={`${r.id}-edit`} style={{ background: T.cardSoft }}>
                    <td colSpan={6} style={{ padding: "10px 16px" }}>
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
                        <span style={{ fontSize: 11, color: T.inkDim }}>
                          Leave blank to use the default. Reflected in both builders on next open.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </section>
      ))}

      <p style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5, margin: 0 }}>
        Toggles control per-surface visibility (subtract-only — a component can&apos;t be forced onto a
        surface its <code>target_context</code> excludes; locked cells show that). Renames apply to both
        builders&apos; &quot;+&quot; gallery on next open. Built-in components can be hidden/renamed but not
        restructured here — that&apos;s a code change (or, soon, fork-to-template).
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: T.field,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.ink,
  fontSize: 12.5,
  padding: "7px 10px",
  width: 220,
};

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{value}</span>
      <span style={{ fontSize: 10.5, color: T.inkMuted, letterSpacing: 0.4 }}>{label}</span>
    </div>
  );
}

function Th({ children, center, right }: { children: React.ReactNode; center?: boolean; right?: boolean }) {
  return (
    <th
      style={{
        padding: "9px 16px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        textAlign: center ? "center" : right ? "right" : "left",
      }}
    >
      {children}
    </th>
  );
}

function Badge({ text, tone }: { text: string; tone: "accent" | "neutral" }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 999,
        background: tone === "accent" ? "rgba(93,211,160,0.14)" : "rgba(255,255,255,0.07)",
        color: tone === "accent" ? T.accent : T.inkMuted,
      }}
    >
      {text}
    </span>
  );
}

function ToggleCell({
  on,
  disabled,
  locked,
  onClick,
}: {
  on: boolean;
  disabled: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  return (
    <td style={{ padding: "9px 16px", textAlign: "center" }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={locked ? "Not targeted to this surface" : on ? "Visible — click to hide" : "Hidden — click to show"}
        aria-pressed={on}
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

function LinkBtn({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        border: "none",
        color: disabled ? T.inkDim : primary ? T.accent : T.inkMuted,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
      }}
    >
      {label}
    </button>
  );
}
