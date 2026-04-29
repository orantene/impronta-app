"use client";

/**
 * TalentPicker — modal search for the featured_talent bespoke inspector.
 *
 * Operator intent: they want to feature 1–12 people on the homepage, and
 * they think in names, not profile codes. Raw code paste (the generic
 * fallback's UI) forces them into a separate tab to look up codes. This
 * picker puts a thumbnail + name grid in front of them, searches as they
 * type, and returns the picked set as an ordered `profile_code[]` so the
 * section schema stays untouched.
 *
 * Shape:
 *   - header: search input (debounced 200ms), selected count, done button
 *   - two-pane body: LEFT is the search grid; RIGHT is the ordered
 *     selected list (drag to reorder, remove)
 *   - footer: "Add selected" / "Cancel" on mobile; both panes scroll
 *
 * Result contract:
 *   - `onConfirm(codes)` emits the final ordered profile_code array when
 *     the operator clicks Done. Cancel closes without emitting.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  searchAgencyTalentAction,
  resolveTalentByCodesAction,
  type TalentSearchHit,
} from "@/lib/site-admin/edit-mode/talent-search";
import { DraggableList } from "./draggable-list";
import { InspectorItemRow, InspectorRowDelete } from "./inspector-item-row";
import { CHROME, CHROME_SHADOWS, CHROME_RADII } from "../../kit";

interface TalentPickerProps {
  open: boolean;
  /** Already-selected codes. Operator can add more, reorder, or remove. */
  initialCodes: string[];
  maxCount?: number;
  onConfirm: (codes: string[]) => void;
  onCancel: () => void;
}

