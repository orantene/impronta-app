"use client";

/**
 * GalleryStripContentInspector — curated canvas-native Content tab for
 * gallery_strip sections.
 *
 * Design intent: "managing a real shoot."
 *
 * The operator thinks in photos, not array indices. The panel mirrors that:
 *   - A visual media tray shows thumbnails with drag handles → feels like
 *     managing a lightbox, not editing JSON
 *   - Multi-select MediaPicker: one modal open, pick as many as needed, close
 *     once. Without this, adding 8 photos would require 8 modal cycles.
 *   - Aspect ratio is a click-to-cycle badge per tile — no dropdown
 *   - Alt text is an inline click-to-edit so it stays out of the way unless
 *     the operator actively wants it
 *   - Layout variant is a visual chip group: the operator sees the shape, not
 *     the enum string
 *   - Minimum 3 images enforced visually (schema min); warning shown below
 *     the tray when below threshold
 *
 * Schema: gallery_schema_v1 — items[], variant, caption
 * items[]: { src: url, alt?: string, aspect?: wide|tall|square|auto }
 */

import { useState } from "react";

import { MediaPicker } from "@/lib/site-admin/sections/shared/MediaPicker";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import {
  DraggableList,
  InspectorGroup,
  InspectorItemRow,
  InspectorRowDelete,
  KIT,
  VisualChipGroup,
  type ChipOption,
  type DragHandleProps,
} from "./kit";

// ── Types ─────────────────────────────────────────────────────────────────────

type VariantKey = "mosaic" | "scroll-rail" | "grid-uniform";
type AspectKey = "auto" | "wide" | "tall" | "square";

interface GalleryItem {
  src: string;
  alt?: string;
  aspect?: AspectKey;
}

interface Props {
  draftProps: Record<string, unknown>;
  tenantId: string;
  onChange: (next: Record<string, unknown>) => void;
}

// ── Aspect cycle ──────────────────────────────────────────────────────────────

const ASPECTS: readonly AspectKey[] = ["auto", "wide", "tall", "square"];

const ASPECT_LABEL: Record<AspectKey, string> = {
  auto: "auto",
  wide: "wide",
  tall: "tall",
  square: "square",
};

// ── Gallery tile row ──────────────────────────────────────────────────────────

