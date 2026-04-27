"use client";

/**
 * CompositionLibraryOverlay — section picker for the in-place editor.
 *
 * Phase D — rebuilt to match prototype §8:
 *   - Drawer chrome (existing kit) preserved.
 *   - Search input first; auto-focuses on open; matches name + description
 *     across ALL section types (default + advanced) regardless of toggle.
 *   - Eight category tabs (Hero / Trust / Showcase / Story / Convert /
 *     Form / Embed / Navigation), plus an "All" pseudo-tab. Counts shown.
 *   - Tile grid grouped by category. Each tile carries a wireframe
 *     preview, name, one-line description, and optional pill tag
 *     (`new` blue / `premium` neutral).
 *   - "Show advanced sections" toggle (off by default) reveals the
 *     remaining ~27 types in their category groups, each with an
 *     "Advanced" pill.
 *   - When opened from a slot inserter, allowed-types filter still
 *     applies — a slot may only accept a subset of the catalog.
 *   - Click a tile → `insertSection(target, typeKey)` runs the existing
 *     create + splice + CAS flow. Picker closes on success.
 *
 * Slot context messaging (`Inserting into <slot>`) preserved from §8.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { useEditContext } from "./edit-context";
import { SectionWire } from "./starter-wireframes";
import { CHROME, Drawer, DrawerHead, DrawerBody } from "./kit";

// Category → tab label. Ordering follows the §8 mockup left-to-right
// rhythm: hero opens, trust + proof, showcase + story (the bulk),
// convert + form (the asks), embed + navigation (the technical tail).
const CATEGORY_ORDER = [
  "hero",
  "trust",
  "showcase",
  "story",
  "convert",
  "form",
  "embed",
  "navigation",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  hero: "Hero",
  trust: "Trust",
  showcase: "Showcase",
  story: "Story",
  convert: "Convert",
  form: "Form",
  embed: "Embed",
  navigation: "Navigation",
};

type ActiveTab = "all" | (typeof CATEGORY_ORDER)[number];

export function CompositionLibraryOverlay() {
  const {
    libraryTarget,
    closeLibrary,
    slotDefs,
    library,
    insertSection,
  } = useEditContext();
  const [busyTypeKey, setBusyTypeKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const queryInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state + auto-focus the search each time the library opens so the
  // operator can start typing immediately — a premium editor habit.
  useEffect(() => {
    if (!libraryTarget) return;
    setQuery("");
    setActiveTab("all");
    setShowAdvanced(false);
    setError(null);
    const t = setTimeout(() => queryInputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [libraryTarget]);

  useEffect(() => {
    if (!libraryTarget) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLibrary();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [libraryTarget, closeLibrary]);

  const slotDef = useMemo(() => {
    if (!libraryTarget) return null;
    return slotDefs.find((s) => s.key === libraryTarget.slotKey) ?? null;
  }, [libraryTarget, slotDefs]);

  // Slot-allowed filter is the floor: every other filter narrows from this
  // set. If the slot specifies allowedSectionTypes, advanced toggle still
  // applies but is meaningless if all allowed types are default-tier.
  const slotFiltered = useMemo(() => {
    if (!slotDef?.allowedSectionTypes) return library;
    const allowed = new Set(slotDef.allowedSectionTypes);
    return library.filter((l) => allowed.has(l.typeKey));
  }, [library, slotDef]);

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // Visible set = slot-filtered ∩ (default-tier OR advanced-toggle-on OR
  // search-active) ∩ (active tab OR "all"). Search bypasses the tier toggle
  // so a power user can jump to any type by typing its name.
  const visible = useMemo(() => {
    return slotFiltered.filter((entry) => {
      if (!isSearching && !showAdvanced && !entry.inDefault) return false;
      if (activeTab !== "all" && entry.category !== activeTab) return false;
      if (isSearching) {
        const hay = `${entry.label} ${entry.description} ${entry.typeKey}`.toLowerCase();
        if (!hay.includes(trimmedQuery)) return false;
      }
      return true;
    });
  }, [slotFiltered, showAdvanced, activeTab, isSearching, trimmedQuery]);

  // Category counts for the tab strip — counted against the slot-filtered
  // set respecting current tier toggle (so the count reflects what the
  // operator will actually see when they click that tab). Search is
  // intentionally excluded from counts: the tab strip is a category map,
  // not a search results facet.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of slotFiltered) {
      if (!showAdvanced && !entry.inDefault) continue;
      counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    }
    return counts;
  }, [slotFiltered, showAdvanced]);

  const totalForTabs = useMemo(
    () =>
      slotFiltered.reduce((acc, entry) => {
        if (!showAdvanced && !entry.inDefault) return acc;
        return acc + 1;
      }, 0),
    [slotFiltered, showAdvanced],
  );

  // Group visible tiles by category; CATEGORY_ORDER drives section order.
  const grouped = useMemo(() => {
    const by: Record<string, typeof visible> = {};
    for (const entry of visible) (by[entry.category] ??= []).push(entry);
    return by;
  }, [visible]);

  async function handlePick(typeKey: string) {
    if (!libraryTarget) return;
    setBusyTypeKey(typeKey);
    setError(null);
    const res = await insertSection(libraryTarget, typeKey);
    setBusyTypeKey(null);
    if (!res.ok) {
      setError(res.error ?? "Couldn't add the section.");
      return;
    }
    closeLibrary();
  }

  const drawerOpen = !!libraryTarget;
  const totalSearchable = slotFiltered.length;
  const advancedHiddenCount =
    slotFiltered.length - slotFiltered.filter((e) => e.inDefault).length;

  return (
    <Drawer kind="picker" open={drawerOpen} zIndex={110}>
      <DrawerHead
        eyebrow="Add section"
        title="Pick a section"
        meta={
          slotDef
            ? `Inserting into ${slotDef.label} · ${totalForTabs} type${totalForTabs === 1 ? "" : "s"} available`
            : `${totalForTabs} types`
        }
        onClose={closeLibrary}
      />

      {/* Search + tier toggle row: stable above the scrollable grid */}
      <div
        className="px-[18px] py-3"
        style={{ borderBottom: `1px solid ${CHROME.line}` }}
      >
        <div className="relative">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={queryInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              totalSearchable === 0
                ? "No sections available"
                : `Search ${totalSearchable} section type${totalSearchable === 1 ? "" : "s"} — gallery, hero, cta, testimonials…`
            }
            className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        {/* Tab strip: All + 8 category tabs (only those with at least one
            tile in the current visible-tier set are shown). */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Tab
            active={activeTab === "all"}
            onClick={() => setActiveTab("all")}
            label="All"
            count={totalForTabs}
          />
          {CATEGORY_ORDER.map((cat) => {
            const n = categoryCounts[cat] ?? 0;
            if (n === 0) return null;
            return (
              <Tab
                key={cat}
                active={activeTab === cat}
                onClick={() => setActiveTab(cat)}
                label={CATEGORY_LABEL[cat] ?? cat}
                count={n}
              />
            );
          })}

          {/* Advanced toggle — quiet pill on the right, distinct from
              category tabs. Only shown when there ARE advanced tiles to
              reveal in the current slot scope. */}
          {advancedHiddenCount > 0 ? (
            <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(e) => setShowAdvanced(e.target.checked)}
                className="h-3 w-3 cursor-pointer accent-zinc-900"
              />
              <span>Show advanced sections</span>
            </label>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="border-b border-red-100 bg-red-50 px-[18px] py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <DrawerBody>
        {visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            {isSearching
              ? `No section types match "${query.trim()}".`
              : "No section types available for this slot."}
          </p>
        ) : (
          <div className="space-y-6">
            {CATEGORY_ORDER.map((cat) => {
              const entries = grouped[cat];
              if (!entries || entries.length === 0) return null;
              return (
                <section key={cat}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      {CATEGORY_LABEL[cat] ?? cat}
                    </h3>
                    <span className="text-[10px] text-zinc-400 tabular-nums">
                      {entries.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {entries.map((entry) => {
                      const busy = busyTypeKey === entry.typeKey;
                      const isAdvanced = !entry.inDefault;
                      return (
                        <button
                          key={entry.typeKey}
                          type="button"
                          disabled={busyTypeKey !== null}
                          onClick={() => void handlePick(entry.typeKey)}
                          className="group flex flex-col items-stretch gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-left transition hover:-translate-y-px hover:border-zinc-900 hover:shadow-md disabled:opacity-50 disabled:hover:border-zinc-200 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                        >
                          <div className="relative overflow-hidden rounded-md bg-zinc-50 p-2">
                            <SectionWire
                              typeKey={entry.typeKey}
                              className="h-20 w-full text-zinc-400"
                            />
                            {entry.tag ? (
                              <span
                                className={
                                  entry.tag === "new"
                                    ? "absolute right-2 top-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-200"
                                    : "absolute right-2 top-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-700 ring-1 ring-inset ring-zinc-300"
                                }
                              >
                                {entry.tag}
                              </span>
                            ) : null}
                            {isAdvanced ? (
                              <span className="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                                Advanced
                              </span>
                            ) : null}
                          </div>
                          <div className="flex w-full items-center justify-between gap-2 px-0.5">
                            <span className="text-sm font-semibold text-zinc-900">
                              {entry.label}
                            </span>
                            {busy ? (
                              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                Adding…
                              </span>
                            ) : null}
                          </div>
                          <p className="line-clamp-2 px-0.5 text-xs leading-relaxed text-zinc-500">
                            {entry.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </DrawerBody>
    </Drawer>
  );
}

interface TabProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}
function Tab({ active, onClick, label, count }: TabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white"
          : "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-200"
      }
    >
      <span>{label}</span>
      <span
        className={
          active
            ? "tabular-nums text-white/70"
            : "tabular-nums text-zinc-400"
        }
      >
        {count}
      </span>
    </button>
  );
}
