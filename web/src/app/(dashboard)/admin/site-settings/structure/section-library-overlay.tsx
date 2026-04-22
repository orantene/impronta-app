"use client";

/**
 * Section Library — visual picker overlay.
 *
 * Opens from the homepage composer when an operator clicks "+ Add from
 * library" on a slot. Renders all platform-owned section types with a
 * schematic thumbnail, businessPurpose badge, and short description.
 *
 * Click → calls `quickCreateSectionFromLibraryAction` (creates a draft
 * section with sensible defaults) → notifies the composer to slot the
 * newly-created id into the target slot in memory.
 *
 * Keyboard: ESC closes. Arrow navigation / search (v2).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";

import type {
  SectionBusinessPurpose,
  SectionMeta,
} from "@/lib/site-admin/sections/types";

import {
  quickCreateSectionFromLibraryAction,
  type LibraryActionState,
} from "./library-actions";

interface LibraryTileMeta extends SectionMeta {
  /** Agency-visible only (internal types are filtered out upstream). */
}

interface Props {
  /** When not null, overlay is open targeting this slot. */
  open: { slotKey: string; slotLabel: string } | null;
  /** Close without creating. */
  onCancel: () => void;
  /** A new section was created and should be inserted into the target slot. */
  onSectionCreated: (
    slotKey: string,
    section: {
      id: string;
      name: string;
      sectionTypeKey: string;
      status: "draft";
    },
  ) => void;
  /** Registry snapshot — injected from the server-rendered parent. */
  registry: ReadonlyArray<LibraryTileMeta>;
  /** Hook to filter tiles to types allowed by the slot (template meta). */
  allowedSectionTypes?: readonly string[] | null;
}

const PURPOSE_LABELS: Record<SectionBusinessPurpose, string> = {
  hero: "Hero",
  conversion: "Conversion",
  trust: "Trust",
  promo: "Promo",
  feature: "Feature",
  footer: "Footer",
};

