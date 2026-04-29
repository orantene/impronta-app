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

type Slot = "heading" | "body";

interface GoogleFont {
  family: string;
  category: "sans" | "serif" | "display" | "mono";
  /** Weights to load when this font is picked. Comma-joined for the URL. */
  weights: string;
}

const FONT_LIBRARY: ReadonlyArray<GoogleFont> = [
  // Sans
  { family: "Inter", category: "sans", weights: "400;500;600;700" },
  { family: "Manrope", category: "sans", weights: "400;500;600;700" },
  { family: "DM Sans", category: "sans", weights: "400;500;700" },
  { family: "Work Sans", category: "sans", weights: "400;500;600" },
  { family: "Outfit", category: "sans", weights: "400;500;600;700" },
  { family: "Plus Jakarta Sans", category: "sans", weights: "400;500;600" },
  // Serif
  { family: "Playfair Display", category: "serif", weights: "400;500;700" },
  { family: "Cormorant Garamond", category: "serif", weights: "400;500;600" },
  { family: "EB Garamond", category: "serif", weights: "400;500;600" },
  { family: "Libre Caslon Text", category: "serif", weights: "400;700" },
  { family: "Fraunces", category: "serif", weights: "400;500;600;700" },
  { family: "Lora", category: "serif", weights: "400;500;600;700" },
  // Display
  { family: "Bricolage Grotesque", category: "display", weights: "400;600;700" },
  { family: "Editorial New", category: "display", weights: "400;700" },
  { family: "Italiana", category: "display", weights: "400" },
  { family: "Cinzel", category: "display", weights: "400;600;700" },
  // Mono
  { family: "JetBrains Mono", category: "mono", weights: "400;500;700" },
  { family: "IBM Plex Mono", category: "mono", weights: "400;500;700" },
];

const CATEGORY_LABEL: Record<GoogleFont["category"], string> = {
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
  const [filter, setFilter] = useState<GoogleFont["category"] | "all">("all");
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const filtered = FONT_LIBRARY.filter((f) => {
      if (filter !== "all" && f.category !== filter) return false;
      if (search && !f.family.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
    const out = new Map<GoogleFont["category"], GoogleFont[]>();
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
    const family = parseFirstFamily(value);
    if (!family) return;
    const def = FONT_LIBRARY.find((f) => f.family === family);
    if (!def) return;
    ensureFontLoaded(def);
  }, [value]);

  const current = parseFirstFamily(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Google Fonts — {slot}
        </span>
        {current ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-md px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/50"
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
            className={`rounded-md px-2 py-0.5 text-[10px] ${
              filter === c
                ? "border border-zinc-300 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "border border-transparent bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search…"
          className="ml-auto w-32 rounded-md border border-border/60 bg-background px-2 py-0.5 text-[11px]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div
        className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-1.5"
      >
        {[...grouped.entries()].flatMap(([cat, items]) => [
          <div
            key={`h-${cat}`}
            className="col-span-2 px-1 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground"
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
                onChange(`"${f.family}", ${fallbackFor(f.category)}`);
              }}
            />
          )),
        ])}
        {grouped.size === 0 ? (
          <div className="col-span-2 p-4 text-center text-[11px] text-muted-foreground">
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
  font: GoogleFont;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{ fontFamily: `"${font.family}", ${fallbackFor(font.category)}` }}
      className={`flex flex-col items-start rounded-md border px-2 py-1.5 text-left transition ${
        selected
          ? "border-zinc-900 bg-white"
          : "border-border/40 bg-background hover:border-border"
      }`}
    >
      <span className="text-[14px] leading-tight">{font.family}</span>
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
        Aa Bb 0123
      </span>
    </button>
  );
}

function fallbackFor(category: GoogleFont["category"]): string {
  switch (category) {
    case "sans":
      return "system-ui, sans-serif";
    case "serif":
      return "Georgia, serif";
    case "display":
      return "Georgia, serif";
    case "mono":
      return 'ui-monospace, "SF Mono", Menlo, monospace';
  }
}

function parseFirstFamily(value: string): string | null {
  if (!value) return null;
  const m = value.match(/^"?([^",]+)"?/);
  return m ? m[1].trim() : null;
}

const LOADED = new Set<string>();

function ensureFontLoaded(font: GoogleFont): void {
  if (typeof document === "undefined") return;
  if (LOADED.has(font.family)) return;
  LOADED.add(font.family);
  const family = font.family.replace(/ /g, "+");
  const href = `https://fonts.googleapis.com/css2?family=${family}:wght@${font.weights}&display=swap`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-google-font", font.family);
  document.head.appendChild(link);
}
