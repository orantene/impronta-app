"use client";

/**
 * CategoryGridContentInspector — bespoke Content tab for category_grid.
 *
 * Operator intent: they're editing a set of service/category tiles, not
 * an "array of objects". So the primary surface is a tile list with:
 *   - real icon glyph or image thumbnail per row
 *   - inline label + href in one row
 *   - drag to reorder
 *   - an icon picker that renders the 16 real glyphs (not an enum list)
 *   - trailing delete
 *
 * Copy lives up top (eyebrow, headline, copy) in a calm group. The footer
 * CTA is collapsed-by-default under "Footer link" — most operators don't
 * touch it on a steady-state site. Grid tuning (variant, desktop columns)
 * lives in an "Advanced" disclosure at the bottom.
 */

import { useState } from "react";

import {
  KIT,
  InspectorGroup,
  InspectorItemRow,
  InspectorRowDelete,
  VisualChipGroup,
  MediaPickerButton,
  CtaDuoEditor,
  DraggableList,
  CategoryIconGlyph,
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_LABEL,
  type CtaShape,
  type DragHandleProps,
} from "./kit";
import { RichEditor } from "@/components/edit-chrome/rich-editor";

type IconKey = (typeof CATEGORY_ICON_KEYS)[number];
type Variant = "portrait-masonry" | "horizontal-scroll" | "small-icon-list";

interface Item {
  label: string;
  tagline?: string;
  iconKey?: IconKey;
  imageUrl?: string;
  href?: string;
}

interface Props {
  draftProps: Record<string, unknown>;
  tenantId: string;
  onChange: (next: Record<string, unknown>) => void;
}

const VARIANT_OPTIONS = [
  {
    value: "portrait-masonry" as const,
    label: "Portrait tiles",
    info: "Editorial portrait tiles with optional image + icon overlay.",
  },
  {
    value: "horizontal-scroll" as const,
    label: "Scroll rail",
    info: "Single-row scroll rail on mobile, grid on desktop.",
  },
  {
    value: "small-icon-list" as const,
    label: "Icon grid",
    info: "Dense icon-only grid. No imagery.",
  },
];

function cleanObject<T extends Record<string, unknown>>(o: T): T {
  const out = { ...o };
  for (const k of Object.keys(out)) {
    const v = out[k as keyof T];
    if (v === "" || v === null || v === undefined) delete out[k as keyof T];
  }
  return out;
}

