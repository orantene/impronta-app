/**
 * THEME SHRINK GUARD — the class killer for "a publish emptied theme_json".
 *
 * Twice now a publish has replaced a fully-customised `agency_branding.theme_json`
 * with a near-empty map and taken a live storefront back to platform defaults:
 *
 *   - 2026-08-15 — a publish rebuilt the live map from the normalized draft and
 *     dropped `logo_url` / `favicon_url` / `watermark_preset` (they are not
 *     registry tokens). Fixed by the legacy-passthrough split.
 *   - 2026-08-16 — the header inspector saved a ONE-KEY draft patch and then ran
 *     an UNSCOPED publish. The legacy-passthrough fix worked exactly as designed
 *     (the three special keys survived) while the 54 registry tokens behind them
 *     were replaced by the single key the draft happened to hold. Live went from
 *     58 keys to 4.
 *
 * Both writers were "correct" in isolation. The invariant nobody enforced is the
 * one that actually matters to the operator:
 *
 *   **A publish never shrinks an established live theme to almost nothing.**
 *
 * This module is that invariant, enforced server-side in the single place every
 * publish funnels through (`publishDesign`), so it holds for every current and
 * future writer regardless of how the caller composes its map.
 *
 * ── Why it cannot false-positive on a legitimate publish ───────────────────
 *
 * Three properties keep the guard off the happy path:
 *
 *  1. **It only engages on an ESTABLISHED live theme.** Fewer than
 *     `ESTABLISHED_LIVE_TOKENS` (20) live registry tokens and the guard is a
 *     no-op. A brand-new tenant (live `{}`), a tenant that has only ever set a
 *     handful of shell tokens, and the very first publish of any workspace all
 *     sail through untouched — those are exactly the "legitimate small theme"
 *     cases, and they are structurally outside the rule.
 *
 *  2. **It only blocks a CATASTROPHIC reduction.** The publish must drop below
 *     `max(10, 25% of the live count)`. Every real editing surface either
 *     submits a complete map (the ThemeDrawer seeds its draft from
 *     `withDefaults(...)`, so it always carries the full registry projection) or
 *     publishes SCOPED (Card Design, header inspector), which starts from the
 *     live map and lays a slice on top — its output can never be smaller than
 *     live. Neither shape can land under a quarter of the live count. Only a
 *     wholesale replacement by an unseeded draft can, and that is the bug.
 *
 *  3. **It counts registry tokens only.** Legacy passthrough keys
 *     (`logo_url`, `favicon_url`, `watermark_preset`) are excluded from both
 *     sides, so clearing or adding a logo never moves the numbers.
 *
 * A deliberate teardown (an operator who genuinely wants to strip a theme back
 * to platform defaults) is served by the explicit `allowReduction` escape hatch,
 * which no UI passes today — the intent has to be spelled out by a caller, it is
 * never inferred from the shape of the data.
 */

import { LEGACY_THEME_PASSTHROUGH_KEYS } from "@/lib/site-admin/tokens/legacy-passthrough";

/**
 * Below this many live registry tokens the theme is not "established" and the
 * guard does not engage at all. Real customised tenants sit far above it
 * (Impronta held 55 registry tokens + 3 legacy keys at the time of the wipe);
 * a fresh workspace sits at 0.
 */
export const ESTABLISHED_LIVE_TOKENS = 20;

/**
 * Hard floor. Whatever the live count, a publish that would leave fewer than
 * this many registry tokens on an established theme is refused.
 */
export const CATASTROPHIC_TOKEN_FLOOR = 10;

/**
 * Proportional floor. A publish must retain at least this share of the live
 * token count. Catches the "58 → 12" shape that clears the absolute floor but
 * is still obviously a wipe.
 */
export const MIN_RETAINED_RATIO = 0.25;

/** Count the registry-token keys in a raw theme map (legacy keys excluded). */
export function countThemeTokens(map: Record<string, unknown> | null | undefined): number {
  if (!map) return 0;
  let n = 0;
  for (const key of Object.keys(map)) {
    if (!LEGACY_THEME_PASSTHROUGH_KEYS.has(key)) n += 1;
  }
  return n;
}

/**
 * The count below which a publish is refused, for a given live count.
 * Exported so tests and the operator-facing message agree on one formula.
 */
export function shrinkFloorFor(liveTokenCount: number): number {
  return Math.max(
    CATASTROPHIC_TOKEN_FLOOR,
    Math.ceil(liveTokenCount * MIN_RETAINED_RATIO),
  );
}

export interface ThemeShrinkVerdict {
  /** True when the write is safe to perform. */
  ok: boolean;
  liveTokenCount: number;
  nextTokenCount: number;
  /** The count the publish had to reach. Only meaningful when `ok` is false. */
  requiredMinimum: number;
  /** Operator-facing English copy. Empty when `ok`. */
  message: string;
  /** Operator-facing Spanish copy. Empty when `ok`. */
  messageEs: string;
}

/** Stable error code for the ERROR_COPY lexicon / client-side locale lookup. */
export const THEME_PUBLISH_SHRINK_BLOCKED_CODE = "theme_publish_shrink_blocked";

/**
 * Decide whether `next` may replace `live` on `agency_branding.theme_json`.
 *
 * Pure — no IO, no Supabase, no clock. The caller performs the write only when
 * `ok` is true and is responsible for logging the refusal.
 */
export function checkThemePublishShrink(params: {
  live: Record<string, unknown> | null | undefined;
  next: Record<string, unknown> | null | undefined;
  /**
   * Explicit operator intent to tear a theme down. No UI passes this today; it
   * exists so a future "reset this theme to platform defaults" flow can opt out
   * by name rather than by accidentally producing a small map.
   */
  allowReduction?: boolean;
}): ThemeShrinkVerdict {
  const liveTokenCount = countThemeTokens(params.live);
  const nextTokenCount = countThemeTokens(params.next);
  const requiredMinimum = shrinkFloorFor(liveTokenCount);

  const engaged = liveTokenCount >= ESTABLISHED_LIVE_TOKENS;
  const catastrophic = engaged && nextTokenCount < requiredMinimum;

  if (params.allowReduction || !catastrophic) {
    return {
      ok: true,
      liveTokenCount,
      nextTokenCount,
      requiredMinimum,
      message: "",
      messageEs: "",
    };
  }

  return {
    ok: false,
    liveTokenCount,
    nextTokenCount,
    requiredMinimum,
    message:
      `Publish blocked: this would cut the live theme from ${liveTokenCount} design tokens ` +
      `down to ${nextTokenCount}, wiping your colors, typography and card styles. ` +
      `The draft being published is incomplete — it does not carry the full theme. ` +
      `Nothing was changed. Open the theme editor, confirm it shows your current design, ` +
      `save the draft, then publish again.`,
    messageEs:
      `Publicación bloqueada: esto reduciría el tema en vivo de ${liveTokenCount} tokens de diseño ` +
      `a ${nextTokenCount}, borrando tus colores, tipografía y estilos de tarjeta. ` +
      `El borrador que se intenta publicar está incompleto: no contiene el tema completo. ` +
      `No se cambió nada. Abre el editor de tema, comprueba que muestre tu diseño actual, ` +
      `guarda el borrador y vuelve a publicar.`,
  };
}
