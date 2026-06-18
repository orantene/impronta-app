import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assignExperimentVariant,
  experimentArmShares,
  experimentConversionTrigger,
  experimentVariantKeyAt,
  getNodeExperimentConfig,
  normalizeNodeExperimentConfig,
  resolveNodeExperiment,
  EXPERIMENT_ELIGIBLE_KINDS,
  EXPERIMENT_MAX_ARMS,
  type ExperimentVariant,
} from "./experiment";

import { deterministicBucket } from "../builder-core/templates/rollout";

// ── deterministic assignment: stable per visitor ─────────────────────────────

test("assignExperimentVariant is stable for the same (experiment, seed)", () => {
  const exp = "exp-cta-1";
  const seed = "visitor-abc";
  const first = assignExperimentVariant(exp, seed);
  for (let i = 0; i < 50; i++) {
    assert.equal(assignExperimentVariant(exp, seed), first);
  }
  assert.ok(first === "a" || first === "b");
});

test("a blank / missing seed always serves the control (a) — never random", () => {
  assert.equal(assignExperimentVariant("exp-1", ""), "a");
  assert.equal(assignExperimentVariant("exp-1", "   "), "a");
  assert.equal(assignExperimentVariant("exp-1", null), "a");
  assert.equal(assignExperimentVariant("exp-1", undefined), "a");
});

test("different experiments can bucket the same visitor differently", () => {
  // Find a seed that lands in different arms for two experiment ids — proves the
  // bucket salts on the experiment id, not just the seed.
  let foundDivergent = false;
  for (let i = 0; i < 200 && !foundDivergent; i++) {
    const seed = `v-${i}`;
    if (assignExperimentVariant("exp-A", seed) !== assignExperimentVariant("exp-B", seed)) {
      foundDivergent = true;
    }
  }
  assert.ok(foundDivergent, "expected at least one seed to diverge across experiments");
});

// ── ~50/50 distribution across many visitors ─────────────────────────────────

test("assignExperimentVariant splits ~50/50 over many distinct visitors", () => {
  const exp = "exp-split";
  let a = 0;
  let b = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const variant = assignExperimentVariant(exp, `visitor-${i}-${(i * 2654435761) >>> 0}`);
    if (variant === "a") a++;
    else b++;
  }
  const ratioA = a / N;
  // Even split with a stable hash — allow a generous ±6% band for sampling.
  assert.ok(
    ratioA > 0.44 && ratioA < 0.56,
    `expected ~50/50, got A=${ratioA.toFixed(3)} (a=${a}, b=${b})`,
  );
});

// ── conversion-tag mapping ───────────────────────────────────────────────────

test("experimentConversionTrigger maps each eligible kind to its conversion", () => {
  assert.equal(experimentConversionTrigger("button"), "click");
  assert.equal(experimentConversionTrigger("cta_group"), "click");
  assert.equal(experimentConversionTrigger("form"), "submit");
  // Ineligible kinds map to null.
  assert.equal(experimentConversionTrigger("heading"), null);
  assert.equal(experimentConversionTrigger("image"), null);
});

test("every eligible kind has a conversion trigger and vice versa", () => {
  for (const kind of EXPERIMENT_ELIGIBLE_KINDS) {
    assert.notEqual(
      experimentConversionTrigger(kind),
      null,
      `eligible kind ${kind} must have a conversion trigger`,
    );
  }
});

// ── normalization ────────────────────────────────────────────────────────────

test("normalizeNodeExperimentConfig requires an id and a non-empty B override", () => {
  // No id → null.
  assert.equal(normalizeNodeExperimentConfig({ variants: [{ key: "a" }, { key: "b" }] }), null);
  // Id but B has no overrides (identical to control) → null.
  assert.equal(
    normalizeNodeExperimentConfig({ experimentId: "x", variants: [{ key: "a" }, { key: "b" }] }),
    null,
  );
  // Valid 2-arm experiment.
  const ok = normalizeNodeExperimentConfig({
    experimentId: "  exp-1  ",
    variants: [
      { key: "a" },
      { key: "b", propOverrides: { label: "Buy now", href: "/x", weird: { drop: true } } },
    ],
  });
  assert.ok(ok);
  assert.equal(ok!.experimentId, "exp-1");
  assert.equal(ok!.enabled, true);
  assert.equal(ok!.variants.length, 2);
  assert.equal(ok!.variants[0].key, "a");
  assert.equal(ok!.variants[1].key, "b");
  // Scalar overrides kept; nested object override dropped.
  assert.deepEqual(ok!.variants[1].propOverrides, { label: "Buy now", href: "/x" });
});

