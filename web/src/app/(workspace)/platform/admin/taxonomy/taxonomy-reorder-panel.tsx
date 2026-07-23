"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/use-t";
import { reorderPlatformTaxonomySiblingsAction } from "./actions";

type ReorderTerm = {
  id: string;
  slug: string;
  name_en: string;
  sort_order: number;
  icon: string | null;
  is_active: boolean;
  archived_at: string | null;
};

const colors = {
  border: "rgba(255,255,255,0.06)",
  card: "rgba(255,255,255,0.04)",
  ink: "#F5F2EB",
  muted: "rgba(245,242,235,0.62)",
  dim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  red: "#F36772",
} as const;

function moveItem(items: ReorderTerm[], fromId: string, toId: string): ReorderTerm[] {
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

export function TaxonomyReorderPanel({
  siblings,
  selectedId,
  returnTerm,
}: {
  siblings: ReorderTerm[];
  selectedId: string;
  returnTerm: string;
}) {
  const t = useT();
  const [items, setItems] = useState(siblings);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const orderedIds = useMemo(() => JSON.stringify(items.map((item) => item.id)), [items]);
  const changed = items.some((item, index) => item.id !== siblings[index]?.id);

  if (siblings.length < 2) {
    return (
      <div style={{ color: colors.dim, fontSize: 12 }}>
        {t("dashboard.platform.taxonomy.reorderNoSiblings")}
      </div>
    );
  }

  return (
    <form action={reorderPlatformTaxonomySiblingsAction} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="ordered_ids" value={orderedIds} readOnly />
      <input type="hidden" name="return_term" value={returnTerm} readOnly />
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((term, index) => {
          const selected = term.id === selectedId;
          const inactive = term.archived_at || !term.is_active;
          return (
            <div
              key={term.id}
              draggable
              onDragStart={() => setDraggingId(term.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggingId) return;
                setItems((current) => moveItem(current, draggingId, term.id));
                setDraggingId(null);
              }}
              onDragEnd={() => setDraggingId(null)}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr auto",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: `1px solid ${selected ? "rgba(93,211,160,0.45)" : colors.border}`,
                borderRadius: 10,
                background: selected ? "rgba(93,211,160,0.10)" : colors.card,
                color: selected ? colors.green : colors.ink,
                cursor: "grab",
                opacity: inactive ? 0.62 : 1,
              }}
            >
              <span style={{ color: colors.dim, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
                {index + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ marginRight: 6 }}>{term.icon ?? "•"}</span>
                <span style={{ fontWeight: 700, fontSize: 12.5 }}>{term.name_en}</span>
                <span
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: colors.dim,
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 10.5,
                  }}
                >
                  {term.slug}
                </span>
              </span>
              <span
                style={{
                  color: inactive ? colors.red : colors.muted,
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: "uppercase",
                }}
              >
                {inactive ? t("dashboard.platform.taxonomy.reorderInactive") : `#${term.sort_order}`}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="submit"
          disabled={!changed}
          style={{
            border: `1px solid ${changed ? "rgba(93,211,160,0.35)" : colors.border}`,
            background: changed ? "rgba(93,211,160,0.12)" : "rgba(255,255,255,0.03)",
            color: changed ? colors.green : colors.dim,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: changed ? "pointer" : "not-allowed",
          }}
        >
          {t("dashboard.platform.taxonomy.reorderSaveOrder")}
        </button>
        <button
          type="button"
          disabled={!changed}
          onClick={() => setItems(siblings)}
          style={{
            border: `1px solid ${colors.border}`,
            background: "transparent",
            color: changed ? colors.muted : colors.dim,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: changed ? "pointer" : "not-allowed",
          }}
        >
          {t("dashboard.platform.taxonomy.reorderReset")}
        </button>
        <span style={{ color: colors.dim, fontSize: 11.5 }}>
          {t("dashboard.platform.taxonomy.reorderHint")}
        </span>
      </div>
    </form>
  );
}
