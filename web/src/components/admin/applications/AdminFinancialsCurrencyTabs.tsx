"use client";

import { useState, type ReactNode } from "react";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

/**
 * AdminFinancialsCurrencyTabs (PR-E / L49).
 *
 * Renders a per-currency tab strip when more than one currency is
 * present, then displays only the active child (`children` keyed by the
 * currency code). When there's a single currency the strip hides itself
 * and the lone child renders inline — no regression for EUR-only
 * tenants. Display-only; no FX conversion happens here or anywhere.
 */
export function AdminFinancialsCurrencyTabs({
  currencies,
  defaultCurrency,
  children,
}: {
  currencies: string[];
  defaultCurrency: string;
  /** Map of currency code → bundle DOM. Keys must match `currencies`. */
  children: Record<string, ReactNode>;
}) {
  const initial = currencies.includes(defaultCurrency)
    ? defaultCurrency
    : currencies[0] ?? defaultCurrency;
  const [active, setActive] = useState(initial);

  if (currencies.length === 0) {
    return <>{children[defaultCurrency] ?? null}</>;
  }
  if (currencies.length === 1) {
    return <>{children[currencies[0]!] ?? null}</>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT }}>
      <div
        role="tablist"
        aria-label="Currency"
        style={{
          display: "inline-flex",
          gap: 4,
          padding: 4,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 999,
          width: "fit-content",
        }}
      >
        {currencies.map((code) => {
          const isActive = code === active;
          return (
            <button
              key={code}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActive(code)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 600,
                background: isActive ? "#fff" : "transparent",
                border: isActive ? `1px solid ${C.border}` : "1px solid transparent",
                color: isActive ? C.ink : C.inkMuted,
                cursor: isActive ? "default" : "pointer",
                fontFamily: FONT,
                letterSpacing: 0.2,
              }}
            >
              {code}
              {code === defaultCurrency && (
                <span style={{
                  marginLeft: 6, fontSize: 9.5, color: isActive ? C.accent : C.inkDim,
                  textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700,
                }}>default</span>
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{children[active] ?? null}</div>
    </div>
  );
}
