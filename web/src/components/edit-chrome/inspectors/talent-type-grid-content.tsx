"use client";

/**
 * TalentTypeGridContentInspector - bespoke Content tab for talent_type_grid.
 *
 * The registry editor is still useful in the composer, but inside the page
 * builder drawer it reads as a raw schema form. This inspector mirrors the
 * Featured Talent treatment: grouped controls, visual chips, warm inputs,
 * and a one-click v11 prototype preset.
 */

import { useEffect, useMemo, useRef } from "react";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import { resolveBuilderNodeRole } from "@/lib/site-admin/builder-node";
import { useEditorLocale } from "../use-editor-locale";
import {
  InspectorGroup,
  KIT,
  MediaPickerButton,
  VisualChipGroup,
} from "./kit";
import { LinkKindPicker } from "@/lib/site-admin/sections/shared/LinkKindPicker";
import type { LinkRef } from "@/lib/site-admin/links/link-ref";
import {
  v11TalentTypeGridItems,
  v11TalentTypeGridPreset,
} from "@/lib/site-admin/sections/talent_type_grid/presets";
import type {
  TalentTypeGridItem,
  TalentTypeGridV1,
} from "@/lib/site-admin/sections/talent_type_grid/schema";

type SourceMode = TalentTypeGridV1["mode"];
type DesktopLayout = TalentTypeGridV1["desktopLayout"];
type MobileLayout = TalentTypeGridV1["mobileLayout"];
type CardRatio = TalentTypeGridV1["cardRatio"];
type TextPosition = TalentTypeGridV1["textPosition"];
type OverlayStrength = TalentTypeGridV1["imageOverlayStrength"];
type CardTitleScale = NonNullable<TalentTypeGridV1["cardTitleScale"]>;
type CardCopyScale = NonNullable<TalentTypeGridV1["cardCopyScale"]>;
type TalentTypeGridNodeRole = "subheadline" | "headline" | "copy";

interface TalentTypeGridContentInspectorProps {
  draftProps: Record<string, unknown>;
  tenantId: string;
  selectedBuilderNodeId: string | null;
  onChange: (next: Record<string, unknown>) => void;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseItems(value: unknown): TalentTypeGridItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TalentTypeGridItem => {
    return Boolean(
      item &&
        typeof item === "object" &&
        "label" in item &&
        typeof item.label === "string",
    );
  });
}

function talentTypeGridNodeRoleLabel(
  role: TalentTypeGridNodeRole | null,
  t: ReturnType<typeof useEditorLocale>["t"],
): string | null {
  if (role === "subheadline") return t("Eyebrow");
  if (role === "headline") return t("Headline");
  if (role === "copy") return t("Subheading");
  return null;
}