export function TalentPicker({
  open,
  initialCodes,
  maxCount = 12,
  onConfirm,
  onCancel,
}: TalentPickerProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TalentSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<TalentSearchHit[]>([]);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate selected from initialCodes on open. If codes no longer resolve
  // to roster talent (roster changed since the section was saved), those
  // codes drop silently and the operator sees the surviving set.
  useEffect(() => {
    if (!open) {
      setBootstrapped(false);
      return;
    }
    let cancelled = false;
    (async () => {
      if (initialCodes.length === 0) {
        setSelected([]);
        setBootstrapped(true);
        return;
      }
      const res = await resolveTalentByCodesAction({ codes: initialCodes });
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setSelected([]);
      } else {
        setSelected(res.hits);
      }
      setBootstrapped(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialCodes]);

  // Debounced search. 200ms is tight enough to feel live without hammering
  // the server on every keystroke.
  useEffect(() => {
    if (!open) return;
    const excludeCodes = selected.map((s) => s.profileCode);
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchAgencyTalentAction({
        query,
        limit: 18,
        excludeCodes,
      });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setHits([]);
        setMore(false);
        setError(res.error);
        return;
      }
      setHits(res.hits);
      setMore(res.more);
      setError(null);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, selected]);

  // Escape to cancel. Keep the handler bound to the open flag so Escape
  // doesn't fire when the modal isn't showing.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const addHit = useCallback(
    (hit: TalentSearchHit) => {
      setSelected((prev) => {
        if (prev.length >= maxCount) return prev;
        if (prev.some((s) => s.profileCode === hit.profileCode)) return prev;
        return [...prev, hit];
      });
    },
    [maxCount],
  );

  const removeCode = useCallback((code: string) => {
    setSelected((prev) => prev.filter((s) => s.profileCode !== code));
  }, []);

  const confirm = useCallback(() => {
    onConfirm(selected.map((s) => s.profileCode));
  }, [onConfirm, selected]);

  if (!open) return null;

  return (
    <div
      data-edit-overlay="talent-picker"
      className="fixed inset-0 z-[130] flex items-start justify-center bg-[#242942]/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="mt-[80px] flex h-[calc(100vh-140px)] w-full max-w-[920px] flex-col overflow-hidden"
        style={{
          background: CHROME.paper2,
          border: `1px solid ${CHROME.lineMid}`,
          borderRadius: CHROME_RADII.lg,
          boxShadow: CHROME_SHADOWS.popover,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between gap-3 px-5 py-3.5"
          style={{
            background: CHROME.surface,
            borderBottom: `1px solid ${CHROME.line}`,
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className="inline-flex shrink-0 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: CHROME.muted2 }}
            >
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full"
                style={{ background: CHROME.muted2 }}
              />
              Pick talent
            </span>
            <div className="relative min-w-0 flex-1 max-w-[440px]">
              <SearchIcon />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or code…"
                className="w-full rounded-lg border border-[#e5e0d5] bg-[#faf9f6] py-2 pl-8 pr-3 text-[13px] text-stone-800 placeholder:text-stone-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-zinc-600">
              {selected.length} / {maxCount}
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-[#e5e0d5] bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-[#faf9f6] hover:border-stone-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              className="rounded-md bg-[#3d4f7c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4a5e94]"
            >
              Done
            </button>
          </div>
        </header>

        {error ? (
          <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px]">
          {/* Search results pane */}
          <div
            className="overflow-y-auto p-4"
            style={{ borderRight: `1px solid ${CHROME.line}` }}
          >
            {!bootstrapped || loading ? (
              <SearchSkeleton />
            ) : hits.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {hits.map((hit) => (
                  <HitTile
                    key={hit.profileCode}
                    hit={hit}
                    disabled={selected.length >= maxCount}
                    onAdd={() => addHit(hit)}
                  />
                ))}
                {more ? (
                  <div className="col-span-3 pt-1 text-center text-[11px] text-zinc-500">
                    Showing 18 matches — refine your search to narrow.
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Selected pane */}
          <div className="flex flex-col overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ borderBottom: `1px solid ${CHROME.line}` }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Selected order
              </span>
              {selected.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="text-[10px] font-medium text-zinc-400 transition hover:text-rose-600"
                >
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {selected.length === 0 ? (
                <p className="py-8 text-center text-[11px] leading-relaxed text-zinc-500">
                  Click a talent on the left to add them here.
                  <br />
                  Drag to reorder. First in list appears first on the page.
                </p>
              ) : (
                <DraggableList<TalentSearchHit>
                  items={selected}
                  keyOf={(h) => h.profileCode}
                  onReorder={setSelected}
                >
                  {(hit, _i, handleProps) => (
                    <InspectorItemRow
                      handleProps={handleProps}
                      thumb={<HitThumb hit={hit} />}
                      trailing={
                        <InspectorRowDelete
                          onClick={() => removeCode(hit.profileCode)}
                        />
                      }
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-zinc-900">
                          {hit.displayName}
                        </div>
                        <div className="truncate text-[11px] text-zinc-500">
                          {hit.roleLabel ?? hit.profileCode}
                        </div>
                      </div>
                    </InspectorItemRow>
                  )}
                </DraggableList>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── subcomponents ─────────────────────────────────────────────────────────

function HitTile({
  hit,
  disabled,
  onAdd,
}: {
  hit: TalentSearchHit;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className="group flex flex-col gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-2 text-left transition hover:border-indigo-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#e5e0d5] disabled:hover:shadow-none"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-zinc-100">
        {hit.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.thumbnailUrl}
            alt={hit.displayName}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
            {initialsOf(hit.displayName)}
          </div>
        )}
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-700 shadow-sm">
          {hit.profileCode}
        </span>
      </div>
      <div className="min-w-0 px-0.5">
        <div className="truncate text-[12px] font-semibold text-zinc-900">
          {hit.displayName}
        </div>
        <div className="truncate text-[10px] text-zinc-500">
          {hit.roleLabel ?? "Talent"}
        </div>
      </div>
    </button>
  );
}

function HitThumb({ hit }: { hit: TalentSearchHit }) {
  if (hit.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={hit.thumbnailUrl} alt={hit.displayName} className="h-full w-full object-cover" />;
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider">
      {initialsOf(hit.displayName)}
    </span>
  );
}

function SearchSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-white p-2"
        >
          <div className="aspect-[4/5] animate-pulse rounded-md bg-zinc-100" />
          <div className="h-2.5 w-3/4 animate-pulse rounded bg-zinc-100" />
          <div className="h-2 w-1/2 animate-pulse rounded bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  const q = query.trim();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        No matches
      </div>
      <p className="max-w-xs text-sm leading-relaxed text-zinc-500">
        {q
          ? `Nobody on this agency's roster matches "${q}".`
          : "This agency has no roster talent yet. Add talent in /admin/talent first."}
      </p>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "·";
  const words = trimmed.split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]!.toUpperCase()).join("");
}