export function CategoryGridContentInspector({
  draftProps,
  tenantId,
  onChange,
}: Props) {
  const eyebrow = (draftProps.eyebrow as string | undefined) ?? "";
  const headline = (draftProps.headline as string | undefined) ?? "";
  const copy = (draftProps.copy as string | undefined) ?? "";
  const items = ((draftProps.items as Item[] | undefined) ?? []).slice();
  const variant = (draftProps.variant as Variant | undefined) ?? "portrait-masonry";
  const columnsDesktop = (draftProps.columnsDesktop as number | undefined) ?? 4;
  const footerCta = (draftProps.footerCta as CtaShape | undefined) ?? null;

  function update(patch: Record<string, unknown>) {
    onChange(cleanObject({ ...draftProps, ...patch }));
  }

  function patchItem(i: number, patch: Partial<Item>) {
    const next = items.map((it, idx) =>
      idx === i ? cleanObject({ ...it, ...patch }) : it,
    );
    update({ items: next });
  }

  function addItem() {
    const next: Item[] = [...items, { label: "New category" }];
    update({ items: next });
  }

  function removeItem(i: number) {
    const next = items.filter((_, idx) => idx !== i);
    // Schema requires min 1 — don't let the last one vanish.
    if (next.length === 0) return;
    update({ items: next });
  }

  function reorderItems(next: Item[]) {
    update({ items: next });
  }

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup title="Header" storageKey="category_grid:header">
        <div className={KIT.field}>
          <label className={KIT.label}>Eyebrow</label>
          <input
            type="text"
            className={KIT.input}
            placeholder="Optional — e.g. Services"
            maxLength={60}
            value={eyebrow}
            onChange={(e) => update({ eyebrow: e.target.value || undefined })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Headline</label>
          <RichEditor
            value={headline}
            onChange={(next) => update({ headline: next || undefined })}
            variant="single"
            tenantId={tenantId}
            placeholder="A section title that orients the visitor"
            ariaLabel="Headline"
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Intro copy</label>
          <RichEditor
            value={copy}
            onChange={(next) => update({ copy: next || undefined })}
            variant="multi"
            tenantId={tenantId}
            placeholder="Optional — a short paragraph under the headline"
            ariaLabel="Intro copy"
          />
        </div>
      </InspectorGroup>

      <InspectorGroup title={`Categories (${items.length})`}>
        <DraggableList<Item>
          items={items}
          keyOf={(_, i) => String(i)}
          onReorder={reorderItems}
        >
          {(item, i, handleProps) => (
            <CategoryRow
              tenantId={tenantId}
              item={item}
              handleProps={handleProps}
              onChange={(patch) => patchItem(i, patch)}
              onDelete={() => removeItem(i)}
              deletable={items.length > 1}
            />
          )}
        </DraggableList>
        {items.length < 12 ? (
          <button
            type="button"
            onClick={addItem}
            className={`${KIT.ghostButton} w-full py-2 text-center`}
          >
            + Add category
          </button>
        ) : (
          <p className={KIT.hint}>Maximum 12 categories.</p>
        )}
      </InspectorGroup>

      <InspectorGroup
        title="Footer link"
        info='Optional "Browse all services" style link under the grid.'
        collapsible
        storageKey="category_grid:footer"
        defaultOpen={Boolean(footerCta)}
      >
        <CtaDuoEditor
          primary={footerCta}
          secondary={null}
          onChangePrimary={(next) => update({ footerCta: next ?? undefined })}
          onChangeSecondary={() => {}}
          secondaryAddLabel="(not used on this section)"
        />
      </InspectorGroup>

      <InspectorGroup
        title="Advanced"
        advanced
        collapsible
        storageKey="category_grid:advanced"
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Layout</label>
          <VisualChipGroup<Variant>
            value={variant}
            onChange={(v) => update({ variant: v })}
            options={VARIANT_OPTIONS.map((opt) => ({
              ...opt,
              preview: <VariantPreview value={opt.value} />,
            }))}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Desktop columns — {columnsDesktop}</label>
          <input
            type="range"
            min={2}
            max={5}
            step={1}
            value={columnsDesktop}
            onChange={(e) =>
              update({ columnsDesktop: Number(e.target.value) })
            }
            className="w-full accent-zinc-900"
          />
        </div>
      </InspectorGroup>
    </div>
  );
}

// ── per-row composite ─────────────────────────────────────────────────────