export function TalentTypeGridContentInspector({
  draftProps,
  tenantId,
  selectedBuilderNodeId,
  onChange,
}: TalentTypeGridContentInspectorProps) {
  const { t } = useEditorLocale();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mode = (asString(draftProps.mode, "manual") as SourceMode) ?? "manual";
  const items = parseItems(draftProps.items);
  const selectedTermIds = Array.isArray(draftProps.selectedTermIds)
    ? draftProps.selectedTermIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  const maxItems = Math.min(18, Math.max(1, asNumber(draftProps.maxItems, 7)));
  const desktopLayout = asString(
    draftProps.desktopLayout,
    "featured-pod-rail",
  ) as DesktopLayout;
  const mobileLayout = asString(
    draftProps.mobileLayout,
    "horizontal-scroll",
  ) as MobileLayout;
  const cardRatio = asString(draftProps.cardRatio, "16/9") as CardRatio;
  const textPosition = asString(
    draftProps.textPosition,
    "overlay-bottom",
  ) as TextPosition;
  const imageOverlayStrength = asString(
    draftProps.imageOverlayStrength,
    "strong",
  ) as OverlayStrength;
  const cardTitleScale = asString(
    draftProps.cardTitleScale,
    "balanced",
  ) as CardTitleScale;
  const cardCopyScale = asString(
    draftProps.cardCopyScale,
    "comfortable",
  ) as CardCopyScale;
  const focusRole = useMemo<TalentTypeGridNodeRole | null>(() => {
    if (!selectedBuilderNodeId) return null;
    const role = resolveBuilderNodeRole(selectedBuilderNodeId);
    if (role === "subheadline" || role === "headline" || role === "copy") {
      return role;
    }
    return null;
  }, [selectedBuilderNodeId]);
  const focusLabel = useMemo(
    () => talentTypeGridNodeRoleLabel(focusRole, t),
    [focusRole, t],
  );

  useEffect(() => {
    if (!focusRole) return;
    const root = rootRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-talent-type-grid-node-role="${focusRole}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const focusable = target.querySelector<HTMLElement>(
      "[contenteditable='true'],input,textarea,select,button",
    );
    focusable?.focus({ preventScroll: true });
  }, [focusRole]);

  function update(patch: Partial<TalentTypeGridV1>) {
    onChange({ ...draftProps, ...patch });
  }

  function applyV11Preset() {
    update({
      ...v11TalentTypeGridPreset,
      items: v11TalentTypeGridItems.map((item) => ({ ...item })),
      presentation: { ...v11TalentTypeGridPreset.presentation },
    });
  }

  function patchItem(index: number, patch: Partial<TalentTypeGridItem>) {
    update({
      items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  function removeItem(index: number) {
    update({ items: items.filter((_, i) => i !== index) });
  }

  function addItem() {
    update({
      items: [
        ...items,
        { label: t("New discipline"), description: "", icon: "*" },
      ].slice(0, 18),
    });
  }

  function setFeaturedItem(index: number, featured: boolean) {
    update({
      items: items.map((item, i) => ({
        ...item,
        featured: featured ? i === index : i === index ? undefined : item.featured,
      })),
    });
  }

  const showImages = draftProps.showImages !== false;
  const showDescriptions =
    asBool(draftProps.showDescriptions) ?? desktopLayout === "featured-pod-rail";
  const showCardIcons =
    asBool(draftProps.showCardIcons) ?? desktopLayout === "featured-pod-rail";
  const showRailControls = draftProps.showRailControls !== false;
  const showCta = draftProps.showCta === true;

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {focusLabel ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
          {t("Editing selected canvas node:")} {focusLabel}
        </div>
      ) : null}
      <div className="rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-amber-950 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("V11 talent roster preset")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
              {t("Applies the prototype rail: large featured pod, three-row card rail, image overlays, icons, descriptions, arrows, and See all link.")}
            </p>
          </div>
          <button type="button" className={KIT.primaryButton} onClick={applyV11Preset}>
            {t("Apply full preset")}
          </button>
        </div>
      </div>

      <InspectorGroup title={t("Header")} storageKey="talent_type_grid:header">
        <div className="grid grid-cols-1 gap-3">
          <div
            className={KIT.field}
            data-talent-type-grid-node-role="subheadline"
          >
            <span className={KIT.label}>{t("Eyebrow")}</span>
            <RichEditor
              value={asString(draftProps.eyebrow)}
              onChange={(next) => update({ eyebrow: next || undefined })}
              variant="single"
              tenantId={tenantId}
              placeholder={t("Optional - e.g. The roster")}
              ariaLabel={t("Talent by discipline eyebrow")}
            />
          </div>
          <div
            className={KIT.field}
            data-talent-type-grid-node-role="headline"
          >
            <span className={KIT.label}>{t("Headline")}</span>
            <RichEditor
              value={asString(draftProps.headline, t("Talent, by discipline"))}
              onChange={(next) => update({ headline: next || undefined })}
              variant="single"
              tenantId={tenantId}
              ariaLabel={t("Talent by discipline headline")}
              className={KIT.inputLg}
            />
          </div>
          <div className={KIT.field} data-talent-type-grid-node-role="copy">
            <span className={KIT.label}>{t("Subheading")}</span>
            <RichEditor
              value={asString(draftProps.subheadline)}
              onChange={(next) => update({ subheadline: next || undefined })}
              variant="multi"
              tenantId={tenantId}
              placeholder={t("Optional supporting line")}
              ariaLabel={t("Talent by discipline subheading")}
              className={`${KIT.textarea} min-h-[96px] whitespace-pre-wrap break-words`}
            />
          </div>
        </div>
      </InspectorGroup>

      <InspectorGroup
        title={t("Typography")}
        info={t("Section text uses the Style tab for selected heading nodes. These controls tune the repeated card text.")}
        storageKey="talent_type_grid:typography"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className={KIT.field}>
            <span className={KIT.label}>{t("Card title scale")}</span>
            <VisualChipGroup<CardTitleScale>
              value={cardTitleScale}
              onChange={(next) => update({ cardTitleScale: next })}
              options={[
                { value: "compact", label: t("Compact"), preview: null },
                { value: "balanced", label: t("Balanced"), preview: null },
                { value: "display", label: t("Display"), preview: null },
              ]}
              columns={3}
            />
          </div>
          <div className={KIT.field}>
            <span className={KIT.label}>{t("Description scale")}</span>
            <VisualChipGroup<CardCopyScale>
              value={cardCopyScale}
              onChange={(next) => update({ cardCopyScale: next })}
              options={[
                { value: "compact", label: t("Compact"), preview: null },
                { value: "comfortable", label: t("Comfort"), preview: null },
              ]}
              columns={2}
            />
          </div>
        </div>
      </InspectorGroup>

      <InspectorGroup
        title={t("Who Shows Up")}
        info={t("Manual cards use these exact entries. Dynamic mode derives live roster taxonomy for this tenant.")}
        storageKey="talent_type_grid:source"
      >
        <VisualChipGroup<SourceMode>
          value={mode}
          onChange={(next) => update({ mode: next })}
          options={[
            { value: "manual", label: t("Manual cards"), preview: <ModePreview mode="manual" /> },
            { value: "dynamic", label: t("Live taxonomy"), preview: <ModePreview mode="dynamic" /> },
          ]}
          columns={2}
        />
        {mode === "dynamic" ? (
          <div className="mt-3 flex flex-col gap-3">
            <ToggleRow
              label={t("Parent-category rollup")}
              checked={draftProps.parentCategoryMode === true}
              onChange={(checked) => update({ parentCategoryMode: checked })}
            />
            <label className={KIT.field}>
              <span className={KIT.label}>{t("Restrict taxonomy term IDs")}</span>
              <input
                className={KIT.input}
                placeholder={t("empty = all roster disciplines")}
                value={selectedTermIds.join(", ")}
                onChange={(event) =>
                  update({
                    selectedTermIds: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .slice(0, 40),
                  })
                }
              />
              <span className={KIT.hint}>
                {t("Safe interim until the visual taxonomy picker lands.")}
              </span>
            </label>
          </div>
        ) : null}
      </InspectorGroup>

      <InspectorGroup
        title={t("Prototype Layout")}
        info={t("Controls the v11 card rail and responsive behavior.")}
        storageKey="talent_type_grid:layout"
      >
        <VisualChipGroup<DesktopLayout>
          value={desktopLayout}
          onChange={(next) => update({ desktopLayout: next })}
          options={[
            {
              value: "featured-pod-rail",
              label: t("V11 rail"),
              preview: <LayoutPreview kind="rail" />,
            },
            {
              value: "horizontal-rail",
              label: t("Rail"),
              preview: <LayoutPreview kind="horizontal" />,
            },
            {
              value: "equal-grid",
              label: t("Grid"),
              preview: <LayoutPreview kind="grid" />,
            },
            {
              value: "editorial-asymmetric",
              label: t("Asymmetric"),
              preview: <LayoutPreview kind="asym" />,
            },
            {
              value: "compact-grid",
              label: t("Compact"),
              preview: <LayoutPreview kind="compact" />,
            },
          ]}
          columns={3}
        />
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className={KIT.field}>
            <span className={KIT.label}>{t("Mobile layout")}</span>
            <VisualChipGroup<MobileLayout>
              value={mobileLayout}
              onChange={(next) => update({ mobileLayout: next })}
              options={[
                { value: "horizontal-scroll", label: t("Scroll"), preview: null },
                { value: "stacked", label: t("Stack"), preview: null },
                { value: "compact-grid", label: t("Compact"), preview: null },
              ]}
              columns={3}
            />
          </div>
          <div className={KIT.field}>
            <span className={KIT.label}>{t("Image ratio")}</span>
            <VisualChipGroup<CardRatio>
              value={cardRatio}
              onChange={(next) => update({ cardRatio: next })}
              options={[
                { value: "16/9", label: "16:9", preview: null },
                { value: "3/4", label: "3:4", preview: null },
                { value: "4/3", label: "4:3", preview: null },
                { value: "1/1", label: "1:1", preview: null },
              ]}
              columns={4}
            />
          </div>
          <div className={KIT.field}>
            <span className={KIT.label}>{t("Text position")}</span>
            <VisualChipGroup<TextPosition>
              value={textPosition}
              onChange={(next) => update({ textPosition: next })}
              options={[
                { value: "overlay-bottom", label: t("Overlay"), preview: null },
                { value: "below", label: t("Below"), preview: null },
              ]}
              columns={2}
            />
          </div>
          <div className={KIT.field}>
            <span className={KIT.label}>{t("Overlay strength")}</span>
            <VisualChipGroup<OverlayStrength>
              value={imageOverlayStrength}
              onChange={(next) => update({ imageOverlayStrength: next })}
              options={[
                { value: "strong", label: t("Strong"), preview: null },
                { value: "medium", label: t("Medium"), preview: null },
                { value: "soft", label: t("Soft"), preview: null },
                { value: "none", label: t("None"), preview: null },
              ]}
              columns={4}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <ToggleRow
            label={t("Images")}
            checked={showImages}
            onChange={(checked) => update({ showImages: checked })}
          />
          <ToggleRow
            label={t("Descriptions")}
            checked={showDescriptions}
            onChange={(checked) => update({ showDescriptions: checked })}
          />
          <ToggleRow
            label={t("Card icons")}
            checked={showCardIcons}
            onChange={(checked) => update({ showCardIcons: checked })}
          />
          <ToggleRow
            label={t("Rail arrows")}
            checked={showRailControls}
            onChange={(checked) => update({ showRailControls: checked })}
          />
          <ToggleRow
            label={t("Talent counts")}
            checked={draftProps.showCount === true}
            onChange={(checked) => update({ showCount: checked })}
          />
          <ToggleRow
            label={t("Card CTA")}
            checked={showCta}
            onChange={(checked) => update({ showCta: checked })}
          />
        </div>
        {showCta ? (
          <label className={`${KIT.field} mt-3`}>
            <span className={KIT.label}>{t("Card CTA label")}</span>
            <input
              className={KIT.input}
              value={asString(draftProps.ctaLabel, t("Explore"))}
              onChange={(event) => update({ ctaLabel: event.target.value })}
            />
          </label>
        ) : null}
      </InspectorGroup>

      {mode === "manual" ? (
        <InspectorGroup
          title={t("Manual Cards")}
          info={t("Choose imagery, copy, icons, links, and which card becomes the large pod.")}
          storageKey="talent_type_grid:manual"
        >
          <div className="flex flex-col gap-3">
            {items.map((item, index) => (
              <article
                key={`${item.label}-${index}`}
                className="rounded-xl border border-[#e5e0d5] bg-[#fbfaf7] p-3 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-800">
                      {item.label || `${t("Card")} ${index + 1}`}
                    </p>
                    <p className="text-[11px] text-stone-500">
                      {t("Card")} {index + 1}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50"
                    onClick={() => removeItem(index)}
                  >
                    {t("Remove")}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <MediaPickerButton
                    tenantId={tenantId}
                    value={item.imageUrl}
                    onChange={(next) =>
                      patchItem(index, { imageUrl: next ?? undefined })
                    }
                    emptyLabel={t("Pick background image")}
                    aspect="16/9"
                  />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className={KIT.field}>
                      <span className={KIT.label}>{t("Label")}</span>
                      <input
                        className={KIT.input}
                        value={item.label}
                        onChange={(event) =>
                          patchItem(index, { label: event.target.value })
                        }
                      />
                    </label>
                    <label className={KIT.field}>
                      <span className={KIT.label}>{t("Icon")}</span>
                      <input
                        className={KIT.input}
                        maxLength={8}
                        value={item.icon ?? ""}
                        onChange={(event) =>
                          patchItem(index, {
                            icon: event.target.value || undefined,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className={KIT.field}>
                    <span className={KIT.label}>{t("Description")}</span>
                    <input
                      className={KIT.input}
                      value={item.description ?? ""}
                      onChange={(event) =>
                        patchItem(index, {
                          description: event.target.value || undefined,
                        })
                      }
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className={KIT.field}>
                      <span className={KIT.label}>{t("Image position")}</span>
                      <input
                        className={KIT.input}
                        placeholder="50% 50%"
                        value={item.imagePosition ?? ""}
                        onChange={(event) =>
                          patchItem(index, {
                            imagePosition: event.target.value || undefined,
                          })
                        }
                      />
                    </label>
                    <div className={KIT.field}>
                      <span className={KIT.label}>{t("Card link")}</span>
                      <LinkKindPicker
                        value={item.href}
                        onChange={(next) =>
                          patchItem(index, { href: next })
                        }
                      />
                    </div>
                  </div>
                  <label className={KIT.field}>
                    <span className={KIT.label}>{t("Image alt text")}</span>
                    <input
                      className={KIT.input}
                      value={item.imageAlt ?? ""}
                      onChange={(event) =>
                        patchItem(index, {
                          imageAlt: event.target.value || undefined,
                        })
                      }
                    />
                  </label>
                  <ToggleRow
                    label={t("Feature this card in pod layouts")}
                    checked={item.featured === true}
                    onChange={(checked) => setFeaturedItem(index, checked)}
                  />
                </div>
              </article>
            ))}
            <button type="button" className={KIT.ghostButton} onClick={addItem}>
              {t("+ Add card")}
            </button>
          </div>
        </InspectorGroup>
      ) : null}

      <InspectorGroup title={t("Links")} storageKey="talent_type_grid:links">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className={KIT.field}>
            <span className={KIT.label}>{t("See all label")}</span>
            <input
              className={KIT.input}
              value={asString(draftProps.seeAllLabel)}
              onChange={(event) => update({ seeAllLabel: event.target.value })}
            />
          </label>
          <div className={KIT.field}>
            <span className={KIT.label}>{t("See all href")}</span>
            <LinkKindPicker
              value={draftProps.seeAllHref as LinkRef | string | undefined}
              onChange={(next) => update({ seeAllHref: next })}
            />
          </div>
        </div>
      </InspectorGroup>

      <InspectorGroup
        title={t("Advanced")}
        advanced
        collapsible
        storageKey="talent_type_grid:advanced"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className={KIT.field}>
            <span className={KIT.label}>{t("Maximum items -")} {maxItems}</span>
            <input
              type="range"
              min={1}
              max={18}
              value={maxItems}
              onChange={(event) => update({ maxItems: Number(event.target.value) })}
              className="w-full accent-violet-600"
            />
          </label>
          <label className={KIT.field}>
            <span className={KIT.label}>{t("Overlay opacity")}</span>
            <input
              className={KIT.input}
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={
                typeof draftProps.overlayOpacity === "number"
                  ? draftProps.overlayOpacity
                  : ""
              }
              onChange={(event) =>
                update({
                  overlayOpacity:
                    event.target.value === ""
                      ? undefined
                      : Math.max(0, Math.min(1, Number(event.target.value))),
                })
              }
            />
          </label>
        </div>
        <label className={`${KIT.field} mt-3`}>
          <span className={KIT.label}>{t("Empty state text")}</span>
          <input
            className={KIT.input}
            value={asString(draftProps.emptyStateText)}
            onChange={(event) => update({ emptyStateText: event.target.value })}
          />
        </label>
      </InspectorGroup>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-[#faf9f6] px-3 py-2 text-[12px] font-medium text-stone-600">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-violet-600"
      />
    </label>
  );
}

function ModePreview({ mode }: { mode: SourceMode }) {
  const { t } = useEditorLocale();
  return (
    <div className="flex h-full w-full items-center justify-center gap-1">
      {mode === "manual" ? (
        <>
          <span className="h-7 w-5 rounded bg-stone-800" />
          <span className="h-7 w-5 rounded bg-amber-500" />
          <span className="h-7 w-5 rounded bg-stone-500" />
        </>
      ) : (
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
          {t("Live")}
        </span>
      )}
    </div>
  );
}

function LayoutPreview({ kind }: { kind: "rail" | "horizontal" | "grid" | "asym" | "compact" }) {
  if (kind === "rail") {
    return (
      <div className="grid h-full w-full grid-cols-[1.1fr_1fr_1fr] grid-rows-3 gap-1 p-1">
        <span className="row-span-3 rounded bg-stone-800" />
        <span className="rounded bg-stone-500" />
        <span className="rounded bg-stone-500" />
        <span className="rounded bg-stone-600" />
        <span className="rounded bg-stone-600" />
        <span className="rounded bg-stone-700" />
        <span className="rounded bg-stone-700" />
      </div>
    );
  }
  if (kind === "horizontal") {
    return (
      <div className="flex h-full w-full gap-1 p-1">
        <span className="flex-1 rounded bg-stone-800" />
        <span className="flex-1 rounded bg-stone-600" />
        <span className="flex-1 rounded bg-stone-500" />
      </div>
    );
  }
  if (kind === "asym") {
    return (
      <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-1 p-1">
        <span className="col-span-2 row-span-2 rounded bg-stone-800" />
        <span className="rounded bg-stone-500" />
        <span className="rounded bg-stone-600" />
      </div>
    );
  }
  if (kind === "compact") {
    return (
      <div className="grid h-full w-full grid-cols-4 gap-1 p-1">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className="rounded bg-stone-500" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid h-full w-full grid-cols-3 gap-1 p-1">
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="rounded bg-stone-600" />
      ))}
    </div>
  );
}