test("normalize now ACCEPTS a third arm (multi-arm) and re-keys by position", () => {
  // ABTEST-1 multi-arm follow-up: the v1 "lock to two arms" rule is replaced by
  // "control + up to EXPERIMENT_MAX_ARMS-1 challengers". A valid C arm survives.
  const cfg = normalizeNodeExperimentConfig({
    experimentId: "e",
    variants: [
      { key: "a" },
      { key: "b", propOverrides: { label: "B" } },
      { key: "c", propOverrides: { label: "C" } },
    ],
  });
  assert.equal(cfg!.variants.length, 3);
  assert.deepEqual(cfg!.variants.map((v) => v.key), ["a", "b", "c"]);
});

test("getNodeExperimentConfig reads base first, then props (editor patch zone)", () => {
  const valid = {
    experimentId: "e1",
    variants: [{ key: "a" }, { key: "b", propOverrides: { label: "B" } }],
  };
  // base-level wins
  assert.equal(
    getNodeExperimentConfig({ experiment: valid })!.experimentId,
    "e1",
  );
  // falls through to props
  assert.equal(
    getNodeExperimentConfig({ props: { experiment: valid } })!.experimentId,
    "e1",
  );
  // absent → null
  assert.equal(getNodeExperimentConfig({}), null);
});

// ── resolution: overrides + eligibility + enabled gate ───────────────────────

test("resolveNodeExperiment returns the served variant's overrides for a CTA", () => {
  const node = {
    kind: "button",
    experiment: {
      experimentId: "btn-1",
      variants: [
        { key: "a" },
        { key: "b", propOverrides: { label: "Variant B" } },
      ],
    },
  };
  // Find a seed that buckets into "b" so we exercise the override path.
  let bSeed: string | null = null;
  for (let i = 0; i < 200 && !bSeed; i++) {
    if (assignExperimentVariant("btn-1", `s-${i}`) === "b") bSeed = `s-${i}`;
  }
  assert.ok(bSeed, "expected a seed bucketing into B");
  const resolved = resolveNodeExperiment(node, bSeed);
  assert.ok(resolved);
  assert.equal(resolved!.variantKey, "b");
  assert.deepEqual(resolved!.propOverrides, { label: "Variant B" });
});

test("resolveNodeExperiment is null for an ineligible kind", () => {
  const node = {
    kind: "heading",
    experiment: {
      experimentId: "h-1",
      variants: [{ key: "a" }, { key: "b", propOverrides: { label: "B" } }],
    },
  };
  assert.equal(resolveNodeExperiment(node, "seed"), null);
});

test("resolveNodeExperiment is null when disabled", () => {
  const node = {
    kind: "form",
    experiment: {
      experimentId: "f-1",
      enabled: false,
      variants: [{ key: "a" }, { key: "b", propOverrides: { label: "B" } }],
    },
  };
  assert.equal(resolveNodeExperiment(node, "seed"), null);
});

test("resolveNodeExperiment without a seed serves control (a) with no B override", () => {
  const node = {
    kind: "button",
    experiment: {
      experimentId: "btn-2",
      variants: [{ key: "a" }, { key: "b", propOverrides: { label: "B copy" } }],
    },
  };
  const resolved = resolveNodeExperiment(node, null);
  assert.ok(resolved);
  assert.equal(resolved!.variantKey, "a");
  assert.deepEqual(resolved!.propOverrides, {});
});

// ── BYTE-STABILITY: the 2-arm even split is unchanged by the multi-arm work ───

test("2-arm even split is byte-identical to the FROZEN v1 bucket (deterministicBucket < 50)", () => {
  const exp = "frozen-2arm";
  const evenVariants: ExperimentVariant[] = [
    { key: "a" },
    { key: "b", propOverrides: { label: "B" } },
  ];
  for (let i = 0; i < 2000; i++) {
    const seed = `v-${i}-${(i * 2654435761) >>> 0}`;
    const legacy = deterministicBucket(seed, exp) < 50 ? "a" : "b";
    // Both the 2-arg (back-compat) AND the 3-arg even-variants call MUST match
    // the frozen bucket exactly — no visitor is ever re-bucketed by this WS.
    assert.equal(assignExperimentVariant(exp, seed), legacy);
    assert.equal(assignExperimentVariant(exp, seed, evenVariants), legacy);
  }
});

