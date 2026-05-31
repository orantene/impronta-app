"use client";

import { useEffect, useRef, useState } from "react";
import { FOCUS_RING } from "./shared";

/**
 * Primary directory search — bound to the `q` URL param. Debounced so typing
 * doesn't fire a navigation per keystroke; Enter commits immediately. Single
 * source of truth for search, so the sidebar deliberately doesn't duplicate it.
 */
export function DirectorySearch({
  value,
  onCommit,
  placeholder = "Search talent by name",
}: {
  value: string | null;
  onCommit: (value: string | null) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const lastCommitted = useRef(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reflect external changes (e.g. Clear all, back/forward) into the input.
  useEffect(() => {
    setDraft(value ?? "");
    lastCommitted.current = value ?? "";
  }, [value]);

  // Debounced commit.
  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === lastCommitted.current) return;
    const id = setTimeout(() => {
      lastCommitted.current = trimmed;
      onCommit(trimmed.length > 0 ? trimmed : null);
    }, 320);
    return () => clearTimeout(id);
  }, [draft, onCommit]);

  const clear = () => {
    setDraft("");
    lastCommitted.current = "";
    onCommit(null);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
        style={{ color: "var(--plt-muted)" }}
      >
        <SearchGlyph />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const trimmed = draft.trim();
            lastCommitted.current = trimmed;
            onCommit(trimmed.length > 0 ? trimmed : null);
          } else if (e.key === "Escape" && draft.length > 0) {
            e.preventDefault();
            clear();
          }
        }}
        placeholder={placeholder}
        aria-label="Search talent"
        className="h-12 w-full rounded-full pl-11 pr-11 text-[0.9375rem] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--plt-muted-soft)] focus:shadow-[0_0_0_4px_var(--plt-forest-ring)] [&::-webkit-search-cancel-button]:appearance-none"
        style={{
          background: "var(--plt-bg-raised)",
          border: "1px solid var(--plt-hairline-strong)",
          color: "var(--plt-ink)",
        }}
      />
      {draft.length > 0 ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className={`absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-[var(--plt-bg-deep)] ${FOCUS_RING}`}
          style={{ color: "var(--plt-muted)" }}
        >
          <ClearGlyph />
        </button>
      ) : null}
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClearGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
