"use client";

/**
 * AdminGlobalSearch — search affordance for the admin SPA shell top bar.
 *
 * Self-contained: it does NOT call useAdminShell (the top bar renders OUTSIDE
 * AdminShellProvider). It consumes the shared `globalSearch` server action
 * (Agent 3's contract), debounced ~250ms, and renders a results dropdown
 * grouped by kind. Clicking a row navigates via next/navigation's router.
 * Esc / outside click closes; ↑/↓ move the active row, Enter opens it.
 *
 * Visual language matches admin-shell-top-bar: token-driven foreground/border
 * colours, rounded-lg controls, the --admin-gold focus ring. Tailwind classes
 * only (no inline styles) so it carries no eslint-suppression weight.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { globalSearch } from "@/lib/search/global-search";
import type { SearchResult } from "@/lib/search/global-search-types";

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  inquiry: "Inquiries",
  booking: "Bookings",
  message: "Messages",
  talent: "Talent",
};

const KIND_ORDER: SearchResult["kind"][] = [
  "inquiry",
  "booking",
  "message",
  "talent",
];

function kindGlyph(kind: SearchResult["kind"]): string {
  switch (kind) {
    case "inquiry":
      return "✉";
    case "booking":
      return "📅";
    case "message":
      return "💬";
    case "talent":
      return "👤";
    default:
      return "•";
  }
}

export function AdminGlobalSearch() {
  const router = useRouter();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const reqRef = React.useRef(0);

  // Debounced search (~250ms). Request counter discards stale resolutions.
  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const myReq = ++reqRef.current;
    const handle = window.setTimeout(async () => {
      try {
        const res = await globalSearch(trimmed);
        if (reqRef.current === myReq) {
          setResults(res);
          setActiveIndex(0);
        }
      } catch {
        if (reqRef.current === myReq) setResults([]);
      } finally {
        if (reqRef.current === myReq) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Outside click + Esc close.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grouped = React.useMemo(() => {
    const map = new Map<SearchResult["kind"], SearchResult[]>();
    for (const r of results) {
      const bucket = map.get(r.kind) ?? [];
      bucket.push(r);
      map.set(r.kind, bucket);
    }
    const flat: SearchResult[] = [];
    const sections: { kind: SearchResult["kind"]; items: SearchResult[] }[] = [];
    for (const kind of KIND_ORDER) {
      const items = map.get(kind);
      if (items && items.length) {
        sections.push({ kind, items });
        flat.push(...items);
      }
    }
    return { sections, flat };
  }, [results]);

  const navigate = React.useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      setResults([]);
      inputRef.current?.blur();
      router.push(href);
    },
    [router],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!grouped.flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % grouped.flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + grouped.flat.length) % grouped.flat.length);
    } else if (e.key === "Enter") {
      const target = grouped.flat[activeIndex];
      if (target) {
        e.preventDefault();
        navigate(target.href);
      }
    }
  };

  const showDropdown =
    open && query.trim().length >= 2 && (loading || results.length > 0);

  let runningIndex = -1;

  return (
    <div ref={rootRef} className="relative">
      {/* Input pill — token-driven, mirrors the top bar's other controls. */}
      <div
        className={cn(
          "flex h-9 w-[220px] max-w-[38vw] items-center gap-2 rounded-lg border bg-background px-2.5 transition-[border-color,box-shadow]",
          open
            ? "border-[var(--admin-gold)]/60 ring-2 ring-[var(--admin-gold)]/30"
            : "border-foreground/15",
        )}
      >
        <Search
          className={cn(
            "size-3.5 shrink-0",
            open ? "text-foreground/70" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder="Search inquiries, bookings, talent…"
          aria-label="Search"
          aria-expanded={showDropdown}
          role="combobox"
          aria-controls="admin-global-search-results"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div
          id="admin-global-search-results"
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] w-[360px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-border bg-background shadow-xl"
        >
          {results.length === 0 ? (
            <div className="py-8 text-center text-[12.5px] text-muted-foreground">
              {loading ? "Searching…" : "No matches"}
            </div>
          ) : (
            grouped.sections.map((section) => (
              <div key={section.kind}>
                <div className="px-3.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {KIND_LABEL[section.kind]}
                </div>
                {section.items.map((r) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  const idx = runningIndex;
                  return (
                    <button
                      key={`${r.kind}-${r.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => navigate(r.href)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-3.5 py-2 text-left transition-colors",
                        isActive ? "bg-muted/60" : "hover:bg-muted/40",
                      )}
                    >
                      <span
                        aria-hidden
                        className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-[13px]"
                      >
                        {kindGlyph(r.kind)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-foreground">
                          {r.title}
                        </span>
                        {r.snippet ? (
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {r.snippet}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
