"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { LinkKindPicker } from "../shared/LinkKindPicker";
import { MediaPicker } from "../shared/MediaPicker";
import type { SectionEditorProps } from "../types";
import { v11TalentTypeGridItems, v11TalentTypeGridPreset } from "./presets";
import type { TalentTypeGridV1, TalentTypeGridItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";
const BUTTON =
  "rounded-md border border-border/60 px-2 py-1 text-xs font-medium hover:bg-muted";
const BUTTON_PRIMARY =
  "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90";

const ICON_PRESETS = [
  "",
  "◑",
  "✦",
  "♪",
  "♫",
  "✷",
  "❀",
  "◉",
  "⌾",
  "◈",
  "⌂",
  "❖",
  "△",
];

export function TalentTypeGridEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<TalentTypeGridV1>) {
  const value: TalentTypeGridV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Talent, by discipline",
    subheadline: initial.subheadline ?? "",
    mode: initial.mode ?? "manual",
    items: initial.items ?? [],
    selectedTermIds: initial.selectedTermIds ?? [],
    parentCategoryMode: initial.parentCategoryMode,
    maxItems: initial.maxItems ?? 7,
    showCount: initial.showCount,
    showCta: initial.showCta,
    ctaLabel: initial.ctaLabel ?? "",
    seeAllLabel: initial.seeAllLabel ?? "",
    seeAllHref: initial.seeAllHref,
    desktopLayout: initial.desktopLayout ?? "equal-grid",
    mobileLayout: initial.mobileLayout ?? "stacked",
    cardRatio: initial.cardRatio ?? "3/4",
    textPosition: initial.textPosition ?? "overlay-bottom",
    showImages: initial.showImages,
    showDescriptions: initial.showDescriptions,
    showCardIcons: initial.showCardIcons,
    showRailControls: initial.showRailControls,
    overlayOpacity: initial.overlayOpacity,
    imageOverlayStrength: initial.imageOverlayStrength ?? "medium",
    emptyStateText: initial.emptyStateText ?? "",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<TalentTypeGridV1>) => onChange({ ...value, ...p });

  const items = value.items ?? [];
  const setItem = (i: number, p: Partial<TalentTypeGridItem>) =>
    patch({
      items: items.map((it, idx) => (idx === i ? { ...it, ...p } : it)),
    });
  const addItem = () =>
    patch({
      items: [
        ...items,
        { label: "New discipline", description: "", icon: "✦" },
      ].slice(0, 18),
    });
  const removeItem = (i: number) =>
    patch({ items: items.filter((_, idx) => idx !== i) });
  const setFeaturedItem = (i: number, featured: boolean) =>
    patch({
      items: items.map((it, idx) => ({
        ...it,
        featured: featured ? idx === i : idx === i ? undefined : it.featured,
      })),
    });
  const applyPrototypePreset = () =>
    patch({
      ...v11TalentTypeGridPreset,
      items: v11TalentTypeGridItems.map((item) => ({ ...item })),
      presentation: {
        ...v11TalentTypeGridPreset.presentation,
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-violet-300/70 bg-violet-50 p-3 text-violet-950 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">V11 prototype preset</p>
            <p className="mt-0.5 text-xs leading-relaxed text-violet-800">
              Resets this section to the prototype roster: seven cards, one
              featured pod, rail arrows, overlays, descriptions, icons, image
              alt text, and the prototype spacing.
            </p>
          </div>
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={applyPrototypePreset}
          >
            Apply full preset
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-violet-800">
          After applying, tune images, alt text, links, and featured card in the
          manual cards below.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input
            className={INPUT}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Heading</span>
          <input
            className={INPUT}
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Subheading</span>
          <input
            className={INPUT}
            value={value.subheadline ?? ""}
            onChange={(e) => patch({ subheadline: e.target.value })}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Mode</span>
          <select
            className={INPUT}
            value={value.mode}
            onChange={(e) =>
              patch({ mode: e.target.value as TalentTypeGridV1["mode"] })
            }
          >
            <option value="manual">Manual cards</option>
            <option value="dynamic">Dynamic, from tenant roster</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Max items</span>
          <input
            className={INPUT}
            type="number"
            min={1}
            max={18}
            value={value.maxItems}
            onChange={(e) =>
              patch({
                maxItems: Math.max(
                  1,
                  Math.min(18, Number(e.target.value) || 7),
                ),
              })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm md:mt-6">
          <input
            type="checkbox"
            checked={value.parentCategoryMode === true}
            onChange={(e) => patch({ parentCategoryMode: e.target.checked })}
          />
          Parent-category rollup
        </label>
      </div>

      {value.mode === "dynamic" ? (
        <label className={FIELD}>
          <span className={LABEL}>
            Restrict to taxonomy term ids (optional, comma-separated)
          </span>
          <input
            className={INPUT}
            placeholder="empty = all roster disciplines"
            value={(value.selectedTermIds ?? []).join(", ")}
            onChange={(e) =>
              patch({
                selectedTermIds: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 40),
              })
            }
          />
          <span className="text-[11px] text-muted-foreground">
            Visual taxonomy picker is a documented follow-up; this manual
            term-id restrict is the safe interim. Tenant-scoped automatically.
          </span>
        </label>
      ) : (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Manual cards</span>
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 rounded-md border border-border/50 p-2 md:grid-cols-2"
            >
              <input
                className={INPUT}
                placeholder="Label"
                value={it.label}
                onChange={(e) => setItem(i, { label: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder="Description (optional)"
                value={it.description ?? ""}
                onChange={(e) =>
                  setItem(i, { description: e.target.value || undefined })
                }
              />
              <label className={FIELD}>
                <span className={LABEL}>Icon</span>
                <select
                  className={INPUT}
                  value={it.icon ?? ""}
                  onChange={(e) =>
                    setItem(i, { icon: e.target.value || undefined })
                  }
                >
                  {ICON_PRESETS.map((icon) => (
                    <option key={icon || "none"} value={icon}>
                      {icon || "None"}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD}>
                <span className={LABEL}>Image position</span>
                <input
                  className={INPUT}
                  placeholder="50% 50%"
                  value={it.imagePosition ?? ""}
                  onChange={(e) =>
                    setItem(i, { imagePosition: e.target.value || undefined })
                  }
                />
              </label>
              <div className="flex flex-col gap-2 md:col-span-2">
                <span className={LABEL}>Background image</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={`${INPUT} min-w-[220px] flex-1`}
                    placeholder="Image URL (optional)"
                    value={it.imageUrl ?? ""}
                    onChange={(e) =>
                      setItem(i, { imageUrl: e.target.value || undefined })
                    }
                  />
                  {tenantId ? (
                    <MediaPicker
                      tenantId={tenantId}
                      label="Pick image"
                      onPick={(url) => setItem(i, { imageUrl: url })}
                    />
                  ) : null}
                  {it.imageUrl ? (
                    <button
                      type="button"
                      className={BUTTON}
                      onClick={() => setItem(i, { imageUrl: undefined })}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
              <label className={`${FIELD} md:col-span-2`}>
                <span className={LABEL}>Image alt text</span>
                <input
                  className={INPUT}
                  placeholder="Describe the image for screen readers"
                  value={it.imageAlt ?? ""}
                  onChange={(e) =>
                    setItem(i, { imageAlt: e.target.value || undefined })
                  }
                />
              </label>
              <label className={FIELD}>
                <span className={LABEL}>Taxonomy term id</span>
                <input
                  className={INPUT}
                  placeholder="optional → directory link"
                  value={it.taxonomyTermId ?? ""}
                  onChange={(e) =>
                    setItem(i, {
                      taxonomyTermId: e.target.value || undefined,
                    })
                  }
                />
              </label>
              <div className={FIELD}>
                <span className={LABEL}>Card link</span>
                <LinkKindPicker
                  value={it.href}
                  onChange={(next) => setItem(i, { href: next })}
                />
              </div>
              <label className="flex items-center gap-2 text-xs md:col-span-2">
                <input
                  type="checkbox"
                  checked={it.featured === true}
                  onChange={(e) => setFeaturedItem(i, e.target.checked)}
                />
                Feature this card in pod layouts
              </label>
              <button
                type="button"
                className="text-xs text-destructive md:col-span-2"
                onClick={() => removeItem(i)}
              >
                Remove card
              </button>
            </div>
          ))}
          <button
            type="button"
            className="self-start rounded-md border border-border/60 px-2 py-1 text-xs"
            onClick={addItem}
          >
            + Add card
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Desktop layout</span>
          <select
            className={INPUT}
            value={value.desktopLayout}
            onChange={(e) =>
              patch({
                desktopLayout: e.target
                  .value as TalentTypeGridV1["desktopLayout"],
              })
            }
          >
            <option value="featured-pod-rail">v11 featured pod rail</option>
            <option value="horizontal-rail">Horizontal rail</option>
            <option value="equal-grid">Equal grid</option>
            <option value="editorial-asymmetric">Editorial asymmetric</option>
            <option value="compact-grid">Compact grid</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Mobile layout</span>
          <select
            className={INPUT}
            value={value.mobileLayout}
            onChange={(e) =>
              patch({
                mobileLayout: e.target
                  .value as TalentTypeGridV1["mobileLayout"],
              })
            }
          >
            <option value="stacked">Stacked</option>
            <option value="horizontal-scroll">Horizontal scroll</option>
            <option value="compact-grid">Compact grid</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Card ratio</span>
          <select
            className={INPUT}
            value={value.cardRatio}
            onChange={(e) =>
              patch({
                cardRatio: e.target.value as TalentTypeGridV1["cardRatio"],
              })
            }
          >
            <option value="3/4">3 / 4</option>
            <option value="1/1">1 / 1</option>
            <option value="4/3">4 / 3</option>
            <option value="16/9">16 / 9</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Text position</span>
          <select
            className={INPUT}
            value={value.textPosition}
            onChange={(e) =>
              patch({
                textPosition: e.target
                  .value as TalentTypeGridV1["textPosition"],
              })
            }
          >
            <option value="overlay-bottom">Overlay (on image)</option>
            <option value="below">Below image</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Overlay strength</span>
          <select
            className={INPUT}
            value={value.imageOverlayStrength}
            onChange={(e) =>
              patch({
                imageOverlayStrength: e.target
                  .value as TalentTypeGridV1["imageOverlayStrength"],
              })
            }
          >
            <option value="none">None</option>
            <option value="soft">Soft</option>
            <option value="medium">Medium</option>
            <option value="strong">Strong</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Overlay opacity (0–1, optional)</span>
          <input
            className={INPUT}
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={value.overlayOpacity ?? ""}
            onChange={(e) =>
              patch({
                overlayOpacity:
                  e.target.value === ""
                    ? undefined
                    : Math.max(0, Math.min(1, Number(e.target.value))),
              })
            }
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.showImages !== false}
            onChange={(e) => patch({ showImages: e.target.checked })}
          />
          Show background images
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={
              value.showDescriptions ??
              value.desktopLayout === "featured-pod-rail"
            }
            onChange={(e) => patch({ showDescriptions: e.target.checked })}
          />
          Show descriptions
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={
              value.showCardIcons ?? value.desktopLayout === "featured-pod-rail"
            }
            onChange={(e) => patch({ showCardIcons: e.target.checked })}
          />
          Show card icons
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.showRailControls !== false}
            onChange={(e) => patch({ showRailControls: e.target.checked })}
          />
          Show rail arrows
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.showCount === true}
            onChange={(e) => patch({ showCount: e.target.checked })}
          />
          Show talent counts
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.showCta === true}
            onChange={(e) => patch({ showCta: e.target.checked })}
          />
          Show card CTA
        </label>
        {value.showCta ? (
          <input
            className={`${INPUT} max-w-[160px]`}
            placeholder="CTA label"
            value={value.ctaLabel ?? ""}
            onChange={(e) => patch({ ctaLabel: e.target.value })}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>“See all” label</span>
          <input
            className={INPUT}
            value={value.seeAllLabel ?? ""}
            onChange={(e) => patch({ seeAllLabel: e.target.value })}
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>“See all” href</span>
          <LinkKindPicker
            value={value.seeAllHref}
            onChange={(next) => patch({ seeAllHref: next })}
          />
        </div>
      </div>

      <label className={FIELD}>
        <span className={LABEL}>Empty-state text</span>
        <input
          className={INPUT}
          placeholder="No talent disciplines to show yet."
          value={value.emptyStateText ?? ""}
          onChange={(e) => patch({ emptyStateText: e.target.value })}
        />
      </label>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
