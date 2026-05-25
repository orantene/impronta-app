"use client";

import { useMemo, useState } from "react";
import { reorderPlatformFieldsAction } from "./actions";

type ReorderField = {
  id: string;
  field_key: string;
  label: string;
  display_order: number;
  deprecated: boolean;
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

function moveItem(items: ReorderField[], fromId: string, toId: string): ReorderField[] {
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

export function FieldOrderPanel({
  fields,
  fieldGroupId,
}: {
  fields: ReorderField[];
  fieldGroupId: string | null;
}) {
  const [items, setItems] = useState(fields);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const orderedIds = useMemo(() => JSON.stringify(items.map((item) => item.id)), [items]);
  const changed = items.some((item, index) => item.id !== fields[index]?.id);

  if (fields.length < 2) return null;

  return (
    <form
      action={reorderPlatformFieldsAction}
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
      <input type="hidden" name="field_group_id" value={fieldGroupId ?? "__ungrouped__"} readOnly />
      <div style={{ display: "grid", gap: 5 }}>
        {items.map((field, index) => (
          <div
            key={field.id}
            draggable
            onDragStart={() => setDraggingId(field.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!draggingId) return;
              setItems((current) => moveItem(current, draggingId, field.id));
              setDraggingId(null);
            }}
            onDragEnd={() => setDraggingId(null)}
            style={{
              display: "grid",
              gridTemplateColumns: "24px minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 8,
              padding: "7px 8px",
              border: `1px solid ${draggingId === field.id ? "rgba(93,211,160,0.45)" : colors.border}`,
              borderRadius: 8,
              background: draggingId === field.id ? "rgba(93,211,160,0.10)" : colors.card,
              color: colors.ink,
              cursor: "grab",
              opacity: field.deprecated ? 0.56 : 1,
            }}
          >
            <span style={{ color: colors.dim, fontVariantNumeric: "tabular-nums", fontSize: 10.5 }}>
              {index + 1}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 750, fontSize: 12 }}>
                {field.label}
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
                {field.field_key}
              </span>
            </span>
            <span
              style={{
                color: field.deprecated ? colors.red : colors.muted,
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              {field.deprecated ? "archived" : `#${field.display_order}`}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={!changed}
          style={{
            border: `1px solid ${changed ? "rgba(93,211,160,0.35)" : colors.border}`,
            background: changed ? "rgba(93,211,160,0.12)" : "rgba(255,255,255,0.03)",
            color: changed ? colors.green : colors.dim,
            borderRadius: 8,
            padding: "7px 11px",
            fontSize: 11.5,
            fontWeight: 750,
            cursor: changed ? "pointer" : "not-allowed",
          }}
        >
          Save field order
        </button>
        <button
          type="button"
          disabled={!changed}
          onClick={() => setItems(fields)}
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
          Drag fields to set the platform default order used by resolved profile sections.
        </span>
      </div>
    </form>
  );
}
