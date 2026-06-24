/**
 * Shared theme palette for theme-adaptive profile templates (Lumen, Atelier).
 *
 * The tenant's theme lives in agency_branding.theme_json; page.tsx projects its
 * color tokens to `--token-color-*` CSS vars (themeVars) and derives a
 * light/dark register (themeMode) from background.mode. This helper turns that
 * into ONE style object the template applies on its root <main>:
 *
 *   1. The tenant's --token-color-* vars (passed through).
 *   2. A semantic `--pp-*` palette (bg / surface / ink / muted / line / accent)
 *      the template's own CSS consumes — tenant color if set, else a tasteful
 *      light or dark default.
 *   3. Overrides of the global `--plt-*` tokens so the REUSED sub-blocks
 *      (ServicesBlock, ServiceMenuBlock, SkillsExperienceBlock, reviews, the
 *      portfolio lightbox, the passed-in inquire buttons) flip to the same
 *      light/dark register + accent automatically — no per-block rework.
 *
 * Pure module. No React, no server code.
 */

export type ProfileThemeMode = "light" | "dark";

function pick(vars: Record<string, string> | undefined, key: string): string | undefined {
  const v = vars?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function buildAdaptiveThemeStyle(
  mode: ProfileThemeMode,
  themeVars: Record<string, string> | undefined,
): Record<string, string> {
  const accent =
    pick(themeVars, "--token-color-accent") ||
    pick(themeVars, "--token-color-primary") ||
    (mode === "dark" ? "#c9a24a" : "#1f6f4f");
  const accentOn = mode === "dark" ? "#14110a" : "#ffffff";

  const dark = mode === "dark";

  // Semantic palette — tenant color tokens win, else mode defaults.
  const bg = pick(themeVars, "--token-color-background") || (dark ? "#0e0e11" : "#ffffff");
  const surface = pick(themeVars, "--token-color-surface-raised") || (dark ? "#17171b" : "#f7f6f3");
  const ink = pick(themeVars, "--token-color-ink") || (dark ? "#edece8" : "#181715");
  const inkSoft = dark ? "rgba(237,236,232,0.74)" : "rgba(24,23,21,0.74)";
  const muted = pick(themeVars, "--token-color-muted") || (dark ? "rgba(237,236,232,0.56)" : "rgba(24,23,21,0.55)");
  const line = pick(themeVars, "--token-color-line") || (dark ? "rgba(255,255,255,0.13)" : "rgba(20,20,20,0.12)");
  const lineStrong = dark ? "rgba(255,255,255,0.24)" : "rgba(20,20,20,0.22)";

  return {
    ...(themeVars ?? {}),

    // ── semantic palette for the template's own CSS ──────────────────────
    "--pp-bg": bg,
    "--pp-surface": surface,
    "--pp-elevated": dark ? "#1d1d22" : "#ffffff",
    "--pp-ink": ink,
    "--pp-ink-soft": inkSoft,
    "--pp-muted": muted,
    "--pp-line": line,
    "--pp-line-strong": lineStrong,
    "--pp-accent": accent,
    "--pp-accent-on": accentOn,
    "--pp-scrim": dark ? "rgba(8,8,10,0.62)" : "rgba(20,20,20,0.42)",

    // ── --plt overrides so reused sub-blocks adopt the same register ─────
    "--plt-bg": bg,
    "--plt-bg-raised": surface,
    "--plt-bg-elevated": dark ? "#1d1d22" : "#ffffff",
    "--plt-bg-deep": dark ? "#0a0a0c" : "#f1efe9",
    "--plt-bg-inverse": ink,
    "--plt-ink": ink,
    "--plt-ink-soft": inkSoft,
    "--plt-ink-strong": dark ? "#ffffff" : "#0d0d0c",
    "--plt-muted": muted,
    "--plt-muted-soft": dark ? "rgba(237,236,232,0.42)" : "rgba(24,23,21,0.45)",
    "--plt-on-inverse": dark ? "#0e0e11" : "#ffffff",
    "--plt-hairline": line,
    "--plt-hairline-strong": lineStrong,
    "--plt-forest": accent,
    "--plt-forest-deep": accent,
    "--plt-forest-bright": accent,
    "--plt-forest-soft": dark ? "rgba(255,255,255,0.06)" : "rgba(20,20,20,0.05)",
    "--plt-forest-ring": accent,
    "--plt-forest-on": accentOn,
    "--plt-accent": accent,
    "--plt-shadow-sm": dark ? "0 4px 14px -10px rgba(0,0,0,0.7)" : "0 4px 14px -10px rgba(20,20,20,0.18)",
    "--plt-shadow-md": dark ? "0 12px 30px -18px rgba(0,0,0,0.75)" : "0 12px 30px -18px rgba(20,20,20,0.2)",
    "--plt-shadow-lg": dark ? "0 26px 60px -34px rgba(0,0,0,0.85)" : "0 26px 60px -34px rgba(20,20,20,0.22)",
  };
}
