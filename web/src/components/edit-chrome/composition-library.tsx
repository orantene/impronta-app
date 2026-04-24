"use client";

/**
 * CompositionLibraryOverlay — section picker for the in-place editor.
 *
 * Opens when EditContext's `libraryTarget` is set (by inserter click or
 * "Add from empty slot" affordance). Shows all agency-visible section
 * types grouped by business purpose; optionally filtered to the target
 * slot's `allowedSectionTypes`.
 *
 * Click a tile → calls `insertSection(target, typeKey)` which:
 *   1. creates a new draft section with defaults
 *   2. splices it into the slot at the insert position
 *   3. saves via CAS + refreshes the server-rendered page
 *
 * Errors are surfaced inline (toast-free for Phase 3 — adds polish later).
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { useEditContext } from "./edit-context";

const PURPOSE_ORDER = [
  "hero",
  "trust",
  "feature",
  "conversion",
  "promo",
  "footer",
] as const;

const PURPOSE_LABEL: Record<string, string> = {
  hero: "Hero",
  trust: "Trust",
  feature: "Feature",
  conversion: "Conversion",
  promo: "Promo",
  footer: "Footer",
};

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
  const queryInputRef = useRef<HTMLInputElement | null>(null);

  // Reset + auto-focus the search input each time the library opens so the
  // operator can start typing immediately — a premium editor habit.
  useEffect(() => {
    if (!libraryTarget) return;
    setQuery("");
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

  const slotFiltered = useMemo(() => {
    if (!slotDef) return library;
    const allowed = slotDef.allowedSectionTypes;
    if (!allowed) return library;
    return library.filter((l) => allowed.includes(l.typeKey));
  }, [library, slotDef]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return slotFiltered;
    return slotFiltered.filter((entry) => {
      const hay = `${entry.label} ${entry.description} ${entry.typeKey}`.toLowerCase();
      return hay.includes(q);
    });
  }, [slotFiltered, query]);

  const grouped = useMemo(() => {
    const by: Record<string, typeof filtered> = {};
    for (const entry of filtered) {
      (by[entry.purpose] ??= []).push(entry);
    }
    return by;
  }, [filtered]);

  if (!libraryTarget) return null;

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

  return (
    <div
      data-edit-overlay="library"
      className="fixed inset-0 z-[110] flex items-start justify-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeLibrary();
      }}
    >
      <div className="relative mt-[56px] flex max-h-[calc(100vh-80px)] w-full max-w-[880px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Add section
            </div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-900">
              {slotDef ? `Into ${slotDef.label}` : "Pick a section"}
            </h2>
            {slotDef?.allowedSectionTypes ? (
              <p className="mt-0.5 text-xs text-zinc-500">
                This slot only accepts {slotDef.allowedSectionTypes.join(", ")}.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={closeLibrary}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Cancel
          </button>
        </header>
        {/* Search filter sits between the header and the grid so the grid
            scrolls under a stable filter input. Operators can narrow long
            libraries with "gallery", "cta", etc. without scrolling. */}
        <div className="border-b border-zinc-100 px-5 py-3">
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
                slotFiltered.length === 0
                  ? "No sections available"
                  : `Filter ${slotFiltered.length} section type${slotFiltered.length === 1 ? "" : "s"}…`
              }
              className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
        </div>
        {error ? (
          <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              {query.trim()
                ? `No section types match "${query.trim()}".`
                : "No section types available for this slot."}
            </p>
          ) : (
            <div className="space-y-6">
              {PURPOSE_ORDER.map((purpose) => {
                const entries = grouped[purpose];
                if (!entries || entries.length === 0) return null;
                return (
                  <section key={purpose}>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      {PURPOSE_LABEL[purpose] ?? purpose}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                      {entries.map((entry) => {
                        const busy = busyTypeKey === entry.typeKey;
                        return (
                          <button
                            key={entry.typeKey}
                            type="button"
                            disabled={busyTypeKey !== null}
                            onClick={() => void handlePick(entry.typeKey)}
                            className="group flex flex-col items-start gap-1.5 rounded-lg border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-900 hover:shadow-md disabled:opacity-50 disabled:hover:border-zinc-200 disabled:hover:shadow-none"
                          >
                            <div className="flex w-full items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-zinc-900">
                                {entry.label}
                              </span>
                              {busy ? (
                                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                  Adding…
                                </span>
                              ) : null}
                            </div>
                            <p className="line-clamp-3 text-xs leading-relaxed text-zinc-500">
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
        </div>
      </div>
    </div>
  );
}
