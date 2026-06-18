import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assignExperimentVariant,
  experimentConversionTrigger,
  getNodeExperimentConfig,
  normalizeNodeExperimentConfig,
  resolveNodeExperiment,
  EXPERIMENT_ELIGIBLE_KINDS,
} from "./experiment";

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

test("normalize locks to exactly two arms regardless of input count", () => {
  const cfg = normalizeNodeExperimentConfig({
    experimentId: "e",
    variants: [
      { key: "a" },
      { key: "b", propOverrides: { label: "B" } },
      { key: "c", propOverrides: { label: "C" } },
    ],
  });
  assert.equal(cfg!.variants.length, 2);
  assert.deepEqual(cfg!.variants.map((v) => v.key), ["a", "b"]);
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