function CategoryRow({
  item,
  tenantId,
  handleProps,
  onChange,
  onDelete,
  deletable,
}: {
  item: Item;
  tenantId: string;
  handleProps: DragHandleProps;
  onChange: (patch: Partial<Item>) => void;
  onDelete: () => void;
  deletable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const thumbEl = item.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt=""
      className="h-full w-full object-cover"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
      }}
    />
  ) : item.iconKey ? (
    <CategoryIconGlyph icon={item.iconKey} />
  ) : (
    <span className="text-[11px] font-semibold uppercase tracking-wider">
      {initials(item.label)}
    </span>
  );

  return (
    <div className="flex flex-col gap-2">
      <InspectorItemRow
        handleProps={handleProps}
        thumb={thumbEl}
        trailing={
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex size-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              aria-label={expanded ? "Hide details" : "Show details"}
              title={expanded ? "Hide details" : "Show details"}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className={`transition ${expanded ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {deletable ? <InspectorRowDelete onClick={onDelete} /> : null}
          </>
        }
      >
        <div className="flex flex-col gap-0.5">
          <input
            type="text"
            className="w-full rounded-sm bg-transparent px-0 py-0.5 text-[13px] font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            value={item.label}
            placeholder="Category name"
            maxLength={60}
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <input
            type="text"
            className="w-full rounded-sm bg-transparent px-0 py-0 text-[11px] text-zinc-500 placeholder:text-zinc-400 focus:outline-none"
            value={item.href ?? ""}
            placeholder="/path or https://… (optional)"
            maxLength={500}
            onChange={(e) => onChange({ href: e.target.value || undefined })}
          />
        </div>
      </InspectorItemRow>

      {expanded ? (
        <div className="ml-9 flex flex-col gap-3 rounded-md border border-zinc-100 bg-zinc-50/50 p-3">
          <div className={KIT.field}>
            <label className={KIT.label}>Tagline</label>
            <input
              type="text"
              className={KIT.input}
              placeholder="Optional — short support line"
              maxLength={120}
              value={item.tagline ?? ""}
              onChange={(e) =>
                onChange({ tagline: e.target.value || undefined })
              }
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Icon</label>
            <IconPicker
              value={item.iconKey ?? null}
              onChange={(next) => onChange({ iconKey: next ?? undefined })}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Image</label>
            <MediaPickerButton
              tenantId={tenantId}
              value={item.imageUrl}
              onChange={(url) => onChange({ imageUrl: url ?? undefined })}
              emptyLabel="Add tile image"
              aspect="4/5"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function initials(s: string) {
  const trimmed = s.trim();
  if (!trimmed) return "·";
  const words = trimmed.split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]!.toUpperCase()).join("");
}

// ── icon picker ───────────────────────────────────────────────────────────

function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: IconKey | null) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`flex aspect-square items-center justify-center rounded-md border text-[10px] font-medium transition ${
          value === null
            ? "border-zinc-300 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            : "border-zinc-200 bg-white text-zinc-400 hover:border-zinc-400"
        }`}
        title="No icon"
      >
        —
      </button>
      {CATEGORY_ICON_KEYS.map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            title={CATEGORY_ICON_LABEL[key]}
            className={`flex aspect-square items-center justify-center rounded-md border transition ${
              active
                ? "border-zinc-300 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
            }`}
          >
            <CategoryIconGlyph
              icon={key}
              size={14}
              className={active ? "text-zinc-900" : "text-zinc-600"}
            />
          </button>
        );
      })}
    </div>
  );
}

// ── variant preview glyphs ────────────────────────────────────────────────

function VariantPreview({ value }: { value: Variant }) {
  const inkStroke = "stroke-zinc-500";
  const inkFill = "fill-zinc-400";
  const common = "w-[68px] h-[36px]";
  if (value === "portrait-masonry") {
    return (
      <svg viewBox="0 0 68 36" className={common} aria-hidden>
        <rect x="2" y="4" width="16" height="28" rx="2" className={`${inkFill} opacity-60`} />
        <rect x="20" y="4" width="16" height="28" rx="2" className={`${inkFill} opacity-60`} />
        <rect x="38" y="4" width="16" height="28" rx="2" className={`${inkFill} opacity-60`} />
      </svg>
    );
  }
  if (value === "horizontal-scroll") {
    return (
      <svg viewBox="0 0 68 36" className={common} aria-hidden>
        <rect x="2" y="8" width="12" height="20" rx="2" className={`${inkFill} opacity-60`} />
        <rect x="16" y="8" width="12" height="20" rx="2" className={`${inkFill} opacity-60`} />
        <rect x="30" y="8" width="12" height="20" rx="2" className={`${inkFill} opacity-60`} />
        <rect x="44" y="8" width="12" height="20" rx="2" className={`${inkFill} opacity-60`} />
        <rect x="58" y="8" width="8" height="20" rx="2" className={`${inkFill} opacity-30`} />
        <path
          d="M2 32 Q34 34 66 32"
          className={`fill-none ${inkStroke}`}
          strokeWidth="1"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 68 36" className={common} aria-hidden>
      <g className={`${inkStroke} fill-none`} strokeWidth="1.2">
        <circle cx="10" cy="10" r="4" />
        <circle cx="26" cy="10" r="4" />
        <circle cx="42" cy="10" r="4" />
        <circle cx="58" cy="10" r="4" />
        <circle cx="10" cy="26" r="4" />
        <circle cx="26" cy="26" r="4" />
        <circle cx="42" cy="26" r="4" />
        <circle cx="58" cy="26" r="4" />
      </g>
    </svg>
  );
}
