/**
 * experiment.ts — ABTEST-1 minimal A/B variant engine (PURE).
 *
 * A CTA / form node can carry an OPTIONAL `experiment` config of EXACTLY two
 * variants. At public render time the shared renderer deterministically buckets
 * a visitor (a stable per-visitor seed — the same FNV-1a hash the staged
 * template rollout uses) into ONE variant, applies that variant's prop overrides
 * to the node, and tags the rendered element with `data-experiment` /
 * `data-variant` so a tiny client runtime can fire an `experiment_view`
 * impression and an `experiment_convert` conversion (CTA click / form submit)
 * through the EXISTING `/api/analytics/events` seam — no parallel event table.
 *
 * This module is PURE (no I/O, no React, no "use server", no Supabase) so it can
 * be unit-tested in the node runner. The bucketing reuses the FROZEN FNV-1a hash
 * via `deterministicBucket(seed, experimentId)` so a visitor is STABLE across
 * SSR renders — a flip-on-every-render would pollute the conversion data (the
 * documented headline risk for this WS).
 *
 * Scope is intentionally MINIMAL for v1: TWO variants ("a" = control, "b"),
 * even 50/50 split, ONE metric (a single conversion per node kind). Config lives
 * in the node tree (carried through validate's BASE_NODE_FIELD_CARRIERS), so
 * there is NO migration — experiment defs are not persisted outside the tree.
 */

import { deterministicBucket } from "../builder-core/templates/rollout";

/** The two fixed variant keys for the minimal v1 engine. "a" is the control. */
export type ExperimentVariantKey = "a" | "b";

export const EXPERIMENT_VARIANT_KEYS: ReadonlyArray<ExperimentVariantKey> = [
  "a",
  "b",
];

/** Max length of an experiment id (slug-ish, matches the visibility variant cap). */
export const EXPERIMENT_ID_MAX = 40;

/** Max length of a per-variant human label shown in the inspector. */
export const EXPERIMENT_VARIANT_LABEL_MAX = 60;

/**
 * The kinds that may carry an A/B experiment. Kept narrow to the conversion
 * surfaces in scope (CTA + form). The renderer reads this allow-list so adding a
 * kind here is the ONLY change needed to extend coverage — every public surface
 * inherits because they all render through the shared `renderBuilderNodes`.
 */
export const EXPERIMENT_ELIGIBLE_KINDS: ReadonlySet<string> = new Set([
  "button",
  "cta_group",
  "form",
]);

/**
 * A scalar prop override applied to the node's `props` when its variant wins.
 * Kept to JSON scalars so it round-trips through the node tree + Zod-free carry
 * without dragging the full style model in. The headline use is swapping a CTA
 * `label` / `href` or a form submit caption between A and B.
 */
export type ExperimentPropOverride = string | number | boolean | null;

/** One variant of a 2-arm experiment. `key` is fixed to "a" | "b". */
export interface ExperimentVariant {
  key: ExperimentVariantKey;
  /** Optional author-facing label (e.g. "Control", "Urgent copy"). */
  label?: string;
  /**
   * Shallow prop overrides merged over the node's `props` when this variant is
   * served. Keys are top-level prop names (e.g. "label", "href"); unknown keys
   * are ignored by the node's own renderer, so a bad key can never break render.
   */
  propOverrides?: Record<string, ExperimentPropOverride>;
}

/**
 * The OPTIONAL experiment config carried on an eligible node. When present AND
 * enabled with two variants, the renderer buckets the visitor; otherwise the
 * node renders byte-identically to a node with no experiment (control = "a").
 */
export interface NodeExperimentConfig {
  /** Stable id — the bucketing salt + the analytics `experiment_id`. */
  experimentId: string;
  /** Master on/off. When false the control ("a") always renders (no tracking). */
  enabled?: boolean;
  /** Exactly two variants, keys "a" then "b". */
  variants: ExperimentVariant[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeExperimentId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, EXPERIMENT_ID_MAX);
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOverrideValue(value: unknown): ExperimentPropOverride | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return undefined;
}

function normalizePropOverrides(
  value: unknown,
): Record<string, ExperimentPropOverride> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, ExperimentPropOverride> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key) continue;
    const normalized = normalizeOverrideValue(raw);
    if (normalized !== undefined) out[key] = normalized;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeVariant(
  value: unknown,
  key: ExperimentVariantKey,
): ExperimentVariant {
  const record = isPlainObject(value) ? value : {};
  const variant: ExperimentVariant = { key };
  if (typeof record.label === "string") {
    const label = record.label.trim().slice(0, EXPERIMENT_VARIANT_LABEL_MAX);
    if (label) variant.label = label;
  }
  const overrides = normalizePropOverrides(record.propOverrides);
  if (overrides) variant.propOverrides = overrides;
  return variant;
}

