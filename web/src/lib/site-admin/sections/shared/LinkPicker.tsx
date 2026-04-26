"use client";

/**
 * Phase 8 — LinkPicker primitive.
 *
 * Replaces a free-form text input for hrefs. The picker accepts five link
 * "kinds" — internal path, external URL, email, tel, or anchor — and
 * normalizes them into a single string the section schema already
 * expects (`href: string`). Keeps schemas backwards-compatible while
 * giving the operator a structured chooser instead of a raw text box.
 *
 * Until the multi-page CMS lands (Phase 7) the "internal" mode is a free
 * path field with sensible suggestions; once pages exist, swap the
 * suggestions list for a real page index without changing the schema or
 * any consuming editor.
 */

import { useEffect, useMemo, useState } from "react";

type LinkKind = "internal" | "external" | "email" | "tel" | "anchor";

interface LinkPickerProps {
  value: string;
  onChange: (next: string) => void;
  /** Optional list of internal paths to suggest. */
  suggestions?: ReadonlyArray<{ path: string; label?: string }>;
  /** Hide the kind tabs and lock to a single kind (useful for forms). */
  forceKind?: LinkKind;
  className?: string;
  placeholder?: string;
}

const DEFAULT_SUGGESTIONS: ReadonlyArray<{ path: string; label?: string }> = [
  { path: "/", label: "Home" },
  { path: "/work", label: "Work" },
  { path: "/about", label: "About" },
  { path: "/contact", label: "Contact" },
  { path: "/services", label: "Services" },
];

function inferKind(value: string): LinkKind {
  if (!value) return "internal";
  if (value.startsWith("mailto:")) return "email";
  if (value.startsWith("tel:")) return "tel";
  if (value.startsWith("#")) return "anchor";
  if (/^https?:\/\//i.test(value)) return "external";
  return "internal";
}

function strip(prefix: string, value: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

const KIND_LABEL: Record<LinkKind, string> = {
  internal: "Page",
  external: "URL",
  email: "Email",
  tel: "Phone",
  anchor: "Anchor",
};

const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";
const TAB_BASE =
  "rounded-md px-2 py-1 text-xs font-medium border border-transparent";
const TAB_OFF = "text-muted-foreground hover:bg-muted/50";
const TAB_ON = "border-border/60 bg-muted text-foreground";

export function LinkPicker({
  value,
  onChange,
  suggestions = DEFAULT_SUGGESTIONS,
  forceKind,
  className,
  placeholder,
}: LinkPickerProps) {
  const initialKind = forceKind ?? inferKind(value);
  const [kind, setKind] = useState<LinkKind>(initialKind);

  // Keep the visible kind in sync if the underlying value swaps shape
  // (e.g. a parent reset to mailto:…).
  useEffect(() => {
    if (forceKind) {
      setKind(forceKind);
      return;
    }
    setKind(inferKind(value));
  }, [value, forceKind]);

  const visible = useMemo(() => {
    switch (kind) {
      case "email":
        return strip("mailto:", value);
      case "tel":
        return strip("tel:", value);
      case "anchor":
        return strip("#", value);
      default:
        return value;
    }
  }, [kind, value]);

  const emit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      return;
    }
    switch (kind) {
      case "email":
        onChange(`mailto:${trimmed}`);
        break;
      case "tel":
        onChange(`tel:${trimmed}`);
        break;
      case "anchor":
        onChange(trimmed.startsWith("#") ? trimmed : `#${trimmed}`);
        break;
      case "external":
        onChange(
          /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
        );
        break;
      default:
        onChange(trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
    }
  };

  const tabs: ReadonlyArray<LinkKind> = forceKind
    ? [forceKind]
    : ["internal", "external", "email", "tel", "anchor"];

  const inputType =
    kind === "email" ? "email" : kind === "tel" ? "tel" : "text";

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      {!forceKind && (
        <div className="flex flex-wrap gap-1">
          {tabs.map((k) => (
            <button
              type="button"
              key={k}
              className={`${TAB_BASE} ${k === kind ? TAB_ON : TAB_OFF}`}
              onClick={() => {
                setKind(k);
                // Re-emit the visible portion under the new prefix so the
                // stored value updates atomically.
                emit(visible);
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {kind === "email" || kind === "tel" || kind === "anchor" ? (
          <span
            aria-hidden
            className="inline-flex items-center rounded-md bg-muted px-2 py-1.5 text-xs font-mono text-muted-foreground"
          >
            {kind === "email" ? "mailto:" : kind === "tel" ? "tel:" : "#"}
          </span>
        ) : null}
        <input
          type={inputType}
          className={INPUT}
          placeholder={
            placeholder ??
            (kind === "internal"
              ? "/about"
              : kind === "external"
                ? "https://example.com"
                : kind === "email"
                  ? "hello@studio.com"
                  : kind === "tel"
                    ? "+1 555 123 4567"
                    : "section-id")
          }
          value={visible}
          onChange={(e) => emit(e.target.value)}
        />
      </div>
      {kind === "internal" && suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {suggestions.map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => emit(s.path)}
              className="rounded-md border border-border/40 bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50"
            >
              {s.label ?? s.path}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
