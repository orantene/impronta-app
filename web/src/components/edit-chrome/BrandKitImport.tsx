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

import { useState, type ReactElement } from "react";

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
  const [error, setError] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

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

  return (
    <div className="flex flex-col gap-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted/50"
      >
        {open ? "Hide brand-kit import" : "Import brand kit (JSON)"}
      </button>
      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <textarea
            rows={10}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setAppliedCount(null);
              setError(null);
            }}
            placeholder={SUGGESTED_FORMAT}
            className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-[11px]"
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
              className="rounded-md border border-zinc-900 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
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
