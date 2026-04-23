"use client";

/**
 * M7 — Theme preset picker.
 *
 * Drop-in card above the granular token editor. Renders every registered
 * preset as a swatch card; clicking "Apply" submits `applyThemePresetAction`
 * which merges the preset's token bundle into the draft. No token changes
 * go live until the operator presses "Publish" on the main editor.
 *
 * Why a separate component (not inline in design-editor.tsx):
 *   - Different state model: picker doesn't own the token form, only the
 *     action-state of the apply submission.
 *   - Cleaner RSC boundary: editor already has a lot of field-level state,
 *     so bundling preset-apply into it would muddy the form.
 *   - Future homepage-sections / card-family / profile-family pickers will
 *     copy this component shape, so keeping it isolated makes the pattern
 *     visible.
 */

import { useActionState } from "react";

import { applyThemePresetAction, type DesignActionState } from "./actions";

export interface ThemePresetView {
  slug: string;
  label: string;
  summary: string;
  idealFor: string[];
  previewSwatch?: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
}

interface Props {
  presets: ReadonlyArray<ThemePresetView>;
  activeSlug: string | null;
  version: number;
  canEdit: boolean;
}

export function ThemePresetPicker({ presets, activeSlug, version, canEdit }: Props) {
  const [state, action, pending] = useActionState<DesignActionState, FormData>(
    applyThemePresetAction,
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Theme preset
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a preset family to populate every design token at once. You
            can still tweak individual tokens below. Applying lands in draft —
            publish to go live.
          </p>
        </div>
        {activeSlug ? (
          <span className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs">
            Active: <strong className="font-medium">{activeSlug}</strong>
          </span>
        ) : (
          <span className="rounded-full border border-dashed border-border/60 px-3 py-1 text-xs text-muted-foreground">
            Custom / no preset
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {presets.map((preset) => {
          const isActive = preset.slug === activeSlug;
          return (
            <form
              key={preset.slug}
              action={action}
              className="group relative flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 transition-all hover:border-border"
              data-active={isActive || undefined}
              style={
                isActive
                  ? { boxShadow: "0 0 0 2px var(--ring) inset" }
                  : undefined
              }
            >
              <input type="hidden" name="presetSlug" value={preset.slug} />
              <input type="hidden" name="expectedVersion" value={version} />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold">{preset.label}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {preset.summary}
                  </p>
                </div>
                {preset.previewSwatch ? (
                  <div className="flex gap-1">
                    {(
                      [
                        preset.previewSwatch.background,
                        preset.previewSwatch.primary,
                        preset.previewSwatch.secondary,
                        preset.previewSwatch.accent,
                      ] as const
                    ).map((hex, i) => (
                      <span
                        key={`${preset.slug}-swatch-${i}`}
                        className="h-6 w-6 rounded-full border border-border/60"
                        style={{ background: hex }}
                        aria-hidden
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              {preset.idealFor.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {preset.idealFor.map((tag) => (
                    <span
                      key={`${preset.slug}-${tag}`}
                      className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <span className="text-xs text-muted-foreground">
                  {isActive ? "Currently active · re-apply to reset tokens" : "Not applied"}
                </span>
                <button
                  type="submit"
                  disabled={!canEdit || pending}
                  className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Applying…" : isActive ? "Re-apply" : "Apply preset"}
                </button>
              </div>
            </form>
          );
        })}
      </div>

      {state ? (
        state.ok ? (
          <p className="text-xs text-emerald-600">{state.message}</p>
        ) : (
          <p className="text-xs text-destructive">{state.error}</p>
        )
      ) : null}
    </div>
  );
}
