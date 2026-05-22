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
import { cn } from "@/lib/utils";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import { humanizeEnumLabel } from "@/lib/directory/humanize-enum-label";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

function pillLabel(label: string): string {
  const t = label.trim();
  if (!t) return t;
  return humanizeEnumLabel(t).toUpperCase();
}

/**
 * Top-5 by count, with a "More disciplines" disclosure that reveals
 * the rest in a searchable popover (B1 — replaces the 21-pill
 * horizontal scroll with restraint).
 *
 * Selection-aware: if the active facet is NOT in the top-5, it's
 * always rendered visibly so users see what they've selected. The
 * overflow popover dismisses on outside-click and ESC.
 */
const VISIBLE_PILL_COUNT = 5;

export function DirectoryTalentTypeBar({
  options,
  selectedIds,
  allLabel,
  barAriaLabel,
  overflowCopy,
}: {
  options: DirectoryFilterOption[];
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
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const siblingIds = useMemo(() => new Set(options.map((o) => o.id)), [options]);
  const selectedInGroup = useMemo(
    () => selectedIds.filter((id) => siblingIds.has(id)),
    [selectedIds, siblingIds],
  );
  const activeId = selectedInGroup[0] ?? null;

  // Sort by count desc, then label asc. Picks the top-N most populated
  // facets to surface as visible pills; the rest hide in the overflow.
  const sorted = useMemo(() => {
    return [...options].sort((a, b) => {
      const ca = a.count ?? 0;
      const cb = b.count ?? 0;
      if (cb !== ca) return cb - ca;
      return a.label.localeCompare(b.label);
    });
  }, [options]);

  // Build the visible set: top-N + (if active is outside top-N) inject it.
  const { visibleOptions, overflowOptions } = useMemo(() => {
    const top = sorted.slice(0, VISIBLE_PILL_COUNT);
    const rest = sorted.slice(VISIBLE_PILL_COUNT);
    if (activeId && !top.some((o) => o.id === activeId)) {
      const activeOpt = rest.find((o) => o.id === activeId);
      if (activeOpt) {
        return {
          visibleOptions: [...top, activeOpt],
          overflowOptions: rest.filter((o) => o.id !== activeId),
        };
      }
    }
    return { visibleOptions: top, overflowOptions: rest };
  }, [sorted, activeId]);

  // Overflow popover search filter.
  const overflowFiltered = useMemo(() => {
    const q = overflowQuery.trim().toLowerCase();
    if (!q) return overflowOptions;
    return overflowOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [overflowOptions, overflowQuery]);

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

  const setActiveTerm = (termId: string | null) => {
    const rest = selectedIds.filter((id) => !siblingIds.has(id));
    if (termId) {
      pushTax([...rest, termId]);
    } else {
      pushTax(rest);
    }
    setOverflowOpen(false);
    setOverflowQuery("");
  };

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

  if (options.length === 0) return null;

  const pillClass = (on: boolean) =>
    cn(
      "snap-start shrink-0 max-w-[min(100%,14rem)] truncate rounded-full border-0 px-4 py-2 text-[11px] font-semibold tracking-[0.12em] shadow-none",
      on
        ? "border border-white bg-white !text-black"
        : "border border-white/15 bg-transparent text-white/60 hover:border-white/30 hover:!text-zinc-200",
    );

  const morePillClass = cn(
    "shrink-0 rounded-full border border-white/15 bg-transparent px-4 py-2 text-[11px] font-semibold tracking-[0.12em] text-white/60 outline-none transition-colors hover:border-white/30 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    overflowOpen && "border-white/40 text-zinc-100",
  );

  return (
    <div className="relative">
      <FilterChips
        className={cn(
          "mb-4 flex-nowrap snap-x snap-proximity gap-2 overflow-x-auto scroll-pb-1 scroll-pl-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          pending && "pointer-events-none opacity-60",
        )}
        role="tablist"
        aria-label={barAriaLabel}
      >
        <FilterChip
          label={allLabel}
          selected={activeId == null}
          onClick={() => setActiveTerm(null)}
          className={pillClass(activeId == null)}
          role="tab"
          aria-selected={activeId == null}
        />
        {visibleOptions.map((opt) => {
          const on = activeId === opt.id;
          const countSuffix =
            typeof opt.count === "number" && opt.count > 0
              ? ` · ${opt.count}`
              : "";
          return (
            <FilterChip
              key={opt.id}
              label={pillLabel(opt.label) + countSuffix}
              selected={on}
              onClick={() => setActiveTerm(on ? null : opt.id)}
              className={pillClass(on)}
              title={opt.label}
              role="tab"
              aria-selected={on}
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
          className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-zinc-950/95 p-3 shadow-xl backdrop-blur-md"
        >
          <input
            type="search"
            value={overflowQuery}
            onChange={(e) => setOverflowQuery(e.target.value)}
            placeholder={overflowCopy.searchPlaceholder}
            aria-label={overflowCopy.searchAria}
            className="mb-2 w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/25"
            autoFocus
          />
          <ul className="max-h-72 overflow-y-auto">
            {overflowFiltered.length === 0 ? (
              <li className="px-2 py-2 text-xs text-white/50">{overflowCopy.noMatches}</li>
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
                          ? "bg-white text-black"
                          : "text-white/70 hover:bg-white/[0.04] hover:text-white focus-visible:bg-white/[0.04] focus-visible:text-white",
                      )}
                    >
                      <span className="truncate">{pillLabel(opt.label)}</span>
                      {typeof opt.count === "number" && opt.count > 0 ? (
                        <span
                          className={cn(
                            "shrink-0 text-[10px] tabular-nums",
                            on ? "text-black/60" : "text-white/40",
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
