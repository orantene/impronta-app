"use client";

/**
 * WS5 — per-field locale tab strip for the Content panel.
 *
 * Renders above a localizable text input (Behavior 1 of the page-builder
 * per-element translation feature):
 *   - One tab per tenant-supported locale, DEFAULT first.
 *   - Each tab shows a status dot: 🟢 filled = a value is present for that
 *     locale, ⚪ hollow = empty (red ring drawing the eye to a gap).
 *   - The active tab decides which locale the field edits: the DEFAULT tab
 *     edits the node's base prop; a SECONDARY tab edits `node.i18n[locale][prop]`.
 *   - A roll-up dot in the header turns green only when EVERY supported locale
 *     has a value ("fully translated" for this field).
 *
 * Single-language tenant → the caller renders the plain field (no `<LocaleFieldTabs>`).
 *
 * The component is presentation + active-tab state only; the parent owns the
 * actual value-by-locale lookups and commits (so the field still flows through
 * the existing `patchBuilderNodeProps` autosave). It defaults the active tab to
 * `activeContentLocale` (the top-header toggle) so flipping the page to ES opens
 * every field on its ES tab.
 */
import { useEffect, useState, type ReactNode } from "react";

import { localeMetadata } from "@/i18n/config";
import { KIT } from "./kit/tokens";

export interface LocaleFieldTabsProps {
  /** Tenant supported locales, DEFAULT first (from TenantLocaleSettings). */
  supportedLocales: readonly string[];
  /** The tenant default ("primary") locale — edits the node's base prop. */
  defaultLocale: string;
  /** The in-session active content locale (top-header toggle) — initial tab. */
  activeContentLocale: string;
  /** Does `locale` currently have a non-empty value for this field? (dot.) */
  hasValueForLocale: (locale: string) => boolean;
  /** Render the field body for the active tab's locale. */
  renderField: (locale: string, isDefault: boolean) => ReactNode;
  /** Optional accessible name for the tablist. */
  ariaLabel?: string;
}

function localeLabel(code: string): string {
  return localeMetadata[code]?.label ?? code.toUpperCase();
}

export function LocaleFieldTabs({
  supportedLocales,
  defaultLocale,
  activeContentLocale,
  hasValueForLocale,
  renderField,
  ariaLabel = "Field language",
}: LocaleFieldTabsProps) {
  // Order: default first, then the rest in tenant order.
  const orderedLocales = [
    defaultLocale,
    ...supportedLocales.filter((l) => l !== defaultLocale),
  ];

  const initialActive = orderedLocales.includes(activeContentLocale)
    ? activeContentLocale
    : defaultLocale;
  const [activeTab, setActiveTab] = useState(initialActive);

  // Follow the top-header toggle: when the operator flips the page locale, every
  // open field's tab snaps to that locale (Behavior 2c). Local clicks still win
  // until the header changes again.
  useEffect(() => {
    if (orderedLocales.includes(activeContentLocale)) {
      setActiveTab(activeContentLocale);
    }
    // Intentionally keyed on the header locale only — a local tab click must not
    // be reset by an unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContentLocale]);

  const allTranslated = orderedLocales.every((l) => hasValueForLocale(l));
  const isDefaultActive = activeTab === defaultLocale;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label={ariaLabel}
          className="inline-flex flex-wrap items-center gap-1 rounded-[8px] bg-[#f4f1ea] p-[3px]"
        >
          {orderedLocales.map((code) => {
            const active = code === activeTab;
            const filled = hasValueForLocale(code);
            return (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={active}
                title={`Edit ${localeLabel(code)}${
                  code === defaultLocale ? " (default)" : ""
                }${filled ? " — translated" : " — empty"}`}
                onClick={() => setActiveTab(code)}
                className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors ${
                  active
                    ? "bg-white text-stone-800 shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block h-[7px] w-[7px] rounded-full"
                  style={
                    filled
                      ? { background: "#22c55e", boxShadow: "0 0 0 1px #16a34a" }
                      : {
                          background: "transparent",
                          boxShadow: "0 0 0 1.5px #f43f5e",
                        }
                  }
                />
                {code}
              </button>
            );
          })}
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: allTranslated ? "#16a34a" : "#a8a29e" }}
          title={
            allTranslated
              ? "This field is translated in every language."
              : "This field is missing a translation in at least one language."
          }
        >
          <span
            aria-hidden
            className="inline-block h-[7px] w-[7px] rounded-full"
            style={
              allTranslated
                ? { background: "#22c55e" }
                : { background: "transparent", boxShadow: "0 0 0 1.5px #d6d3d1" }
            }
          />
          {allTranslated ? "All" : "Partial"}
        </span>
      </div>
      {renderField(activeTab, isDefaultActive)}
    </div>
  );
}
