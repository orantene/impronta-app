"use client";

/**
 * CurrencyPicker — "Showing prices in MXN · change" dropdown for
 * marketing surfaces (L50 Phase 2).
 *
 * Behavior:
 *   1. Renders the currently active currency (passed in via prop from
 *      the server-side `resolveCurrency` call).
 *   2. Click → opens a small native-style dropdown.
 *   3. Pick a currency → writes the `tulala-currency` cookie (so
 *      subsequent server renders pick it up) AND navigates with
 *      `?currency=X` (so the IMMEDIATE next render reflects the
 *      change without waiting for the cookie round-trip).
 *
 * No localStorage write — the cookie is the source of truth (server
 * can read it on first render; localStorage can't).
 */

import { useState, useRef, useEffect } from "react";
import {
  DEFAULT_CURRENCY_OPTIONS,
  CURRENCY_LABELS,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";

const COOKIE_NAME = "tulala-currency";
const COOKIE_MAX_AGE_DAYS = 365;

export function CurrencyPicker({
  current,
  source,
}: {
  current: DefaultCurrencyCode | string;
  /** Where the current value came from. Shown in the chip subtitle. */
  source?: "url-param" | "cookie" | "ip-country" | "fallback";
}) {
  const [open, setOpen] = useState(false);
  // On hydration, prefer the URL param if present so the chip shows
  // what the rest of the page is actually rendering. The footer reads
  // currency from cookie/IP only (no searchParams plumbing through the
  // shell), so without this useEffect the chip would say USD on a page
  // loaded with `?currency=MXN`. The effect ALSO writes the cookie so
  // the next navigation persists the choice.
  const [displayedCurrency, setDisplayedCurrency] = useState(current);
  const [displayedSource, setDisplayedSource] = useState(source);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const urlValue = url.searchParams.get("currency")?.toUpperCase();
    if (
      urlValue &&
      (DEFAULT_CURRENCY_OPTIONS as readonly string[]).includes(urlValue)
    ) {
      setDisplayedCurrency(urlValue);
      setDisplayedSource("url-param");
      // Sticky-fy the URL choice via cookie so the next page render
      // also picks it up server-side.
      const maxAgeSecs = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
      // eslint-disable-next-line react-hooks/immutability
      document.cookie = `${COOKIE_NAME}=${urlValue}; path=/; max-age=${maxAgeSecs}; SameSite=Lax`;
    }
  }, []);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const upperCurrent = displayedCurrency.toUpperCase();

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function pick(code: DefaultCurrencyCode) {
    // Set the cookie so future requests / pages remember the choice.
    // `document.cookie =` is the only API for writing cookies from the
    // browser; the react-hooks/immutability rule flags it as a mutation
    // because `document` is module-external, but this is a deliberate
    // side effect on a click handler — exactly what the rule is meant to
    // permit. Same logic for window.location.assign below.
    const maxAgeSecs = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `${COOKIE_NAME}=${code}; path=/; max-age=${maxAgeSecs}; SameSite=Lax`;
    const url = new URL(window.location.href);
    url.searchParams.set("currency", code);
    window.location.assign(url.toString());
  }

  const subtitle =
    displayedSource === "ip-country"
      ? "Auto-detected"
      : displayedSource === "cookie"
        ? "Your pick"
        : displayedSource === "url-param"
          ? "Set via link"
          : displayedSource === "fallback"
            ? "Default"
            : undefined;

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.8125rem] transition-colors"
        style={{
          borderColor: "var(--plt-hairline)",
          background: "var(--plt-bg-raised)",
          color: "var(--plt-ink-soft)",
        }}
      >
        <span>Showing prices in</span>
        <strong style={{ color: "var(--plt-ink)", fontVariantNumeric: "tabular-nums" }}>
          {upperCurrent}
        </strong>
        {subtitle && (
          <span style={{ color: "var(--plt-muted)", fontSize: "0.6875rem" }}>
            · {subtitle}
          </span>
        )}
        <span aria-hidden style={{ marginLeft: 2, fontSize: "0.625rem" }}>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Pick a currency"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            minWidth: 240,
            background: "var(--plt-bg-raised)",
            border: "1px solid var(--plt-hairline)",
            borderRadius: 12,
            boxShadow: "0 24px 48px -20px rgba(15,23,20,0.18)",
            padding: 6,
            zIndex: 50,
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {DEFAULT_CURRENCY_OPTIONS.map((code) => {
            const isCurrent = code === upperCurrent;
            return (
              <button
                key={code}
                role="option"
                aria-selected={isCurrent}
                type="button"
                onClick={() => pick(code)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  background: isCurrent ? "rgba(0,0,0,0.05)" : "transparent",
                  border: "none",
                  borderRadius: 8,
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  color: "var(--plt-ink)",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = "rgba(0,0,0,0.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                {isCurrent ? "✓" : <span style={{ width: 9 }} aria-hidden />}
                <span style={{ flex: 1 }}>{CURRENCY_LABELS[code]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
