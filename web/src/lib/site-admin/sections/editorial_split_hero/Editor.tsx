"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { LinkKindPicker } from "../shared/LinkKindPicker";
import { coerceLegacyHref } from "../../links/link-ref";
import type { SectionEditorProps } from "../types";
import type { EditorialSplitHeroV1 } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function EditorialSplitHeroEditor({
  initial,
  onChange,
}: SectionEditorProps<EditorialSplitHeroV1>) {
  const value: EditorialSplitHeroV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Discover premium talent across",
    highlight: initial.highlight ?? "destination cities.",
    body: initial.body ?? "",
    primaryCta: initial.primaryCta,
    secondaryCta: initial.secondaryCta,
    mediaMode: initial.mediaMode ?? "static",
    mediaUrl: initial.mediaUrl ?? "",
    mediaAlt: initial.mediaAlt ?? "",
    mediaRatio: initial.mediaRatio ?? "4/3",
    mediaStyle: initial.mediaStyle ?? "single",
    mediaStackUrls: initial.mediaStackUrls,
    mediaStackCaptions: initial.mediaStackCaptions,
    overlayColor: initial.overlayColor ?? "",
    overlayOpacity: initial.overlayOpacity,
    overlayStrength: initial.overlayStrength ?? "none",
    mediaSide: initial.mediaSide ?? "right",
    mobileOrder: initial.mobileOrder ?? "text-first",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<EditorialSplitHeroV1>) =>
    onChange({ ...value, ...p });

  const cta = (key: "primaryCta" | "secondaryCta", label: string) => (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <label className={FIELD}>
        <span className={LABEL}>{label} label</span>
        <input
          className={INPUT}
          value={value[key]?.label ?? ""}
          onChange={(e) =>
            patch({
              [key]: e.target.value
                ? {
                    label: e.target.value,
                    href: value[key]?.href ?? coerceLegacyHref("/directory"),
                  }
                : undefined,
            } as Partial<EditorialSplitHeroV1>)
          }
        />
      </label>
      <div className={FIELD}>
        <span className={LABEL}>{label} link</span>
        <LinkKindPicker
          value={value[key]?.href}
          onChange={(next) =>
            patch({
              [key]: value[key]
                ? { ...value[key]!, href: next }
                : { label, href: next },
            } as Partial<EditorialSplitHeroV1>)
          }
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input
            className={INPUT}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Highlighted phrase</span>
          <input
            className={INPUT}
            value={value.highlight ?? ""}
            onChange={(e) => patch({ highlight: e.target.value })}
          />
        </label>
      </div>
      <label className={FIELD}>
        <span className={LABEL}>Headline</span>
        <input
          className={INPUT}
          value={value.headline ?? ""}
          onChange={(e) => patch({ headline: e.target.value })}
        />
      </label>
      <label className={FIELD}>
        <span className={LABEL}>Body</span>
        <textarea
          className={INPUT}
          rows={3}
          value={value.body ?? ""}
          onChange={(e) => patch({ body: e.target.value })}
        />
      </label>

      {cta("primaryCta", "Primary CTA")}
      {cta("secondaryCta", "Secondary CTA")}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Media mode</span>
          <select
            className={INPUT}
            value={value.mediaMode}
            onChange={(e) =>
              patch({
                mediaMode: e.target
                  .value as EditorialSplitHeroV1["mediaMode"],
              })
            }
          >
            <option value="static">Static media</option>
            <option value="selected">Selected talent (follow-on)</option>
            <option value="dynamic">Dynamic talent (follow-on)</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Media side (desktop)</span>
          <select
            className={INPUT}
            value={value.mediaSide}
            onChange={(e) =>
              patch({
                mediaSide: e.target
                  .value as EditorialSplitHeroV1["mediaSide"],
              })
            }
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Mobile order</span>
          <select
            className={INPUT}
            value={value.mobileOrder}
            onChange={(e) =>
              patch({
                mobileOrder: e.target
                  .value as EditorialSplitHeroV1["mobileOrder"],
              })
            }
          >
            <option value="text-first">Text first</option>
            <option value="media-first">Media first</option>
          </select>
        </label>
      </div>

      {value.mediaMode !== "static" ? (
        <p className="text-[11px] text-muted-foreground">
          Selected/dynamic talent media is a documented follow-on (couples to
          the cache-trimmed featured DTO). Static media renders meanwhile.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className={FIELD}>
            <span className={LABEL}>Media URL</span>
            <input
              className={INPUT}
              placeholder="https://…"
              value={value.mediaUrl ?? ""}
              onChange={(e) => patch({ mediaUrl: e.target.value })}
            />
          </label>
          <label className={FIELD}>
            <span className={LABEL}>Media alt text</span>
            <input
              className={INPUT}
              value={value.mediaAlt ?? ""}
              onChange={(e) => patch({ mediaAlt: e.target.value })}
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Media ratio</span>
          <select
            className={INPUT}
            value={value.mediaRatio}
            onChange={(e) =>
              patch({
                mediaRatio: e.target
                  .value as EditorialSplitHeroV1["mediaRatio"],
              })
            }
          >
            <option value="4/3">4 / 3</option>
            <option value="3/4">3 / 4</option>
            <option value="1/1">1 / 1</option>
            <option value="16/9">16 / 9</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Overlay strength</span>
          <select
            className={INPUT}
            value={value.overlayStrength}
            onChange={(e) =>
              patch({
                overlayStrength: e.target
                  .value as EditorialSplitHeroV1["overlayStrength"],
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

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
