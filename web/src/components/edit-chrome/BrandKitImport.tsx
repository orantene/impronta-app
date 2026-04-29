"use client";

/**
 * Phase 13 — brand kit import.
 *
 * Operator pastes a JSON token bundle and we bulk-apply it to the
 * theme draft. Accepts either:
 *   - Tulala-native token map: { "color.primary": "#…", "color.ink": "#…", ... }
 *   - Figma "Variables" JSON export (filtered to color/typography vars)
 *   - Generic flat key/value where keys roughly match registry names
 *
 * Keys not in the registry are silently dropped. Hex values are
 * normalized to lowercase #rrggbb. Anything that doesn't parse leaves
 * the existing draft untouched and surfaces an error.
 *
 * The actual save still goes through the Theme Drawer's existing
 * Save / Publish buttons — this primitive only mutates the in-memory
 * draft via the onApply callback.
 */

import { useState, useTransition, type ReactElement } from "react";

import { extractBrandKitFromUrl } from "@/lib/site-admin/edit-mode/brand-kit-url-action";

interface Props {
  onApply: (tokens: Record<string, string>) => void;
}

const SUGGESTED_FORMAT = `{
  "color.primary": "#0F4F3E",
  "color.accent": "#C9A96E",
  "color.ink": "#1A1A1A",
  "color.surface-raised": "#F8F5EF",
  "typography.heading-font-family": "\\"Playfair Display\\", Georgia, serif",
  "typography.h1-size": "clamp(40px, 6vw, 72px)"
}`;

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHex(v: string): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!HEX_RE.test(trimmed)) return null;
  const hex = trimmed.replace(/^#/, "").toLowerCase();
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return `#${hex}`;
}

/**
 * Best-effort parse: a JSON object with string values. Hex values get
 * normalized; everything else is passed through. Keys are not
 * registry-validated here — the Theme Drawer's `set()` ignores unknown
 * keys, so junk fields are harmless.
 */
function parseBundle(raw: string): { ok: true; tokens: Record<string, string>; ignored: number } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Not valid JSON. Check the format." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Expected a flat JSON object of token → value." };
  }
  const tokens: Record<string, string> = {};
  let ignored = 0;
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== "string") {
      ignored += 1;
      continue;
    }
    if (k.startsWith("color.")) {
      const norm = normalizeHex(v);
      if (norm) {
        tokens[k] = norm;
      } else {
        ignored += 1;
      }
      continue;
    }
    tokens[k] = v;
  }
  return { ok: true, tokens, ignored };
}

export function BrandKitImport({ onApply }: Props): ReactElement {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const [extractPending, startExtract] = useTransition();

  function handleApply() {
    setError(null);
    const result = parseBundle(raw);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const count = Object.keys(result.tokens).length;
    if (count === 0) {
      setError("Nothing parseable in that JSON.");
      return;
    }
    onApply(result.tokens);
    setAppliedCount(count);
  }

  function handleExtract() {
    setError(null);
    setAppliedCount(null);
    startExtract(async () => {
      const result = await extractBrandKitFromUrl({ url });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Pre-fill the textarea with the extracted JSON so the operator
      // can review + tweak before clicking Apply.
      setRaw(JSON.stringify(result.tokens, null, 2));
    });
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-white hover:border-stone-300 transition-colors"
      >
        {open ? "Hide brand-kit import" : "Import brand kit (JSON)"}
      </button>
      {open ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6]/40 p-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
              Or extract from a website URL
            </label>
            <div className="flex items-center gap-1">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex-1 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2 py-1.5 text-[12px] text-stone-800 placeholder:text-stone-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors"
                disabled={extractPending}
              />
              <button
                type="button"
                onClick={handleExtract}
                disabled={extractPending || !url.trim()}
                className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2 py-1 text-[10px] font-medium text-stone-600 hover:bg-white hover:border-stone-300 disabled:opacity-50 transition-colors"
              >
                {extractPending ? "…" : "Extract"}
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground/70">
              Best-effort scan for brand colors + Google Fonts on the page.
              Result fills the box below — review then click Apply.
            </span>
          </div>
          <textarea
            rows={10}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setAppliedCount(null);
              setError(null);
            }}
            placeholder={SUGGESTED_FORMAT}
            className="w-full rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-3 py-2 font-mono text-[11px] text-stone-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors"
            spellCheck={false}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Hex colors normalize to <code>#rrggbb</code>. Unknown keys are
              dropped on save. Apply does not save — review then click
              Save&nbsp;draft.
            </span>
            <button
              type="button"
              onClick={handleApply}
              disabled={!raw.trim()}
              className="rounded-md border border-[#3d4f7c] bg-[#3d4f7c] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#4a5e94] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply to draft
            </button>
          </div>
          {error ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
              {error}
            </div>
          ) : null}
          {appliedCount !== null ? (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
              Applied {appliedCount} token{appliedCount === 1 ? "" : "s"} to
              the draft. Click <strong>Save draft</strong> in the footer to
              persist.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
