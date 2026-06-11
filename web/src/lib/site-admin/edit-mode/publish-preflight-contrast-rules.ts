/**
 * WS4 — contrast preflight rules for the publish-preflight checker.
 *
 * Checks the workspace's brand token palette against WCAG 2.1 AA thresholds
 * before the operator publishes. Issues are advisory (severity "warn") — they
 * do not block the publish action, but surface in the Publish drawer so the
 * operator can decide whether to fix them first.
 *
 * Scope of this check (and its known limitation):
 *   - We check the *theme-level* color token pairs (ink-on-surface,
 *     primary-on-background, etc.) — exactly the same pairs shown in the
 *     ContrastChecker widget inside the Theme Drawer Colors tab.
 *   - We intentionally do NOT walk the BuilderNode tree for per-node
 *     background-color inheritance at this layer. Resolving effective
 *     background requires following the ancestor chain and resolving
 *     `token:<key>` sentinels against the live CSS custom property
 *     cascade — a task that is accurate only in-browser or via a full
 *     token-resolve pass. Doing it server-side with incomplete sentinel
 *     resolution would produce false positives for any node that uses
 *     `token:color.background` (transparent back to page default) or a
 *     background image. The plan explicitly flags this as the real work
 *     and recommends shipping the simpler check first.
 *
 * When the per-node walk is added (future), this module should gain a second
 * exported function `collectBuilderTreeContrastFindings(tree, tokens)` that
 * resolves effective foreground + background per text node by walking to the
 * nearest solid-background ancestor, resolves token sentinels, and re-uses
 * `contrastRatio` + `classifyContrast` from the same library.
 */

import {
  classifyContrast,
  contrastRatio,
} from "@/lib/site-admin/a11y/contrast";
import { tokenDefaults } from "@/lib/site-admin/tokens/registry";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── token pairs to audit ───────────────────────────────────────────────────

interface ContrastPair {
  label: string;
  fgKey: string;
  bgKey: string;
  fgFallback: string;
  bgFallback: string;
}

const CONTRAST_PAIRS: ReadonlyArray<ContrastPair> = [
  {
    label: "Ink on Surface",
    fgKey: "color.ink",
    bgKey: "color.surface-raised",
    fgFallback: "#111111",
    bgFallback: "#ffffff",
  },
  {
    label: "Primary on Background",
    fgKey: "color.primary",
    bgKey: "color.background",
    fgFallback: "#111111",
    bgFallback: "#ffffff",
  },
  {
    label: "Secondary on Surface",
    fgKey: "color.secondary",
    bgKey: "color.surface-raised",
    fgFallback: "#6b7280",
    bgFallback: "#ffffff",
  },
  {
    label: "Muted text on Surface",
    fgKey: "color.muted",
    bgKey: "color.surface-raised",
    fgFallback: "#8c7f75",
    bgFallback: "#ffffff",
  },
  {
    label: "Accent on Background",
    fgKey: "color.accent",
    bgKey: "color.background",
    fgFallback: "#0ea5e9",
    bgFallback: "#ffffff",
  },
];

// ── result type ────────────────────────────────────────────────────────────

export interface ContrastPreflightIssue {
  pairLabel: string;
  ratio: number;
  /** "aa-large" = only passes for large text (≥18pt or ≥14pt bold). */
  verdict: "fail" | "aa-large";
  message: string;
}

// ── token loader ───────────────────────────────────────────────────────────

/**
 * Load the workspace's current theme-draft tokens from `agency_branding`.
 * Falls back to the registry defaults when the row has no draft.
 * Returns `null` on query failure (caller skips the check gracefully).
 */
export async function loadThemeDraftTokens(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Record<string, string> | null> {
  try {
    const { data } = await supabase
      .from("agency_branding")
      .select("theme_json_draft")
      .eq("agency_id", tenantId)
      .maybeSingle<{ theme_json_draft: Record<string, string> | null }>();

    const defaults = tokenDefaults();
    if (!data?.theme_json_draft) return defaults;

    return { ...defaults, ...data.theme_json_draft };
  } catch {
    return null;
  }
}

// ── main check ────────────────────────────────────────────────────────────

/**
 * Run WCAG 2.1 AA contrast checks against the brand token palette.
 * Each failing pair produces one advisory issue. Returns an empty array
 * when all pairs pass (or when tokens cannot be loaded).
 *
 * Passing `null` for `tokens` skips the check gracefully (best-effort).
 */
export function collectContrastPreflightIssues(
  tokens: Record<string, string> | null,
): ReadonlyArray<ContrastPreflightIssue> {
  if (!tokens) return [];

  const issues: ContrastPreflightIssue[] = [];

  for (const pair of CONTRAST_PAIRS) {
    const fg = tokens[pair.fgKey] ?? pair.fgFallback;
    const bg = tokens[pair.bgKey] ?? pair.bgFallback;
    const ratio = contrastRatio(fg, bg);
    if (ratio == null) continue;

    const verdict = classifyContrast(ratio);
    if (verdict === "aa" || verdict === "aaa") continue;

    const ratioStr = ratio.toFixed(2);
    const message =
      verdict === "fail"
        ? `Accessibility: "${pair.label}" fails WCAG AA (${ratioStr}:1 — needs ≥ 4.5:1). Adjust brand colors in the Theme drawer.`
        : `Accessibility: "${pair.label}" only passes WCAG AA for large text (${ratioStr}:1 — small text needs ≥ 4.5:1). Adjust brand colors in the Theme drawer.`;

    issues.push({ pairLabel: pair.label, ratio, verdict, message });
  }

  return issues;
}
