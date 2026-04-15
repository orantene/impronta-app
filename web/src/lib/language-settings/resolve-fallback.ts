import type { LanguageSettings } from "./types";

/**
 * Resolve which locale string to show when `primary` is empty.
 * Respects per-locale `fallback_locale` chain, then site default, then optional `candidates` order.
 */
export function resolveLocalizedString(
  values: Record<string, string | null | undefined>,
  preferredLocale: string,
  settings: LanguageSettings,
): string {
  const trimmed = (s: string | null | undefined) => (s ?? "").trim();

  const tryLocale = (code: string): string | null => {
    const v = trimmed(values[code]);
    return v.length > 0 ? v : null;
  };

  const direct = tryLocale(preferredLocale);
  if (direct) return direct;

  const localeMeta = settings.locales.find((l) => l.code === preferredLocale);
  const visited = new Set<string>([preferredLocale]);
  let chain: string | null = localeMeta?.fallback_locale ?? null;

  while (chain && !visited.has(chain)) {
    visited.add(chain);
    const v = tryLocale(chain);
    if (v) return v;
    chain = settings.locales.find((l) => l.code === chain)?.fallback_locale ?? null;
  }

  if (settings.fallbackMode === "default_only" || settings.fallbackMode === "default_then_chain") {
    const d = tryLocale(settings.defaultLocale);
    if (d) return d;
  }

  for (const code of settings.publicLocales) {
    const v = tryLocale(code);
    if (v) return v;
  }

  for (const code of settings.adminLocales) {
    const v = tryLocale(code);
    if (v) return v;
  }

  return "";
}

export function isLocaleAllowedPublic(code: string, settings: LanguageSettings): boolean {
  return settings.publicLocales.includes(code);
}

export function isLocaleAllowedAdmin(code: string, settings: LanguageSettings): boolean {
  return settings.adminLocales.includes(code);
}
