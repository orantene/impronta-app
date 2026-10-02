import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";
import { isLookOwnedTokenKey, isPaletteTokenKey, isValidPaletteValue } from "@/lib/talent-site/theme-catalog/look-layer";
import { STYLE_TOKEN_BY_KEY, styleTokenValidator } from "@/lib/site-admin/tokens/style-tokens";
import type { ThemeDraft, ThemeDraftPreview, ThemeDraftResult, ThemeDraftStatus } from "./types";

/** Raw row of public.talent_theme_drafts. */
export interface ThemeDraftRow {
  id: string;
  design: string;
  base_version: number;
  payload: DesignPayload;
  preview: ThemeDraftPreview | null;
  rev: number;
  status: ThemeDraftStatus;
  published_version: number | null;
  release_id: string | null;
  updated_at: string;
}

export const THEME_DRAFT_COLUMNS =
  "id, design, base_version, payload, preview, rev, status, published_version, release_id, updated_at";

export function mapDraftRow(row: ThemeDraftRow): ThemeDraft {
  return {
    id: row.id,
    design: row.design,
    baseVersion: row.base_version,
    payload: row.payload,
    preview: row.preview ?? {},
    rev: row.rev,
    status: row.status,
    publishedVersion: row.published_version ?? null,
    releaseId: row.release_id ?? null,
    updatedAt: row.updated_at,
  };
}

export interface TokenPatchSplit {
  /** Style tokens: key -> value, null removes. */
  style: Record<string, string | null>;
  /**
   * Colour edits for the palette the editor is on (`payload.palettes[palette]`):
   * key -> value, null removes the override. Empty when no palette is known.
   */
  palette?: Record<string, string | null>;
  /** Gallery palette key the colour edits belong to (null = preview only). */
  paletteKey?: string | null;
  /** Look-owned tokens (preview only): key -> value, null removes. */
  look: Record<string, string | null>;
  invalid: string[];
}

/**
 * Route each patch key: colours to the edited palette (when `paletteKey` is
 * known), other look-owned keys to preview, then validated style tokens;
 * anything else is invalid.
 */
export function splitTokenPatch(
  patch: Record<string, string | null>,
  paletteKey: string | null = null,
): TokenPatchSplit {
  const out: TokenPatchSplit = { style: {}, palette: {}, paletteKey, look: {}, invalid: [] };
  for (const [key, value] of Object.entries(patch)) {
    if (paletteKey && isPaletteTokenKey(key)) {
      if (value === null || isValidPaletteValue(key, value)) out.palette![key] = value;
      else out.invalid.push(key);
      continue;
    }
    if (isLookOwnedTokenKey(key)) {
      out.look[key] = value;
      continue;
    }
    const def = STYLE_TOKEN_BY_KEY.get(key);
    if (!def) {
      out.invalid.push(key);
      continue;
    }
    if (value === null || styleTokenValidator(def).safeParse(value).success) out.style[key] = value;
    else out.invalid.push(key);
  }
  return out;
}

/**
 * Palette edits store ONLY real changes: a value equal to the current stored
 * override (or, with none, the code palette) is a no-op; a value equal to the
 * code palette removes the override (null). The drawer sends its whole
 * working copy, so untouched colours must never become overrides.
 */
export function minimizePaletteEdits(
  split: TokenPatchSplit,
  stored: Record<string, string> | undefined,
  code: Record<string, string> | null,
): TokenPatchSplit {
  const edits = split.palette ?? {};
  const palette: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(edits)) {
    const eq = (a: string | undefined, b: string) => a !== undefined && a.toLowerCase() === b.toLowerCase();
    const effective = stored?.[k] ?? code?.[k];
    if (v === null) {
      if (stored && k in stored) palette[k] = null;
    } else if (eq(code?.[k], v)) {
      if (stored && k in stored) palette[k] = null;
    } else if (!eq(effective, v)) {
      palette[k] = v;
    }
  }
  return { ...split, palette };
}

function applyPatch(base: Record<string, string> | undefined, patch: Record<string, string | null>) {
  const next: Record<string, string> = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next;
}

export function applyTokenSplit(
  payload: DesignPayload,
  preview: ThemeDraftPreview,
  split: TokenPatchSplit,
): { payload: DesignPayload; preview: ThemeDraftPreview } {
  let nextPayload =
    Object.keys(split.style).length > 0 ? { ...payload, tokenDefaults: applyPatch(payload.tokenDefaults, split.style) } : payload;
  const paletteEdits = split.palette ?? {};
  if (split.paletteKey && Object.keys(paletteEdits).length > 0) {
    const palettes = { ...(nextPayload.palettes ?? {}) };
    const next = applyPatch(palettes[split.paletteKey], paletteEdits);
    if (Object.keys(next).length > 0) palettes[split.paletteKey] = next;
    else delete palettes[split.paletteKey];
    const { palettes: _drop, ...rest } = nextPayload;
    void _drop;
    nextPayload = Object.keys(palettes).length > 0 ? { ...rest, palettes } : rest;
  }
  // A colour now saved on the palette must not linger as a preview-only value.
  const previewTokens = { ...(preview.previewTokens ?? {}) };
  let previewChanged = false;
  for (const k of split.paletteKey ? Object.keys(paletteEdits) : []) {
    if (k in previewTokens) {
      delete previewTokens[k];
      previewChanged = true;
    }
  }
  const basePreview = previewChanged ? { ...preview, previewTokens } : preview;
  return {
    payload: nextPayload,
    preview:
      Object.keys(split.look).length > 0
        ? { ...basePreview, previewTokens: applyPatch(basePreview.previewTokens, split.look) }
        : basePreview,
  };
}

/** Map the rows returned by a CAS update (`.eq("rev", expected)`) to a result. */
export function mapCasResult(
  rows: ThemeDraftRow[] | null,
  error: { message: string } | null,
): ThemeDraftResult<ThemeDraft> {
  if (error) return { ok: false, code: "error", error: error.message };
  if (!rows || rows.length === 0) {
    return { ok: false, code: "stale_rev", error: "The draft changed since it was loaded." };
  }
  return { ok: true, value: mapDraftRow(rows[0]) };
}