function GalleryTileRow({
  item,
  handleProps,
  onRemove,
  onUpdate,
}: {
  item: GalleryItem;
  handleProps: DragHandleProps;
  onRemove: () => void;
  onUpdate: (patch: Partial<GalleryItem>) => void;
}) {
  const [editingAlt, setEditingAlt] = useState(false);
  const aspect: AspectKey = item.aspect ?? "auto";

  function cycleAspect() {
    const idx = ASPECTS.indexOf(aspect);
    const next = ASPECTS[(idx + 1) % ASPECTS.length]!;
    onUpdate({ aspect: next });
  }

  return (
    <InspectorItemRow
      handleProps={handleProps}
      thumb={
        item.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt={item.alt ?? ""}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
            }}
          />
        ) : (
          <div className="text-[9px] font-medium text-zinc-400">No src</div>
        )
      }
      trailing={<InspectorRowDelete onClick={onRemove} />}
    >
      <div className="min-w-0 flex flex-col gap-1">
        {/* Alt text — click to edit inline */}
        {editingAlt ? (
          <input
             
            autoFocus
            type="text"
            className="w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] focus:border-zinc-400 focus:outline-none"
            value={item.alt ?? ""}
            maxLength={160}
            placeholder="Describe this image…"
            onBlur={(e) => {
              onUpdate({ alt: e.target.value.trim() || undefined });
              setEditingAlt(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
          />
        ) : (
          <button
            type="button"
            className="text-left text-[11px] truncate transition hover:text-zinc-800"
            onClick={() => setEditingAlt(true)}
            title="Click to add alt text"
          >
            {item.alt ? (
              <span className="text-zinc-700">{item.alt}</span>
            ) : (
              <span className="italic text-zinc-400">Add alt text</span>
            )}
          </button>
        )}

        {/* Aspect badge — click to cycle */}
        <button
          type="button"
          onClick={cycleAspect}
          className="w-fit rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-200"
          title="Click to change aspect ratio"
          aria-label={`Aspect: ${ASPECT_LABEL[aspect]}. Click to cycle.`}
        >
          {ASPECT_LABEL[aspect]}
        </button>
      </div>
    </InspectorItemRow>
  );
}

// ── Layout variant previews ───────────────────────────────────────────────────

function MosaicPreview() {
  return (
    <svg viewBox="0 0 80 48" fill="none" className="w-14">
      {/* Varied sizes: tall left, wide top-right, square bottom-right */}
      <rect x={4}  y={4}  width={28} height={40} rx={1.5} stroke="currentColor" strokeWidth={1.2} />
      <rect x={36} y={4}  width={40} height={18} rx={1.5} stroke="currentColor" strokeWidth={1.2} />
      <rect x={36} y={26} width={18} height={18} rx={1.5} stroke="currentColor" strokeWidth={1.2} />
      <rect x={58} y={26} width={18} height={18} rx={1.5} stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}

function ScrollRailPreview() {
  return (
    <svg viewBox="0 0 80 48" fill="none" className="w-14">
      {/* Three equal cards in a row, third partially clipped */}
      <rect x={2}  y={8} width={28} height={32} rx={1.5} stroke="currentColor" strokeWidth={1.2} />
      <rect x={34} y={8} width={28} height={32} rx={1.5} stroke="currentColor" strokeWidth={1.2} />
      <rect x={66} y={8} width={28} height={32} rx={1.5} stroke="currentColor" strokeWidth={1.2} opacity={0.4} />
      {/* Scroll indicator dots */}
      <circle cx={32} cy={46} r={1.5} fill="currentColor" />
      <circle cx={40} cy={46} r={1}   fill="currentColor" opacity={0.4} />
      <circle cx={48} cy={46} r={1}   fill="currentColor" opacity={0.4} />
    </svg>
  );
}

function GridUniformPreview() {
  return (
    <svg viewBox="0 0 80 48" fill="none" className="w-14">
      {/* 3×2 uniform grid */}
      {[0, 1, 2].map((col) =>
        [0, 1].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={4 + col * 26}
            y={4 + row * 22}
            width={22}
            height={18}
            rx={1.5}
            stroke="currentColor"
            strokeWidth={1.2}
          />
        )),
      )}
    </svg>
  );
}

const VARIANT_CHIPS: ReadonlyArray<ChipOption<VariantKey>> = [
  { value: "mosaic",       label: "Mosaic",  preview: <MosaicPreview />,       info: "Varied sizes for editorial depth" },
  { value: "scroll-rail",  label: "Scroll",  preview: <ScrollRailPreview />,   info: "Horizontal scroll strip" },
  { value: "grid-uniform", label: "Grid",    preview: <GridUniformPreview />,  info: "Equal-size uniform grid" },
];

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyTray() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 py-10 text-center">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-zinc-400"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="M21 15l-5-5-11 11" />
      </svg>
      <div className="text-[11px] font-medium text-zinc-500">No photos yet</div>
      <div className="text-[10px] text-zinc-400">
        Add at least 3 to publish this section.
      </div>
    </div>
  );
}

// ── Main inspector ────────────────────────────────────────────────────────────

