"use client";

/**
 * Phase 13 — Google Fonts picker.
 *
 * Curated list of high-quality Google Fonts, grouped by character (sans
 * / serif / display / mono). Selecting a family:
 *   1. Updates the corresponding theme token (`typography.heading-font-
 *      family` or `typography.body-font-family`).
 *   2. Lazy-injects a `<link rel="stylesheet">` against
 *      fonts.googleapis.com so the editor canvas previews with the real
 *      family without a full reload.
 *
 * The token is a free string (CSS font-family value). The storefront
 * picks it up via the same `--site-heading-font` / `--site-body-font`
 * CSS vars that drive the existing presets — when this token is set,
 * the preset is overridden via a higher-specificity selector emitted
 * downstream (kept out of this picker so the picker itself stays
 * presentational).
 */

import { useEffect, useMemo, useState } from "react";

import {
  BUILDER_FONT_REGISTRY,
  buildGoogleFontsHrefForFamilies,
  cssFamilyForBuilderFont,
  firstFontFamily,
  resolveBuilderFont,
  type BuilderFontCategory,
  type BuilderFontDefinition,
} from "@/lib/site-admin/builder-node/fonts-registry";

type Slot = "heading" | "body";

const CATEGORY_LABEL: Record<BuilderFontCategory, string> = {
  sans: "Sans",
  serif: "Serif",
  display: "Display",
  mono: "Mono",
};

interface GoogleFontPickerProps {
  slot: Slot;
  /** Current resolved font-family token value (may be empty). */
  value: string;
  onChange: (next: string) => void;
}

export function GoogleFontPicker({ slot, value, onChange }: GoogleFontPickerProps) {
  const [filter, setFilter] = useState<BuilderFontCategory | "all">("all");
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const filtered = BUILDER_FONT_REGISTRY.filter((f) => {
      if (filter !== "all" && f.category !== filter) return false;
      if (search && !f.family.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const out = new Map<BuilderFontCategory, BuilderFontDefinition[]>();
    for (const f of filtered) {
      if (!out.has(f.category)) out.set(f.category, []);
      out.get(f.category)!.push(f);
    }
    return out;
  }, [filter, search]);

  // Lazy-load the family the operator just picked + the currently selected
  // value so the preview button renders in the actual face.
  useEffect(() => {
    if (!value) return;
    const def = resolveBuilderFont(value);
    if (!def) return;
    ensureFontLoaded(def);
  }, [value]);

  const current = firstFontFamily(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          Fonts — {slot}
        </span>
        {current ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-lg px-2 py-0.5 text-[10px] text-stone-500 hover:bg-[#faf9f6] hover:text-stone-600 transition-colors"
          >
            Reset
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {(["all", "sans", "serif", "display", "mono"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`rounded-lg px-2 py-0.5 text-[10px] ${
              filter === c
                ? "border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                : "border border-[#e5e0d5] bg-[#faf9f6] text-stone-500 hover:bg-white hover:text-stone-700 hover:border-stone-300"
            }`}
          >
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search…"
          className="ml-auto w-32 rounded-lg border border-[#cfc7b6] bg-white px-2 py-1 text-[11px] text-stone-800 placeholder:text-stone-500 hover:border-[#b3a892] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 transition-[border-color,box-shadow]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div
        className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-[#e5e0d5] bg-[#faf9f6]/40 p-1.5"
      >
        {[...grouped.entries()].flatMap(([cat, items]) => [
          <div
            key={`h-${cat}`}
            className="col-span-2 px-1 pt-1 text-[10px] uppercase tracking-wide text-stone-500"
          >
            {CATEGORY_LABEL[cat]}
          </div>,
          ...items.map((f) => (
            <FontTile
              key={f.family}
              font={f}
              selected={current === f.family}
              onPick={() => {
                ensureFontLoaded(f);
                onChange(cssFamilyForBuilderFont(f));
              }}
            />
          )),
        ])}
        {grouped.size === 0 ? (
          <div className="col-span-2 p-4 text-center text-[11px] text-stone-500">
            No fonts match.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FontTile({
  font,
  selected,
  onPick,
}: {
  font: BuilderFontDefinition;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{ fontFamily: font.cssFamily }}
      className={`flex flex-col items-start rounded-lg border px-2 py-1.5 text-left transition ${
        selected
          ? "border-indigo-400 bg-indigo-50"
          : "border-[#e5e0d5] bg-[#faf9f6] hover:border-stone-300"
      }`}
    >
      <span className="text-[14px] leading-tight text-stone-800">{font.family}</span>
      <span className="text-[9px] uppercase tracking-wide text-stone-500">
        {font.source === "bundled" ? "Bundled" : "Google"} · Aa Bb 0123
      </span>
    </button>
  );
}

const LOADED = new Set<string>();

function ensureFontLoaded(font: BuilderFontDefinition): void {
  if (typeof document === "undefined") return;
  if (font.source === "bundled") return;
  if (LOADED.has(font.family)) return;
  // QA 2026-05-13 — defense-in-depth: even when our in-memory Set says
  // "not loaded" we still check the DOM. The Set resets on full page
  // reload (module re-init), but bfcache restores can keep the
  // injected <link> alive — re-injecting would create a duplicate
  // node that browsers tolerate but is wasteful. Cheap query + early
  // return keeps the DOM clean.
  const existing = document.querySelector(
    `link[data-google-font="${CSS.escape(font.family)}"]`,
  );
  if (existing) {
    LOADED.add(font.family);
    return;
  }
  LOADED.add(font.family);
  const href = buildGoogleFontsHrefForFamilies([font.cssFamily]);
  if (!href) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-google-font", font.family);
  document.head.appendChild(link);
}