test("normalize keeps a 2-arm even config structurally identical to v1 (no weight field)", () => {
  const cfg = normalizeNodeExperimentConfig({
    experimentId: "e",
    variants: [{ key: "a" }, { key: "b", propOverrides: { label: "B" } }],
  });
  assert.ok(cfg);
  assert.equal(cfg!.variants.length, 2);
  // No weight keys anywhere — byte-stable with the original shape.
  assert.ok(cfg!.variants.every((v) => v.weight === undefined));
  assert.deepEqual(cfg!.variants[0], { key: "a" });
  assert.deepEqual(cfg!.variants[1], { key: "b", propOverrides: { label: "B" } });
});

// ── MULTI-ARM normalization ──────────────────────────────────────────────────

test("normalize supports N challenger arms (control + B + C), re-keyed a,b,c", () => {
  const cfg = normalizeNodeExperimentConfig({
    experimentId: "multi",
    variants: [
      { key: "a" },
      { key: "b", propOverrides: { label: "B copy" } },
      { key: "c", propOverrides: { label: "C copy" } },
    ],
  });
  assert.ok(cfg);
  assert.deepEqual(cfg!.variants.map((v) => v.key), ["a", "b", "c"]);
  assert.deepEqual(cfg!.variants[2].propOverrides, { label: "C copy" });
});

test("normalize drops INERT challengers (no overrides) and re-keys contiguously", () => {
  const cfg = normalizeNodeExperimentConfig({
    experimentId: "gap",
    variants: [
      { key: "a" },
      { key: "b" }, // inert → dropped
      { key: "c", propOverrides: { label: "Real" } },
    ],
  });
  assert.ok(cfg);
  // The surviving challenger is re-keyed to "b" so there is no gap.
  assert.deepEqual(cfg!.variants.map((v) => v.key), ["a", "b"]);
  assert.deepEqual(cfg!.variants[1].propOverrides, { label: "Real" });
});

test("normalize caps arms at EXPERIMENT_MAX_ARMS", () => {
  const variants = [{ key: "a" }] as Array<Record<string, unknown>>;
  for (let i = 1; i < EXPERIMENT_MAX_ARMS + 4; i++) {
    variants.push({ key: experimentVariantKeyAt(i), propOverrides: { label: `v${i}` } });
  }
  const cfg = normalizeNodeExperimentConfig({ experimentId: "cap", variants });
  assert.ok(cfg);
  assert.equal(cfg!.variants.length, EXPERIMENT_MAX_ARMS);
});

test("normalize drops the control's prop overrides (control IS the base node)", () => {
  const cfg = normalizeNodeExperimentConfig({
    experimentId: "ctrl",
    variants: [
      { key: "a", propOverrides: { label: "should be dropped" } },
      { key: "b", propOverrides: { label: "B" } },
    ],
  });
  assert.ok(cfg);
  assert.equal(cfg!.variants[0].propOverrides, undefined);
});

test("normalize keeps explicit weights and reports them", () => {
  const cfg = normalizeNodeExperimentConfig({
    experimentId: "w",
    variants: [
      { key: "a", weight: 70 },
      { key: "b", weight: 20, propOverrides: { label: "B" } },
      { key: "c", weight: 10, propOverrides: { label: "C" } },
    ],
  });
  assert.ok(cfg);
  assert.deepEqual(cfg!.variants.map((v) => v.weight), [70, 20, 10]);
});

test("normalize discards non-positive / non-finite weights (treated as even)", () => {
  const cfg = normalizeNodeExperimentConfig({
    experimentId: "badw",
    variants: [
      { key: "a", weight: 0 },
      { key: "b", weight: -5, propOverrides: { label: "B" } },
      { key: "c", weight: Number.NaN, propOverrides: { label: "C" } },
    ],
  });
  assert.ok(cfg);
  // All weights invalid → no arm carries a weight → even split (byte-stable).
  assert.ok(cfg!.variants.every((v) => v.weight === undefined));
});

// ── arm shares ───────────────────────────────────────────────────────────────

