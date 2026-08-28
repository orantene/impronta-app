"use client";

/**
 * CatalogBrowser — the "All Google Fonts" pane of the font picker.
 *
 * Browses the FULL checked-in catalogue (1,800+ latin families, popularity
 * sorted), not the curated twenty. The catalogue module is `import()`ed on
 * first open so its ~70 KB of data stays out of the editor's main chunk, and
 * the pane self-limits to a page of tiles with search/category narrowing —
 * live previews load one combined css2 stylesheet (weight 400 only) per
 * visible page, so browsing never pulls hundreds of font files.
 */

import { useEffect, useMemo, useState } from "react";

import type {
  GoogleFontMeta,
} from "@/lib/site-admin/builder-node/fonts-catalog";
import type { BuilderFontCategory } from "@/lib/site-admin/builder-node/fonts-registry";
import { ensureFontStylesheet } from "./font-css";

type CatalogModule = typeof import("@/lib/site-admin/builder-node/fonts-catalog");

const PAGE_SIZE = 24;

const CATEGORY_LABEL: Record<BuilderFontCategory, string> = {
  sans: "Sans",
  serif: "Serif",
  display: "Display",
  script: "Script",
  mono: "Mono",
};

let modulePromise: Promise<CatalogModule> | null = null;
function loadCatalogModule(): Promise<CatalogModule> {
  if (!modulePromise) {
    modulePromise = import("@/lib/site-admin/builder-node/fonts-catalog");
  }
  return modulePromise;
}

export function CatalogBrowser({
  current,
  onPick,
}: {
  /** The currently selected bare family name, if any. */
  current: string | null;
  /** Called with the stored font-family value (family + real fallback). */
  onPick: (cssFamily: string) => void;
}) {
  const [mod, setMod] = useState<CatalogModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BuilderFontCategory | "all">("all");

  useEffect(() => {
    let alive = true;
    loadCatalogModule().then(
      (m) => {
        if (alive) setMod(m);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const catalog = useMemo(() => (mod ? mod.loadGoogleFontsCatalog() : []), [mod]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter((f) => {
      if (filter !== "all" && f.category !== filter) return false;
      if (query && !f.family.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [catalog, filter, search]);

  const visible = filtered.slice(0, PAGE_SIZE);

  // One combined stylesheet (weight 400 per family) for the visible page, so
  // the tiles render in their own face without a per-family request storm.
  useEffect(() => {
    if (!mod || visible.length === 0) return;
    const href = mod.buildGoogleFontsHrefFromUsage(
      visible.map((f) => ({ value: f.family, weights: [400] })),
    );
    if (href) {
      ensureFontStylesheet(href, `gf-page:${visible.map((f) => f.family).join(",")}`);
    }
  }, [mod, visible]);

  const pick = (meta: GoogleFontMeta) => {
    if (!mod) return;
    // Load the face the canvas will need right away (default usage weights).
    const href = mod.buildGoogleFontsHrefFromUsage([{ value: meta.family }]);
    if (href) ensureFontStylesheet(href, `gf-family:${meta.family}`);
    onPick(mod.cssFamilyForGoogleFont(meta));
  };

  if (failed) {
    return (
      <div className="p-4 text-center text-[11px] text-stone-500">
        The font catalogue could not load. Reload the editor and try again.
      </div>
    );
  }
  if (!mod) {
    return (
      <div className="p-4 text-center text-[11px] text-stone-500">
        Loading the Google Fonts catalogue…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {(["all", "sans", "serif", "display", "script", "mono"] as const).map((c) => (
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
          placeholder={`Search ${catalog.length} fonts…`}
          className="ml-auto w-36 rounded-lg border border-[rgba(24,24,27,0.16)] bg-white px-2 py-1 text-[11px] text-stone-800 placeholder:text-stone-500 hover:border-[rgba(24,24,27,0.28)] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 transition-[border-color,box-shadow]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-[#e5e0d5] bg-[#faf9f6]/40 p-1.5">
        {visible.map((f) => (
          <button
            key={f.family}
            type="button"
            onClick={() => pick(f)}
            style={{ fontFamily: `"${f.family}"` }}
            className={`flex flex-col items-start rounded-lg border px-2 py-1.5 text-left transition ${
              current === f.family
                ? "border-indigo-400 bg-indigo-50"
                : "border-[#e5e0d5] bg-[#faf9f6] hover:border-stone-300"
            }`}
          >
            <span className="text-[14px] leading-tight text-stone-800">{f.family}</span>
            <span className="text-[9px] uppercase tracking-wide text-stone-500">
              {CATEGORY_LABEL[f.category]}
              {f.vf ? " · Variable" : ""}
              {f.italicWeights.length > 0 ? " · Italic" : ""}
            </span>
          </button>
        ))}
        {filtered.length === 0 ? (
          <div className="col-span-2 p-4 text-center text-[11px] text-stone-500">
            No fonts match.
          </div>
        ) : null}
        {filtered.length > PAGE_SIZE ? (
          <div className="col-span-2 px-1 py-1 text-center text-[10px] text-stone-500">
            Showing {PAGE_SIZE} of {filtered.length}. Search to narrow.
          </div>
        ) : null}
      </div>
    </div>
  );
}
