"use client";

/**
 * Phase 9 (M-20) — per-locale tabbed input for i18nString fields.
 *
 * Operators usually edit the default (English) copy via the standard
 * text/textarea control. When they need to translate, they expand the
 * "Localize" disclosure and the field reveals a tab strip — one tab per
 * locale supported by `i18nString`. Switching tabs swaps the textarea
 * value; saves go through `setI18n()` so the underlying store is the
 * locale map, not a string.
 *
 * Defaults:
 *   - "default" tab maps to the original plain-string value
 *   - English ("en") is shown second
 *   - Other locales are added on demand via the "Add language" picker
 *
 * Translation status pip on each tab indicates whether that locale has a
 * non-empty value yet.
 *
 * NOTE: This is the inspector-side primitive. Storage continues to use
 * `i18nString` (plain string OR locale map). Plain-string values stay
 * editable in their original control until the operator opens this; on
 * first locale write the value is auto-promoted into a map.
 */

import { useState, type ReactElement } from "react";

import {
  listI18nLocales,
  pickI18n,
  setI18n,
  type I18nString,
} from "./i18n-text";
import { RichEditor } from "@/components/edit-chrome/rich-editor";

const KNOWN_LOCALES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "default", label: "Default" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "pt", label: "Português" },
  { value: "pt-BR", label: "Português (BR)" },
  { value: "it", label: "Italiano" },
  { value: "de", label: "Deutsch" },
  { value: "ja", label: "日本語" },
];

interface Props {
  /** Operator-facing label above the field. */
  label: string;
  /** Current value (plain string or locale map). */
  value: I18nString | undefined;
  /** Single-source-of-truth setter — receives the new I18nString. */
  onChange: (next: I18nString) => void;
  /** Render as <textarea> instead of <input>. */
  multiline?: boolean;
  /** maxLength clamp (matches the schema's max). */
  maxLength?: number;
  /** Optional helper line beneath the field. */
  hint?: string;
  /** Phase C — when true, the per-locale field renders the RichEditor. */
  rich?: boolean;
  /** Required when `rich` is true to scope LinkPicker lookups. */
  tenantId?: string;
}

export function LocalizedTextInput({
  label,
  value,
  onChange,
  multiline,
  maxLength,
  hint,
  rich,
  tenantId,
}: Props): ReactElement {
  const [activeLocale, setActiveLocale] = useState<string>("default");
  const populated = listI18nLocales(value);
  const isMap = value !== null && value !== undefined && typeof value === "object";
  const tabs = (() => {
    // Always show default + English. Then any extra populated locales.
    // Then a "+ Add" affordance.
    const set = new Set<string>(["default", "en"]);
    for (const k of populated) set.add(k);
    return Array.from(set);
  })();

  const currentValue = pickI18n(value, activeLocale === "default" ? "default" : activeLocale);
  // For the default tab on a plain string, show the string verbatim;
  // for other tabs, show what pickI18n resolves to.
  const displayValue =
    activeLocale === "default" && typeof value === "string"
      ? value
      : isMap
        ? ((value as Record<string, string>)[activeLocale] ?? "")
        : currentValue;

  function handleChange(next: string) {
    onChange(setI18n(value, activeLocale, next));
  }

  function addLocale(locale: string) {
    if (!locale) return;
    setActiveLocale(locale);
    onChange(setI18n(value, locale, ""));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {populated.length === 0
            ? "Single language"
            : `${populated.length} locale${populated.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-border/50">
        {tabs.map((loc) => {
          const meta = KNOWN_LOCALES.find((k) => k.value === loc);
          const populatedHere = populated.includes(loc) ||
            (loc === "default" && typeof value === "string" && value.length > 0);
          const active = activeLocale === loc;
          return (
            <button
              key={loc}
              type="button"
              onClick={() => setActiveLocale(loc)}
              className={`flex items-center gap-1 rounded-t-md border-b-2 px-2 py-1 text-[10px] font-medium ${
                active
                  ? "border-zinc-900 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${populatedHere ? "bg-emerald-500" : "bg-zinc-300"}`}
                aria-hidden
              />
              {meta?.label ?? loc}
            </button>
          );
        })}
        <select
          className="ml-auto rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px]"
          value=""
          onChange={(e) => addLocale(e.target.value)}
          aria-label="Add language"
          title="Add language"
        >
          <option value="">+ Add language</option>
          {KNOWN_LOCALES.filter((k) => !tabs.includes(k.value) && k.value !== "default").map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {rich ? (
        <RichEditor
          // Per-locale key so the editor remounts on locale switch — the
          // initial Lexical state is captured at mount, so without a key
          // change the editor would show the previous locale's content
          // until the operator typed.
          key={`${activeLocale}`}
          value={displayValue}
          onChange={(next) => handleChange(next)}
          variant={multiline ? "multi" : "single"}
          tenantId={tenantId}
          ariaLabel={label}
        />
      ) : multiline ? (
        <textarea
          className="min-h-[80px] w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
          value={displayValue}
          maxLength={maxLength}
          onChange={(e) => handleChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
          value={displayValue}
          maxLength={maxLength}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
      {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
