/**
 * Phase 5 — governed design token registry.
 *
 * Locked: only tokens flagged `agencyConfigurable: true` are editable by
 * tenant staff via the M6 design UI. Non-allow-listed token keys in an
 * incoming payload must be rejected server-side with TOKEN_NOT_OVERRIDABLE
 * (concurrency.ts error code).
 *
 * Token values are stored in agency_branding.theme_json. This module is the
 * source of truth for the token schema + defaults + safe-value validators.
 */

import { z } from "zod";

/**
 * Hex color in the form "#rgb" or "#rrggbb". Accessibility contrast checks
 * are enforced on M6 UI, not at DB level.
 */
const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Invalid hex color");

export type TokenScope = "color" | "typography" | "spacing" | "radius";

export interface TokenSpec {
  key: string;
  label: string;
  scope: TokenScope;
  /** Gate: true = tenant can override via M6 UI. false = platform-only. */
  agencyConfigurable: boolean;
  /** Zod validator for accepted values. */
  validator: z.ZodType<string>;
  /** Platform default; used when theme_json lacks this key. */
  defaultValue: string;
}

export const TOKEN_REGISTRY: Record<string, TokenSpec> = {
  "color.primary": {
    key: "color.primary",
    label: "Primary",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#111111",
  },
  "color.secondary": {
    key: "color.secondary",
    label: "Secondary",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#6b7280",
  },
  "color.accent": {
    key: "color.accent",
    label: "Accent",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#0ea5e9",
  },
  "color.neutral": {
    key: "color.neutral",
    label: "Neutral",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#737373",
  },
  "color.background": {
    key: "color.background",
    label: "Background",
    scope: "color",
    // Platform-governed: changing this risks storefront legibility.
    agencyConfigurable: false,
    validator: hexColor,
    defaultValue: "#ffffff",
  },
  "typography.heading-preset": {
    key: "typography.heading-preset",
    label: "Heading font preset",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.enum(["sans", "serif", "display"]),
    defaultValue: "sans",
  },
  "typography.body-preset": {
    key: "typography.body-preset",
    label: "Body font preset",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.enum(["sans", "serif"]),
    defaultValue: "sans",
  },
  "radius.base": {
    key: "radius.base",
    label: "Radius base",
    scope: "radius",
    agencyConfigurable: true,
    validator: z.enum(["none", "sm", "md", "lg"]),
    defaultValue: "md",
  },
  "spacing.scale": {
    key: "spacing.scale",
    label: "Spacing scale",
    scope: "spacing",
    agencyConfigurable: false,
    validator: z.enum(["compact", "cozy", "comfortable"]),
    defaultValue: "cozy",
  },
};

export function getToken(key: string): TokenSpec | null {
  return TOKEN_REGISTRY[key] ?? null;
}

export function listAgencyConfigurableTokens(): ReadonlyArray<TokenSpec> {
  return Object.values(TOKEN_REGISTRY).filter((t) => t.agencyConfigurable);
}

export function isTokenOverridable(key: string): boolean {
  return Boolean(TOKEN_REGISTRY[key]?.agencyConfigurable);
}

/**
 * Validate an incoming theme_json patch against the registry. Rejects any
 * keys that are not registered or not agency-configurable.
 *
 * Returns { ok: true, normalized } on success or
 * { ok: false, rejected: [...] } listing the keys that failed.
 */
export function validateThemePatch(
  patch: Record<string, unknown>,
):
  | { ok: true; normalized: Record<string, string> }
  | { ok: false; rejected: string[]; reasons: Record<string, string> } {
  const rejected: string[] = [];
  const reasons: Record<string, string> = {};
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(patch)) {
    const spec = TOKEN_REGISTRY[key];
    if (!spec) {
      rejected.push(key);
      reasons[key] = "Unknown token";
      continue;
    }
    if (!spec.agencyConfigurable) {
      rejected.push(key);
      reasons[key] = "Not agency-configurable";
      continue;
    }
    const parsed = spec.validator.safeParse(value);
    if (!parsed.success) {
      rejected.push(key);
      reasons[key] = parsed.error.issues[0]?.message ?? "Invalid value";
      continue;
    }
    normalized[key] = parsed.data;
  }

  if (rejected.length > 0) return { ok: false, rejected, reasons };
  return { ok: true, normalized };
}

export function tokenDefaults(): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const spec of Object.values(TOKEN_REGISTRY)) {
    out[spec.key] = spec.defaultValue;
  }
  return out;
}