const PURPOSE_ACCENT: Record<SectionBusinessPurpose, string> = {
  hero: "bg-[var(--impronta-gold)]/20 text-[var(--impronta-gold)] border-[var(--impronta-gold)]/40",
  conversion: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  trust: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  promo: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  feature: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  footer: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

const PURPOSE_ORDER: SectionBusinessPurpose[] = [
  "hero",
  "trust",
  "feature",
  "conversion",
  "promo",
  "footer",
];

/**
 * A small schematic per businessPurpose — not a screenshot, just a layout
 * cue. Keeps tiles readable at a glance without requiring per-variant
 * PNG assets. Real screenshots can drop in later via a thumbnail URL
 * field on SectionMeta.
 */
function TileSchematic({ purpose }: { purpose: SectionBusinessPurpose }) {
  switch (purpose) {
    case "hero":
      return (
        <svg viewBox="0 0 140 80" className="h-full w-full">
          <rect x="0" y="0" width="140" height="80" fill="currentColor" opacity="0.08" />
          <rect x="0" y="0" width="140" height="80" fill="url(#grad-hero)" opacity="0.35" />
          <defs>
            <linearGradient id="grad-hero" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <rect x="16" y="46" width="58" height="4" rx="1" fill="currentColor" opacity="0.9" />
          <rect x="16" y="54" width="92" height="3" rx="1" fill="currentColor" opacity="0.55" />
          <rect x="16" y="62" width="22" height="6" rx="1" fill="currentColor" opacity="0.85" />
          <rect x="42" y="62" width="22" height="6" rx="1" fill="currentColor" opacity="0.4" />
        </svg>
      );
    case "trust":
      return (
        <svg viewBox="0 0 140 80" className="h-full w-full">
          <rect x="0" y="0" width="140" height="80" fill="currentColor" opacity="0.05" />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${16 + i * 38}, 24)`}>
              <circle cx="10" cy="8" r="6" fill="currentColor" opacity="0.65" />
              <rect x="0" y="20" width="36" height="3" rx="1" fill="currentColor" opacity="0.85" />
              <rect x="0" y="26" width="28" height="2" rx="1" fill="currentColor" opacity="0.45" />
            </g>
          ))}
        </svg>
      );
    case "feature":
      return (
        <svg viewBox="0 0 140 80" className="h-full w-full">
          <rect x="0" y="0" width="140" height="80" fill="currentColor" opacity="0.05" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${10 + i * 32}, 14)`}>
              <rect width="28" height="36" rx="2" fill="currentColor" opacity="0.6" />
              <rect y="40" width="20" height="3" rx="1" fill="currentColor" opacity="0.85" />
              <rect y="46" width="26" height="2" rx="1" fill="currentColor" opacity="0.45" />
            </g>
          ))}
        </svg>
      );
    case "conversion":
      return (
        <svg viewBox="0 0 140 80" className="h-full w-full">
          <rect x="0" y="0" width="140" height="80" fill="currentColor" opacity="0.08" />
          <rect x="18" y="22" width="104" height="4" rx="1" fill="currentColor" opacity="0.9" />
          <rect x="18" y="32" width="80" height="3" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="18" y="48" width="34" height="10" rx="2" fill="currentColor" opacity="0.9" />
          <rect x="58" y="48" width="34" height="10" rx="2" fill="currentColor" opacity="0.35" />
        </svg>
      );
    case "promo":
      return (
        <svg viewBox="0 0 140 80" className="h-full w-full">
          <rect x="0" y="0" width="140" height="80" fill="currentColor" opacity="0.06" />
          <rect x="20" y="14" width="42" height="52" rx="2" fill="currentColor" opacity="0.6" />
          <rect x="72" y="24" width="48" height="3" rx="1" fill="currentColor" opacity="0.9" />
          <rect x="72" y="32" width="40" height="2" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="72" y="48" width="28" height="8" rx="1.5" fill="currentColor" opacity="0.8" />
        </svg>
      );
    case "footer":
      return (
        <svg viewBox="0 0 140 80" className="h-full w-full">
          <rect x="0" y="0" width="140" height="80" fill="currentColor" opacity="0.05" />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${10 + i * 42}, 22)`}>
              <rect width="36" height="3" rx="1" fill="currentColor" opacity="0.9" />
              <rect y="10" width="30" height="2" rx="1" fill="currentColor" opacity="0.5" />
              <rect y="16" width="26" height="2" rx="1" fill="currentColor" opacity="0.4" />
              <rect y="22" width="28" height="2" rx="1" fill="currentColor" opacity="0.4" />
            </g>
          ))}
        </svg>
      );
  }
}

export function SectionLibraryOverlay({
  open,
  onCancel,
  onSectionCreated,
  registry,
  allowedSectionTypes,
}: Props) {
  const [query, setQuery] = useState("");
  const [activePurpose, setActivePurpose] =
    useState<SectionBusinessPurpose | "all">("all");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState<
    LibraryActionState,
    FormData
  >(quickCreateSectionFromLibraryAction, undefined);

  // Close on ESC. Reset local state when the overlay mounts for a new slot.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActivePurpose("all");
      setPendingKey(null);
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // When the action resolves successfully, notify the parent and close.
  useEffect(() => {
    if (!open) return;
    if (state?.ok && pendingKey) {
      onSectionCreated(open.slotKey, state.section);
      setPendingKey(null);
    }
    if (state && !state.ok && pendingKey) {
      // Keep the overlay open so the operator can retry / pick another.
      setPendingKey(null);
    }
  }, [state, open, pendingKey, onSectionCreated]);

  // Group registry by purpose for the filter chip counts + display order.
  const byPurpose = useMemo(() => {
    const allowed = allowedSectionTypes
      ? new Set(allowedSectionTypes)
      : null;
    const filtered = registry.filter((s) => {
      if (!s.visibleToAgency) return false;
      if (allowed && !allowed.has(s.key)) return false;
      if (activePurpose !== "all" && s.businessPurpose !== activePurpose) {
        return false;
      }
      const q = query.trim().toLowerCase();
      if (q) {
        const hay = `${s.label} ${s.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const groups: Partial<
      Record<SectionBusinessPurpose, LibraryTileMeta[]>
    > = {};
    for (const s of filtered) {
      const arr = groups[s.businessPurpose] ?? [];
      arr.push(s);
      groups[s.businessPurpose] = arr;
    }
    return groups;
  }, [registry, activePurpose, query, allowedSectionTypes]);

  const purposeCounts = useMemo(() => {
    const counts: Record<SectionBusinessPurpose | "all", number> = {
      all: 0,
      hero: 0,
      trust: 0,
      feature: 0,
      conversion: 0,
      promo: 0,
      footer: 0,
    };
    const allowed = allowedSectionTypes
      ? new Set(allowedSectionTypes)
      : null;
    for (const s of registry) {
      if (!s.visibleToAgency) continue;
      if (allowed && !allowed.has(s.key)) continue;
      counts.all += 1;
      counts[s.businessPurpose] += 1;
    }
    return counts;
  }, [registry, allowedSectionTypes]);

  if (!open) return null;

  function handleTileClick(key: string) {
    if (pending) return;
    setPendingKey(key);
    const fd = new FormData();
    fd.set("sectionTypeKey", key);
    dispatch(fd);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-label="Section library"
      onClick={(e) => {
        // Click outside the overlay body cancels.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={containerRef}
        className="flex h-full w-full max-w-[720px] flex-col border-l border-border/60 bg-background shadow-2xl"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 border-b border-border/50 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Section library</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add to{" "}
              <span className="font-medium text-foreground">
                {open.slotLabel}
              </span>
              . Picking a type creates a draft section with sensible
              defaults — edit copy after.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border/60 px-3 py-1.5 text-sm transition hover:bg-muted/40"
            aria-label="Close library"
          >
            Close
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="space-y-3 border-b border-border/40 px-5 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections…"
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActivePurpose("all")}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activePurpose === "all"
                  ? "border-foreground bg-foreground/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:bg-muted/30"
              }`}
            >
              All <span className="opacity-60">{purposeCounts.all}</span>
            </button>
            {PURPOSE_ORDER.map((p) => {
              const count = purposeCounts[p];
              if (count === 0) return null;
              const active = activePurpose === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActivePurpose(p)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "border-foreground bg-foreground/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {PURPOSE_LABELS[p]}{" "}
                  <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tiles ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state && !state.ok && (
            <p className="mb-3 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          {PURPOSE_ORDER.map((purpose) => {
            const tiles = byPurpose[purpose];
            if (!tiles || tiles.length === 0) return null;
            return (
              <section key={purpose} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {PURPOSE_LABELS[purpose]}
                </h3>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {tiles.map((s) => {
                    const busy = pending && pendingKey === s.key;
                    return (
                      <li key={s.key}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleTileClick(s.key)}
                          className="group/tile flex w-full flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-muted/10 p-3 text-left transition hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-busy={busy}
                        >
                          <div className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-background text-foreground/70">
                            <TileSchematic purpose={s.businessPurpose} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold">
                                {s.label}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                                  PURPOSE_ACCENT[s.businessPurpose]
                                }`}
                              >
                                {PURPOSE_LABELS[s.businessPurpose]}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {s.description}
                            </p>
                            {busy ? (
                              <span className="mt-1 text-xs text-muted-foreground">
                                Creating…
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {purposeCounts.all === 0 && (
            <p className="text-sm text-muted-foreground">
              No sections available for this slot.
            </p>
          )}
          {purposeCounts.all > 0 &&
            Object.values(byPurpose).every((arr) => !arr || arr.length === 0) && (
              <p className="text-sm text-muted-foreground">
                No matches — try another filter or search term.
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
