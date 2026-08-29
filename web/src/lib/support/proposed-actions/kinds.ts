/**
 * Whitelist of agency-settings keys a settings_patch may touch.
 * Display / branding only. Billing, domain, and security keys are never allowed.
 */
export const SETTINGS_PATCH_KEYS = [
  "branding.tagline",
  "branding.description",
  "branding.primary_color",
  "branding.accent_color",
  "branding.logo_url",
  "branding.favicon_url",
] as const;

export type SettingsPatchKey = (typeof SETTINGS_PATCH_KEYS)[number];

const ALLOWED = new Set<string>(SETTINGS_PATCH_KEYS);

export const FORBIDDEN_SETTINGS_PREFIXES = ["billing", "domain", "security", "stripe", "payout"] as const;

export type ProposedActionKind = "settings_patch" | "builder_draft_revision" | "instruction";

export function isSettingsPatchKey(key: string): key is SettingsPatchKey {
  return ALLOWED.has(key);
}

export function pickWhitelistedPatch(
  input: Record<string, unknown>,
): { ok: true; patch: Record<SettingsPatchKey, unknown> } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_SETTINGS_PREFIXES.some((p) => key === p || key.startsWith(`${p}.`))) {
      return { ok: false, error: "That settings key is not allowed." };
    }
    if (!isSettingsPatchKey(key)) {
      return { ok: false, error: `Unknown settings key: ${key}` };
    }
    if (value === undefined) continue;
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Provide at least one settings change." };
  }
  return { ok: true, patch: patch as Record<SettingsPatchKey, unknown> };
}

/** Read a dotted path, for capturing what a patch is about to replace. */
export function getDotted(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = source;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setDotted(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = cur[part];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}
