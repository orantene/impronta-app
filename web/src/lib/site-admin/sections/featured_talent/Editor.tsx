"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { LinkPicker } from "../shared/LinkPicker";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import type { SectionEditorProps } from "../types";
import type { FeaturedTalentV1 } from "./schema";

const LAYOUT_VARIANTS: ReadonlyArray<{
  value: NonNullable<FeaturedTalentV1["variant"]>;
  label: string;
  hint: string;
}> = [
  {
    value: "grid",
    label: "Grid",
    hint: "Uniform card grid — dense, scannable.",
  },
  {
    value: "carousel",
    label: "Carousel",
    hint: "Horizontal rail with scroll affordance — editorial.",
  },
];

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function FeaturedTalentEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<FeaturedTalentV1>) {
  const value: FeaturedTalentV1 = {
    eyebrow: initial.eyebrow ?? "Featured collective",
    headline: initial.headline ?? "",
    copy: initial.copy ?? "",
    sourceMode: initial.sourceMode ?? "auto_featured_flag",
    manualProfileCodes: initial.manualProfileCodes ?? [],
    filterServiceSlug: initial.filterServiceSlug ?? "",
    filterDestinationSlug: initial.filterDestinationSlug ?? "",
    limit: initial.limit ?? 6,
    columnsDesktop: initial.columnsDesktop ?? 3,
    variant: initial.variant ?? "grid",
    footerCta: initial.footerCta,
    presentation: initial.presentation,
  };
  const patch = (p: Partial<FeaturedTalentV1>) => onChange({ ...value, ...p });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input
            className={INPUT}
            maxLength={60}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>Headline</span>
          <RichEditor
            value={value.headline ?? ""}
            onChange={(next) => patch({ headline: next })}
            variant="single"
            tenantId={tenantId}
            ariaLabel="Headline"
          />
        </div>
      </div>

      <div className={FIELD}>
        <span className={LABEL}>Copy</span>
        <RichEditor
          value={value.copy ?? ""}
          onChange={(next) => patch({ copy: next })}
          variant="multi"
          tenantId={tenantId}
          ariaLabel="Copy"
        />
      </div>

      <VariantPicker
        name="featured_talent.variant"
        legend="Layout"
        sectionKey="featured_talent"
        options={LAYOUT_VARIANTS}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Source mode</span>
          <select
            className={INPUT}
            value={value.sourceMode}
            onChange={(e) =>
              patch({
                sourceMode: e.target.value as FeaturedTalentV1["sourceMode"],
              })
            }
          >
            <option value="auto_featured_flag">Auto — featured flag</option>
            <option value="auto_recent">Auto — most recent</option>
            <option value="auto_by_service">Auto — by service</option>
            <option value="auto_by_destination">Auto — by destination</option>
            <option value="manual_pick">Manual pick</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Limit</span>
          <input
            className={INPUT}
            type="number"
            min={1}
            max={12}
            value={value.limit}
            onChange={(e) =>
              patch({
                limit: Math.max(1, Math.min(12, Number(e.target.value) || 6)),
              })
            }
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Columns (desktop)</span>
          <input
            className={INPUT}
            type="number"
            min={2}
            max={4}
            value={value.columnsDesktop}
            onChange={(e) =>
              patch({
                columnsDesktop: Math.max(2, Math.min(4, Number(e.target.value) || 3)),
              })
            }
          />
        </label>
      </div>

      {value.sourceMode === "auto_by_service" ? (
        <label className={FIELD}>
          <span className={LABEL}>Service slug</span>
          <input
            className={INPUT}
            placeholder="bridal-makeup"
            value={value.filterServiceSlug ?? ""}
            onChange={(e) => patch({ filterServiceSlug: e.target.value })}
          />
        </label>
      ) : null}

      {value.sourceMode === "auto_by_destination" ? (
        <label className={FIELD}>
          <span className={LABEL}>Destination slug</span>
          <input
            className={INPUT}
            placeholder="tulum"
            value={value.filterDestinationSlug ?? ""}
            onChange={(e) => patch({ filterDestinationSlug: e.target.value })}
          />
        </label>
      ) : null}

      {value.sourceMode === "manual_pick" ? (
        <label className={FIELD}>
          <span className={LABEL}>Profile codes (comma-separated)</span>
          <input
            className={INPUT}
            placeholder="aurelia-cruz, elena-marchetti, mateo-lange"
            value={(value.manualProfileCodes ?? []).join(", ")}
            onChange={(e) =>
              patch({
                manualProfileCodes: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Footer CTA label</span>
          <input
            className={INPUT}
            value={value.footerCta?.label ?? ""}
            onChange={(e) =>
              patch({
                footerCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.footerCta?.href ?? "/directory",
                    }
                  : undefined,
              })
            }
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>Footer CTA href</span>
          <LinkPicker
            value={value.footerCta?.href ?? ""}
            onChange={(next) =>
              patch({
                footerCta: value.footerCta
                  ? { ...value.footerCta, href: next }
                  : next
                    ? { label: "Explore the collective", href: next }
                    : undefined,
              })
            }
          />
        </div>
      </div>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
