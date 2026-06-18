/**
 * experiment.ts — ABTEST-1 A/B(/n) variant engine (PURE).
 *
 * A CTA / form node can carry an OPTIONAL `experiment` config of N variants
 * (control + 1..N challengers). At public render time the shared renderer
 * deterministically buckets a visitor (a stable per-visitor seed — the same
 * FNV-1a hash the staged template rollout uses) into ONE arm, applies that arm's
 * prop overrides to the node, and tags the rendered element with
 * `data-experiment` / `data-variant` so a tiny client runtime can fire an
 * `experiment_view` impression and an `experiment_convert` conversion (CTA click
 * / form submit) through the EXISTING `/api/analytics/events` seam — no parallel
 * event table.
 *
 * This module is PURE (no I/O, no React, no "use server", no Supabase) so it can
 * be unit-tested in the node runner. The bucketing reuses the FROZEN FNV-1a hash
 * (`deterministicBucket` / `deterministicPosition`) so a visitor is STABLE
 * across SSR renders — a flip-on-every-render would pollute the conversion data
 * (the documented headline risk for this WS).
 *
 * v1 shipped a MINIMAL engine (exactly 2 arms, even 50/50, one metric). This
 * extends it to:
 *   - MULTI-ARM: a control ("a") plus up to {@link EXPERIMENT_MAX_ARMS}-1
 *     challengers ("b", "c", …).
 *   - WEIGHTED splits: each arm carries an optional `weight`; the bucketer maps
 *     a visitor's stable [0, 1) position into a cumulative-weight band.
 * BYTE-STABILITY CONTRACT: a node with no experiment, AND the 2-arm even-split
 * case (no weights), bucket + normalize EXACTLY as before — the weighted path is
 * only taken when weights are present OR there are >2 arms.
 *
 * Config lives in the node tree (carried through validate's
 * BASE_NODE_FIELD_CARRIERS), so there is NO migration — experiment defs are not
 * persisted outside the tree.
 */

import {
  deterministicBucket,
  deterministicPosition,
} from "../builder-core/templates/rollout";

/**
 * A variant key. "a" is ALWAYS the control. Historically fixed to "a" | "b";
 * now any single lowercase letter from the {@link experimentVariantKeyAt}
 * sequence (a, b, c, …). Kept as a string alias so existing call sites that
 * compared against "a" / "b" keep type-checking.
 */
export type ExperimentVariantKey = string;

/** The two original fixed arm keys — retained for the byte-stable 2-arm path. */
export const EXPERIMENT_VARIANT_KEYS: ReadonlyArray<ExperimentVariantKey> = [
  "a",
  "b",
];

/**
 * Hard cap on arms (control + challengers). Keeps the authoring UI + the
 * cumulative-weight math bounded; 6 covers any realistic CTA/form test. Arms
 * beyond the cap are dropped at normalization.
 */
export const EXPERIMENT_MAX_ARMS = 6;

/** Stable key for the Nth arm: 0→"a", 1→"b", …, 5→"f". */
export function experimentVariantKeyAt(index: number): ExperimentVariantKey {
  return String.fromCharCode(97 + index); // 97 = 'a'
}

/** Max length of an experiment id (slug-ish, matches the visibility variant cap). */
export const EXPERIMENT_ID_MAX = 40;

/** Max length of a per-variant human label shown in the inspector. */
export const EXPERIMENT_VARIANT_LABEL_MAX = 60;

/** Default per-arm weight when an experiment carries no explicit weights — an
 *  EVEN split. Surfaced so the authoring UI can show the implied weight. */
export const EXPERIMENT_DEFAULT_WEIGHT = 1;

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
 * `label` / `href` or a form submit caption between arms.
 */
export type ExperimentPropOverride = string | number | boolean | null;

