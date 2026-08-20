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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveBuilderNodeRole } from "@/lib/site-admin/builder-node";

import { InspectorGroup, InspectorLabelWithInfo, KIT, VisualChipGroup, type ChipOption } from "./kit";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import { useEditorLocale } from "../use-editor-locale";

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
  selectedBuilderNodeId: string | null;
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

function accentSwatches(
  t: ReturnType<typeof useEditorLocale>["t"],
): ReadonlyArray<{
  key: AccentOrAuto;
  style: React.CSSProperties;
  title: string;
}> {
  return [
    {
      key: "",
      style: {
        background:
          "conic-gradient(#F4CACA 0deg, #C4D4C4 120deg, #E8D8B4 240deg, #F4CACA 360deg)",
      },
      title: t("Auto (cycles A→B→C)"),
    },
    { key: "blush", style: { background: "#F4CACA" }, title: t("Blush") },
    { key: "sage", style: { background: "#C4D4C4" }, title: t("Sage") },
    { key: "champagne", style: { background: "#E8D8B4" }, title: t("Champagne") },
    { key: "ivory", style: { background: "#F5F0E8" }, title: t("Ivory") },
  ];
}

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

function variantChips(
  t: ReturnType<typeof useEditorLocale>["t"],
): ReadonlyArray<ChipOption<VariantKey>> {
  return [
    { value: "trio-card",     label: t("Trio"),     preview: <TrioPreview /> },
    { value: "single-hero",   label: t("Hero"),     preview: <SingleHeroPreview /> },
    { value: "carousel-row",  label: t("Carousel"), preview: <CarouselPreview /> },
  ];
}

function AccentSwatch({ value }: { value: AccentKey }) {
  const { t } = useEditorLocale();
  const swatches = accentSwatches(t);
  const sw = swatches.find((s) => s.key === value) ?? swatches[0]!;
  return (
    <div className="size-6 rounded-full border border-stone-200" style={sw.style} />
  );
}

function defaultAccentChips(
  t: ReturnType<typeof useEditorLocale>["t"],
): ReadonlyArray<ChipOption<AccentKey>> {
  return [
    {
      value: "auto",
      label: t("Auto"),
      preview: <AccentSwatch value="auto" />,
      info: t("Cycles blush → sage → champagne by position"),
    },
    { value: "blush",     label: t("Blush"),     preview: <AccentSwatch value="blush" /> },
    { value: "sage",      label: t("Sage"),      preview: <AccentSwatch value="sage" /> },
    { value: "champagne", label: t("Champagne"), preview: <AccentSwatch value="champagne" /> },
    { value: "ivory",     label: t("Ivory"),     preview: <AccentSwatch value="ivory" /> },
  ];
}

// ── Char count guidance ───────────────────────────────────────────────────────

