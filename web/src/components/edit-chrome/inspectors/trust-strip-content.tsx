"use client";

/**
 * TrustStripContentInspector — curated Content tab for trust_strip.
 *
 * Keeps the section on the current builder foundation while improving the
 * authoring loop: selected canvas child nodes (eyebrow/headline) now jump
 * the operator directly to matching content fields.
 */

import { useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp, Copy, GripVertical } from "lucide-react";
import { resolveBuilderNodeRole } from "@/lib/site-admin/builder-node";
import { RichEditor } from "@/components/edit-chrome/rich-editor";

import { InspectorGroup, KIT, VisualChipGroup } from "./kit";
import { DraggableList, type DragHandleProps } from "./kit/draggable-list";

type Variant = "icon-row" | "metrics-row" | "logo-row";
type Background = "neutral" | "ivory" | "champagne" | "espresso";
type Density = "tight" | "standard" | "airy";

interface TrustItemDraft {
  label: string;
  detail: string;
  stat: string;
}

interface Props {
  draftProps: Record<string, unknown>;
  tenantId: string;
  selectedBuilderNodeId: string | null;
  onChange: (next: Record<string, unknown>) => void;
}

const VARIANT_OPTIONS: ReadonlyArray<{
  value: Variant;
  label: string;
  info: string;
}> = [
  {
    value: "icon-row",
    label: "Icon row",
    info: "Small proof strip with index numerals.",
  },
  {
    value: "metrics-row",
    label: "Metrics",
    info: "Large stats with short labels.",
  },
  {
    value: "logo-row",
    label: "Logo row",
    info: "Client or publication name strip.",
  },
];

const BACKGROUND_OPTIONS: ReadonlyArray<{
  value: Background;
  label: string;
  color: string;
}> = [
  { value: "neutral", label: "Neutral", color: "#f8f6f2" },
  { value: "ivory", label: "Ivory", color: "#f4efe6" },
  { value: "champagne", label: "Champagne", color: "#e7d6b7" },
  { value: "espresso", label: "Espresso", color: "#2b211a" },
];

const DENSITY_OPTIONS: ReadonlyArray<{
  value: Density;
  label: string;
  info: string;
}> = [
  { value: "tight", label: "Tight", info: "Compact vertical rhythm." },
  { value: "standard", label: "Standard", info: "Balanced section rhythm." },
  { value: "airy", label: "Airy", info: "More breathing room." },
];

function parseItems(raw: unknown): TrustItemDraft[] {
  if (!Array.isArray(raw)) return [{ label: "Destination-ready", detail: "", stat: "" }];
  const next = raw
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        label: typeof row.label === "string" ? row.label : "",
        detail: typeof row.detail === "string" ? row.detail : "",
        stat: typeof row.stat === "string" ? row.stat : "",
      };
    })
    .slice(0, 6);
  return next.length > 0 ? next : [{ label: "Destination-ready", detail: "", stat: "" }];
}

function cleanObject<T extends Record<string, unknown>>(value: T): T {
  const out = { ...value };
  for (const key of Object.keys(out)) {
    const field = out[key as keyof T];
    if (field === null || field === undefined) {
      delete out[key as keyof T];
    }
  }
  return out;
}