/**
 * Coerce arbitrary JSON (the stored `experiment` or operator input) into a clean
 * 2-arm config, or `null` when there is no usable experiment. Always returns
 * EXACTLY two variants keyed "a","b" when non-null. Never throws. An experiment
 * with no id, or fewer than two variants, normalizes to null (→ control render).
 */
export function normalizeNodeExperimentConfig(
  value: unknown,
): NodeExperimentConfig | null {
  if (!isPlainObject(value)) return null;
  const experimentId = normalizeExperimentId(value.experimentId);
  if (!experimentId) return null;
  const rawVariants = Array.isArray(value.variants) ? value.variants : [];
  // Lock to the two fixed arms regardless of how many were supplied — minimal v1.
  const variants: ExperimentVariant[] = [
    normalizeVariant(rawVariants[0], "a"),
    normalizeVariant(rawVariants[1], "b"),
  ];
  // The "b" arm must carry at least one override to be a real experiment; an
  // empty B is identical to the control, so treat it as "no experiment".
  if (!variants[1].propOverrides) return null;
  const enabled = value.enabled !== false; // default ON when present + valid.
  return { experimentId, enabled, variants };
}

/** Read an eligible node's normalized experiment config (or null). Mirrors the
 *  visibility reader: base-level FIRST (where validate lifts it), then `props`
 *  (the editor patch landing zone), so it resolves in both states. */
export function getNodeExperimentConfig(node: {
  experiment?: unknown;
  props?: unknown;
}): NodeExperimentConfig | null {
  const base = normalizeNodeExperimentConfig(node.experiment);
  if (base) return base;
  const props = node.props as Record<string, unknown> | undefined;
  return normalizeNodeExperimentConfig(props?.experiment);
}

/**
 * Deterministically assign a visitor (identified by a stable `seed`) to one of
 * the two variants for `experimentId`. Reuses the FROZEN FNV-1a bucket so the
 * SAME visitor always lands in the SAME arm for a given experiment — stable
 * across SSR renders and deploys. Even 50/50 split: bucket < 50 → "a", else "b".
 *
 * A missing/blank seed → "a" (control). This keeps SSR-without-a-cookie
 * deterministic (always control) rather than random, so a first paint can never
 * desync from a later hydration.
 */
export function assignExperimentVariant(
  experimentId: string,
  seed: string | null | undefined,
): ExperimentVariantKey {
  if (typeof seed !== "string" || seed.trim().length === 0) return "a";
  return deterministicBucket(seed.trim(), experimentId) < 50 ? "a" : "b";
}

/**
 * Resolve which variant a visitor sees for an eligible node, plus the served
 * variant's overrides. Returns null when there is no live experiment (config
 * absent / disabled / invalid) → the node renders as its plain control.
 */
export interface ResolvedNodeExperiment {
  experimentId: string;
  variantKey: ExperimentVariantKey;
  propOverrides: Record<string, ExperimentPropOverride>;
}

export function resolveNodeExperiment(
  node: { kind: string; experiment?: unknown; props?: unknown },
  seed: string | null | undefined,
): ResolvedNodeExperiment | null {
  if (!EXPERIMENT_ELIGIBLE_KINDS.has(node.kind)) return null;
  const config = getNodeExperimentConfig(node);
  if (!config || config.enabled === false) return null;
  const variantKey = assignExperimentVariant(config.experimentId, seed);
  const served = config.variants.find((v) => v.key === variantKey);
  return {
    experimentId: config.experimentId,
    variantKey,
    propOverrides: served?.propOverrides ?? {},
  };
}

/**
 * Map a node kind to the analytics conversion that counts as a "convert" for its
 * experiment. CTA kinds (`button`, `cta_group`) convert on CLICK; `form`
 * converts on SUBMIT. The client runtime reads this to know which DOM event to
 * bind. Returns null for ineligible kinds (defensive — callers gate on
 * eligibility first). This is the single conversion-tag mapping the WS pins.
 */
export type ExperimentConversionTrigger = "click" | "submit";

export function experimentConversionTrigger(
  kind: string,
): ExperimentConversionTrigger | null {
  if (kind === "form") return "submit";
  if (kind === "button" || kind === "cta_group") return "click";
  return null;
}
