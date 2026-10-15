import { STATIC_LOCALES, type Locale } from "@/i18n/config";

/**
 * Languages the workspace dashboard language menu lists. The dashboard UI
 * ships in every static locale (ES + EN) regardless of which languages the
 * workspace's public site publishes, so those two are always offered; the
 * workspace's own extra site languages follow. Without this union a workspace
 * whose site is English-only showed just "English" and had no way back to ES.
 */
export function workspaceMenuLocales(
  supported: readonly Locale[],
  tenantDefault: Locale,
): readonly Locale[] {
  const out: Locale[] = [];
  for (const code of [...supported, tenantDefault, ...STATIC_LOCALES]) {
    if (!out.includes(code)) out.push(code);
  }
  return out;
}