export function TrustStripContentInspector({
  draftProps,
  tenantId,
  selectedBuilderNodeId,
  onChange,
}: Props) {
  const eyebrow = (draftProps.eyebrow as string | undefined) ?? "";
  const headline = (draftProps.headline as string | undefined) ?? "";
  const variant = (draftProps.variant as Variant | undefined) ?? "icon-row";
  const background = (draftProps.background as Background | undefined) ?? "neutral";
  const density = (draftProps.density as Density | undefined) ?? "standard";
  const items = parseItems(draftProps.items);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const focusRole = useMemo(() => {
    if (!selectedBuilderNodeId) return null;
    const role = resolveBuilderNodeRole(selectedBuilderNodeId);
    if (role === "subheadline" || role === "headline") return role;
    return null;
  }, [selectedBuilderNodeId]);

  const focusLabel = useMemo(() => {
    if (focusRole === "subheadline") return "Eyebrow";
    if (focusRole === "headline") return "Headline";
    return null;
  }, [focusRole]);

  useEffect(() => {
    if (!focusRole) return;
    const root = rootRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-trust-strip-node-role="${focusRole}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const focusable = target.querySelector<HTMLElement>(
      "[contenteditable='true'],input,textarea,select,button",
    );
    focusable?.focus({ preventScroll: true });
  }, [focusRole]);

  function update(patch: Record<string, unknown>) {
    onChange(cleanObject({ ...draftProps, ...patch }));
  }

  function patchItem(index: number, patch: Partial<TrustItemDraft>) {
    const next = items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    );
    update({ items: next });
  }

  function reorderItems(next: TrustItemDraft[]) {
    update({ items: next });
  }

  function addItem() {
    if (items.length >= 6) return;
    update({
      items: [...items, { label: "New item", detail: "", stat: "" }],
    });
  }

  function duplicateItem(index: number) {
    if (items.length >= 6) return;
    const source = items[index];
    if (!source) return;
    update({
      items: [
        ...items.slice(0, index + 1),
        { ...source },
        ...items.slice(index + 1),
      ],
    });
  }

  function moveItem(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    update({ items: next });
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    update({ items: items.filter((_, itemIndex) => itemIndex !== index) });
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      {focusRole && focusLabel ? (
        <div
          className="rounded-lg border px-3 py-2 text-xs font-medium"
          style={{
            borderColor: "#bfdbfe",
            background: "#eff6ff",
            color: "#1d4ed8",
          }}
        >
          Editing selected canvas node: {focusLabel}
        </div>
      ) : null}

      <InspectorGroup title="Copy">
        <div className={KIT.field} data-trust-strip-node-role="subheadline">
          <label className={KIT.label}>Eyebrow</label>
          <RichEditor
            value={eyebrow}
            onChange={(next) => update({ eyebrow: next || undefined })}
            variant="single"
            tenantId={tenantId}
            placeholder="Optional framing line"
            ariaLabel="Trust strip eyebrow"
          />
        </div>
        <div className={KIT.field} data-trust-strip-node-role="headline">
          <label className={KIT.label}>Headline</label>
          <RichEditor
            value={headline}
            onChange={(next) => update({ headline: next || undefined })}
            variant="single"
            tenantId={tenantId}
            placeholder="Optional core proof statement"
            ariaLabel="Trust strip headline"
          />
        </div>
      </InspectorGroup>

      <InspectorGroup title="Layout style">
        <VisualChipGroup<Variant>
          value={variant}
          onChange={(next) => update({ variant: next })}
          options={VARIANT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            info: option.info,
            preview: null,
          }))}
          columns={3}
        />
      </InspectorGroup>

      <InspectorGroup title="Tone">
        <div className="grid grid-cols-4 gap-2">
          {BACKGROUND_OPTIONS.map((option) => {
            const active = option.value === background;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ background: option.value })}
                className={`flex flex-col items-stretch gap-1.5 rounded-lg border p-1.5 text-left transition ${
                  active
                    ? "border-indigo-400 shadow-[0_0_0_1px_rgba(124,58,237,0.4)]"
                    : "border-stone-200 hover:border-stone-400"
                }`}
              >
                <span
                  className="h-8 rounded-md border border-black/5"
                  style={{ backgroundColor: option.color }}
                />
                <span className="px-0.5 text-[11px] font-medium text-stone-700">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </InspectorGroup>

      <InspectorGroup title="Density">
        <VisualChipGroup<Density>
          value={density}
          onChange={(next) => update({ density: next })}
          options={DENSITY_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            info: option.info,
            preview: null,
          }))}
          columns={3}
        />
      </InspectorGroup>

      <InspectorGroup title={`Items (${items.length}/6)`}>
        <DraggableList<TrustItemDraft>
          items={items}
          keyOf={(_, i) => String(i)}
          onReorder={reorderItems}
        >
          {(item, index, handleProps: DragHandleProps) => (
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
              {variant === "metrics-row" ? (
                <input
                  type="text"
                  className={KIT.input}
                  maxLength={40}
                  placeholder="Stat (e.g. 12+ years)"
                  value={item.stat}
                  onChange={(event) =>
                    patchItem(index, { stat: event.target.value })
                  }
                />
              ) : (
                <input
                  type="text"
                  className={KIT.input}
                  maxLength={80}
                  placeholder="Label"
                  value={item.label}
                  onChange={(event) =>
                    patchItem(index, { label: event.target.value })
                  }
                />
              )}
              <input
                type="text"
                className={KIT.input}
                maxLength={200}
                placeholder="Supporting detail (optional)"
                value={item.detail}
                onChange={(event) =>
                  patchItem(index, { detail: event.target.value })
                }
              />
              <div className="flex items-center gap-2 md:justify-end">
                {variant === "metrics-row" ? (
                  <input
                    type="text"
                    className={KIT.input}
                    maxLength={80}
                    placeholder="Label"
                    value={item.label}
                  onChange={(event) =>
                    patchItem(index, { label: event.target.value })
                  }
                />
              ) : null}
              <button
                type="button"
                {...handleProps}
                aria-label="Drag to reorder item"
                title="Drag to reorder"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#ddd7ca] text-stone-500"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, "up")}
                disabled={index === 0}
                  aria-label="Move item up"
                  title="Move up"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#ddd7ca] text-stone-600 disabled:opacity-40"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(index, "down")}
                  disabled={index === items.length - 1}
                  aria-label="Move item down"
                  title="Move down"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#ddd7ca] text-stone-600 disabled:opacity-40"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => duplicateItem(index)}
                  disabled={items.length >= 6}
                  aria-label="Duplicate item"
                  title="Duplicate"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#ddd7ca] text-stone-600 disabled:opacity-40"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={items.length <= 1}
                  className="rounded-md border border-[#ddd7ca] px-2 py-1 text-xs text-stone-600 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </DraggableList>
        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= 6}
          className="mt-3 rounded-md border border-[#ddd7ca] px-2.5 py-1.5 text-xs font-medium text-stone-700 disabled:opacity-50"
        >
          Add item
        </button>
      </InspectorGroup>
    </div>
  );
}
