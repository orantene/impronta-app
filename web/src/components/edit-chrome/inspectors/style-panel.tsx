"use client";

/**
 * StylePanel — decorative + surface treatment for a section.
 *
 * Shared across types:
 *   - background palette token (presentation.background)
 *   - top divider (presentation.dividerTop)
 *
 * Type-specific extras (when the selected section exposes them):
 *   - hero        → mood + overlay flavor (live on root payload, not
 *                   presentation)
 *
 * Patches for presentation fields are wrapped under `__presentation` so the
 * dock's `handleStylePatch` routes them to the right merger. Root-level
 * patches go direct.
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
const HINT = "text-[11px] leading-tight text-zinc-500";

const HERO_OVERLAY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "gradient-scrim", label: "Gradient scrim" },
  { value: "aurora", label: "Aurora" },
  { value: "soft-vignette", label: "Soft vignette" },
];

const HERO_MOOD_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  hint: string;
}> = [
  { value: "", label: "Default", hint: "Tenant theme picks the rhythm." },
  { value: "clean", label: "Clean", hint: "Tight rhythm, compact type." },
  {
    value: "editorial",
    label: "Editorial",
    hint: "Serif display, generous spacing.",
  },
  { value: "cinematic", label: "Cinematic", hint: "Oversized, dramatic." },
];

interface StylePanelProps {
  sectionTypeKey: string;
  draftProps: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function StylePanel({
  sectionTypeKey,
  draftProps,
  onPatch,
}: StylePanelProps) {
  const presentation =
    (draftProps.presentation as Record<string, unknown> | undefined) ?? {};
  const present = <K extends string>(key: K): string =>
    (presentation[key] as string | undefined) ?? "";
  const root = <K extends string>(key: K): string =>
    (draftProps[key] as string | undefined) ?? "";

  return (
    <div className="flex flex-col gap-6">
      <section className={SECTION}>
        <div className={SECTION_TITLE}>Surface</div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>
            {PRESENTATION_FIELD_LABELS.background}
          </label>
          <select
            className={SELECT}
            value={present("background")}
            onChange={(e) =>
              onPatch({
                __presentation: { background: e.target.value || undefined },
              })
            }
          >
            <option value="">Match canvas</option>
            {PRESENTATION_OPTIONS.background.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>
            {PRESENTATION_FIELD_LABELS.dividerTop}
          </label>
          <select
            className={SELECT}
            value={present("dividerTop")}
            onChange={(e) =>
              onPatch({
                __presentation: { dividerTop: e.target.value || undefined },
              })
            }
          >
            <option value="">None</option>
            {PRESENTATION_OPTIONS.dividerTop.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {sectionTypeKey === "hero" ? (
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Hero treatment</div>
          <div className={FIELD_GROUP}>
            <label className={LABEL}>Mood</label>
            <select
              className={SELECT}
              value={root("mood")}
              onChange={(e) => onPatch({ mood: e.target.value || undefined })}
            >
              {HERO_MOOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className={HINT}>
              {HERO_MOOD_OPTIONS.find((o) => o.value === root("mood"))?.hint ??
                ""}
            </p>
          </div>
          <div className={FIELD_GROUP}>
            <label className={LABEL}>Overlay</label>
            <select
              className={SELECT}
              value={root("overlay")}
              onChange={(e) =>
                onPatch({ overlay: e.target.value || undefined })
              }
            >
              {HERO_OVERLAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </section>
      ) : null}
    </div>
  );
}
