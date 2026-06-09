"use client";

// Drag-to-reorder panel for the SECTIONS within one profile-editor group.
// Posts ordered_ids (JSON) + section_group_id to reorderSections. Modeled on
// field-order-panel.tsx.

import { useMemo, useState } from "react";
import { reorderSections } from "../../profile-editor/actions";

type ReorderSection = {
  id: string;
  slug: string;
  label_en: string;
  emoji: string;
  sort_order: number;
  archived: boolean;
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
  items: ReorderSection[],
  fromId: string,
  toId: string,
): ReorderSection[] {
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

export function EditorSectionReorderPanel({
  sections,
  sectionGroupId,
}: {
  sections: ReorderSection[];
  sectionGroupId: string;
}) {
  const [items, setItems] = useState(sections);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const orderedIds = useMemo(
    () => JSON.stringify(items.map((item) => item.id)),
    [items],
  );
  const changed = items.some((item, index) => item.id !== sections[index]?.id);

  if (sections.length < 2) return null;

  return (
    <form
      action={reorderSections}
      style={{
        display: "grid",
        gap: 8,
        marginBottom: 10,
        padding: 10,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <input type="hidden" name="ordered_ids" value={orderedIds} readOnly />
      <input
        type="hidden"
        name="section_group_id"
        value={sectionGroupId}
        readOnly
      />
      <div style={{ display: "grid", gap: 5 }}>
        {items.map((section, index) => (
          <div
            key={section.id}
            draggable
            onDragStart={() => setDraggingId(section.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!draggingId) return;
              setItems((current) => moveItem(current, draggingId, section.id));
              setDraggingId(null);
            }}
            onDragEnd={() => setDraggingId(null)}
            style={{
              display: "grid",
              gridTemplateColumns: "24px minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 8,
              padding: "7px 8px",
              border: `1px solid ${
                draggingId === section.id
                  ? "rgba(93,211,160,0.45)"
                  : colors.border
              }`,
              borderRadius: 8,
              background:
                draggingId === section.id
                  ? "rgba(93,211,160,0.10)"
                  : colors.card,
              color: colors.ink,
              cursor: "grab",
              opacity: section.archived ? 0.56 : 1,
            }}
          >
            <span
              style={{
                color: colors.dim,
                fontVariantNumeric: "tabular-nums",
                fontSize: 10.5,
              }}
            >
              {index + 1}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 750, fontSize: 12 }}>
                {section.emoji ? `${section.emoji} ` : ""}
                {section.label_en}
              </span>
              <span
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: colors.dim,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 10,
                }}
              >
                {section.slug}
              </span>
            </span>
            <span
              style={{
                color: section.archived ? colors.red : colors.muted,
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              {section.archived ? "archived" : `#${section.sort_order}`}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
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
            padding: "7px 11px",
            fontSize: 11.5,
            fontWeight: 750,
            cursor: changed ? "pointer" : "not-allowed",
          }}
        >
          Save section order
        </button>
        <button
          type="button"
          disabled={!changed}
          onClick={() => setItems(sections)}
          style={{
            border: `1px solid ${colors.border}`,
            background: "transparent",
            color: changed ? colors.muted : colors.dim,
            borderRadius: 8,
            padding: "7px 11px",
            fontSize: 11.5,
            fontWeight: 750,
            cursor: changed ? "pointer" : "not-allowed",
          }}
        >
          Reset
        </button>
        <span style={{ color: colors.dim, fontSize: 10.5 }}>
          Drag sections to set their order within this group.
        </span>
      </div>
    </form>
  );
}
