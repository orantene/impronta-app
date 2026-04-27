"use client";

/**
 * TestimonialsTrioContentInspector — curated canvas-native Content tab for
 * testimonials_trio sections.
 *
 * Design intent: "three voices on stage".
 *
 * The operator is curating proof — real client words — not filling array
 * items. The panel reflects that by:
 *   - Showing three named, permanent slots (A / B / C) rather than a list
 *   - Leading with the quote textarea: large, roomy, and prominent
 *   - Providing contextual length guidance (not just a raw count) so the
 *     operator can judge mobile fit at a glance
 *   - Keeping accent colour selection as an instant swatch row per slot —
 *     no dropdown, no enum string
 *   - Collapsing secondary fields (location) behind a ghost button
 *
 * Empty slots show a muted "won't appear on page" state so the operator
 * knows which voices are live vs. still blank.
 *
 * Schema: testimonials_trio_schema_v1 — items[], variant, defaultAccent
 * Note: schema has no headshot field; that's a future schema-migration concern.
 *
 * Undo safety: local slot state syncs from draftProps on external changes
 * (undo/redo) via an isOurChange ref that distinguishes our own onChange
 * calls from external updates.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { InspectorGroup, KIT, VisualChipGroup, type ChipOption } from "./kit";
import { RichEditor } from "@/components/edit-chrome/rich-editor";

// ── Types ────────────────────────────────────────────────────────────────────

type AccentKey = "auto" | "blush" | "sage" | "champagne" | "ivory";
type VariantKey = "trio-card" | "single-hero" | "carousel-row";

interface SlotDraft {
  quote: string;
  author: string;
  context: string;
  location: string;
  accent: AccentKey | "";
}

interface Props {
  draftProps: Record<string, unknown>;
  tenantId: string; // required by CuratedInspectorProps; testimonials don't use media
  onChange: (next: Record<string, unknown>) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_SLOT: SlotDraft = {
  quote: "",
  author: "",
  context: "",
  location: "",
  accent: "",
};

function rawToSlot(raw: Record<string, unknown> | undefined): SlotDraft {
  if (!raw) return { ...EMPTY_SLOT };
  return {
    quote: (raw.quote as string | undefined) ?? "",
    author: (raw.author as string | undefined) ?? "",
    context: (raw.context as string | undefined) ?? "",
    location: (raw.location as string | undefined) ?? "",
    accent: (raw.accent as AccentKey | undefined) ?? "",
  };
}

function slotToItem(s: SlotDraft): Record<string, unknown> | null {
  if (!s.quote.trim()) return null;
  const item: Record<string, unknown> = { quote: s.quote.trim() };
  if (s.author.trim()) item.author = s.author.trim();
  if (s.context.trim()) item.context = s.context.trim();
  if (s.location.trim()) item.location = s.location.trim();
  // Only include accent if explicitly set (non-auto, non-empty)
  if (s.accent && s.accent !== "auto") item.accent = s.accent;
  else if (s.accent === "auto") item.accent = "auto";
  return item;
}

function initSlots(
  dp: Record<string, unknown>,
): [SlotDraft, SlotDraft, SlotDraft] {
  const items =
    (dp.items as Record<string, unknown>[] | undefined) ?? [];
  return [rawToSlot(items[0]), rawToSlot(items[1]), rawToSlot(items[2])];
}

// ── Accent swatches ───────────────────────────────────────────────────────────

type AccentOrAuto = AccentKey | "";

const ACCENT_SWATCHES: ReadonlyArray<{
  key: AccentOrAuto;
  style: React.CSSProperties;
  title: string;
}> = [
  {
    key: "",
    style: {
      background:
        "conic-gradient(#F4CACA 0deg, #C4D4C4 120deg, #E8D8B4 240deg, #F4CACA 360deg)",
    },
    title: "Auto (cycles A→B→C)",
  },
  { key: "blush", style: { background: "#F4CACA" }, title: "Blush" },
  { key: "sage", style: { background: "#C4D4C4" }, title: "Sage" },
  { key: "champagne", style: { background: "#E8D8B4" }, title: "Champagne" },
  { key: "ivory", style: { background: "#F5F0E8" }, title: "Ivory" },
];

// ── Variant / defaultAccent chips ─────────────────────────────────────────────

function TrioPreview() {
  return (
    <svg viewBox="0 0 80 48" fill="none" className="w-14">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={4 + i * 26}
          y={4}
          width={22}
          height={40}
          rx={2}
          stroke="currentColor"
          strokeWidth={1.2}
        />
      ))}
    </svg>
  );
}

function SingleHeroPreview() {
  return (
    <svg viewBox="0 0 80 48" fill="none" className="w-14">
      <rect x={8} y={6} width={64} height={36} rx={2} stroke="currentColor" strokeWidth={1.2} />
      <line x1={16} y1={18} x2={64} y2={18} stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
      <line x1={22} y1={24} x2={58} y2={24} stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
      <line x1={30} y1={30} x2={50} y2={30} stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
    </svg>
  );
}

function CarouselPreview() {
  return (
    <svg viewBox="0 0 80 52" fill="none" className="w-14">
      <rect x={2}  y={8}  width={30} height={32} rx={2} stroke="currentColor" strokeWidth={1.2} opacity={0.35} />
      <rect x={14} y={4}  width={36} height={40} rx={2} stroke="currentColor" strokeWidth={1.4} />
      <rect x={52} y={8}  width={30} height={32} rx={2} stroke="currentColor" strokeWidth={1.2} opacity={0.35} />
      <circle cx={32} cy={48} r={2}   fill="currentColor" />
      <circle cx={40} cy={48} r={1.4} fill="currentColor" opacity={0.35} />
      <circle cx={48} cy={48} r={1.4} fill="currentColor" opacity={0.35} />
    </svg>
  );
}

const VARIANT_CHIPS: ReadonlyArray<ChipOption<VariantKey>> = [
  { value: "trio-card",     label: "Trio",     preview: <TrioPreview /> },
  { value: "single-hero",   label: "Hero",     preview: <SingleHeroPreview /> },
  { value: "carousel-row",  label: "Carousel", preview: <CarouselPreview /> },
];

function AccentSwatch({ value }: { value: AccentKey }) {
  const sw = ACCENT_SWATCHES.find((s) => s.key === value) ?? ACCENT_SWATCHES[0]!;
  return (
    <div className="size-6 rounded-full border border-zinc-200" style={sw.style} />
  );
}

const DEFAULT_ACCENT_CHIPS: ReadonlyArray<ChipOption<AccentKey>> = [
  {
    value: "auto",
    label: "Auto",
    preview: <AccentSwatch value="auto" />,
    info: "Cycles blush → sage → champagne by position",
  },
  { value: "blush",     label: "Blush",     preview: <AccentSwatch value="blush" /> },
  { value: "sage",      label: "Sage",      preview: <AccentSwatch value="sage" /> },
  { value: "champagne", label: "Champagne", preview: <AccentSwatch value="champagne" /> },
  { value: "ivory",     label: "Ivory",     preview: <AccentSwatch value="ivory" /> },
];

// ── Char count guidance ───────────────────────────────────────────────────────

function QuoteGuidance({ len }: { len: number }) {
  if (len === 0) {
    return (
      <p className={KIT.hint}>
        Great quotes are personal and specific. Aim for 2–4 sentences.
      </p>
    );
  }
  if (len <= 120) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-400">Ideal length for three columns</span>
        <span className="text-[10px] tabular-nums text-zinc-400">{len}</span>
      </div>
    );
  }
  if (len <= 220) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-amber-500">Getting long — may wrap on mobile</span>
        <span className="text-[10px] tabular-nums text-amber-500">{len}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-rose-500">Trim for mobile readability</span>
      <span className="text-[10px] tabular-nums text-rose-500">{len}/360</span>
    </div>
  );
}

// ── VoiceSlot ─────────────────────────────────────────────────────────────────

function VoiceSlot({
  label,
  slot,
  onPatch,
}: {
  label: "A" | "B" | "C";
  slot: SlotDraft;
  onPatch: (patch: Partial<SlotDraft>) => void;
}) {
  const [showLocation, setShowLocation] = useState(Boolean(slot.location));
  const isEmpty = !slot.quote.trim();

  return (
    <div
      className={`rounded-xl border p-3.5 flex flex-col gap-3 transition ${
        isEmpty
          ? "border-zinc-200 bg-zinc-50/80"
          : "border-zinc-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      }`}
    >
      {/* Slot header: label badge + accent swatch row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-500">
            {label}
          </span>
          {isEmpty && (
            <span className="text-[10px] text-zinc-400">
              Empty — won&apos;t appear on page
            </span>
          )}
        </div>
        {/* Per-slot accent: instant colour swatches */}
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Accent colour">
          {ACCENT_SWATCHES.map(({ key, style, title }) => {
            const active = slot.accent === key;
            return (
              <button
                key={key}
                type="button"
                title={title}
                role="radio"
                aria-checked={active}
                onClick={() =>
                  onPatch({ accent: active ? "" : (key as AccentOrAuto) })
                }
                className={`size-5 rounded-full border-2 transition hover:scale-110 ${
                  active
                    ? "border-zinc-900 scale-110"
                    : "border-zinc-200 hover:border-zinc-400"
                }`}
                style={style}
              />
            );
          })}
        </div>
      </div>

      {/* Quote — the centrepiece */}
      <div className={KIT.field}>
        <label className={KIT.label}>Quote</label>
        <textarea
          className={`${KIT.textarea} min-h-[96px]`}
          value={slot.quote}
          maxLength={360}
          rows={5}
          placeholder="Write their words here…"
          onChange={(e) => onPatch({ quote: e.target.value })}
        />
        <QuoteGuidance len={slot.quote.length} />
      </div>

      {/* Attribution fields — only show when there's a quote to attribute */}
      {!isEmpty && (
        <>
          <div className={KIT.field}>
            <label className={KIT.label}>Name</label>
            <input
              type="text"
              className={KIT.input}
              value={slot.author}
              maxLength={80}
              placeholder="Full name"
              onChange={(e) => onPatch({ author: e.target.value })}
            />
          </div>

          <div className={KIT.field}>
            <label className={KIT.label}>Role or occasion</label>
            <input
              type="text"
              className={KIT.input}
              value={slot.context}
              maxLength={120}
              placeholder="Bridal client · New York"
              onChange={(e) => onPatch({ context: e.target.value })}
            />
            <p className={KIT.hint}>
              Shown beneath the name. E.g. &ldquo;Featured talent&rdquo; or
              &ldquo;Agency client since 2022&rdquo;.
            </p>
          </div>

          {!showLocation && !slot.location ? (
            <button
              type="button"
              className={`${KIT.ghostButton} self-start`}
              onClick={() => setShowLocation(true)}
            >
              + Add location
            </button>
          ) : (
            <div className={KIT.field}>
              <label className={KIT.label}>Location</label>
              <input
                type="text"
                className={KIT.input}
                value={slot.location}
                maxLength={120}
                placeholder="City, Country"
                onChange={(e) => onPatch({ location: e.target.value })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main inspector ────────────────────────────────────────────────────────────

export function TestimonialsTrioContentInspector({
  draftProps,
  tenantId,
  onChange,
}: Props) {
  // Local slot state — gives stable slot positions (A/B/C) regardless of how
  // many items the underlying array has. Syncs from draftProps on external
  // changes (undo/redo) via the isOurChange guard.
  const isOurChange = useRef(false);
  const [slots, setSlots] = useState<[SlotDraft, SlotDraft, SlotDraft]>(() =>
    initSlots(draftProps),
  );

  // Sync local state when draftProps is updated externally (undo, etc.)
  useEffect(() => {
    if (isOurChange.current) {
      isOurChange.current = false;
      return;
    }
    setSlots(initSlots(draftProps));
     
  }, [draftProps]);

  const patchSlot = useCallback(
    (index: 0 | 1 | 2, patch: Partial<SlotDraft>) => {
      const newSlots: [SlotDraft, SlotDraft, SlotDraft] = [
        { ...slots[0] },
        { ...slots[1] },
        { ...slots[2] },
      ];
      Object.assign(newSlots[index], patch);
      setSlots(newSlots);

      // Only write non-empty slots to items[], preserving slot order (A→B→C).
      const newItems = newSlots
        .map(slotToItem)
        .filter((item): item is Record<string, unknown> => item !== null);

      if (newItems.length > 0) {
        isOurChange.current = true;
        onChange({ ...draftProps, items: newItems });
      }
    },
     
    [slots, draftProps, onChange],
  );

  const eyebrow = (draftProps.eyebrow as string | undefined) ?? "";
  const headline = (draftProps.headline as string | undefined) ?? "";
  const variant = (draftProps.variant as VariantKey | undefined) ?? "trio-card";
  const defaultAccent =
    (draftProps.defaultAccent as AccentKey | undefined) ?? "auto";

  function patchMeta(patch: Record<string, unknown>) {
    onChange({ ...draftProps, ...patch });
  }

  const filledCount = slots.filter((s) => s.quote.trim().length > 0).length;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Headline ── */}
      <InspectorGroup
        title="Headline"
        collapsible
        storageKey="tt-header"
        defaultOpen={Boolean(eyebrow || headline)}
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Eyebrow</label>
          <input
            type="text"
            className={KIT.input}
            value={eyebrow}
            maxLength={60}
            placeholder="What clients say"
            onChange={(e) =>
              patchMeta({ eyebrow: e.target.value || undefined })
            }
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Headline</label>
          <RichEditor
            value={headline}
            onChange={(next) => patchMeta({ headline: next || undefined })}
            variant="single"
            tenantId={tenantId}
            placeholder="In their own words"
            ariaLabel="Headline"
          />
        </div>
      </InspectorGroup>

      {/* ── Three voices ── */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className={KIT.sectionTitle}>Three voices</span>
          <span className="text-[10px] tabular-nums text-zinc-400">
            {filledCount} / 3
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {(["A", "B", "C"] as const).map((label, i) => (
            <VoiceSlot
              key={label}
              label={label}
              slot={slots[i]}
              onPatch={(patch) => patchSlot(i as 0 | 1 | 2, patch)}
            />
          ))}
        </div>
        {filledCount === 0 && (
          <p className={`${KIT.hint} text-amber-600`}>
            Fill at least one voice to publish this section.
          </p>
        )}
      </section>

      {/* ── Display (advanced) ── */}
      <InspectorGroup
        title="Display"
        advanced
        collapsible
        storageKey="tt-display"
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Layout</label>
          <VisualChipGroup
            value={variant}
            onChange={(v) => patchMeta({ variant: v })}
            options={VARIANT_CHIPS}
            columns={3}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Default accent</label>
          <VisualChipGroup
            value={defaultAccent}
            onChange={(v) => patchMeta({ defaultAccent: v })}
            options={DEFAULT_ACCENT_CHIPS}
            columns={5}
          />
        </div>
      </InspectorGroup>
    </div>
  );
}
