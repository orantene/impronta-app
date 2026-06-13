"use client";

/**
 * ComponentCatalog (P2) — the read-only inventory of EVERY page-builder
 * component currently offered in the "+" Add Gallery, for BOTH the Talent-Max
 * and Workspace builders, grouped by the same gallery tabs.
 *
 * It is the control-plane's read surface: it calls the same single read path
 * the live galleries use (`fetchSurfaceGalleryItems` → `listGalleryItems`),
 * once per surface at max plan/tier so nothing is plan/tier-hidden — what shows
 * here is exactly what each builder's gallery offers. The Talent/Workspace
 * columns are the EFFECTIVE per-surface visibility (after target/tier gating).
 *
 * P2 is read-only. P3 adds the overlay so these rows become toggle/edit
 * controls; the same fetch + grouping is reused.
 */

import { useEffect, useMemo, useState } from "react";

import {
  ADD_GALLERY_CATEGORIES,
  type AddGalleryItem,
  type AddGalleryTab,
  type GallerySurfaceDescriptor,
} from "@/lib/site-admin/add-gallery";
import { fetchSurfaceGalleryItems } from "@/lib/site-admin/add-gallery/gallery-fetch-action";
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

// Max plan/tier so nothing is plan/tier-hidden — the catalog shows the full set
// each surface could offer; the per-surface columns reflect target/tier gating.
const TALENT_DESCRIPTOR: GallerySurfaceDescriptor = {
  allowedTabs: ALL_TABS,
  allowDbTemplates: true,
  surfaceTarget: "talent",
  plan: "network",
  talentTier: "talent_portfolio",
};
const WORKSPACE_DESCRIPTOR: GallerySurfaceDescriptor = {
  allowedTabs: ALL_TABS,
  allowDbTemplates: true,
  surfaceTarget: "workspace",
  plan: "network",
  talentTier: null,
};

const CATEGORY_LABEL = new Map(
  ADD_GALLERY_CATEGORIES.map((c) => [c.id, c.label] as const),
);

function humanize(id: string): string {
  return CATEGORY_LABEL.get(id) ??
    id
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
}

interface CatalogRow {
  item: AddGalleryItem;
  talent: boolean;
  workspace: boolean;
}

export function ComponentCatalog() {
  const [talentItems, setTalentItems] = useState<AddGalleryItem[] | null>(null);
  const [workspaceItems, setWorkspaceItems] = useState<AddGalleryItem[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchSurfaceGalleryItems(TALENT_DESCRIPTOR),
      fetchSurfaceGalleryItems(WORKSPACE_DESCRIPTOR),
    ])
      .then(([t, w]) => {
        if (cancelled) return;
        setTalentItems(t);
        setWorkspaceItems(w);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load the component catalog.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo<CatalogRow[] | null>(() => {
    if (!talentItems || !workspaceItems) return null;
    const byId = new Map<string, CatalogRow>();
    for (const item of talentItems) {
      byId.set(item.id, { item, talent: true, workspace: false });
    }
    for (const item of workspaceItems) {
      const existing = byId.get(item.id);
      if (existing) existing.workspace = true;
      else byId.set(item.id, { item, talent: false, workspace: true });
    }
    return [...byId.values()];
  }, [talentItems, workspaceItems]);

  const groups = useMemo(() => {
    if (!rows) return null;
    return ALL_TABS.map((tab) => {
      const tabRows = rows
        .filter((r) => r.item.tab === tab)
        .sort(
          (a, b) =>
            a.item.category.localeCompare(b.item.category) ||
            a.item.label.localeCompare(b.item.label),
        );
      return { tab, rows: tabRows };
    }).filter((g) => g.rows.length > 0);
  }, [rows]);

  if (error) {
    return <div style={{ color: "#ff8585", fontSize: 13 }}>{error}</div>;
  }
  if (!rows || !groups) {
    return (
      <div style={{ color: T.inkMuted, fontSize: 13, padding: "8px 0" }}>
        Loading the component catalog…
      </div>
    );
  }

  const total = rows.length;
  const templates = rows.filter(
    (r) => r.item.insertMethod === "dbTemplate",
  ).length;
  const talentCount = rows.filter((r) => r.talent).length;
  const workspaceCount = rows.filter((r) => r.workspace).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12.5 }}>
        <Stat label="Components" value={total} />
        <Stat label="Built-in (code)" value={total - templates} />
        <Stat label="Published templates" value={templates} />
        <Stat label="Visible · Talent-Max" value={talentCount} />
        <Stat label="Visible · Workspace" value={workspaceCount} />
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
              <tr style={{ color: T.inkDim, textAlign: "left" }}>
                <Th>Component</Th>
                <Th>Category</Th>
                <Th>Source</Th>
                <Th>Kind</Th>
                <Th center>Talent-Max</Th>
                <Th center>Workspace</Th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => {
                const isTemplate = r.item.insertMethod === "dbTemplate";
                return (
                  <tr
                    key={r.item.id}
                    style={{ borderTop: `1px solid ${T.borderSoft}` }}
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
                          <AddGalleryIcon name={r.item.icon} size="sm" tone="accent" />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: T.ink, fontWeight: 600 }}>
                            {r.item.label}
                          </div>
                          <div
                            style={{
                              color: T.inkDim,
                              fontSize: 10.5,
                              fontFamily: "ui-monospace, monospace",
                            }}
                          >
                            {r.item.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "9px 16px", color: T.inkMuted }}>
                      {humanize(r.item.category)}
                    </td>
                    <td style={{ padding: "9px 16px" }}>
                      <Badge
                        text={isTemplate ? "Template" : "Code"}
                        tone={isTemplate ? "accent" : "neutral"}
                      />
                      {isTemplate && r.item.targetContext ? (
                        <span style={{ marginLeft: 6, color: T.inkDim, fontSize: 10.5 }}>
                          {r.item.targetContext}
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: "9px 16px", color: T.inkMuted, textTransform: "capitalize" }}>
                      {r.item.itemKind}
                      {r.item.availability !== "available" ? (
                        <span style={{ marginLeft: 6, color: T.inkDim, fontSize: 10.5 }}>
                          ({r.item.availability})
                        </span>
                      ) : null}
                    </td>
                    <VisCell on={r.talent} />
                    <VisCell on={r.workspace} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <p style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5, margin: 0 }}>
        Read-only inventory. Built-in components are visible on both surfaces;
        published templates follow their <code>target_context</code>. Per-surface
        toggles, renaming, and publishing controls land next.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{value}</span>
      <span style={{ fontSize: 10.5, color: T.inkMuted, letterSpacing: 0.4 }}>
        {label}
      </span>
    </div>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th
      style={{
        padding: "9px 16px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        textAlign: center ? "center" : "left",
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

function VisCell({ on }: { on: boolean }) {
  return (
    <td style={{ padding: "9px 16px", textAlign: "center" }}>
      <span
        aria-label={on ? "visible" : "hidden"}
        style={{ color: on ? T.yes : T.no, fontSize: 14, fontWeight: 700 }}
      >
        {on ? "✓" : "—"}
      </span>
    </td>
  );
}
