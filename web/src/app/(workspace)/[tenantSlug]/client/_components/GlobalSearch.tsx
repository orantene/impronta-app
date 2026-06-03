"use client";

/**
 * GlobalSearch (client shell) — search affordance for the client identity bar.
 *
 * A compact search button that expands into an input + results dropdown.
 * Queries the shared `globalSearch` server action (Agent 3's contract),
 * debounced ~250ms. Results are grouped by kind with a snippet; clicking a
 * row navigates to its href via the next/navigation router. Esc / outside
 * click closes; ↑/↓ move the active row, Enter opens it.
 *
 * Matches the client shell visual language: blue accent (#1D4ED8) on white,
 * Inter, soft borders — mirrors ClientNotificationBell.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { globalSearch } from "@/lib/search/global-search";
import type { SearchResult } from "@/lib/search/global-search-types";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  fill: "#1D4ED8",
  fillSoft: "rgba(29,78,216,0.08)",
  surface: "rgba(11,11,13,0.02)",
  surfaceAlt: "rgba(11,11,13,0.04)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

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

function iconForKind(kind: SearchResult["kind"]): string {
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

export function GlobalSearch({ placeholder }: { placeholder?: string }) {
  const router = useRouter();
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const reqRef = useRef(0);

  // Debounced search — fire ~250ms after the last keystroke. The request
  // counter guards against out-of-order resolutions.
  useEffect(() => {
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

  // Close on outside click + Esc.
  useEffect(() => {
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

  const grouped = useMemo(() => {
    const map = new Map<SearchResult["kind"], SearchResult[]>();
    for (const r of results) {
      const bucket = map.get(r.kind) ?? [];
      bucket.push(r);
      map.set(r.kind, bucket);
    }
    // Flatten in fixed kind order so the active-index navigation is stable.
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

  const navigate = useCallback(
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
    <div
      ref={rootRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      {/* Input pill */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          height: 34,
          width: 220,
          maxWidth: "38vw",
          padding: "0 10px",
          borderRadius: 8,
          border: `1px solid ${open ? "rgba(29,78,216,0.45)" : C.borderSoft}`,
          background: "#fff",
          boxShadow: open ? `0 0 0 3px ${C.fillSoft}` : "none",
          transition: "border-color 0.12s, box-shadow 0.12s",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={open ? C.fill : C.inkDim}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{ flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
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
          placeholder={placeholder ?? "Search…"}
          aria-label="Search"
          aria-expanded={showDropdown}
          aria-controls={popoverId}
          role="combobox"
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: FONT,
            fontSize: 13,
            color: C.ink,
          }}
        />
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div
          id={popoverId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "70vh",
            background: "#fff",
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            boxShadow:
              "0 24px 60px -10px rgba(11,11,13,0.28), 0 4px 16px rgba(11,11,13,0.06)",
            overflowY: "auto",
            zIndex: 60,
            fontFamily: FONT,
          }}
        >
          {results.length === 0 ? (
            <div
              style={{
                padding: "26px 16px",
                textAlign: "center",
                fontSize: 13,
                color: C.inkMuted,
              }}
            >
              {loading ? "Searching…" : "No matches"}
            </div>
          ) : (
            grouped.sections.map((section) => (
              <div key={section.kind}>
                <div
                  style={{
                    padding: "9px 14px 5px",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: C.inkDim,
                  }}
                >
                  {KIND_LABEL[section.kind]}
                </div>
                {section.items.map((r) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  return (
                    <div
                      key={`${r.kind}-${r.id}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => navigate(r.href)}
                      onMouseEnter={() => setActiveIndex(runningIndex)}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "9px 14px",
                        cursor: "pointer",
                        background: isActive ? C.surfaceAlt : "transparent",
                        transition: "background 100ms",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: C.surface,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 13,
                        }}
                      >
                        {iconForKind(r.kind)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: C.ink,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.title}
                        </div>
                        {r.snippet && (
                          <div
                            style={{
                              fontSize: 11,
                              color: C.inkMuted,
                              marginTop: 1,
                              lineHeight: 1.4,
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {r.snippet}
                          </div>
                        )}
                      </div>
                    </div>
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
