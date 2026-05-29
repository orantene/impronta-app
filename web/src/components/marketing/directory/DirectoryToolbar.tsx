"use client";

import type { DirectoryView, DiscoverSort } from "./shared";

/**
 * Results toolbar: live count · mobile "Filters" trigger · grid/list/map view
 * toggle · sort. Sort offers two honest, deterministic orderings against real
 * matview columns (no fabricated "Newest" — the view has no per-talent
 * recency column).
 */
export function DirectoryToolbar({
  total,
  view,
  sort,
  activeFilterCount,
  onView,
  onSort,
  onOpenFilters,
}: {
  total: number;
  view: DirectoryView;
  sort: DiscoverSort;
  activeFilterCount: number;
  onView: (view: DirectoryView) => void;
  onSort: (sort: DiscoverSort) => void;
  onOpenFilters: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenFilters}
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.8125rem] font-medium leading-none lg:hidden"
          style={{
            border: "1px solid var(--plt-hairline-strong)",
            background: "var(--plt-bg-raised)",
            color: "var(--plt-ink-soft)",
          }}
        >
          <FilterGlyph />
          Filters
          {activeFilterCount > 0 ? (
            <span
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold"
              style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}
            >
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        <p className="text-[0.875rem]" style={{ color: "var(--plt-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--plt-ink)" }}>
            {total.toLocaleString()}
          </span>{" "}
          {total === 1 ? "profile" : "profiles"}
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        {view !== "map" ? (
          <label className="flex items-center gap-2 text-[0.8125rem]" style={{ color: "var(--plt-muted)" }}>
            <span className="hidden sm:inline">Sort</span>
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value === "availability" ? "availability" : "recommended")}
              className="h-9 rounded-full pl-3.5 pr-8 text-[0.8125rem] font-medium outline-none transition-colors focus:shadow-[0_0_0_4px_var(--plt-forest-ring)]"
              style={{
                border: "1px solid var(--plt-hairline-strong)",
                background:
                  "var(--plt-bg-raised) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236b7065' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 0.9rem center",
                color: "var(--plt-ink)",
                appearance: "none",
                WebkitAppearance: "none",
              }}
            >
              <option value="recommended">Recommended</option>
              <option value="availability">Most available</option>
            </select>
          </label>
        ) : null}

        <div
          role="tablist"
          aria-label="View mode"
          className="inline-flex items-center gap-0.5 rounded-full p-0.5"
          style={{ background: "var(--plt-bg-deep)", border: "1px solid var(--plt-hairline)" }}
        >
          <ViewTab label="Grid" active={view === "grid"} onClick={() => onView("grid")}>
            <GridGlyph />
          </ViewTab>
          <ViewTab label="List" active={view === "list"} onClick={() => onView("list")}>
            <ListGlyph />
          </ViewTab>
          <ViewTab label="Map" active={view === "map"} onClick={() => onView("map")}>
            <MapGlyph />
          </ViewTab>
        </div>
      </div>
    </div>
  );
}

function ViewTab({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[0.75rem] font-medium leading-none transition-colors"
      style={{
        background: active ? "var(--plt-bg-raised)" : "transparent",
        color: active ? "var(--plt-forest)" : "var(--plt-muted)",
        boxShadow: active ? "var(--plt-shadow-sm)" : "none",
      }}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FilterGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 4H14M4 8H12M6 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function GridGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1" y="1" width="5" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8" y="1" width="5" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="8" width="5" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8" y="8" width="5" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function ListGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1 3H13M1 7H13M1 11H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function MapGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 13C9.5 10 11.5 7.7 11.5 5.5C11.5 3 9.5 1 7 1C4.5 1 2.5 3 2.5 5.5C2.5 7.7 4.5 10 7 13Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
