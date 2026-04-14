"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronRight, Search, Sparkles, X } from "lucide-react";
import type {
  DirectoryFilterOption,
  DirectoryFilterSection,
  DirectoryFilterSidebarBlock,
} from "@/lib/directory/field-driven-filters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FilterChip, FilterChips } from "@/components/ui/filter-chips";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { formatFilterSearchSummary } from "@/lib/directory/directory-ui-copy";
import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";
import { serializeDirectoryFieldFacetParams } from "@/lib/directory/search-params";

const COLLAPSE_CHIPS = 6;
const COLLAPSE_RADIO = 8;
const COLLAPSE_GRID = 9;
const CHIPS_COLLAPSED_MAX_PX = 148;
const GRID_COLLAPSED_MAX_PX = 200;

function normalizeFilterQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

function labelMatchesQuery(label: string, q: string): boolean {
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

/** Readable label in filter tiles (taxonomy terms are often stored ALL CAPS). */
function facetTileLabel(label: string): string {
  const t = label.trim();
  if (!t) return t;
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function heightSectionMatchesQuery(sectionLabel: string, q: string): boolean {
  if (!q) return true;
  const l = sectionLabel.toLowerCase();
  if (l.includes(q)) return true;
  // Avoid matching "cm" inside unrelated words (e.g. "commercial").
  return (
    /\b(height|tall|altura|estatura|cm)\b/i.test(q) || /\b\d{2,3}\s*cm\b/i.test(q)
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = normalizeFilterQuery(query);
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const i = lower.indexOf(q);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="rounded-sm bg-[var(--impronta-gold)]/18 px-0.5 text-[var(--impronta-gold-bright)]">
        {text.slice(i, i + q.length)}
      </span>
      {text.slice(i + q.length)}
    </>
  );
}

/** Scrollable list: all cities from DB flow through here (sorted). */
const LOCATION_DROPDOWN_MAX = 800;

function DirectoryLocationSearchDropdown({
  options,
  locationSelected,
  pushLocation,
  filterSidebarQuery,
  fc,
}: {
  options: DirectoryFilterOption[];
  locationSelected: string;
  pushLocation: (slug: string) => void;
  /** Highlights matches when the sidebar "Search filters" box is in use. */
  filterSidebarQuery: string;
  fc: DirectoryUiCopy["filters"];
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (locationSelected) {
      const label = options.find((o) => o.id === locationSelected)?.label ?? locationSelected;
      setInputValue(label);
      return;
    }
    if (document.activeElement !== inputRef.current) {
      setInputValue("");
    }
  }, [locationSelected, options]);

  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label));
    if (!q) return sorted.slice(0, LOCATION_DROPDOWN_MAX);
    return sorted.filter((o) => o.label.toLowerCase().includes(q)).slice(0, LOCATION_DROPDOWN_MAX);
  }, [options, inputValue]);

  const updateMenuPosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 200),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateMenuPosition, filtered.length, inputValue]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const pick = (opt: DirectoryFilterOption) => {
    pushLocation(opt.id);
    setInputValue(opt.label);
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    pushLocation("");
    setInputValue("");
    setOpen(false);
  };

  if (options.length === 0) {
    return (
      <p className="text-xs text-[var(--impronta-muted)]">{fc.noCitiesYet}</p>
    );
  }

  const listEl =
    open && menuPos ? (
      <ul
        ref={listRef}
        id="directory-location-listbox"
        role="listbox"
        style={{
          position: "fixed",
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          zIndex: 200,
        }}
        className="max-h-60 overflow-auto rounded-lg border border-[var(--impronta-gold-border)]/40 bg-[var(--impronta-surface)] py-1 shadow-xl"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-[var(--impronta-muted)]">{fc.noCitiesMatch}</li>
        ) : (
          filtered.map((opt) => {
            const selected = locationSelected === opt.id;
            const c = opt.count;
            return (
              <li key={opt.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-[rgba(212,175,55,0.12)] text-[var(--impronta-gold)]"
                      : "text-zinc-200 hover:bg-[var(--impronta-surface)]",
                  )}
                >
                  <span className="min-w-0 truncate">
                    <HighlightMatch text={opt.label} query={filterSidebarQuery} />
                  </span>
                  {c !== undefined ? (
                    <span
                      className={cn(
                        "shrink-0 tabular-nums text-xs",
                        selected ? "text-[var(--impronta-gold)]" : "text-[var(--impronta-muted)]",
                      )}
                    >
                      {c}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    ) : null;

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor="directory-location-search" className="sr-only">
        {fc.locationSearchLabel}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--impronta-gold-dim)]"
          aria-hidden
        />
        <input
          ref={inputRef}
          id="directory-location-search"
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="directory-location-listbox"
          aria-autocomplete="list"
          placeholder={fc.locationPlaceholder}
          value={inputValue}
          onChange={(e) => {
            const v = e.target.value;
            setInputValue(v);
            setOpen(true);
            if (locationSelected) pushLocation("");
          }}
          onFocus={() => {
            setOpen(true);
            queueMicrotask(() => updateMenuPosition());
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn(
            "w-full rounded-lg border border-[var(--impronta-gold-border)]/35 bg-[var(--impronta-surface)]/90 py-2 pl-8 text-sm text-foreground placeholder:text-[var(--impronta-muted)]/70 outline-none ring-0 transition-[border-color,box-shadow] focus:border-[var(--impronta-gold-dim)] focus:shadow-[0_0_0_1px_rgba(201,162,39,0.25)]",
            locationSelected ? "pr-9" : "pr-8",
          )}
        />
        {locationSelected ? (
          <button
            type="button"
            onClick={() => clear()}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--impronta-muted)] hover:text-foreground"
            aria-label={fc.clearCityAria}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {mounted && listEl ? createPortal(listEl, document.body) : null}
    </div>
  );
}

function SectionAccordion({
  title,
  defaultOpen = true,
  forceOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** When true, section stays open (e.g. while filter search is active). */
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduceMotion = useReducedMotion();
  const effectiveOpen = forceOpen ? true : open;

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <div className="border-b border-[var(--impronta-gold-border)]/25 pb-3">
      <button
        type="button"
        onClick={() => !forceOpen && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 py-1 text-left",
          forceOpen && "cursor-default",
        )}
        aria-expanded={effectiveOpen}
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--impronta-muted)]">
          {title}
        </span>
        {effectiveOpen ? (
          <ChevronDown className="size-4 shrink-0 text-[var(--impronta-gold-dim)]" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-[var(--impronta-gold-dim)]" aria-hidden />
        )}
      </button>
      <AnimatePresence initial={false}>
        {effectiveOpen ? (
          <motion.div
            key="acc-content"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.32,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ExpandableChips({
  optionCount,
  forceExpanded,
  children,
  fc,
}: {
  optionCount: number;
  forceExpanded: boolean;
  children: React.ReactNode;
  fc: DirectoryUiCopy["filters"];
}) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const needs = optionCount > COLLAPSE_CHIPS;
  const showAll = forceExpanded || expanded || !needs;

  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  return (
    <div className="relative">
      <motion.div
        initial={false}
        animate={{
          maxHeight: showAll ? 4800 : CHIPS_COLLAPSED_MAX_PX,
        }}
        transition={{
          duration: reduceMotion ? 0 : 0.42,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="overflow-hidden"
      >
        {children}
      </motion.div>
      {needs && !showAll ? (
        <div
          className="pointer-events-none absolute bottom-8 left-0 right-0 h-12 bg-gradient-to-t from-background via-background/85 to-transparent"
          aria-hidden
        />
      ) : null}
      {needs ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-[var(--impronta-gold-border)]/40 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--impronta-gold-dim)] transition-colors hover:border-[var(--impronta-gold-dim)] hover:text-[var(--impronta-gold)]"
        >
          {showAll ? (
            <>
              <ChevronDown className="size-3.5 rotate-180" aria-hidden />
              {fc.showLess}
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" aria-hidden />
              {fc.showAll.replace("{count}", String(optionCount))}
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

function ExpandableGrid({
  optionCount,
  forceExpanded,
  children,
  fc,
}: {
  optionCount: number;
  forceExpanded: boolean;
  children: React.ReactNode;
  fc: DirectoryUiCopy["filters"];
}) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const needs = optionCount > COLLAPSE_GRID;
  const showAll = forceExpanded || expanded || !needs;

  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  return (
    <div className="relative">
      <motion.div
        initial={false}
        animate={{
          maxHeight: showAll ? 4800 : GRID_COLLAPSED_MAX_PX,
        }}
        transition={{
          duration: reduceMotion ? 0 : 0.42,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="overflow-hidden"
      >
        {children}
      </motion.div>
      {needs && !showAll ? (
        <div
          className="pointer-events-none absolute bottom-8 left-0 right-0 h-10 bg-gradient-to-t from-background via-background/85 to-transparent"
          aria-hidden
        />
      ) : null}
      {needs ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-[var(--impronta-gold-border)]/40 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--impronta-gold-dim)] transition-colors hover:border-[var(--impronta-gold-dim)] hover:text-[var(--impronta-gold)]"
        >
          {showAll ? (
            <>
              <ChevronDown className="size-3.5 rotate-180" aria-hidden />
              {fc.showLess}
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" aria-hidden />
              {fc.showAll.replace("{count}", String(optionCount))}
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

function ExpandableRadioList({
  options,
  forceExpanded,
  renderRow,
  fc,
}: {
  options: DirectoryFilterOption[];
  forceExpanded: boolean;
  renderRow: (opt: DirectoryFilterOption) => React.ReactNode;
  fc: DirectoryUiCopy["filters"];
}) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const needs = options.length > COLLAPSE_RADIO;
  const showAll = forceExpanded || expanded || !needs;
  const visible = showAll ? options : options.slice(0, COLLAPSE_RADIO);

  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  return (
    <div>
      <motion.ul
        className="space-y-1.5"
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((opt) => (
            <motion.li
              key={opt.id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderRow(opt)}
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
      {needs ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-[var(--impronta-gold-border)]/40 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--impronta-gold-dim)] transition-colors hover:border-[var(--impronta-gold-dim)] hover:text-[var(--impronta-gold)]"
        >
          {showAll ? (
            <>
              <ChevronDown className="size-3.5 rotate-180" aria-hidden />
              {fc.showLess}
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" aria-hidden />
              {fc.radioMore.replace("{count}", String(options.length - COLLAPSE_RADIO))}
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

type VisibleFilterSection = {
  section: DirectoryFilterSection;
  options: DirectoryFilterOption[];
  /** Override for "Search filters" match tally (e.g. City shows full list when title matches). */
  matchHintCount?: number;
};

function scalarFacetHasSelection(
  fieldKey: string,
  fieldFacets: DirectoryFieldFacetSelection[],
): boolean {
  const row = fieldFacets.find((f) => f.fieldKey === fieldKey);
  return Boolean(row?.values.some((v) => v.trim()));
}

/** Sections with any active URL selection bubble up right after the search block (stable among active / inactive). */
function reorderFilterBlocksWithActiveFirst(
  blocks: DirectoryFilterSidebarBlock[],
  selectedIds: string[],
  locationSlug: string,
  heightMinCm: number | null,
  heightMaxCm: number | null,
  fieldFacets: DirectoryFieldFacetSelection[],
  ageMin: number | null = null,
  ageMax: number | null = null,
): DirectoryFilterSidebarBlock[] {
  const selectedSet = new Set(selectedIds);
  const loc = locationSlug.trim();

  const sectionIsActive = (section: DirectoryFilterSection): boolean => {
    if (section.kind === "height_range") {
      return heightMinCm != null || heightMaxCm != null;
    }
    if (section.kind === "age_range") {
      return ageMin != null || ageMax != null;
    }
    if (section.kind === "location") {
      return loc.length > 0;
    }
    if (section.kind === "taxonomy") {
      return section.options.some((o) => selectedSet.has(o.id));
    }
    if (
      section.kind === "profile_gender" ||
      section.kind === "field_boolean" ||
      section.kind === "field_text_enum"
    ) {
      return scalarFacetHasSelection(section.fieldKey, fieldFacets);
    }
    return false;
  };

  const head: DirectoryFilterSidebarBlock[] = [];
  const rest: DirectoryFilterSidebarBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "filter_search") head.push(b);
    else rest.push(b);
  }

  const active: DirectoryFilterSidebarBlock[] = [];
  const inactive: DirectoryFilterSidebarBlock[] = [];
  for (const b of rest) {
    if (b.kind !== "section") {
      inactive.push(b);
      continue;
    }
    if (sectionIsActive(b.section)) active.push(b);
    else inactive.push(b);
  }

  return [...head, ...active, ...inactive];
}

function mergeFacetSelections(
  current: DirectoryFieldFacetSelection[],
  fieldKey: string,
  mutate: (prev: Set<string>) => void,
): DirectoryFieldFacetSelection[] {
  const byKey = new Map<string, Set<string>>();
  for (const f of current) {
    byKey.set(f.fieldKey, new Set(f.values.map((v) => v.trim()).filter(Boolean)));
  }
  const s = byKey.get(fieldKey) ?? new Set<string>();
  mutate(s);
  if (s.size === 0) byKey.delete(fieldKey);
  else byKey.set(fieldKey, s);
  return [...byKey.entries()]
    .map(([k, vs]) => ({ fieldKey: k, values: [...vs].sort() }))
    .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
}

export function DirectoryFiltersSidebar({
  blocks,
  selectedIds,
  locationSlug,
  heightMinCm,
  heightMaxCm,
  ageMin = null,
  ageMax = null,
  fieldFacets,
  ui,
}: {
  blocks: DirectoryFilterSidebarBlock[];
  selectedIds: string[];
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  fieldFacets: DirectoryFieldFacetSelection[];
  ui: DirectoryUiCopy;
}) {
  const fc = ui.filters;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [filterQuery, setFilterQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const locationSelected = locationSlug.trim();
  const qNorm = normalizeFilterQuery(filterQuery);
  const hasFilterSearch = qNorm.length > 0;

  const displayBlocks = useMemo(
    () =>
      reorderFilterBlocksWithActiveFirst(
        blocks,
        selectedIds,
        locationSlug,
        heightMinCm,
        heightMaxCm,
        fieldFacets,
        ageMin,
        ageMax,
      ),
    [blocks, selectedIds, locationSlug, heightMinCm, heightMaxCm, fieldFacets, ageMin, ageMax],
  );

  const facetSections = useMemo(
    () =>
      displayBlocks
        .filter(
          (b): b is { kind: "section"; section: DirectoryFilterSection } => b.kind === "section",
        )
        .map((b) => b.section),
    [displayBlocks],
  );

  const visibleSections = useMemo((): VisibleFilterSection[] => {
    if (!hasFilterSearch) {
      return facetSections.map((section) => ({
        section,
        options: (section.kind === "height_range" || section.kind === "age_range") ? [] : section.options,
      }));
    }
    const out: VisibleFilterSection[] = [];
    for (const section of facetSections) {
      if (section.kind === "height_range" || section.kind === "age_range") {
        if (heightSectionMatchesQuery(section.label, qNorm)) {
          out.push({ section, options: [] });
        }
        continue;
      }
      if (section.kind === "location") {
        if (labelMatchesQuery(section.label, qNorm)) {
          out.push({ section, options: section.options, matchHintCount: 1 });
          continue;
        }
        const filtered = section.options.filter((o) => labelMatchesQuery(o.label, qNorm));
        if (filtered.length > 0) {
          out.push({ section, options: filtered });
        }
        continue;
      }
      if (
        section.kind === "profile_gender" ||
        section.kind === "field_boolean" ||
        section.kind === "field_text_enum"
      ) {
        const filtered = section.options.filter((o) => labelMatchesQuery(o.label, qNorm));
        if (filtered.length > 0) {
          out.push({ section, options: filtered });
        }
        continue;
      }
      const filtered = section.options.filter((o) => labelMatchesQuery(o.label, qNorm));
      if (filtered.length > 0) {
        out.push({ section, options: filtered });
      }
    }
    return out;
  }, [facetSections, hasFilterSearch, qNorm]);

  const visibleSectionMap = useMemo(
    () => new Map(visibleSections.map((v) => [v.section.fieldKey, v])),
    [visibleSections],
  );

  const matchCount = useMemo(() => {
    if (!hasFilterSearch) return 0;
    return visibleSections.reduce(
      (n, row) => n + (row.matchHintCount ?? row.options.length),
      0,
    );
  }, [hasFilterSearch, visibleSections]);

  const pushParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      startTransition(() => {
        commitDirectoryListingUrl(router, pathname, searchParams.toString(), mutate);
      });
    },
    [router, pathname, searchParams, startTransition],
  );

  const pushTax = useCallback(
    (nextIds: string[]) => {
      pushParams((params) => {
        if (nextIds.length > 0) {
          params.set("tax", [...nextIds].sort().join(","));
        } else {
          params.delete("tax");
        }
      });
    },
    [pushParams],
  );

  const pushLocation = useCallback(
    (next: string) => {
      pushParams((params) => {
        if (next) params.set("location", next);
        else params.delete("location");
      });
    },
    [pushParams],
  );

  const pushHeight = useCallback(
    (min: number | null, max: number | null) => {
      pushParams((params) => {
        if (min != null) params.set("hmin", String(min));
        else params.delete("hmin");
        if (max != null) params.set("hmax", String(max));
        else params.delete("hmax");
      });
    },
    [pushParams],
  );

  const pushAge = useCallback(
    (min: number | null, max: number | null) => {
      pushParams((params) => {
        if (min != null) params.set("amin", String(min));
        else params.delete("amin");
        if (max != null) params.set("amax", String(max));
        else params.delete("amax");
      });
    },
    [pushParams],
  );

  const pushFieldFacets = useCallback(
    (next: DirectoryFieldFacetSelection[]) => {
      pushParams((params) => {
        params.delete("ff");
        for (const seg of serializeDirectoryFieldFacetParams(next)) {
          params.append("ff", seg);
        }
      });
    },
    [pushParams],
  );

  const toggleScalarChip = useCallback(
    (fieldKey: string, valueId: string) => {
      const next = mergeFacetSelections(fieldFacets, fieldKey, (set) => {
        if (set.has(valueId)) set.delete(valueId);
        else set.add(valueId);
      });
      pushFieldFacets(next);
    },
    [fieldFacets, pushFieldFacets],
  );

  const selectScalarRadio = useCallback(
    (fieldKey: string, valueId: string) => {
      const next = mergeFacetSelections(fieldFacets, fieldKey, () => new Set([valueId]));
      pushFieldFacets(next);
    },
    [fieldFacets, pushFieldFacets],
  );

  const toggleChip = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    pushTax([...next]);
  };

  const selectRadio = (section: Extract<DirectoryFilterSection, { kind: "taxonomy" }>, termId: string) => {
    const siblingIds = new Set(section.options.map((o) => o.id));
    const next = selectedIds.filter((id) => !siblingIds.has(id));
    if (!next.includes(termId)) next.push(termId);
    pushTax(next);
  };

  const clearAll = () => {
    pushParams((params) => {
      params.delete("tax");
      params.delete("location");
      params.delete("hmin");
      params.delete("hmax");
      params.delete("amin");
      params.delete("amax");
      params.delete("ff");
    });
  };

  const hasHeightFilter = heightMinCm != null || heightMaxCm != null;
  const hasAgeFilter = ageMin != null || ageMax != null;
  const hasScalarFilters = fieldFacets.some((f) => f.values.some((v) => v.trim()));
  const hasFilters =
    selectedIds.length > 0 ||
    Boolean(locationSelected) ||
    hasHeightFilter ||
    hasAgeFilter ||
    hasScalarFilters;

  if (facetSections.length === 0) {
    return (
      <aside className="space-y-3 rounded-lg border border-dashed border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/80 p-4 text-sm text-[var(--impronta-muted)]">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--impronta-gold-dim)]">
          {fc.emptyAsideTitle}
        </h2>
        <p className="text-foreground">{fc.emptyAsideBody}</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li className="font-medium text-foreground">{fc.emptyAsideBulletAdmin}</li>
          <li className="text-foreground">{fc.emptyAsideBulletMigration}</li>
        </ul>
        <p>
          <Link
            href="/admin/directory/filters"
            className="font-medium text-[var(--impronta-gold)] underline underline-offset-4"
          >
            {fc.emptyAsideLink}
          </Link>
        </p>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "space-y-1",
        pending && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--impronta-gold-dim)]">
          {fc.sidebarTitle}
        </h2>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-[var(--impronta-gold)] underline-offset-4 hover:underline"
          >
            {fc.clearAll}
          </button>
        ) : null}
      </div>

      {displayBlocks.map((block) => {
        if (block.kind === "filter_search") {
          return (
            <div key="directory-filter-search-block" className="space-y-2">
              <div className="relative pb-3">
                <label htmlFor="directory-filter-search" className="sr-only">
                  {fc.searchFiltersLabel}
                </label>
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--impronta-gold-dim)]"
                  aria-hidden
                />
                <input
                  id="directory-filter-search"
                  type="search"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder={fc.searchFiltersPlaceholder}
                  autoComplete="off"
                  className="w-full rounded-lg border border-[var(--impronta-gold-border)]/35 bg-[var(--impronta-surface)]/90 py-2 pl-8 pr-8 text-sm text-foreground placeholder:text-[var(--impronta-muted)]/70 outline-none ring-0 transition-[border-color,box-shadow] focus:border-[var(--impronta-gold-dim)] focus:shadow-[0_0_0_1px_rgba(201,162,39,0.25)]"
                />
                {filterQuery ? (
                  <button
                    type="button"
                    onClick={() => setFilterQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--impronta-muted)] hover:text-foreground"
                    aria-label={fc.clearFilterSearchAria}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
                <AnimatePresence>
                  {hasFilterSearch ? (
                    <motion.p
                      key="hint"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                      className="mt-1.5 text-[10px] uppercase tracking-wider text-[var(--impronta-muted)]"
                    >
                      {matchCount > 0 ? (
                        formatFilterSearchSummary(fc, matchCount, visibleSections.length)
                      ) : (
                        fc.filterNoLabelsMatch
                      )}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>

              {hasFilterSearch && visibleSections.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--impronta-gold-border)]/50 px-3 py-4 text-center text-xs text-[var(--impronta-muted)]">
                  {fc.filterNothingMatches.replace("{q}", filterQuery.trim())}
                </p>
              ) : null}
            </div>
          );
        }

        const vis = visibleSectionMap.get(block.section.fieldKey);
        if (!vis) return null;
        const { section, options: opts } = vis;
        const defaultCollapsed = block.defaultCollapsed === true;

        if (section.kind === "height_range") {
          return (
            <HeightRangeSection
              key={`${section.fieldKey}-${hasFilterSearch ? "f" : "a"}`}
              section={section}
              heightMinCm={heightMinCm}
              heightMaxCm={heightMaxCm}
              onCommit={pushHeight}
              forceAccordionOpen={hasFilterSearch}
              defaultCollapsed={defaultCollapsed}
              fc={fc}
            />
          );
        }

        if (section.kind === "age_range") {
          return (
            <AgeRangeSection
              key={`${section.fieldKey}-${hasFilterSearch ? "f" : "a"}`}
              section={section}
              ageMin={ageMin}
              ageMax={ageMax}
              onCommit={pushAge}
              forceAccordionOpen={hasFilterSearch}
              defaultCollapsed={defaultCollapsed}
              fc={fc}
            />
          );
        }

        const optionSource = hasFilterSearch ? opts : section.options;
        const forceExpandLists = hasFilterSearch;

        const scalarSelected = (() => {
          const row = fieldFacets.find((f) => f.fieldKey === section.fieldKey);
          return new Set((row?.values ?? []).map((v) => v.trim()).filter(Boolean));
        })();

        return (
          <SectionAccordion
            key={`${section.fieldKey}-${hasFilterSearch ? "f" : "a"}`}
            title={section.label}
            defaultOpen={!defaultCollapsed}
            forceOpen={hasFilterSearch}
          >
            {section.kind === "location" ? (
              <DirectoryLocationSearchDropdown
                options={optionSource}
                locationSelected={locationSelected}
                pushLocation={pushLocation}
                filterSidebarQuery={hasFilterSearch ? filterQuery : ""}
                fc={fc}
              />
            ) : section.kind === "field_text_enum" && section.presentation === "radio" ? (
              <ExpandableRadioList
                options={optionSource}
                forceExpanded={forceExpandLists}
                fc={fc}
                renderRow={(opt) => {
                  const on = scalarSelected.has(opt.id);
                  const c = opt.count;
                  return (
                    <button
                      type="button"
                      onClick={() => selectScalarRadio(section.fieldKey, opt.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-sm transition-colors",
                        on ? "text-[var(--impronta-gold)]" : "text-zinc-300 hover:text-zinc-100",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex size-3.5 shrink-0 rounded-full border-2",
                            on
                              ? "border-[var(--impronta-gold)] bg-[var(--impronta-gold)]"
                              : "border-zinc-500",
                          )}
                          aria-hidden
                        />
                        <HighlightMatch text={opt.label} query={filterQuery} />
                      </span>
                      {c !== undefined ? (
                        <span className={cn("tabular-nums text-xs", on ? "" : "text-[var(--impronta-muted)]")}>
                          {c}
                        </span>
                      ) : null}
                    </button>
                  );
                }}
              />
            ) : section.kind === "profile_gender" ||
              section.kind === "field_boolean" ||
              (section.kind === "field_text_enum" && section.presentation === "chips") ? (
              <ExpandableChips
                optionCount={optionSource.length}
                forceExpanded={forceExpandLists}
                fc={fc}
              >
                <div className="flex flex-wrap gap-1.5">
                  {optionSource.map((opt) => {
                    const on = scalarSelected.has(opt.id);
                    const c = opt.count;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleScalarChip(section.fieldKey, opt.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          on
                            ? "border-[var(--impronta-gold)] bg-[rgba(212,175,55,0.12)] text-[var(--impronta-gold)]"
                            : "border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:border-[var(--impronta-gold-dim)] hover:text-zinc-200",
                        )}
                      >
                        <span>
                          <HighlightMatch text={opt.label} query={filterQuery} />
                        </span>
                        {c !== undefined ? (
                          <span className={cn("ml-1 tabular-nums", on ? "" : "opacity-70")}>({c})</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </ExpandableChips>
            ) : section.kind === "taxonomy" && section.presentation === "radio" ? (
              <ExpandableRadioList
                options={optionSource}
                forceExpanded={forceExpandLists}
                fc={fc}
                renderRow={(opt) => {
                  const on = selectedSet.has(opt.id);
                  const c = opt.count;
                  return (
                    <button
                      type="button"
                      onClick={() => selectRadio(section, opt.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-sm transition-colors",
                        on ? "text-[var(--impronta-gold)]" : "text-zinc-300 hover:text-zinc-100",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex size-3.5 shrink-0 rounded-full border-2",
                            on
                              ? "border-[var(--impronta-gold)] bg-[var(--impronta-gold)]"
                              : "border-zinc-500",
                          )}
                          aria-hidden
                        />
                        <HighlightMatch text={opt.label} query={filterQuery} />
                      </span>
                      {c !== undefined ? (
                        <span className={cn("tabular-nums text-xs", on ? "" : "text-[var(--impronta-muted)]")}>
                          {c}
                        </span>
                      ) : null}
                    </button>
                  );
                }}
              />
            ) : section.kind === "taxonomy" && section.presentation === "grid" ? (
              <ExpandableGrid
                optionCount={optionSource.length}
                forceExpanded={forceExpandLists}
                fc={fc}
              >
                {/*
                  Narrow sidebar (~224px): fixed 3 columns (not viewport sm:*) so density stays predictable.
                  Title case + single-line row + truncate keeps tiles short; full label in aria-label.
                */}
                <div className="grid grid-cols-3 gap-x-1 gap-y-1">
                  {optionSource.map((opt) => {
                    const on = selectedSet.has(opt.id);
                    const c = opt.count;
                    const displayLabel = facetTileLabel(opt.label);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleChip(opt.id)}
                        title={c !== undefined ? `${displayLabel} (${c})` : displayLabel}
                        aria-label={
                          c !== undefined
                            ? c === 1
                              ? fc.gridProfileAriaOne.replace("{label}", displayLabel)
                              : fc.gridProfileAriaMany
                                  .replace("{label}", displayLabel)
                                  .replace("{count}", String(c))
                            : displayLabel
                        }
                        className={cn(
                          "flex min-w-0 max-w-full items-center gap-0.5 rounded border py-0.5 pl-1 pr-0.5 text-left transition-colors",
                          on
                            ? "border-[var(--impronta-gold)] bg-[rgba(212,175,55,0.08)] text-[var(--impronta-gold)]"
                            : "border-[var(--impronta-gold-border)]/70 text-zinc-300 hover:border-[var(--impronta-gold-dim)] hover:bg-[var(--impronta-surface)]/50",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-[10px] font-medium leading-tight tracking-normal">
                          <HighlightMatch text={displayLabel} query={filterQuery} />
                        </span>
                        {c !== undefined ? (
                          <span
                            className={cn(
                              "shrink-0 text-[9px] font-normal tabular-nums leading-none",
                              on ? "text-[var(--impronta-gold)]/75" : "text-[var(--impronta-muted)]",
                            )}
                          >
                            {c}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </ExpandableGrid>
            ) : (
              <ExpandableChips
                optionCount={optionSource.length}
                forceExpanded={forceExpandLists}
                fc={fc}
              >
                <div className="flex flex-wrap gap-1.5">
                  {optionSource.map((opt) => {
                    const on = selectedSet.has(opt.id);
                    const c = opt.count;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleChip(opt.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          on
                            ? "border-[var(--impronta-gold)] bg-[rgba(212,175,55,0.12)] text-[var(--impronta-gold)]"
                            : "border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:border-[var(--impronta-gold-dim)] hover:text-zinc-200",
                        )}
                      >
                        <span>
                          <HighlightMatch text={opt.label} query={filterQuery} />
                        </span>
                        {c !== undefined ? (
                          <span className={cn("ml-1 tabular-nums", on ? "" : "opacity-70")}>({c})</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </ExpandableChips>
            )}
          </SectionAccordion>
        );
      })}
    </aside>
  );
}

function HeightRangeSection({
  section,
  heightMinCm,
  heightMaxCm,
  onCommit,
  forceAccordionOpen,
  defaultCollapsed = false,
  fc,
}: {
  section: Extract<DirectoryFilterSection, { kind: "height_range" }>;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  onCommit: (min: number | null, max: number | null) => void;
  forceAccordionOpen?: boolean;
  defaultCollapsed?: boolean;
  fc: DirectoryUiCopy["filters"];
}) {
  const lo = section.sliderMinCm;
  const hi = section.sliderMaxCm;
  const effMin = heightMinCm ?? lo;
  const effMax = heightMaxCm ?? hi;

  const [minV, setMinV] = useState(effMin);
  const [maxV, setMaxV] = useState(effMax);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMinV(heightMinCm ?? lo);
    setMaxV(heightMaxCm ?? hi);
  }, [heightMinCm, heightMaxCm, lo, hi]);

  const scheduleHeight = useCallback(
    (a: number, b: number) => {
      const x = Math.min(a, b);
      const y = Math.max(a, b);
      const atMin = x <= lo;
      const atMax = y >= hi;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onCommit(atMin ? null : x, atMax ? null : y);
      }, 380);
    },
    [lo, hi, onCommit],
  );

  return (
    <SectionAccordion
      title={section.label}
      defaultOpen={!defaultCollapsed}
      forceOpen={forceAccordionOpen}
    >
      <div className="space-y-3 px-0.5">
        <div className="flex items-center justify-between text-[11px] text-[var(--impronta-muted)]">
          <span className="tabular-nums">{minV}</span>
          <span className="tabular-nums">{maxV}</span>
        </div>
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-wide text-[var(--impronta-muted)]">
            {fc.minCm}
            <input
              type="range"
              min={lo}
              max={hi}
              value={Math.min(minV, maxV)}
              onChange={(e) => {
                const v = Number(e.target.value);
                const nextMin = Math.min(v, maxV);
                setMinV(nextMin);
                scheduleHeight(nextMin, maxV);
              }}
              className="mt-1 w-full accent-[var(--impronta-gold)]"
            />
          </label>
          <label className="block text-[10px] uppercase tracking-wide text-[var(--impronta-muted)]">
            {fc.maxCm}
            <input
              type="range"
              min={lo}
              max={hi}
              value={Math.max(minV, maxV)}
              onChange={(e) => {
                const v = Number(e.target.value);
                const nextMax = Math.max(v, minV);
                setMaxV(nextMax);
                scheduleHeight(minV, nextMax);
              }}
              className="mt-1 w-full accent-[var(--impronta-gold)]"
            />
          </label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full text-[11px] text-[var(--impronta-muted)] hover:text-foreground"
          onClick={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setMinV(lo);
            setMaxV(hi);
            onCommit(null, null);
          }}
        >
          {fc.resetHeight}
        </Button>
      </div>
    </SectionAccordion>
  );
}

function AgeRangeSection({
  section,
  ageMin,
  ageMax,
  onCommit,
  forceAccordionOpen,
  defaultCollapsed = false,
  fc,
}: {
  section: Extract<DirectoryFilterSection, { kind: "age_range" }>;
  ageMin: number | null;
  ageMax: number | null;
  onCommit: (min: number | null, max: number | null) => void;
  forceAccordionOpen?: boolean;
  defaultCollapsed?: boolean;
  fc: DirectoryUiCopy["filters"];
}) {
  const lo = section.sliderMinAge;
  const hi = section.sliderMaxAge;
  const effMin = ageMin ?? lo;
  const effMax = ageMax ?? hi;

  const [minV, setMinV] = useState(effMin);
  const [maxV, setMaxV] = useState(effMax);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMinV(ageMin ?? lo);
    setMaxV(ageMax ?? hi);
  }, [ageMin, ageMax, lo, hi]);

  const scheduleAge = useCallback(
    (a: number, b: number) => {
      const x = Math.min(a, b);
      const y = Math.max(a, b);
      const atMin = x <= lo;
      const atMax = y >= hi;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onCommit(atMin ? null : x, atMax ? null : y);
      }, 380);
    },
    [lo, hi, onCommit],
  );

  return (
    <SectionAccordion
      title={section.label}
      defaultOpen={!defaultCollapsed}
      forceOpen={forceAccordionOpen}
    >
      <div className="space-y-3 px-0.5">
        <div className="flex items-center justify-between text-[11px] text-[var(--impronta-muted)]">
          <span className="tabular-nums">{minV} yrs</span>
          <span className="tabular-nums">{maxV} yrs</span>
        </div>
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-wide text-[var(--impronta-muted)]">
            {fc.minAge}
            <input
              type="range"
              min={lo}
              max={hi}
              value={Math.min(minV, maxV)}
              onChange={(e) => {
                const v = Number(e.target.value);
                const nextMin = Math.min(v, maxV);
                setMinV(nextMin);
                scheduleAge(nextMin, maxV);
              }}
              className="mt-1 w-full accent-[var(--impronta-gold)]"
            />
          </label>
          <label className="block text-[10px] uppercase tracking-wide text-[var(--impronta-muted)]">
            {fc.maxAge}
            <input
              type="range"
              min={lo}
              max={hi}
              value={Math.max(minV, maxV)}
              onChange={(e) => {
                const v = Number(e.target.value);
                const nextMax = Math.max(v, minV);
                setMaxV(nextMax);
                scheduleAge(minV, nextMax);
              }}
              className="mt-1 w-full accent-[var(--impronta-gold)]"
            />
          </label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full text-[11px] text-[var(--impronta-muted)] hover:text-foreground"
          onClick={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setMinV(lo);
            setMaxV(hi);
            onCommit(null, null);
          }}
        >
          {fc.resetAge}
        </Button>
      </div>
    </SectionAccordion>
  );
}

function prettyChipLabel(label: string): string {
  const t = label.trim();
  if (!t) return t;
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function AppliedFilterChips({
  options,
  selectedIds,
  query = "",
  locationSlug = "",
  heightMinCm = null,
  heightMaxCm = null,
  chips,
}: {
  options: { id: string; name: string }[];
  selectedIds: string[];
  query?: string;
  locationSlug?: string;
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  chips: DirectoryUiCopy["chips"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const remove = useCallback(
    (id: string) => {
      const next = new Set(selectedSet);
      next.delete(id);
      startTransition(() => {
        commitDirectoryListingUrl(router, pathname, searchParams.toString(), (params) => {
          params.delete("ai_sum");
          if (next.size > 0) {
            params.set("tax", [...next].sort().join(","));
          } else {
            params.delete("tax");
          }
        });
      });
    },
    [router, pathname, searchParams, selectedSet, startTransition],
  );

  const removeParam = useCallback(
    (name: string) => {
      startTransition(() => {
        commitDirectoryListingUrl(router, pathname, searchParams.toString(), (params) => {
          params.delete("ai_sum");
          params.delete(name);
        });
      });
    },
    [router, pathname, searchParams, startTransition],
  );

  const selected = options.filter((o) => selectedSet.has(o.id));
  const hasHeight = heightMinCm != null || heightMaxCm != null;
  const hasExtraState =
    query.trim().length > 0 || locationSlug.trim().length > 0 || hasHeight;
  if (selected.length === 0 && !hasExtraState) return null;

  const prettyLocation = locationSlug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

  const chipClass =
    "rounded-lg border-[var(--impronta-gold-border)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--impronta-gold)] shadow-none hover:bg-[rgba(212,175,55,0.08)] hover:!text-[var(--impronta-gold)]";

  return (
    <FilterChips className="items-center">
      {selected.map((opt) => (
        <FilterChip
          key={opt.id}
          label={prettyChipLabel(opt.name)}
          onClick={() => remove(opt.id)}
          className={chipClass}
        >
          <X className="size-3.5 shrink-0 opacity-80" aria-hidden />
        </FilterChip>
      ))}
      {hasHeight ? (
        <FilterChip
          label={`${chips.height}${heightMinCm != null ? chips.heightMinPart.replace("{cm}", String(heightMinCm)) : ""}${heightMaxCm != null ? chips.heightMaxPart.replace("{cm}", String(heightMaxCm)) : ""}`}
          onClick={() => {
            startTransition(() => {
              commitDirectoryListingUrl(router, pathname, searchParams.toString(), (params) => {
                params.delete("ai_sum");
                params.delete("hmin");
                params.delete("hmax");
              });
            });
          }}
          className={chipClass}
        >
          <X className="size-3.5 shrink-0 opacity-80" aria-hidden />
        </FilterChip>
      ) : null}
      {query ? (
        <FilterChip
          label={`${chips.searchPrefix} ${query}`}
          onClick={() => removeParam("q")}
          className={chipClass}
        >
          <X className="size-3.5 shrink-0 opacity-80" aria-hidden />
        </FilterChip>
      ) : null}
      {locationSlug ? (
        <FilterChip
          label={prettyLocation || locationSlug}
          onClick={() => removeParam("location")}
          className={chipClass}
        >
          <X className="size-3.5 shrink-0 opacity-80" aria-hidden />
        </FilterChip>
      ) : null}
    </FilterChips>
  );
}
