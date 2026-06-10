"use client";

// Drag-to-reorder panel for profile-editor section GROUPS. Posts ordered_ids
// (JSON) to reorderSectionGroups. Modeled on field-groups-reorder-panel.tsx.

import { useMemo, useState } from "react";
import { reorderSectionGroups } from "../../profile-editor/actions";

type ReorderGroup = {
  id: string;
  slug: string;
  label_en: string;
  sort_order: number;
  is_active: boolean;
  section_count: number;
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

function moveItem(
  items: ReorderGroup[],
  fromId: string,
  toId: string,
): ReorderGroup[] {
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

export function EditorGroupReorderPanel({ groups }: { groups: ReorderGroup[] }) {
  const [items, setItems] = useState(groups);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const orderedIds = useMemo(
    () => JSON.stringify(items.map((item) => item.id)),
    [items],
  );
  const changed = items.some((item, index) => item.id !== groups[index]?.id);

  if (groups.length < 2) {
    return (
      <div style={{ color: colors.dim, fontSize: 12 }}>
        Add at least two section groups before editing group order.
      </div>
    );
  }

  return (
    <form action={reorderSectionGroups} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="ordered_ids" value={orderedIds} readOnly />
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((group, index) => (
          <div
            key={group.id}
            draggable
            onDragStart={() => setDraggingId(group.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!draggingId) return;
              setItems((current) => moveItem(current, draggingId, group.id));
              setDraggingId(null);
            }}
            onDragEnd={() => setDraggingId(null)}
            style={{
              display: "grid",
              gridTemplateColumns: "26px minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              border: `1px solid ${
                draggingId === group.id
                  ? "rgba(93,211,160,0.45)"
                  : colors.border
              }`,
              borderRadius: 10,
              background:
                draggingId === group.id
                  ? "rgba(93,211,160,0.10)"
                  : colors.card,
              color: colors.ink,
              cursor: "grab",
              opacity: group.is_active ? 1 : 0.62,
            }}
          >
            <span
              style={{
                color: colors.dim,
                fontVariantNumeric: "tabular-nums",
                fontSize: 11,
              }}
            >
              {index + 1}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 750, fontSize: 12.5 }}>
                {group.label_en}
              </span>
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
                {group.slug} · {group.section_count} section
                {group.section_count === 1 ? "" : "s"}
              </span>
            </span>
            <span
              style={{
                color: group.is_active ? colors.muted : colors.red,
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              {group.is_active ? `#${group.sort_order}` : "inactive"}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="submit"
          disabled={!changed}
          style={{
            border: `1px solid ${
              changed ? "rgba(93,211,160,0.35)" : colors.border
            }`,
            background: changed
              ? "rgba(93,211,160,0.12)"
              : "rgba(255,255,255,0.03)",
            color: changed ? colors.green : colors.dim,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: changed ? "pointer" : "not-allowed",
          }}
        >
          Save group order
        </button>
        <button
          type="button"
          disabled={!changed}
          onClick={() => setItems(groups)}
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
          Reset
        </button>
        <span style={{ color: colors.dim, fontSize: 11 }}>
          Drag a group, then save. This changes the profile-editor rail order.
        </span>
      </div>
    </form>
  );
}
