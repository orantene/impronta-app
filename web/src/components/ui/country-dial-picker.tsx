/**
 * CountryDialPicker — searchable dropdown for ITU dial codes.
 *
 * Drop-in replacement for the bare `<select>` that used to ship 11
 * hard-coded prefixes. Renders as a compact button (flag + dial), and
 * on click opens a popover with a search input and the full ~245-country
 * list (filtered live by ISO code, country name, or dial). Picks store
 * the dial string back via `onChange`, the same shape the existing
 * identity reducer expects — so this is a leaf swap.
 *
 * Search ranks ISO matches first ("AR" jumps to Argentina even if the
 * user starts typing "ar"), then dial-code prefix matches ("+54"), then
 * country-name substring matches.
 */
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  COUNTRY_DIAL_CODES,
  POPULAR_DIAL_ISOS,
  firstIsoForDial,
  flagEmojiForIso,
  type CountryDial,
} from "@/lib/data/country-dial-codes";

type Props = {
  /** Current dial code WITH the leading "+", e.g. "+34". */
  value: string;
  /** Fired with the new dial code WITH the leading "+". */
  onChange: (dial: string) => void;
  /**
   * Optional ISO hint used when the same dial code maps to multiple
   * countries (e.g. +1 → US / Canada). Lets the trigger button show the
   * intended flag instead of always defaulting to the first match.
   */
  preferIso?: string;
  /** Disable interaction (e.g. while a parent action is in flight). */
  disabled?: boolean;
  /** Optional style override for the trigger button. */
  className?: string;
  /** ARIA label for assistive tech. Defaults to "Country dial code". */
  ariaLabel?: string;
};

const POPULAR_SET = new Set<string>(POPULAR_DIAL_ISOS);

function isoForValue(value: string, preferIso?: string): string {
  if (preferIso) return preferIso.toUpperCase();
  return firstIsoForDial(value) ?? "";
}

function ranked(query: string): CountryDial[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // No query → popular first (in the declared order), then everyone
    // else alphabetically (the source list is already sorted).
    const popular = POPULAR_DIAL_ISOS
      .map((iso) => COUNTRY_DIAL_CODES.find((c) => c.iso === iso))
      .filter((c): c is CountryDial => !!c);
    const rest = COUNTRY_DIAL_CODES.filter((c) => !POPULAR_SET.has(c.iso));
    return [...popular, ...rest];
  }
  const isoMatches: CountryDial[] = [];
  const dialMatches: CountryDial[] = [];
  const nameMatches: CountryDial[] = [];
  const qDial = q.startsWith("+") ? q : `+${q}`;
  for (const row of COUNTRY_DIAL_CODES) {
    const iso = row.iso.toLowerCase();
    const name = row.name.toLowerCase();
    if (iso === q || iso.startsWith(q)) {
      isoMatches.push(row);
    } else if (row.dial === qDial || row.dial.startsWith(qDial)) {
      dialMatches.push(row);
    } else if (name.includes(q)) {
      nameMatches.push(row);
    }
  }
  return [...isoMatches, ...dialMatches, ...nameMatches];
}

export function CountryDialPicker({
  value,
  onChange,
  preferIso,
  disabled,
  className,
  ariaLabel = "Country dial code",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (e.target instanceof Node && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Auto-focus the search input when the popover opens.
  useEffect(() => {
    if (open) {
      // Defer so the input is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
    }
  }, [open]);

  const triggerIso = isoForValue(value, preferIso);
  const triggerFlag = triggerIso ? flagEmojiForIso(triggerIso) : "🌐";

  const results = useMemo(() => ranked(query), [query]);

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", display: "inline-flex" }}
      className={className}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 8px 10px 12px",
          background: "rgba(11,11,13,0.03)",
          border: "none",
          borderRadius: 0,
          fontFamily: "inherit",
          fontSize: 13,
          color: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
          minWidth: 88,
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>{triggerFlag}</span>
        <span>{value}</span>
        <span aria-hidden style={{ fontSize: 9, opacity: 0.5, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 50,
            marginTop: 4,
            width: 280,
            maxHeight: 340,
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            border: "1px solid rgba(11,11,13,0.12)",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(11,11,13,0.15)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 8, borderBottom: "1px solid rgba(11,11,13,0.08)" }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  e.preventDefault();
                  onChange(results[0].dial);
                  setOpen(false);
                }
              }}
              placeholder="Search country, ISO, or +code…"
              aria-label="Search country dial code"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid rgba(11,11,13,0.12)",
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            {results.length === 0 ? (
              <div style={{
                padding: "12px 14px",
                fontSize: 12,
                color: "rgba(11,11,13,0.55)",
              }}>
                No matches
              </div>
            ) : (
              results.map((row, idx) => {
                const isActive = row.dial === value && (!preferIso || row.iso === preferIso.toUpperCase());
                const showPopularDivider = !query && idx === POPULAR_DIAL_ISOS.length;
                return (
                  <React.Fragment key={`${row.iso}-${row.dial}`}>
                    {showPopularDivider && (
                      <div style={{
                        margin: "6px 14px",
                        borderTop: "1px solid rgba(11,11,13,0.08)",
                      }} aria-hidden />
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        onChange(row.dial);
                        setOpen(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        padding: "8px 14px",
                        border: "none",
                        background: isActive ? "rgba(11,11,13,0.06)" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                        fontSize: 13,
                        color: "inherit",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = "rgba(11,11,13,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span aria-hidden style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                        {flagEmojiForIso(row.iso)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.name}
                      </span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "rgba(11,11,13,0.55)",
                        letterSpacing: 0.3,
                        flexShrink: 0,
                      }}>
                        {row.iso}
                      </span>
                      <span style={{
                        fontSize: 12,
                        color: "rgba(11,11,13,0.7)",
                        minWidth: 44,
                        textAlign: "right",
                        flexShrink: 0,
                      }}>
                        {row.dial}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
