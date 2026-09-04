/**
 * pipelines.test.ts — the rules a fulfilment board cannot be allowed to break.
 *
 * Two of these are money rules and one is a "the kitchen cannot work" rule.
 * The rest of the file exists so the presets stay honest as verticals are added.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PRESET_ID,
  MAX_STAGES,
  PIPELINE_PRESETS,
  boardColumns,
  releasesPayout,
  resolvePipeline,
  startStage,
  validatePipeline,
  type FulfilmentPipeline,
} from "./pipelines";

const PRESET_IDS = Object.keys(PIPELINE_PRESETS) as Array<keyof typeof PIPELINE_PRESETS>;

test("a pizza maker and a print shop get genuinely different boards", () => {
  // The premise of the feature: if these were the same, a fixed enum would do.
  const kitchen = PIPELINE_PRESETS.restaurant;
  const shop = PIPELINE_PRESETS.print_shop;
  assert.notEqual(kitchen.stages.length, shop.stages.length);
  assert.ok(
    shop.stages.some((s) => s.key === "proof_sent"),
    "a print shop blocks on customer approval; a kitchen does not",
  );
  assert.ok(!kitchen.stages.some((s) => s.key === "proof_sent"));
});

test("EVERY preset can complete, or a payout can never release", () => {
  for (const id of PRESET_IDS) {
    const problems = validatePipeline(PIPELINE_PRESETS[id]);
    assert.deepEqual(problems, [], `${id} is not a saveable pipeline: ${problems.join(", ")}`);
    assert.ok(
      PIPELINE_PRESETS[id].stages.some(releasesPayout),
      `${id} has no done stage, so a product payout could never release`,
    );
  }
});

test("payout release keys on kind, never on the label or the key", () => {
  // Renaming a stage must not unhook the money. This is the whole reason
  // `kind` exists rather than matching on "delivered"/"collected"/"served".
  const renamed = {
    key: "out_the_door",
    label: { en: "Out the door", es: "Entregado" },
    kind: "done" as const,
    color: "slate",
    notifyCustomer: false,
    lateAfterMin: null,
  };
  assert.equal(releasesPayout(renamed), true);

  const lookalike = { ...renamed, kind: "ready" as const, label: { en: "Delivered", es: "Entregado" } };
  assert.equal(
    releasesPayout(lookalike),
    false,
    "a stage LABELLED delivered but not kind=done must not release money",
  );
});

test("a pipeline with no done stage is refused", () => {
  const bad: FulfilmentPipeline = {
    name: "Broken",
    stages: [
      { key: "new", label: { en: "New", es: "Nuevo" }, kind: "start", color: "slate", notifyCustomer: false, lateAfterMin: null },
      { key: "wip", label: { en: "Doing", es: "Haciendo" }, kind: "work", color: "amber", notifyCustomer: false, lateAfterMin: null },
    ],
  };
  assert.ok(validatePipeline(bad).includes("no_done"));
});

test("a pipeline with no start, or two, is refused", () => {
  const s = (key: string, kind: "start" | "done") => ({
    key,
    label: { en: key, es: key },
    kind,
    color: "slate",
    notifyCustomer: false,
    lateAfterMin: null,
  });
  assert.ok(validatePipeline({ name: "x", stages: [s("a", "done")] }).includes("no_start"));
  assert.ok(
    validatePipeline({ name: "x", stages: [s("a", "start"), s("b", "start"), s("c", "done")] })
      .includes("many_starts"),
    "two start columns means a new order has two homes",
  );
});

test("duplicate stage keys are refused", () => {
  const dup = (key: string) => ({
    key,
    label: { en: "L", es: "L" },
    kind: "work" as const,
    color: "slate",
    notifyCustomer: false,
    lateAfterMin: null,
  });
  const p: FulfilmentPipeline = {
    name: "x",
    stages: [
      { ...dup("a"), kind: "start" },
      dup("a"),
      { ...dup("z"), kind: "done" },
    ],
  };
  assert.ok(validatePipeline(p).includes("duplicate_key"));
});

test("a malformed override degrades to the preset, never to an empty board", () => {
  // An operator staring at a board with no columns cannot tell a broken save
  // from a quiet day, and a kitchen with no columns cannot work at all.
  for (const settings of [
    null,
    {},
    { fulfilment_pipeline: "nonsense" },
    { fulfilment_pipeline: { name: "Mine", stages: [] } },
    { fulfilment_pipeline: { name: "Mine", stages: [{ key: "only", label: { en: "Only", es: "Solo" }, kind: "work" }] } },
  ]) {
    const { pipeline, source } = resolvePipeline(settings, "restaurant");
    assert.equal(source, "preset", `expected preset fallback for ${JSON.stringify(settings)}`);
    assert.ok(pipeline.stages.length > 0);
    assert.deepEqual(validatePipeline(pipeline), []);
  }
});

test("a valid override wins, and its stages survive intact", () => {
  const { pipeline, source } = resolvePipeline(
    {
      fulfilment_pipeline: {
        name: "Lavandería",
        stages: [
          { key: "dropped", label: { en: "Dropped off", es: "Recibido" }, kind: "start", color: "slate" },
          { key: "washing", label: { en: "Washing", es: "Lavando" }, kind: "work", color: "amber", lateAfterMin: 90 },
          { key: "ready", label: { en: "Ready", es: "Listo" }, kind: "ready", color: "green", notifyCustomer: true },
          { key: "picked_up", label: { en: "Picked up", es: "Recogido" }, kind: "done", color: "slate" },
        ],
      },
    },
    "pickup",
  );
  assert.equal(source, "override");
  assert.equal(pipeline.name, "Lavandería");
  assert.equal(boardColumns(pipeline).length, 4);
  assert.equal(startStage(pipeline)?.key, "dropped");
  assert.equal(pipeline.stages[1]?.lateAfterMin, 90);
  assert.equal(pipeline.stages[2]?.notifyCustomer, true);
});

test("an unknown preset id falls back rather than throwing", () => {
  const { pipeline } = resolvePipeline(null, "brewery");
  assert.deepEqual(pipeline, PIPELINE_PRESETS[DEFAULT_PRESET_ID]);
});

test("too many stages is refused", () => {
  const many = Array.from({ length: MAX_STAGES + 1 }, (_, i) => ({
    key: `s${i}`,
    label: { en: `S${i}`, es: `S${i}` },
    kind: i === 0 ? ("start" as const) : i === 1 ? ("done" as const) : ("work" as const),
    color: "slate",
    notifyCustomer: false,
    lateAfterMin: null,
  }));
  assert.ok(validatePipeline({ name: "x", stages: many }).includes("too_many_stages"));
});

test("every preset stage carries both languages", () => {
  for (const id of PRESET_IDS) {
    for (const s of PIPELINE_PRESETS[id].stages) {
      assert.ok(s.label.en.trim(), `${id}.${s.key} has no en label`);
      assert.ok(s.label.es.trim(), `${id}.${s.key} has no es label`);
      assert.notEqual(
        s.label.en,
        s.label.es,
        `${id}.${s.key} has English in the es slot — every other check would pass`,
      );
    }
  }
});

test("only the stage a customer would want to hear about notifies", () => {
  // A notification per column is how a board teaches people to mute you.
  for (const id of PRESET_IDS) {
    const notifying = PIPELINE_PRESETS[id].stages.filter((s) => s.notifyCustomer);
    assert.ok(notifying.length <= 2, `${id} notifies on ${notifying.length} stages`);
    assert.ok(
      notifying.every((s) => s.kind === "ready" || s.kind === "work"),
      `${id} notifies on a start or done stage, which nobody needs`,
    );
  }
});