export function GalleryStripContentInspector({
  draftProps,
  tenantId,
  onChange,
}: Props) {
  const rawItems = (draftProps.items as GalleryItem[] | undefined) ?? [];

  function updateItems(nextItems: GalleryItem[]) {
    onChange({ ...draftProps, items: nextItems });
  }

  function addImages(urls: string[]) {
    const newItems: GalleryItem[] = urls.map((src) => ({
      src,
      aspect: "auto" as const,
    }));
    updateItems([...rawItems, ...newItems]);
  }

  function removeItem(index: number) {
    updateItems(rawItems.filter((_, i) => i !== index));
  }

  function updateItem(index: number, patch: Partial<GalleryItem>) {
    updateItems(rawItems.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  const eyebrow = (draftProps.eyebrow as string | undefined) ?? "";
  const headline = (draftProps.headline as string | undefined) ?? "";
  const variant = (draftProps.variant as VariantKey | undefined) ?? "mosaic";
  const caption = (draftProps.caption as string | undefined) ?? "";

  const tooFew = rawItems.length > 0 && rawItems.length < 3;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Headline ── */}
      <InspectorGroup
        title="Headline"
        collapsible
        storageKey="gs-header"
        defaultOpen={Boolean(eyebrow || headline)}
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Eyebrow</label>
          <input
            type="text"
            className={KIT.input}
            value={eyebrow}
            maxLength={60}
            placeholder="The work"
            onChange={(e) =>
              onChange({ ...draftProps, eyebrow: e.target.value || undefined })
            }
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Headline</label>
          <RichEditor
            value={headline}
            onChange={(next) => onChange({ ...draftProps, headline: next || undefined })}
            variant="single"
            tenantId={tenantId}
            placeholder="A year in frames"
            ariaLabel="Headline"
          />
        </div>
      </InspectorGroup>

      {/* ── Layout ── */}
      <InspectorGroup title="Layout" collapsible storageKey="gs-layout" defaultOpen>
        <VisualChipGroup
          value={variant}
          onChange={(v) => onChange({ ...draftProps, variant: v })}
          options={VARIANT_CHIPS}
          columns={3}
        />
      </InspectorGroup>

      {/* ── Media tray ── */}
      <section className="flex flex-col gap-2.5">
        {/* Tray header: count + "Add images" button */}
        <div className="flex items-center justify-between">
          <span className={KIT.sectionTitle}>
            Photos
            {rawItems.length > 0 && (
              <span className="ml-1.5 tabular-nums text-zinc-400">
                ({rawItems.length})
              </span>
            )}
          </span>
          {/* Multi-select picker — keeps modal open until "Add N images" */}
          <MediaPicker
            tenantId={tenantId}
            label="Add images"
            onPick={(url) => addImages([url])}
            multi
            onMultiPick={addImages}
          />
        </div>

        {/* Below-threshold warning */}
        {tooFew && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            Add {3 - rawItems.length} more{" "}
            {3 - rawItems.length === 1 ? "photo" : "photos"} — minimum 3
            required to publish.
          </div>
        )}

        {/* Tray */}
        {rawItems.length === 0 ? (
          <EmptyTray />
        ) : (
          <DraggableList
            items={rawItems}
            keyOf={(item, i) => `${item.src}-${i}`}
            onReorder={updateItems}
          >
            {(item, i, handleProps) => (
              <GalleryTileRow
                item={item}
                handleProps={handleProps}
                onRemove={() => removeItem(i)}
                onUpdate={(patch) => updateItem(i, patch)}
              />
            )}
          </DraggableList>
        )}

        {/* Drag hint — only show when there are 2+ items */}
        {rawItems.length >= 2 && (
          <p className={KIT.hint}>Drag to reorder. First image sets the hero tile in mosaic view.</p>
        )}
      </section>

      {/* ── Caption (collapsed) ── */}
      <InspectorGroup
        title="Caption"
        collapsible
        storageKey="gs-caption"
        defaultOpen={Boolean(caption)}
      >
        <div className={KIT.field}>
          <textarea
            className={KIT.textarea}
            value={caption}
            maxLength={240}
            rows={2}
            placeholder="An editorial note beneath the gallery…"
            onChange={(e) =>
              onChange({ ...draftProps, caption: e.target.value || undefined })
            }
          />
          <p className={KIT.hint}>
            Renders in italic serif below the grid. Optional — leave blank to
            omit.
          </p>
        </div>
      </InspectorGroup>
    </div>
  );
}