test("experimentArmShares is even when no weights, and normalizes relative weights", () => {
  assert.deepEqual(
    experimentArmShares([{ key: "a" }, { key: "b" }, { key: "c" }]),
    [1 / 3, 1 / 3, 1 / 3],
  );
  const weighted = experimentArmShares([
    { key: "a", weight: 70 },
    { key: "b", weight: 20 },
    { key: "c", weight: 10 },
  ]);
  assert.ok(Math.abs(weighted[0] - 0.7) < 1e-9);
  assert.ok(Math.abs(weighted[1] - 0.2) < 1e-9);
  assert.ok(Math.abs(weighted[2] - 0.1) < 1e-9);
  // Relative — [7,2,1] splits identically to [70,20,10].
  const relative = experimentArmShares([
    { key: "a", weight: 7 },
    { key: "b", weight: 2 },
    { key: "c", weight: 1 },
  ]);
  assert.deepEqual(relative, weighted);
});

// ── weighted, stable, N-arm assignment over many seeds ───────────────────────

test("assignExperimentVariant is STABLE per visitor in the N-arm weighted path", () => {
  const variants: ExperimentVariant[] = [
    { key: "a", weight: 70 },
    { key: "b", weight: 20, propOverrides: { label: "B" } },
    { key: "c", weight: 10, propOverrides: { label: "C" } },
  ];
  const seed = "stable-visitor-xyz";
  const first = assignExperimentVariant("weighted-exp", seed, variants);
  for (let i = 0; i < 50; i++) {
    assert.equal(assignExperimentVariant("weighted-exp", seed, variants), first);
  }
  assert.ok(["a", "b", "c"].includes(first));
});

test("3-arm WEIGHTED distribution (70/20/10) ~matches the weights over many seeds", () => {
  const variants: ExperimentVariant[] = [
    { key: "a", weight: 70 },
    { key: "b", weight: 20, propOverrides: { label: "B" } },
    { key: "c", weight: 10, propOverrides: { label: "C" } },
  ];
  const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
  const N = 12000;
  for (let i = 0; i < N; i++) {
    const seed = `wv-${i}-${(i * 2654435761) >>> 0}`;
    counts[assignExperimentVariant("dist-exp", seed, variants)]++;
  }
  const ra = counts.a / N;
  const rb = counts.b / N;
  const rc = counts.c / N;
  // Generous ±4% bands around each target share for sampling noise.
  assert.ok(ra > 0.66 && ra < 0.74, `A share ${ra.toFixed(3)} (want ~.70)`);
  assert.ok(rb > 0.16 && rb < 0.24, `B share ${rb.toFixed(3)} (want ~.20)`);
  assert.ok(rc > 0.06 && rc < 0.14, `C share ${rc.toFixed(3)} (want ~.10)`);
});

test("4-arm EVEN distribution (no weights) is ~25% each", () => {
  const variants: ExperimentVariant[] = [
    { key: "a" },
    { key: "b", propOverrides: { label: "B" } },
    { key: "c", propOverrides: { label: "C" } },
    { key: "d", propOverrides: { label: "D" } },
  ];
  const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
  const N = 12000;
  for (let i = 0; i < N; i++) {
    const seed = `ev-${i}-${(i * 40503) >>> 0}`;
    counts[assignExperimentVariant("even4-exp", seed, variants)]++;
  }
  for (const key of ["a", "b", "c", "d"]) {
    const ratio = counts[key] / N;
    assert.ok(ratio > 0.21 && ratio < 0.29, `${key} share ${ratio.toFixed(3)} (want ~.25)`);
  }
});

test("a weighted experiment resolves through resolveNodeExperiment with the served arm's overrides", () => {
  const node = {
    kind: "button",
    experiment: {
      experimentId: "rw-1",
      variants: [
        { key: "a", weight: 50 },
        { key: "b", weight: 30, propOverrides: { label: "B copy" } },
        { key: "c", weight: 20, propOverrides: { label: "C copy" } },
      ],
    },
  };
  // Find a seed that buckets into "c" so we exercise the 3rd-arm override path.
  const cfg = getNodeExperimentConfig(node)!;
  let cSeed: string | null = null;
  for (let i = 0; i < 2000 && !cSeed; i++) {
    if (assignExperimentVariant("rw-1", `s-${i}`, cfg.variants) === "c") cSeed = `s-${i}`;
  }
  assert.ok(cSeed, "expected a seed bucketing into C");
  const resolved = resolveNodeExperiment(node, cSeed);
  assert.ok(resolved);
  assert.equal(resolved!.variantKey, "c");
  assert.deepEqual(resolved!.propOverrides, { label: "C copy" });
});
