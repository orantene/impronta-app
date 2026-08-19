"use client";

/**
 * IconPicker — choose one glyph from the operator icon library.
 *
 * NOT an extension of `GlyphTiles`, deliberately. GlyphTiles is a flat
 * radiogroup with roving focus: exactly right up to about a dozen options,
 * where seeing every choice at once IS the interface. This library is ~95
 * glyphs across nine categories, where the only usable interface is search —
 * so the two live side by side in field-kit and the caller picks by set size.
 *
 * Search matches label, name and the registry's `keywords`, so "chat" finds
 * Message and "dj" finds Headphones. Recently-used sits on top because the
 * same handful of glyphs get reached for over and over inside one site.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import {
  BUILDER_ICON_CATEGORY_LABELS,
  BUILDER_ICON_CATEGORY_ORDER,
  BUILDER_ICON_REGISTRY,
  type BuilderIconName,
} from "@/lib/site-admin/builder-node/icon-registry";
import { BuilderIconSvg } from "@/lib/site-admin/builder-node/builder-icon-svg";
import { CHROME } from "../../kit/tokens";
import { FieldRow } from "./field-row";
import { useInspectorT } from "../kit/use-inspector-t";

const RECENTS_KEY = "tulala:icon-picker-recents";
const RECENTS_MAX = 8;

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    // A blocked or full localStorage must never take the picker down with it.
    return [];
  }
}

function pushRecent(name: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = [name, ...readRecents().filter((n) => n !== name)].slice(0, RECENTS_MAX);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* non-fatal */
  }
}

export interface IconPickerProps {
  label: string;
  value: string | null | undefined;
  onChange: (next: BuilderIconName | null) => void;
  /** Offers a "No icon" choice. Use wherever the glyph is optional. */
  allowNone?: boolean;
  /**
   * What the empty choice is CALLED. Defaults to "No icon", which is only true
   * where clearing means nothing renders. Where a fallback glyph takes over —
   * a social link keeps its platform mark — say so, or the field claims an
   * outcome the operator will not see.
   */
  noneLabel?: string;
  hint?: string;
  searchTerms?: string | string[];
}

export function IconPicker({
  label,
  value,
  onChange,
  allowNone = true,
  noneLabel,
  hint,
  searchTerms,
}: IconPickerProps) {
  const { t } = useInspectorT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const recents = useMemo(() => (open ? readRecents() : []), [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return BUILDER_ICON_REGISTRY.filter((icon) => {
      const haystack = [icon.name, icon.label, ...(icon.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const grouped = useMemo(
    () =>
      BUILDER_ICON_CATEGORY_ORDER.map((category) => ({
        category,
        icons: BUILDER_ICON_REGISTRY.filter((icon) => icon.category === category),
      })).filter((group) => group.icons.length > 0),
    [],
  );

  const choose = useCallback(
    (name: BuilderIconName | null) => {
      if (name) pushRecent(name);
      onChange(name);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const current = value
    ? BUILDER_ICON_REGISTRY.find((icon) => icon.name === value)
    : undefined;

  return (
    <FieldRow label={label} hint={hint} searchTerms={searchTerms}>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          data-icon-picker-trigger
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]"
          style={{ border: `1px solid ${CHROME.controlBorder}`, background: "#fff" }}
        >
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[15px]"
            style={{ background: CHROME.paper, color: CHROME.ink }}
          >
            {current ? <BuilderIconSvg definition={current} /> : "–"}
          </span>
          <span className="flex-1 truncate" style={{ color: CHROME.ink }}>
            {current ? t(current.label) : t(noneLabel ?? "No icon")}
          </span>
          <span aria-hidden style={{ color: CHROME.muted, fontSize: 10 }}>
            {t("Change")}
          </span>
        </button>

        {open ? (
          <div
            role="dialog"
            aria-label={t("Choose an icon")}
            className="flex max-h-[280px] flex-col gap-2 overflow-hidden rounded-md p-2"
            style={{ border: `1px solid ${CHROME.line}`, background: CHROME.paper }}
          >
            <input
              ref={inputRef}
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t("Search icons")}
              className="w-full rounded px-2 py-1 text-[12px]"
              style={{ border: `1px solid ${CHROME.controlBorder}`, background: "#fff" }}
            />

            <div className="flex flex-col gap-2 overflow-y-auto">
              {allowNone ? (
                <button
                  type="button"
                  onClick={() => choose(null)}
                  className="rounded px-2 py-1 text-left text-[11px]"
                  style={{ color: CHROME.muted }}
                >
                  {t(noneLabel ?? "No icon")}
                </button>
              ) : null}

              {matches ? (
                matches.length > 0 ? (
                  <IconGrid icons={matches} value={value} onPick={choose} />
                ) : (
                  <p className="px-2 py-3 text-[11px]" style={{ color: CHROME.muted }}>
                    {t("No icons match that word.")}
                  </p>
                )
              ) : (
                <>
                  {recents.length > 0 ? (
                    <IconSection
                      title={t("Recently used")}
                      icons={BUILDER_ICON_REGISTRY.filter((icon) =>
                        recents.includes(icon.name),
                      )}
                      value={value}
                      onPick={choose}
                    />
                  ) : null}
                  {grouped.map((group) => (
                    <IconSection
                      key={group.category}
                      title={t(BUILDER_ICON_CATEGORY_LABELS[group.category])}
                      icons={group.icons}
                      value={value}
                      onPick={choose}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </FieldRow>
  );
}

function IconSection({
  title,
  icons,
  value,
  onPick,
}: {
  title: string;
  icons: ReadonlyArray<(typeof BUILDER_ICON_REGISTRY)[number]>;
  value: string | null | undefined;
  onPick: (name: BuilderIconName) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="px-1 text-[9px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: CHROME.muted2 }}
      >
        {title}
      </span>
      <IconGrid icons={icons} value={value} onPick={onPick} />
    </div>
  );
}

function IconGrid({
  icons,
  value,
  onPick,
}: {
  icons: ReadonlyArray<(typeof BUILDER_ICON_REGISTRY)[number]>;
  value: string | null | undefined;
  onPick: (name: BuilderIconName) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1">
      {icons.map((icon) => {
        const selected = icon.name === value;
        return (
          <button
            key={icon.name}
            type="button"
            title={icon.label}
            aria-label={icon.label}
            aria-pressed={selected}
            data-icon-name={icon.name}
            onClick={() => onPick(icon.name as BuilderIconName)}
            className="flex h-8 items-center justify-center rounded text-[16px]"
            style={{
              border: `1px solid ${selected ? CHROME.accent : "transparent"}`,
              background: selected ? "#fff" : "transparent",
              color: CHROME.ink,
            }}
          >
            <BuilderIconSvg definition={icon} />
          </button>
        );
      })}
    </div>
  );
}
