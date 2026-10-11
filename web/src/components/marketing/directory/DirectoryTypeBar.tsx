"use client";

import { useEffect, useState } from "react";
import { DIRECTORY_TOP_TYPES, FOCUS_RING, type DirectoryFacets } from "./shared";
import { directoryCopy } from "./directory-copy";

type Category = DirectoryFacets["categories"][number];

/**
 * Lean talent-type bar: an "All" pill + the top-N categories by count, with
 * the remaining categories tucked into a "More" overflow popover. Selecting a
 * type filters the grid; selecting the active type again clears it.
 */
export function DirectoryTypeBar({
  categories,
  active,
  onSelect,
  locale,
}: {
  categories: Category[];
  active: string | null;
  onSelect: (slug: string | null) => void;
  locale: string;
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const c = directoryCopy(locale);

  // Escape closes the overflow popover (click-away is handled by the backdrop).
  useEffect(() => {
    if (!overflowOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverflowOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overflowOpen]);

  if (categories.length === 0) return null;

  const top = categories.slice(0, DIRECTORY_TOP_TYPES);
  const rest = categories.slice(DIRECTORY_TOP_TYPES);
  const activeInRest = rest.find((c) => c.value === active) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill label={c.allTalent} selected={active === null} onClick={() => onSelect(null)} />
      {top.map((cat) => (
        <Pill
          key={cat.value}
          label={cat.label}
          count={cat.count}
          selected={active === cat.value}
          onClick={() => onSelect(active === cat.value ? null : cat.value)}
        />
      ))}
      {/* If the active type is hidden in the overflow, surface it as a pill so
          the selection is always visible. */}
      {activeInRest ? (
        <Pill
          label={activeInRest.label}
          count={activeInRest.count}
          selected
          onClick={() => onSelect(null)}
        />
      ) : null}

      {rest.length > 0 ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOverflowOpen((o) => !o)}
            aria-expanded={overflowOpen}
            aria-haspopup="true"
            className={`inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[0.8125rem] font-medium leading-none transition-colors ${FOCUS_RING}`}
            style={{
              border: "1px solid var(--plt-hairline-strong)",
              background: "var(--plt-bg-raised)",
              color: "var(--plt-ink-soft)",
            }}
          >
            {c.more}
            <ChevronGlyph open={overflowOpen} />
          </button>
          {overflowOpen ? (
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setOverflowOpen(false)}
              />
              <div
                className="absolute left-0 z-50 mt-2 max-h-72 w-60 overflow-auto rounded-[16px] p-1.5"
                style={{
                  background: "var(--plt-bg-raised)",
                  border: "1px solid var(--plt-hairline-strong)",
                  boxShadow: "var(--plt-shadow-lg)",
                }}
              >
                {rest.map((cat) => {
                  const selected = cat.value === active;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => {
                        onSelect(selected ? null : cat.value);
                        setOverflowOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-[11px] px-3 py-2 text-left text-[0.8125rem] transition-colors hover:bg-[var(--plt-bg-deep)] ${FOCUS_RING}`}
                      style={{ color: selected ? "var(--plt-forest)" : "var(--plt-ink-soft)" }}
                    >
                      <span className="truncate">{cat.label}</span>
                      <span className="shrink-0 text-[0.6875rem]" style={{ color: "var(--plt-muted-soft)" }}>
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Pill({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.8125rem] font-medium leading-none transition-[background,color,border-color] duration-200 ${FOCUS_RING}`}
      style={
        selected
          ? {
              background: "var(--plt-forest)",
              color: "var(--plt-forest-on)",
              border: "1px solid var(--plt-forest)",
            }
          : {
              background: "var(--plt-bg-raised)",
              color: "var(--plt-ink-soft)",
              border: "1px solid var(--plt-hairline-strong)",
            }
      }
    >
      {label}
      {typeof count === "number" ? (
        <span
          className="text-[0.6875rem]"
          style={{ color: selected ? "color-mix(in srgb, var(--plt-forest-on) 75%, transparent)" : "var(--plt-muted-soft)" }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      aria-hidden
      className="transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
    >
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
