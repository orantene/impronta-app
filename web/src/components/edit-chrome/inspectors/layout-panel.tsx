"use client";

/**
 * LayoutPanel — shared Layout tab for every section type.
 *
 * Reads/writes the platform `presentation` sub-schema: container width,
 * padding, alignment, mobile stack, visibility, top divider. Every section
 * inherits these via `sectionPresentationSchema`, so the panel works
 * uniformly regardless of type.
 *
 * Emits patches (not whole values) — InspectorDock's `handlePresentationPatch`
 * merges into draftProps.presentation and strips empty keys so the server
 * treats them as "unset → theme default" instead of invalid enum values.
 */

import {
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
} from "@/lib/site-admin/sections/shared/presentation";

const FIELD_GROUP = "flex flex-col gap-1";
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";
const SELECT =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none";
const SECTION = "flex flex-col gap-3";
const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400";

interface LayoutPanelProps {
  presentation: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function LayoutPanel({ presentation, onPatch }: LayoutPanelProps) {
  const val = <K extends string>(key: K): string =>
    (presentation[key] as string | undefined) ?? "";

  return (
    <div className="flex flex-col gap-6">
      <section className={SECTION}>
        <div className={SECTION_TITLE}>Frame</div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>
            {PRESENTATION_FIELD_LABELS.containerWidth}
          </label>
          <select
            className={SELECT}
            value={val("containerWidth")}
            onChange={(e) =>
              onPatch({ containerWidth: e.target.value || undefined })
            }
          >
            <option value="">Theme default</option>
            {PRESENTATION_OPTIONS.containerWidth.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className={FIELD_GROUP}>
            <label className={LABEL}>
              {PRESENTATION_FIELD_LABELS.paddingTop}
            </label>
            <select
              className={SELECT}
              value={val("paddingTop")}
              onChange={(e) =>
                onPatch({ paddingTop: e.target.value || undefined })
              }
            >
              <option value="">Default</option>
              {PRESENTATION_OPTIONS.paddingTop.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className={FIELD_GROUP}>
            <label className={LABEL}>
              {PRESENTATION_FIELD_LABELS.paddingBottom}
            </label>
            <select
              className={SELECT}
              value={val("paddingBottom")}
              onChange={(e) =>
                onPatch({ paddingBottom: e.target.value || undefined })
              }
            >
              <option value="">Default</option>
              {PRESENTATION_OPTIONS.paddingBottom.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className={SECTION}>
        <div className={SECTION_TITLE}>Alignment</div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>
            {PRESENTATION_FIELD_LABELS.align}
          </label>
          <select
            className={SELECT}
            value={val("align")}
            onChange={(e) =>
              onPatch({ align: e.target.value || undefined })
            }
          >
            <option value="">Theme default</option>
            {PRESENTATION_OPTIONS.align.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className={SECTION}>
        <div className={SECTION_TITLE}>Responsive</div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>
            {PRESENTATION_FIELD_LABELS.mobileStack}
          </label>
          <select
            className={SELECT}
            value={val("mobileStack")}
            onChange={(e) =>
              onPatch({ mobileStack: e.target.value || undefined })
            }
          >
            <option value="">Default (stack)</option>
            {PRESENTATION_OPTIONS.mobileStack.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>
            {PRESENTATION_FIELD_LABELS.visibility}
          </label>
          <select
            className={SELECT}
            value={val("visibility")}
            onChange={(e) =>
              onPatch({ visibility: e.target.value || undefined })
            }
          >
            <option value="">Always visible</option>
            {PRESENTATION_OPTIONS.visibility.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>
    </div>
  );
}
