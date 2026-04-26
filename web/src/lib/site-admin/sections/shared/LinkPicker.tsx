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

import { loadCmsPagesForLinkPicker } from "@/lib/site-admin/edit-mode/cms-pages-list-action";
import { loadTalentPathsForLinkPicker } from "@/lib/site-admin/edit-mode/talent-paths-action";
import { validateLinkUrl } from "@/lib/site-admin/edit-mode/link-validate-action";
import { MediaPicker } from "./MediaPicker";

type LinkKind = "internal" | "external" | "email" | "tel" | "anchor" | "asset" | "talent";

interface LinkPickerProps {
  value: string;
  onChange: (next: string) => void;
  /** Optional list of internal paths to suggest. */
  suggestions?: ReadonlyArray<{ path: string; label?: string }>;
  /** Hide the kind tabs and lock to a single kind (useful for forms). */
  forceKind?: LinkKind;
  className?: string;
  placeholder?: string;
  /** Required to enable the "asset" mode (link to a media-library file). */
  tenantId?: string;
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
  if (value.startsWith("/t/")) return "talent";
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
  asset: "File",
  talent: "Talent",
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
  tenantId,
}: LinkPickerProps) {
  const initialKind = forceKind ?? inferKind(value);
  const [kind, setKind] = useState<LinkKind>(initialKind);

  // Phase 8 — fetched cms_pages list, lazy-loaded the first time the
  // operator focuses the internal-mode input. Cached for the life of
  // the inspector mount.
  const [pageOptions, setPageOptions] = useState<
    ReadonlyArray<{ path: string; label?: string }> | null
  >(null);
  const [pagesLoading, setPagesLoading] = useState(false);

  async function ensurePagesLoaded() {
    if (pageOptions !== null || pagesLoading) return;
    setPagesLoading(true);
    try {
      const result = await loadCmsPagesForLinkPicker();
      if (result.ok) {
        setPageOptions(
          result.pages.map((p) => ({ path: p.path, label: p.title })),
        );
      } else {
        // Quiet fallback — keep the suggestions defaults visible.
        setPageOptions([]);
      }
    } finally {
      setPagesLoading(false);
    }
  }

  // Phase 8 — talent paths lazy-loaded on first "talent" tab focus.
  const [talentOptions, setTalentOptions] = useState<
    ReadonlyArray<{ path: string; label: string }> | null
  >(null);
  const [talentLoading, setTalentLoading] = useState(false);

  // Phase 8 — manual link validation. Operator clicks "Test" → server
  // HEADs the URL → status chip shows reachable / 404 / unreachable.
  const [validateState, setValidateState] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "ok"; status: number }
    | { kind: "warn"; status: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  async function runValidate() {
    if (!value.trim()) return;
    setValidateState({ kind: "checking" });
    const result = await validateLinkUrl({ url: value });
    if (!result.ok) {
      setValidateState({ kind: "error", message: result.error });
      return;
    }
    setValidateState({
      kind: result.reachable ? "ok" : "warn",
      status: result.status,
    });
  }
  async function ensureTalentLoaded() {
    if (talentOptions !== null || talentLoading) return;
    setTalentLoading(true);
    try {
      const result = await loadTalentPathsForLinkPicker();
      if (result.ok) {
        setTalentOptions(result.talent.map((t) => ({ path: t.path, label: t.label })));
      } else {
        setTalentOptions([]);
      }
    } finally {
      setTalentLoading(false);
    }
  }

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
    : tenantId
      ? ["internal", "external", "email", "tel", "anchor", "asset", "talent"]
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
      {kind !== "asset" ? (
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
            onFocus={kind === "internal" ? () => void ensurePagesLoaded() : undefined}
          />
          {/* Phase 8 — link route test. HTTP-able kinds only. */}
          {(kind === "internal" || kind === "external") && value.trim() ? (
            <button
              type="button"
              onClick={() => void runValidate()}
              disabled={validateState.kind === "checking"}
              className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
              title="Test the link with a HEAD request"
            >
              {validateState.kind === "checking" ? "…" : "Test"}
            </button>
          ) : null}
          {validateState.kind === "ok" ? (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              {validateState.status} OK
            </span>
          ) : validateState.kind === "warn" ? (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              {validateState.status}
            </span>
          ) : validateState.kind === "error" ? (
            <span
              className="inline-flex items-center rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300"
              title={validateState.message}
            >
              ✗
            </span>
          ) : null}
        </div>
      ) : null}
      {kind === "internal" ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {(pageOptions ?? suggestions).map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => emit(s.path)}
              className="rounded-md border border-border/40 bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50"
            >
              {s.label ?? s.path}
            </button>
          ))}
          {pagesLoading && pageOptions === null ? (
            <span className="text-[10px] text-muted-foreground/70">
              loading pages…
            </span>
          ) : null}
        </div>
      ) : null}
      {kind === "asset" && tenantId ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              type="url"
              className={INPUT}
              placeholder="https://…/file.pdf"
              value={visible}
              onChange={(e) => onChange(e.target.value)}
            />
            <MediaPicker
              tenantId={tenantId}
              label="Pick file"
              onPick={(url) => onChange(url)}
            />
          </div>
          <span className="text-[10px] text-muted-foreground/70">
            Picks from your tenant&apos;s media library. Any file type.
          </span>
        </div>
      ) : null}
      {kind === "talent" && tenantId ? (
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            className={INPUT}
            placeholder="/t/<profile-code>"
            value={visible}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => void ensureTalentLoaded()}
          />
          <div className="flex flex-wrap gap-1 pt-1">
            {(talentOptions ?? []).map((t) => (
              <button
                key={t.path}
                type="button"
                onClick={() => onChange(t.path)}
                className="rounded-md border border-border/40 bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50"
              >
                {t.label}
              </button>
            ))}
            {talentLoading && talentOptions === null ? (
              <span className="text-[10px] text-muted-foreground/70">loading roster…</span>
            ) : null}
            {talentOptions !== null && talentOptions.length === 0 ? (
              <span className="text-[10px] text-muted-foreground/70">No talent on this tenant&apos;s roster.</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
