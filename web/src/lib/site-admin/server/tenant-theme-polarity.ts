/**
 * Resolve a tenant's theme polarity + anchor swatches SERVER-SIDE, for the AI
 * page generator's color guidance (AIQ-12).
 *
 * WHY: polarity used to be read from the client DOM only
 * (`document.documentElement.getAttribute("data-token-background-mode")`, in
 * empty-canvas-starter.tsx / freeform-layers-tree.tsx / ai-revise-modal.tsx).
 * That works when a builder canvas is mounted and nowhere else: any generation
 * entry point without one (a future server-invoked generate, a scheduled or
 * API-driven draft, an admin surface that is not the canvas) sent no
 * backgroundMode at all, so the model got the "polarity is unknown to you"
 * gamble and could emit a band that inverts to unreadable on the tenant's real
 * theme.
 *
 * The client value is KEPT as an override where it exists, because it is
 * strictly better information: it reflects the theme the operator is looking at
 * right now, including a draft the DB has not been told about yet. This module
 * is the floor under it, not a replacement.
 *
 * DRAFT FIRST: the builder canvas paints from `theme_json_draft` when a draft
 * exists (Publish promotes it to `theme_json`), so the draft is what the
 * operator sees and what a generated page must match.
 */

import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import {
  backgroundModeToPolarity,
  type BackgroundPolarity,
} from "@/lib/site-admin/tokens/polarity";

/** The design-token keys read here. `background.mode` drives polarity; the rest anchor a band. */
const BACKGROUND_MODE_KEY = "background.mode";
const COLOR_KEYS = {
  background: "color.background",
  ink: "color.ink",
  primary: "color.primary",
} as const;

/** Resolved theme facts the generator prompt can use. Every field is best-effort. */
export interface TenantThemeGenerationContext {
  polarity?: BackgroundPolarity;
  palette?: {
    background?: string;
    ink?: string;
    primary?: string;
  };
}

function asTokenMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(tokens: Record<string, unknown>, key: string): string | undefined {
  const raw = tokens[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * PURE: turn an `agency_branding` row into the generator's theme context.
 *
 * Draft tokens win key-by-key over published ones (a draft that only changes
 * `background.mode` must not blank out the published palette). Extracted from
 * the fetch so the precedence is directly unit-testable with no DB.
 */
export function themeGenerationContextFromBrandingRow(row: {
  theme_json?: unknown;
  theme_json_draft?: unknown;
} | null): TenantThemeGenerationContext {
  const tokens = { ...asTokenMap(row?.theme_json), ...asTokenMap(row?.theme_json_draft) };
  const polarity = backgroundModeToPolarity(readString(tokens, BACKGROUND_MODE_KEY));
  const background = readString(tokens, COLOR_KEYS.background);
  const ink = readString(tokens, COLOR_KEYS.ink);
  const primary = readString(tokens, COLOR_KEYS.primary);
  const palette =
    background || ink || primary
      ? {
          ...(background ? { background } : {}),
          ...(ink ? { ink } : {}),
          ...(primary ? { primary } : {}),
        }
      : undefined;
  return {
    ...(polarity ? { polarity } : {}),
    ...(palette ? { palette } : {}),
  };
}

/**
 * Read the tenant's own theme and derive polarity + swatches. Never throws: a
 * failed or absent read returns `{}`, which restores the exact prior behaviour
 * (the prompt's neutral "polarity is unknown" wording).
 */
export async function resolveTenantThemeGenerationContext(
  tenantId: string,
): Promise<TenantThemeGenerationContext> {
  if (!tenantId) return {};
  try {
    const supabase = await createClient();
    if (!supabase) return {};
    const { data, error } = await tenantScopedQuery(supabase, "agency_branding", tenantId)
      .select("theme_json, theme_json_draft")
      .maybeSingle();
    if (error) {
      logServerError("tenant-theme-polarity/load", error);
      return {};
    }
    return themeGenerationContextFromBrandingRow(
      data as { theme_json?: unknown; theme_json_draft?: unknown } | null,
    );
  } catch (err) {
    logServerError("tenant-theme-polarity/load", err);
    return {};
  }
}
