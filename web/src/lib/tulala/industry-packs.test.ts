/**
 * industry-packs.test.ts
 *
 * The pack layer can fail in two directions, and only one of them is obvious.
 *
 * The obvious failure is not matching: a massage therapist gets the generic
 * questionnaire. Mildly disappointing, entirely survivable, and the core bank
 * still produces a correct recommendation.
 *
 * The failure that matters is matching WRONGLY, or letting pack detail leak into
 * the classifier. A barber asked about dietary requirements has learned that
 * nobody is listening. A singer whose band gets scored as roster evidence gets
 * sold an agency plan to perform with three friends. Most of this file defends
 * against the second kind.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INDUSTRY_PACKS,
  INDUSTRY_PACK_SET_VERSION,
  allPackQuestions,
  packById,
  packForFacts,
  unknownPackTargets,
} from "@/lib/tulala/industry-packs";
import { INDUSTRY_FACT_KEYS } from "@/lib/tulala/industry-fact-keys";
import {
  INDUSTRY_PACK_LABELS,
  packLabel,
} from "@/lib/tulala/industry-pack-labels";
import { FACT_KEYS, factKeyDef, isKnownFactKey } from "@/lib/tulala/fact-keys";
import { QUESTIONS } from "@/lib/tulala/questions";

// ─── Integrity ────────────────────────────────────────────────────────────────

test("pack ids are unique", () => {
  const ids = INDUSTRY_PACKS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("pack question ids are unique, and do not collide with the core bank", () => {
  // A collision merges two questions' metrics permanently, and the merge is
  // silent: both ids still resolve, to whichever won the map.
  const packIds = allPackQuestions().map((q) => q.id);
  assert.equal(new Set(packIds).size, packIds.length, "duplicate within packs");

  const coreIds = new Set(QUESTIONS.map((q) => q.id));
  for (const id of packIds) {
    assert.equal(coreIds.has(id), false, `${id} collides with a core question`);
  }
});

test("every pack question id is prefixed with its pack id", () => {
  // Core questions are prefixed by stage; pack questions by pack, because every
  // pack question shares one stage and the stage prefix would carry no
  // information. Either way the prefix has to identify the group the metrics
  // will be read by.
  for (const pack of INDUSTRY_PACKS) {
    for (const q of pack.questions) {
      assert.equal(q.id.split(".")[0], pack.id, q.id);
    }
  }
});

test("every pack target is a real fact key", () => {
  assert.deepEqual(unknownPackTargets(), [], "an unknown target is unsatisfiable forever");
});

test("every pack question is in the specifics stage", () => {
  // Stage order is priority order. A pack question in an earlier stage could be
  // asked before the recommendation is settled, which is exactly what packs
  // running last is meant to prevent.
  for (const q of allPackQuestions()) {
    assert.equal(q.stage, "specifics", q.id);
  }
});

test("no pack question is decisive", () => {
  // Decisive means the plan choice depends on it. Nothing a pack asks can, by
  // construction, so a decisive pack question would be a contradiction that the
  // conversation machine would then act on.
  for (const q of allPackQuestions()) {
    assert.notEqual(q.decisive, true, q.id);
  }
});

test("both locales are present in every pack question and label", () => {
  for (const pack of INDUSTRY_PACKS) {
    assert.ok(pack.label.en.trim().length > 0, pack.id);
    assert.ok(pack.label.es.trim().length > 0, pack.id);
    for (const q of pack.questions) {
      assert.ok(q.phrasing.en.text.trim().length > 0, q.id);
      assert.ok(q.phrasing.es.text.trim().length > 0, q.id);
      assert.notEqual(q.phrasing.en.text, q.phrasing.es.text, `${q.id} is not translated`);
    }
  }
});

test("versions are sane", () => {
  assert.ok(Number.isInteger(INDUSTRY_PACK_SET_VERSION) && INDUSTRY_PACK_SET_VERSION > 0);
  for (const pack of INDUSTRY_PACKS) {
    assert.ok(Number.isInteger(pack.version) && pack.version > 0, pack.id);
    for (const q of pack.questions) {
      assert.ok(Number.isInteger(q.version) && q.version > 0, q.id);
    }
  }
});

// ─── The rule that keeps the engine honest ────────────────────────────────────

test("NO industry fact key carries an evidence weight", () => {
  // The single most important assertion in this file. Packs run after the
  // decision, so a weight here could only corrupt the classifier: service
  // breadth would become business evidence and every thorough sole trader would
  // be recommended a workspace.
  for (const def of INDUSTRY_FACT_KEYS) {
    assert.equal(def.evidence, undefined, `${def.key} must not vote`);
  }
});

test("performing with a group is not roster evidence", () => {
  // Named specifically because it is the one that looks like it should count. A
  // singer's band is not her roster: she does not seat them and takes no cut.
  const def = factKeyDef("industry.performs_with_group");
  assert.ok(def, "the key exists");
  assert.equal(def.evidence, undefined);
});

test("every industry key lives in the industry category", () => {
  for (const def of INDUSTRY_FACT_KEYS) {
    assert.equal(def.category, "industry", def.key);
    assert.ok(def.key.startsWith("industry."), def.key);
  }
});

test("physical attributes are marked personal so prompts never see them", () => {
  for (const key of [
    "industry.height_cm",
    "industry.measurements",
    "industry.hair_color",
    "industry.eye_color",
  ]) {
    assert.equal(factKeyDef(key)?.personal, true, `${key} must be redacted`);
  }
});

test("industry keys are merged into the one canonical vocabulary", () => {
  // Two vocabularies would defeat `isKnownFactKey`, which is the only thing
  // between a typo and the database.
  for (const def of INDUSTRY_FACT_KEYS) {
    assert.equal(isKnownFactKey(def.key), true, def.key);
    assert.ok(
      FACT_KEYS.some((d) => d.key === def.key),
      def.key,
    );
  }
});

test("no key is defined twice across core and industry", () => {
  const keys = FACT_KEYS.map((d) => d.key);
  assert.equal(new Set(keys).size, keys.length);
});

// ─── Matching ─────────────────────────────────────────────────────────────────

test("the disciplines from the plan each reach their pack", () => {
  const cases: Array<[string, string]> = [
    ["massage therapist", "massage"],
    ["private chef", "chef"],
    ["model", "model"],
    ["singer", "music"],
    ["photographer", "photo"],
    ["nail artist", "beauty"],
  ];
  for (const [discipline, expected] of cases) {
    assert.equal(packForFacts({ discipline })?.id, expected, discipline);
  }
});

test("Spanish disciplines match too", () => {
  assert.equal(packForFacts({ discipline: "masajista" })?.id, "massage");
  assert.equal(packForFacts({ discipline: "fotógrafo de bodas" })?.id, "photo");
  assert.equal(packForFacts({ discipline: "manicurista" })?.id, "beauty");
  assert.equal(packForFacts({ discipline: "cantante" })?.id, "music");
});

test("accents are not required to match", () => {
  assert.equal(packForFacts({ discipline: "fotografo" })?.id, "photo");
  assert.equal(packForFacts({ discipline: "músico" })?.id, "music");
});

test("no match is a normal outcome, not an error", () => {
  // The core questionnaire is complete on its own. These are real trades that
  // simply have no pack yet, and each must get the generic intake rather than
  // the nearest-looking one.
  for (const discipline of [
    "accountant",
    "plumber",
    "yoga teacher",
    "dog walker",
    "tattoo artist",
    "",
  ]) {
    assert.equal(packForFacts({ discipline }), null, discipline);
  }
});

test("nothing known at all matches nothing", () => {
  assert.equal(packForFacts({}), null);
  assert.equal(packForFacts({ discipline: null, industry: null, services: null }), null);
});

test("discipline outranks a broader industry word", () => {
  // She is a photographer who works in the beauty industry. The pack must follow
  // what she DOES, not the sector she does it in.
  const pack = packForFacts({ discipline: "photographer", industry: "beauty" });
  assert.equal(pack?.id, "photo");
});

test("a service list can match when nothing else does", () => {
  const pack = packForFacts({ discipline: "freelancer", services: ["gel nails", "pedicure"] });
  assert.equal(pack?.id, "beauty");
});

test("but an incidental service does not override a stated discipline", () => {
  // "I'm a photographer, I also do makeup" must not become the beauty pack.
  const pack = packForFacts({
    discipline: "photographer",
    services: ["makeup", "wedding photography"],
  });
  assert.equal(pack?.id, "photo");
});

test("matching is deterministic", () => {
  const signals = { discipline: "massage therapist", industry: "wellness" };
  const first = packForFacts(signals)?.id;
  for (let i = 0; i < 20; i += 1) {
    assert.equal(packForFacts(signals)?.id, first);
  }
});

test("packById round-trips every pack, and rejects anything else", () => {
  for (const pack of INDUSTRY_PACKS) {
    assert.equal(packById(pack.id)?.id, pack.id);
  }
  assert.equal(packById("not_a_pack"), null);
});

// ─── Shared vocabulary, not per-pack duplicates ───────────────────────────────

test("duration is one key across every pack that asks about it", () => {
  // The trap this guards is `massage.session_length`, `music.set_length`,
  // `photo.shoot_length`: three rows in Settings meaning one thing, and every
  // consumer needing a switch on industry to find a duration.
  const durationKeys = INDUSTRY_FACT_KEYS.filter(
    (d) => d.key.includes("length") || d.key.includes("duration"),
  ).map((d) => d.key);
  assert.deepEqual(durationKeys, ["industry.session_length_minutes"]);
});

test("the core question every pack asks targets the one specialties key", () => {
  // Modalities, cuisines, genres and specialties are the same question in five
  // trades. They must land in the same place or the directory cannot filter.
  for (const pack of INDUSTRY_PACKS) {
    assert.ok(
      pack.questions.some((q) => q.targets.includes("industry.specialties")),
      `${pack.id} must ask what kinds specifically`,
    );
  }
});

test("no pack asks for a physical attribute except modelling", () => {
  const physical = new Set([
    "industry.height_cm",
    "industry.measurements",
    "industry.hair_color",
    "industry.eye_color",
  ]);
  for (const pack of INDUSTRY_PACKS) {
    if (pack.id === "model") continue;
    for (const q of pack.questions) {
      for (const target of q.targets) {
        assert.equal(physical.has(target), false, `${pack.id} must not ask ${target}`);
      }
    }
  }
});

test("every pack asks something, and not so much that it is a form", () => {
  for (const pack of INDUSTRY_PACKS) {
    assert.ok(pack.questions.length >= 3, `${pack.id} is too thin to be worth a pack`);
    assert.ok(pack.questions.length <= 6, `${pack.id} has become a questionnaire`);
  }
});

// ─── Labels reach the browser intact ──────────────────────────────────────────

test("every pack has a label, and every label has a pack", () => {
  // The panel imports the label map directly, so an orphan on either side is a
  // pack that renders as nothing or a name for a pack that no longer exists.
  const packIds = new Set(INDUSTRY_PACKS.map((p) => p.id));
  const labelIds = new Set(Object.keys(INDUSTRY_PACK_LABELS));
  assert.deepEqual([...packIds].sort(), [...labelIds].sort());
});

test("the pack label and the panel label are the same string", () => {
  for (const pack of INDUSTRY_PACKS) {
    assert.equal(packLabel(pack.id, "en"), pack.label.en, pack.id);
    assert.equal(packLabel(pack.id, "es"), pack.label.es, pack.id);
  }
});

test("an unknown or absent pack id has no label rather than a wrong one", () => {
  assert.equal(packLabel(null, "en"), null);
  assert.equal(packLabel("not_a_pack", "en"), null);
});