/** One variant (arm) of an experiment. `key` is "a" (control), "b", "c", …. */
export interface ExperimentVariant {
  key: ExperimentVariantKey;
  /** Optional author-facing label (e.g. "Control", "Urgent copy"). */
  label?: string;
  /**
   * Optional relative weight (split share). Weights are relative — [70, 20, 10]
   * and [7, 2, 1] split identically. Absent on EVERY arm ⇒ an even split (the
   * byte-stable default). A non-positive / non-finite weight normalizes away.
   */
  weight?: number;
  /**
   * Shallow prop overrides merged over the node's `props` when this variant is
   * served. Keys are top-level prop names (e.g. "label", "href"); unknown keys
   * are ignored by the node's own renderer, so a bad key can never break render.
   * The control ("a") carries none (it IS the node's base props).
   */
  propOverrides?: Record<string, ExperimentPropOverride>;
}

/**
 * The OPTIONAL experiment config carried on an eligible node. When present AND
 * enabled with ≥2 valid arms, the renderer buckets the visitor; otherwise the
 * node renders byte-identically to a node with no experiment (control = "a").
 */
export interface NodeExperimentConfig {
  /** Stable id — the bucketing salt + the analytics `experiment_id`. */
  experimentId: string;
  /** Master on/off. When false the control ("a") always renders (no tracking). */
  enabled?: boolean;
  /** 2..{@link EXPERIMENT_MAX_ARMS} variants, keyed "a","b","c",… in order. */
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

/** Coerce a raw weight to a positive finite number, or undefined. */
function normalizeWeight(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
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
  const weight = normalizeWeight(record.weight);
  if (weight !== undefined) variant.weight = weight;
  const overrides = normalizePropOverrides(record.propOverrides);
  if (overrides) variant.propOverrides = overrides;
  return variant;
}

/**
 * Coerce arbitrary JSON (the stored `experiment` or operator input) into a clean
 * multi-arm config, or `null` when there is no usable experiment. Never throws.
 *
 * Rules:
 *   - Requires an `experimentId`.
 *   - Re-keys arms by position to "a","b","c",… (operator input keys ignored)
 *     and caps at {@link EXPERIMENT_MAX_ARMS}.
 *   - The control ("a") never carries prop overrides (it IS the base node) —
 *     any supplied overrides on arm 0 are dropped.
 *   - A challenger ("b"+) with NO prop overrides is INERT (identical to the
 *     control), so it is dropped. If that leaves <2 arms ⇒ null (no experiment).
 *     This preserves the v1 contract: an empty B == "no experiment".
 *
 * BYTE-STABILITY: a config that normalizes to exactly two arms with NO weights
 * is structurally identical to the v1 output (`[{key:"a"}, {key:"b",
 * propOverrides}]`) — same field shape, so the carry + render are byte-stable.
 */
export function normalizeNodeExperimentConfig(
  value: unknown,
): NodeExperimentConfig | null {
  if (!isPlainObject(value)) return null;
  const experimentId = normalizeExperimentId(value.experimentId);
  if (!experimentId) return null;

  const rawVariants = Array.isArray(value.variants) ? value.variants : [];

  // Re-key by position; control is arm 0 ("a"). Cap to the max arm count.
  const armCount = Math.min(rawVariants.length, EXPERIMENT_MAX_ARMS);
  const built: ExperimentVariant[] = [];
  for (let i = 0; i < armCount; i++) {
    built.push(normalizeVariant(rawVariants[i], experimentVariantKeyAt(i)));
  }
  // Always at least 2 candidate slots so a config with one supplied arm still
  // produces "a","b" (the v1 shape) before the inert-challenger prune below.
  while (built.length < 2) {
    built.push({ key: experimentVariantKeyAt(built.length) });
  }

  // The control carries no prop overrides (it IS the base node) and no weight
  // semantics beyond its split share. Drop any overrides operator input put on
  // arm 0 so the control is always a clean base render.
  const control: ExperimentVariant = { key: "a" };
  if (built[0].label) control.label = built[0].label;
  if (built[0].weight !== undefined) control.weight = built[0].weight;

  // Challengers must carry at least one override to be a real arm; an empty
  // challenger is identical to the control, so drop it (v1 contract).
  const challengers = built
    .slice(1)
    .filter((v) => v.propOverrides && Object.keys(v.propOverrides).length > 0);

  if (challengers.length === 0) return null; // no live experiment.

  // Re-key contiguously so dropped inert arms never leave a gap: a, b, c, …
  const variants: ExperimentVariant[] = [control, ...challengers].map(
    (v, i) => ({ ...v, key: experimentVariantKeyAt(i) }),
  );

  // BYTE-STABILITY: if NO arm carries an explicit weight, drop the weight field
  // entirely so a 2-arm even config is structurally identical to v1 output.
  const anyWeighted = variants.some((v) => v.weight !== undefined);
  if (!anyWeighted) {
    for (const v of variants) delete v.weight;
  }

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
 * True when the config is the BYTE-STABLE 2-arm even-split shape: exactly two
 * arms and no explicit weights. Such a config MUST bucket via the exact v1
 * algorithm (`deterministicBucket < 50`) so historical assignments never shift.
 */
function isLegacyTwoArmEven(variants: ReadonlyArray<ExperimentVariant>): boolean {
  return (
    variants.length === 2 && variants.every((v) => v.weight === undefined)
  );
}

/**
 * Resolve the cumulative-weight bands for a set of arms. Returns the per-arm
 * normalized share (summing to 1) using each arm's `weight` (default
 * {@link EXPERIMENT_DEFAULT_WEIGHT} = even). Pure + deterministic.
 */
export function experimentArmShares(
  variants: ReadonlyArray<ExperimentVariant>,
): number[] {
  const weights = variants.map((v) => v.weight ?? EXPERIMENT_DEFAULT_WEIGHT);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    // Degenerate (shouldn't happen post-normalize) — fall back to even.
    return variants.map(() => 1 / variants.length);
  }
  return weights.map((w) => w / total);
}

/**
 * Deterministically assign a visitor (identified by a stable `seed`) to one of
 * the experiment's arms. STABLE per (experiment, seed) across SSR renders and
 * deploys, because it reuses the FROZEN FNV-1a hash.
 *
 * Two paths, both pure + deterministic:
 *   - LEGACY 2-arm even (no weights): the EXACT v1 bucketing —
 *     `deterministicBucket(seed, experimentId) < 50 → "a"` else "b". Byte-stable
 *     with everything shipped before this WS.
 *   - WEIGHTED / N>2: map the visitor's stable [0, 1) position into the
 *     cumulative-weight bands. The first band whose cumulative top exceeds the
 *     position wins. The last arm absorbs any FP rounding at the top edge.
 *
 * A missing/blank seed → "a" (control), with NO tracking, so a first paint can
 * never desync from a later hydration.
 *
 * Two call shapes:
 *   - `assignExperimentVariant(experimentId, seed)` — back-compat, assumes the
 *     legacy 2-arm even split.
 *   - `assignExperimentVariant(experimentId, seed, variants)` — multi-arm /
 *     weighted, driven by the arm list.
 */
export function assignExperimentVariant(
  experimentId: string,
  seed: string | null | undefined,
  variants?: ReadonlyArray<ExperimentVariant>,
): ExperimentVariantKey {
  if (typeof seed !== "string" || seed.trim().length === 0) return "a";
  const trimmedSeed = seed.trim();

  // No arm list, or the byte-stable 2-arm even shape → the FROZEN v1 path.
  if (!variants || isLegacyTwoArmEven(variants)) {
    return deterministicBucket(trimmedSeed, experimentId) < 50 ? "a" : "b";
  }
  if (variants.length === 0) return "a";
  if (variants.length === 1) return variants[0].key;

  // Weighted / N-arm path: stable [0, 1) position → cumulative-weight band.
  const position = deterministicPosition(trimmedSeed, experimentId);
  const shares = experimentArmShares(variants);
  let cumulative = 0;
  for (let i = 0; i < variants.length - 1; i++) {
    cumulative += shares[i];
    if (position < cumulative) return variants[i].key;
  }
  // Last arm absorbs the remaining band (and any FP top-edge rounding).
  return variants[variants.length - 1].key;
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
  const variantKey = assignExperimentVariant(
    config.experimentId,
    seed,
    config.variants,
  );
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
