"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { FilterChip, FilterChips } from "@/components/ui/filter-chips";
import type { DirectoryFilterOption } from "@/lib/directory/field-driven-filters";
import type { DirectoryCategoryParent } from "@/lib/directory/directory-category-tree";
import { cn } from "@/lib/utils";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import { humanizeEnumLabel } from "@/lib/directory/humanize-enum-label";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { byLabel } from "@/lib/field-engine/sort-comparators";

function pillLabel(label: string): string {
  const t = label.trim();
  if (!t) return t;
  return humanizeEnumLabel(t).toUpperCase();
}

function countSuffix(count: number | undefined): string {
  return typeof count === "number" && count > 0 ? ` · ${count}` : "";
}

/**
 * Top-N by count, with a "More" disclosure that reveals the rest in a
 * searchable popover (B1 — replaces the long horizontal scroll with restraint).
 *
 * TWO MODES:
 *  - Hierarchical (when `categoryTree` is supplied): PARENT-category pills.
 *    Clicking a parent filters by it (the `?tax=` resolver expands a parent to
 *    its talent-type leaves) AND reveals an inline sub-row of that parent's
 *    child types (only the non-empty ones) to refine further.
 *  - Flat (fallback): the legacy single-level talent-type pills.
 *
 * Selection-aware: an active facet outside the top-N is always rendered so the
 * user sees their selection. The overflow popover dismisses on outside-click + ESC.
 */
const VISIBLE_PILL_COUNT = 6;

const ACTIVE_PILL =
  "border border-[var(--dir-accent)] bg-[var(--dir-accent-soft)] !text-[var(--dir-accent)]";
const INACTIVE_PILL =
  "border border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:!text-foreground";

