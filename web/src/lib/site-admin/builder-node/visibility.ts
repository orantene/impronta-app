/**
 * Wave 5B (job #38) — OPTIONAL node-level conditional visibility.
 *
 * A builder node may carry a `visibilityCondition` that hides the block unless
 * the render context matches. Three independent, server-evaluable signals:
 *
 *   - `locale`  : "en" | "es" — show only on that storefront locale.
 *   - `auth`    : "signed_in" | "signed_out" — show only to (anon|authed) visitors.
 *   - `variant` : a simple named flag (e.g. "promo") — show only when the active
 *                 render variant matches.
 *
 * DESIGN — graceful by default. A condition is evaluated against
 * {@link BuilderVisibilityContext}; a signal that the context does NOT provide
 * (`undefined`) is treated as a PASS, never a hide. So a node with an `auth`
 * rule still renders in a context that has no auth signal (e.g. a test / a
 * lighter preview), and a node with NO condition is always shown. This keeps
 * the rule additive + back-compat: the flagship sets no condition → identity →
 * byte-identical render.
 *
 * The renderer calls {@link evaluateBuilderNodeVisibility} from the single
 * `shouldRenderNode` choke point and OMITS the node when it returns false. The
 * condition is persisted in `node.props.visibilityCondition` (validated +
 * carried by registry/validate alongside the existing per-kind props), and ALSO
 * surfaced as a convenience base-level type field for editor reads.
 */

import { pickLocale } from "@/lib/i18n/pick-locale";

/** Locale signal — the two storefront locales the app ships. */
export type BuilderVisibilityLocale = "en" | "es";

/** Auth signal — whether the visitor is signed in. */
export type BuilderVisibilityAuth = "signed_in" | "signed_out";

export const BUILDER_VISIBILITY_LOCALES: ReadonlyArray<BuilderVisibilityLocale> = [
  "en",
  "es",
];

export const BUILDER_VISIBILITY_AUTH_STATES: ReadonlyArray<BuilderVisibilityAuth> = [
  "signed_in",
  "signed_out",
];

/** Max length of a free-form named variant flag (slug-ish). */
export const BUILDER_VISIBILITY_VARIANT_MAX = 40;

/**
 * A node-level visibility rule. Every field is optional; an empty object means
 * "no constraint" (always shown). Fields combine with AND — ALL present (and
 * context-known) signals must match.
 */
export interface BuilderVisibilityCondition {
  locale?: BuilderVisibilityLocale;
  auth?: BuilderVisibilityAuth;
  variant?: string;
}

/**
 * The signals the render context knows. Any field left `undefined` means the
 * context cannot evaluate that signal, so a rule on it PASSES (never hides).
 */
export interface BuilderVisibilityContext {
  locale?: string;
  /** True when a signed-in visitor is rendering; false when anonymous. */
  signedIn?: boolean;
  /** The active named render variant, when the page is rendered for one. */
  variant?: string;
}

/**
 * The minimal node shape the visibility readers accept — a node carrying the
 * rule on its base (`visibilityCondition`) and/or in `props` (the patch landing
 * zone). Both keys are present so an object literal with either one matches.
 */
export interface BuilderVisibilityNodeLike {
  visibilityCondition?: unknown;
  props?: unknown;
}

function isVisibilityLocale(value: unknown): value is BuilderVisibilityLocale {
  return value === "en" || value === "es";
}

function isVisibilityAuth(value: unknown): value is BuilderVisibilityAuth {
  return value === "signed_in" || value === "signed_out";
}

/** Normalize a context locale (e.g. "es-MX", "EN") to a bare visibility locale. */
function normalizeContextLocale(
  locale: string | null | undefined,
): BuilderVisibilityLocale | null {
  if (typeof locale !== "string") return null;
  const head = locale.trim().toLowerCase().split(/[-_]/)[0];
  return isVisibilityLocale(head) ? head : null;
}

function normalizeVariant(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, BUILDER_VISIBILITY_VARIANT_MAX);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Coerce arbitrary JSON (the stored `visibilityCondition` or operator input)
 * into a clean condition, or null when there is no usable constraint. Unknown
 * enum values drop (so a stale signal never hides everything); an all-empty
 * result is null (== "always shown"). Never throws.
 */
export function normalizeBuilderVisibilityCondition(
  value: unknown,
): BuilderVisibilityCondition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const out: BuilderVisibilityCondition = {};
  if (isVisibilityLocale(record.locale)) out.locale = record.locale;
  if (isVisibilityAuth(record.auth)) out.auth = record.auth;
  const variant = normalizeVariant(record.variant);
  if (variant) out.variant = variant;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Read a node's normalized visibility condition (or null). The persisted value
 * lives on the node BASE after `validateBuilderNodeTree` lifts it there; the
 * editor patch path writes it transiently into `props` before the next
 * validate. Reading base-level FIRST, then `props`, resolves correctly in both
 * states without a second source of truth.
 */
export function getBuilderNodeVisibilityCondition(
  node: BuilderVisibilityNodeLike,
): BuilderVisibilityCondition | null {
  const base = normalizeBuilderVisibilityCondition(node.visibilityCondition);
  if (base) return base;
  const props = node.props as Record<string, unknown> | undefined;
  return normalizeBuilderVisibilityCondition(props?.visibilityCondition);
}

/**
 * Evaluate a single condition against the context. Returns true (show) when
 * every PRESENT + context-known signal matches; a signal the context does not
 * provide passes. A null/empty condition always shows.
 */
export function evaluateBuilderVisibilityCondition(
  condition: BuilderVisibilityCondition | null | undefined,
  context: BuilderVisibilityContext | null | undefined,
): boolean {
  const rule = normalizeBuilderVisibilityCondition(condition);
  if (!rule) return true;
  const ctx = context ?? {};

  if (rule.locale) {
    const ctxLocale = normalizeContextLocale(ctx.locale);
    // Only hide when the context KNOWS a locale that differs. Unknown → pass.
    if (ctxLocale && ctxLocale !== rule.locale) return false;
  }

  if (rule.auth) {
    if (typeof ctx.signedIn === "boolean") {
      const wantSignedIn = rule.auth === "signed_in";
      if (ctx.signedIn !== wantSignedIn) return false;
    }
  }

  if (rule.variant) {
    const ctxVariant = normalizeVariant(ctx.variant);
    // Only hide when the context KNOWS a variant that differs. Unknown → pass.
    if (ctxVariant && ctxVariant !== rule.variant) return false;
  }

  return true;
}

/** Convenience — evaluate a node (reads its condition) against a context. */
export function evaluateBuilderNodeVisibility(
  node: BuilderVisibilityNodeLike,
  context: BuilderVisibilityContext | null | undefined,
): boolean {
  return evaluateBuilderVisibilityCondition(
    getBuilderNodeVisibilityCondition(node),
    context,
  );
}

/** Human-readable summary of a condition for the inspector (e.g. badge text). */
export function describeBuilderVisibilityCondition(
  condition: BuilderVisibilityCondition | null | undefined,
): string {
  const rule = normalizeBuilderVisibilityCondition(condition);
  if (!rule) return "Always visible";
  const parts: string[] = [];
  if (rule.locale) parts.push(pickLocale(rule.locale, { en: "English only", es: "Spanish only" }));
  if (rule.auth) {
    parts.push(rule.auth === "signed_in" ? "Signed-in only" : "Signed-out only");
  }
  if (rule.variant) parts.push(`Variant “${rule.variant}”`);
  return parts.join(" · ");
}
