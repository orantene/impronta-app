"use client";

/**
 * Phase 11 — section blueprint picker.
 *
 * Renders the curated blueprints for the section's type as a horizontal
 * row of tiles. Clicking one merges the blueprint's `props` into the
 * section's current props (shallow). Sections without a blueprint set
 * just render `null` — the picker is opt-in.
 */

import { useState, type ReactElement } from "react";
import { getBlueprintsFor } from "./blueprints";

interface Props<T extends Record<string, unknown>> {
  sectionTypeKey: string;
  current: T;
  onApply: (next: T) => void;
}

export function BlueprintPicker<T extends Record<string, unknown>>({
  sectionTypeKey,
  current,
  onApply,
}: Props<T>): ReactElement | null {
  const blueprints = getBlueprintsFor(sectionTypeKey);
  const [appliedSlug, setAppliedSlug] = useState<string | null>(null);
  if (blueprints.length === 0) return null;

  return (
    <details className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
      <summary className="cursor-pointer select-none text-sm font-medium">
        Layout blueprints
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          One-click shape presets
        </span>
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {blueprints.map((bp) => {
          const isApplied = appliedSlug === bp.slug;
          return (
            <button
              key={bp.slug}
              type="button"
              onClick={() => {
                onApply({ ...current, ...bp.props } as T);
                setAppliedSlug(bp.slug);
              }}
              className={`flex flex-col items-start gap-1 rounded-md border p-2 text-left transition ${
                isApplied
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-border/60 bg-background hover:border-zinc-900"
              }`}
              title={bp.description}
            >
              <span className={`text-[11px] font-semibold ${isApplied ? "text-white" : "text-foreground"}`}>
                {bp.label}
              </span>
              <span className={`line-clamp-2 text-[10px] leading-snug ${isApplied ? "text-white/80" : "text-muted-foreground"}`}>
                {bp.description}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Blueprints overwrite layout fields only — your copy stays. Click Save draft to persist.
      </p>
    </details>
  );
}