function QuoteGuidance({ len }: { len: number }) {
  const { t } = useEditorLocale();
  if (len === 0) {
    return (
      <p className={KIT.hint}>
        {t("Great quotes are personal and specific. Aim for 2–4 sentences.")}
      </p>
    );
  }
  if (len <= 120) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-stone-500">{t("Ideal length for three columns")}</span>
        <span className="text-[10px] tabular-nums text-stone-500">{len}</span>
      </div>
    );
  }
  if (len <= 220) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-blue-500">{t("Getting long, may wrap on mobile")}</span>
        <span className="text-[10px] tabular-nums text-blue-500">{len}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-rose-500">{t("Trim for mobile readability")}</span>
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
  const { t } = useEditorLocale();
  const [showLocation, setShowLocation] = useState(Boolean(slot.location));
  const isEmpty = !slot.quote.trim();

  return (
    <div
      className={`rounded-xl border p-3.5 flex flex-col gap-3 transition ${
        isEmpty
          ? "border-[#e5e0d5] bg-[#faf9f6]/80"
          : "border-[#e5e0d5] bg-[#faf9f6] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      }`}
    >
      {/* Slot header: label badge + accent swatch row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-stone-100 text-[10px] font-bold text-stone-500">
            {label}
          </span>
          {isEmpty && (
            <span className="text-[10px] text-stone-500">
              {t("Empty, won't appear on page")}
            </span>
          )}
        </div>
        {/* Per-slot accent: instant colour swatches */}
        <div className="flex items-center gap-1" role="radiogroup" aria-label={t("Accent colour")}>
          {accentSwatches(t).map(({ key, style, title }) => {
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
                    ? "border-indigo-400 scale-110"
                    : "border-stone-200 hover:border-stone-400"
                }`}
                style={style}
              />
            );
          })}
        </div>
      </div>

      {/* Quote — the centrepiece */}
      <div className={KIT.field}>
        <label className={KIT.label}>{t("Quote")}</label>
        <textarea
          className={`${KIT.textarea} min-h-[96px]`}
          value={slot.quote}
          maxLength={360}
          rows={5}
          placeholder={t("Write their words here…")}
          onChange={(e) => onPatch({ quote: e.target.value })}
        />
        <QuoteGuidance len={slot.quote.length} />
      </div>

      {/* Attribution fields — only show when there's a quote to attribute */}
      {!isEmpty && (
        <>
          <div className={KIT.field}>
            <label className={KIT.label}>{t("Name")}</label>
            <input
              type="text"
              className={KIT.input}
              value={slot.author}
              maxLength={80}
              placeholder={t("Full name")}
              onChange={(e) => onPatch({ author: e.target.value })}
            />
          </div>

          <div className={KIT.field}>
            <InspectorLabelWithInfo
              label="Role or occasion"
              info={'Shown beneath the name. E.g. "Featured talent" or "Agency client since 2022".'}
              className={KIT.label}
            />
            <input
              type="text"
              className={KIT.input}
              value={slot.context}
              maxLength={120}
              placeholder={t("Bridal client · New York")}
              onChange={(e) => onPatch({ context: e.target.value })}
            />
          </div>

          {!showLocation && !slot.location ? (
            <button
              type="button"
              className={`${KIT.ghostButton} self-start`}
              onClick={() => setShowLocation(true)}
            >
              {t("+ Add location")}
            </button>
          ) : (
            <div className={KIT.field}>
              <label className={KIT.label}>{t("Location")}</label>
              <input
                type="text"
                className={KIT.input}
                value={slot.location}
                maxLength={120}
                placeholder={t("City, Country")}
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
  selectedBuilderNodeId,
  onChange,
}: Props) {
  // Local slot state — gives stable slot positions (A/B/C) regardless of how
  // many items the underlying array has. Syncs from draftProps on external
  // changes (undo/redo) via the isOurChange guard.
  const { t } = useEditorLocale();
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const focusRole = useMemo(() => {
    if (!selectedBuilderNodeId) return null;
    const role = resolveBuilderNodeRole(selectedBuilderNodeId);
    if (role === "subheadline") return "subheadline";
    if (role === "headline") return "headline";
    return null;
  }, [selectedBuilderNodeId]);

  useEffect(() => {
    if (!focusRole) return;
    const root = rootRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-testimonials-node-role="${focusRole}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const focusable = target.querySelector<HTMLElement>(
      "[contenteditable='true'],input,textarea,select,button",
    );
    focusable?.focus({ preventScroll: true });
  }, [focusRole]);

  function patchMeta(patch: Record<string, unknown>) {
    onChange({ ...draftProps, ...patch });
  }

  const filledCount = slots.filter((s) => s.quote.trim().length > 0).length;

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      {focusRole ? (
        <div
          className="rounded-lg border px-3 py-2 text-xs font-medium"
          style={{
            borderColor: "#bfdbfe",
            background: "#eff6ff",
            color: "#1d4ed8",
          }}
        >
          {t("Editing selected block:")} {focusRole === "subheadline" ? t("Eyebrow") : t("Headline")}
        </div>
      ) : null}
      {/* ── Headline ── */}
      <InspectorGroup
        title={t("Headline")}
        collapsible
        storageKey="tt-header"
        defaultOpen={Boolean(eyebrow || headline)}
      >
        <div className={KIT.field} data-testimonials-node-role="subheadline">
          <label className={KIT.label}>{t("Eyebrow")}</label>
          <input
            type="text"
            className={KIT.input}
            value={eyebrow}
            maxLength={60}
            placeholder={t("What clients say")}
            onChange={(e) =>
              patchMeta({ eyebrow: e.target.value || undefined })
            }
          />
        </div>
        <div className={KIT.field} data-testimonials-node-role="headline">
          <label className={KIT.label}>{t("Headline")}</label>
          <RichEditor
            value={headline}
            onChange={(next) => patchMeta({ headline: next || undefined })}
            variant="single"
            tenantId={tenantId}
            placeholder={t("In their own words")}
            ariaLabel={t("Headline")}
          />
        </div>
      </InspectorGroup>

      {/* ── Three voices ── */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className={KIT.sectionTitle}>{t("Three voices")}</span>
          <span className="text-[10px] tabular-nums text-stone-500">
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
          <p className={`${KIT.hint} text-blue-600`}>
            {t("Fill at least one voice to publish this section.")}
          </p>
        )}
      </section>

      {/* ── Display (advanced) ── */}
      <InspectorGroup
        title={t("Display")}
        advanced
        collapsible
        storageKey="tt-display"
      >
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Layout")}</label>
          <VisualChipGroup
            value={variant}
            onChange={(v) => patchMeta({ variant: v })}
            options={variantChips(t)}
            columns={3}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Default accent")}</label>
          <VisualChipGroup
            value={defaultAccent}
            onChange={(v) => patchMeta({ defaultAccent: v })}
            options={defaultAccentChips(t)}
            columns={5}
          />
        </div>
      </InspectorGroup>
    </div>
  );
}