export function DirectoryTalentTypeBar({
  options,
  categoryTree,
  selectedIds,
  allLabel,
  barAriaLabel,
  overflowCopy,
}: {
  options: DirectoryFilterOption[];
  /** When present + non-empty, the bar renders the two-level parent→child UI. */
  categoryTree?: DirectoryCategoryParent[];
  selectedIds: string[];
  allLabel: string;
  /** Usually the facet label (e.g. "Talent type", "Skills") for the pill tablist. */
  barAriaLabel: string;
  overflowCopy: DirectoryUiCopy["topBarPills"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowQuery, setOverflowQuery] = useState("");
  // Child refine sub-row: a single scroll row by default; expands to show all.
  const [childrenExpanded, setChildrenExpanded] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const useHierarchy = !!categoryTree && categoryTree.length > 0;
  const parents = useMemo(() => categoryTree ?? [], [categoryTree]);

  // The full id-universe this facet controls — parent + child ids in
  // hierarchical mode, else the flat option ids.
  const siblingIds = useMemo(() => {
    if (useHierarchy) {
      const s = new Set<string>();
      for (const p of parents) {
        s.add(p.id);
        for (const c of p.children) s.add(c.id);
      }
      return s;
    }
    return new Set(options.map((o) => o.id));
  }, [useHierarchy, parents, options]);

  const selectedInGroup = useMemo(
    () => selectedIds.filter((id) => siblingIds.has(id)),
    [selectedIds, siblingIds],
  );
  const activeId = selectedInGroup[0] ?? null;

  // Collapse the "show all types" expansion when the active PARENT changes
  // (but NOT when refining to a child within the same parent).
  const activeParentId = useMemo(() => {
    if (!useHierarchy) return null;
    const p =
      parents.find((pp) => pp.id === activeId) ??
      parents.find((pp) => pp.children.some((c) => c.id === activeId));
    return p?.id ?? null;
  }, [useHierarchy, parents, activeId]);
  useEffect(() => {
    setChildrenExpanded(false);
  }, [activeParentId]);

  const pushTax = useCallback(
    (nextIds: string[]) => {
      startTransition(() => {
        commitDirectoryListingUrl(
          router,
          pathname,
          searchParams.toString(),
          (p) => {
            if (nextIds.length > 0) {
              p.set("tax", [...nextIds].sort().join(","));
            } else {
              p.delete("tax");
            }
          },
        );
      });
    },
    [router, pathname, searchParams, startTransition],
  );

  const setActiveTerm = useCallback(
    (termId: string | null) => {
      const rest = selectedIds.filter((id) => !siblingIds.has(id));
      pushTax(termId ? [...rest, termId] : rest);
      setOverflowOpen(false);
      setOverflowQuery("");
    },
    [selectedIds, siblingIds, pushTax],
  );

  // Outside-click / ESC dismiss the overflow popover.
  useEffect(() => {
    if (!overflowOpen) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (overflowRef.current && overflowRef.current.contains(target)) return;
      if (buttonRef.current && buttonRef.current.contains(target)) return;
      setOverflowOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOverflowOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [overflowOpen]);

  const pillClass = (on: boolean) =>
    cn(
      "snap-start shrink-0 max-w-[min(100%,14rem)] truncate rounded-full border-0 px-4 py-2 text-[11px] font-semibold tracking-[0.12em] shadow-none",
      on ? ACTIVE_PILL : INACTIVE_PILL,
    );

  const morePillClass = cn(
    "shrink-0 rounded-full border border-border bg-transparent px-4 py-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    overflowOpen && "border-foreground/40 text-foreground",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // HIERARCHICAL MODE — parent pills + inline child refine sub-row.
  // ─────────────────────────────────────────────────────────────────────────
  if (useHierarchy) {
    const activeParent =
      parents.find((p) => p.id === activeId) ??
      parents.find((p) => p.children.some((c) => c.id === activeId)) ??
      null;
    const activeChildId =
      activeParent && activeParent.children.some((c) => c.id === activeId)
        ? activeId
        : null;

    // Top-N parents + (inject the active parent if it's outside the top-N).
    const top = parents.slice(0, VISIBLE_PILL_COUNT);
    const rest = parents.slice(VISIBLE_PILL_COUNT);
    let visibleParents = top;
    let overflowParents = rest;
    if (activeParent && !top.some((p) => p.id === activeParent.id)) {
      visibleParents = [...top, activeParent];
      overflowParents = rest.filter((p) => p.id !== activeParent.id);
    }
    const overflowFiltered = overflowQuery.trim()
      ? overflowParents.filter((p) =>
          p.label.toLowerCase().includes(overflowQuery.trim().toLowerCase()),
        )
      : overflowParents;

    const onParent = (id: string) => setActiveTerm(activeId === id ? null : id);
    const onChild = (parentId: string, childId: string) =>
      setActiveTerm(activeId === childId ? parentId : childId);

    return (
      <div className="relative">
        <FilterChips
          className={cn(
            "mb-3 flex-nowrap snap-x snap-proximity overscroll-x-contain gap-2 overflow-x-auto scroll-pb-1 scroll-pl-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            pending && "pointer-events-none opacity-60",
          )}
          role="group"
          aria-label={barAriaLabel}
        >
          <FilterChip
            label={allLabel}
            selected={activeParent == null}
            onClick={() => setActiveTerm(null)}
            className={pillClass(activeParent == null)}
            aria-pressed={activeParent == null}
          />
          {visibleParents.map((p) => {
            const on = activeParent?.id === p.id;
            return (
              <FilterChip
                key={p.id}
                label={pillLabel(p.label) + countSuffix(p.count)}
                selected={on}
                onClick={() => onParent(p.id)}
                className={pillClass(on)}
                title={p.label}
                aria-pressed={on}
              />
            );
          })}
          {overflowParents.length > 0 ? (
            <button
              ref={buttonRef}
              type="button"
              className={morePillClass}
              onClick={() => setOverflowOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={overflowOpen}
              aria-controls="directory-talent-type-overflow"
            >
              {overflowCopy.more} · {overflowParents.length}
            </button>
          ) : null}
        </FilterChips>

        {/* Inline refine sub-row — the active parent's child types. ONE clean
            horizontal-scroll row by default (scroll right for more); a trailing
            "All N +" toggle expands it to every type at once. */}
        {activeParent && activeParent.children.length > 0 ? (
          <div
            className={cn(
              "-mt-1 mb-4 flex items-start gap-2",
              pending && "pointer-events-none opacity-60",
            )}
            data-directory-type-children
          >
            <div
              role="group"
              aria-label={`Refine ${activeParent.label}`}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5",
                childrenExpanded
                  ? "flex-wrap"
                  : "flex-nowrap snap-x snap-proximity overscroll-x-contain overflow-x-auto scroll-pl-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              )}
            >
              {activeParent.children.map((c) => {
                const on = activeChildId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onChild(activeParent.id, c.id)}
                    aria-pressed={on}
                    title={c.label}
                    className={cn(
                      "snap-start shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] font-medium tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      on
                        ? "border-[var(--dir-accent)] bg-[var(--dir-accent-soft)] text-[var(--dir-accent)]"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-foreground/25 hover:text-foreground/85",
                    )}
                  >
                    {pillLabel(c.label)}
                    <span className="ml-1 text-muted-foreground tabular-nums">{c.count}</span>
                  </button>
                );
              })}
            </div>
            {activeParent.children.length > 6 ? (
              <button
                type="button"
                onClick={() => setChildrenExpanded((v) => !v)}
                aria-expanded={childrenExpanded}
                className="shrink-0 rounded-full border border-border bg-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {childrenExpanded
                  ? `Less −`
                  : `All ${activeParent.children.length} +`}
              </button>
            ) : null}
          </div>
        ) : null}

        {overflowOpen && overflowParents.length > 0 ? (
          <div
            ref={overflowRef}
            id="directory-talent-type-overflow"
            role="listbox"
            aria-label={overflowCopy.moreOptionsAria.replace("{label}", barAriaLabel)}
            className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur-md"
          >
            <input
              type="search"
              value={overflowQuery}
              onChange={(e) => setOverflowQuery(e.target.value)}
              placeholder={overflowCopy.searchPlaceholder}
              aria-label={overflowCopy.searchAria}
              className="mb-2 w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/25"
              autoFocus
            />
            <ul className="max-h-72 overflow-y-auto">
              {overflowFiltered.length === 0 ? (
                <li className="px-2 py-2 text-xs text-muted-foreground">{overflowCopy.noMatches}</li>
              ) : (
                overflowFiltered.map((p) => {
                  const on = activeParent?.id === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={on}
                        onClick={() => onParent(p.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-[12px] tracking-[0.06em] outline-none transition-colors",
                          on
                            ? "bg-[var(--dir-accent-soft)] text-[var(--dir-accent)]"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40 focus-visible:text-foreground",
                        )}
                      >
                        <span className="truncate">{pillLabel(p.label)}</span>
                        <span
                          className={cn(
                            "shrink-0 text-[10px] tabular-nums",
                            on ? "text-[var(--dir-accent)]" : "text-muted-foreground/60",
                          )}
                        >
                          {p.count}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FLAT MODE (fallback) — single-level talent-type pills.
  // ─────────────────────────────────────────────────────────────────────────
  const sorted = [...options].sort((a, b) => {
    const ca = a.count ?? 0;
    const cb = b.count ?? 0;
    if (cb !== ca) return cb - ca;
    return byLabel(a, b);
  });

  const top = sorted.slice(0, VISIBLE_PILL_COUNT);
  const restOpts = sorted.slice(VISIBLE_PILL_COUNT);
  let visibleOptions = top;
  let overflowOptions = restOpts;
  if (activeId && !top.some((o) => o.id === activeId)) {
    const activeOpt = restOpts.find((o) => o.id === activeId);
    if (activeOpt) {
      visibleOptions = [...top, activeOpt];
      overflowOptions = restOpts.filter((o) => o.id !== activeId);
    }
  }
  const overflowFiltered = overflowQuery.trim()
    ? overflowOptions.filter((o) =>
        o.label.toLowerCase().includes(overflowQuery.trim().toLowerCase()),
      )
    : overflowOptions;

  if (options.length === 0) return null;

  return (
    <div className="relative">
      <FilterChips
        className={cn(
          "mb-4 flex-nowrap snap-x snap-proximity overscroll-x-contain gap-2 overflow-x-auto scroll-pb-1 scroll-pl-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          pending && "pointer-events-none opacity-60",
        )}
        role="group"
        aria-label={barAriaLabel}
      >
        <FilterChip
          label={allLabel}
          selected={activeId == null}
          onClick={() => setActiveTerm(null)}
          className={pillClass(activeId == null)}
          aria-pressed={activeId == null}
        />
        {visibleOptions.map((opt) => {
          const on = activeId === opt.id;
          return (
            <FilterChip
              key={opt.id}
              label={pillLabel(opt.label) + countSuffix(opt.count)}
              selected={on}
              onClick={() => setActiveTerm(on ? null : opt.id)}
              className={pillClass(on)}
              title={opt.label}
              aria-pressed={on}
            />
          );
        })}
        {overflowOptions.length > 0 ? (
          <button
            ref={buttonRef}
            type="button"
            className={morePillClass}
            onClick={() => setOverflowOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={overflowOpen}
            aria-controls="directory-talent-type-overflow"
          >
            {overflowCopy.more} · {overflowOptions.length}
          </button>
        ) : null}
      </FilterChips>

      {overflowOpen && overflowOptions.length > 0 ? (
        <div
          ref={overflowRef}
          id="directory-talent-type-overflow"
          role="listbox"
          aria-label={overflowCopy.moreOptionsAria.replace("{label}", barAriaLabel)}
          className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur-md"
        >
          <input
            type="search"
            value={overflowQuery}
            onChange={(e) => setOverflowQuery(e.target.value)}
            placeholder={overflowCopy.searchPlaceholder}
            aria-label={overflowCopy.searchAria}
            className="mb-2 w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/25"
            autoFocus
          />
          <ul className="max-h-72 overflow-y-auto">
            {overflowFiltered.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted-foreground">{overflowCopy.noMatches}</li>
            ) : (
              overflowFiltered.map((opt) => {
                const on = activeId === opt.id;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => setActiveTerm(on ? null : opt.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-[12px] tracking-[0.06em] outline-none transition-colors",
                        on
                          ? "bg-[var(--dir-accent-soft)] text-[var(--dir-accent)]"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40 focus-visible:text-foreground",
                      )}
                    >
                      <span className="truncate">{pillLabel(opt.label)}</span>
                      {typeof opt.count === "number" && opt.count > 0 ? (
                        <span
                          className={cn(
                            "shrink-0 text-[10px] tabular-nums",
                            on ? "text-[var(--dir-accent)]" : "text-muted-foreground/60",
                          )}
                        >
                          {opt.count}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
