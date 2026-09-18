"use client";

/**
 * Search-and-pick field: the value is what was picked, never what was
 * typed. Used for what-you-do (taxonomy / catalogue) and city (the
 * platform's cities). The list renders in flow so it never covers a button.
 */

import { useEffect, useRef, useState } from "react";

type Locale = "en" | "es";

/** Search box with a dropdown; the value is what was picked, never what was typed. */
export function Picker<Item>({
  id,
  label,
  placeholder,
  locale,
  selected,
  selectedLabel,
  search,
  itemLabel,
  itemSub,
  itemKey,
  onPick,
  onClear,
  changeLabel,
  noResultsLabel,
  testId,
  extra,
}: {
  id: string;
  label: string;
  placeholder: string;
  locale: Locale;
  selected: Item | null;
  selectedLabel: (item: Item) => string;
  search: (query: string) => Promise<Item[]>;
  itemLabel: (item: Item) => string;
  itemSub?: (item: Item) => string | null;
  itemKey: (item: Item) => string;
  onPick: (item: Item) => void;
  onClear: () => void;
  changeLabel: string;
  noResultsLabel: string;
  testId: string;
  /** Rendered under the list (the "Other" affordance). */
  extra?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (selected) return;
    const mine = ++seq.current;
    const handle = window.setTimeout(() => {
      setSearching(true);
      void search(query)
        .then((res) => {
          if (seq.current === mine) setItems(res);
        })
        .catch(() => {
          if (seq.current === mine) setItems([]);
        })
        .finally(() => {
          if (seq.current === mine) setSearching(false);
        });
    }, query ? 180 : 0);
    return () => window.clearTimeout(handle);
  }, [query, search, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[14px] px-3 py-2.5" style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }} data-testid={`${testId}-selected`}>
        <span className="min-w-0">
          <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{label}</span>
          <span className="block truncate text-[1rem] font-medium" style={{ color: "var(--tl-ink)" }}>{selectedLabel(selected)}</span>
        </span>
        <button type="button" onClick={() => { onClear(); setQuery(""); setOpen(true); }} className="shrink-0 text-[0.8125rem] font-semibold underline underline-offset-2" style={{ color: "var(--tl-ink-soft)" }} data-testid={`${testId}-change`}>
          {changeLabel}
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{label}</label>
      <input
        id={id}
        name={id}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        lang={locale}
        data-testid={testId}
        className="h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none placeholder:text-[var(--tl-muted-soft)]"
        style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
      />
      {open ? (
        <div className="mt-1 max-h-60 overflow-y-auto rounded-[14px]" style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }} data-testid={`${testId}-list`}>
          {items.length === 0 ? (
            <div className="px-3 py-2 text-[0.875rem]" style={{ color: "var(--tl-muted)" }}>{searching ? "…" : noResultsLabel}</div>
          ) : (
            items.map((item, i) => (
              <button
                key={`${itemKey(item)}#${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(item); setOpen(false); }}
                className="flex w-full flex-col items-start px-3 py-2 text-left"
                style={{ borderBottom: "1px solid var(--tl-hairline)" }}
                data-testid={`${testId}-option`}
              >
                <span className="text-[0.9375rem] font-medium" style={{ color: "var(--tl-ink)" }}>{itemLabel(item)}</span>
                {itemSub?.(item) ? <span className="text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{itemSub(item)}</span> : null}
              </button>
            ))
          )}
          {extra}
        </div>
      ) : null}
    </div>
  );
}
