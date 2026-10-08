import test from "node:test";
import assert from "node:assert/strict";

import { choiceNeedsAge18, hasAge18Confirmation, requireAge18ForPublish } from "./age-gate";
import { parsePersistedModuleState } from "./module-state";

test("myself and both need the confirmation; studio does not", () => {
  assert.equal(choiceNeedsAge18("myself"), true);
  assert.equal(choiceNeedsAge18("both"), true);
  assert.equal(choiceNeedsAge18("studio"), false);
  assert.equal(choiceNeedsAge18(undefined), false);
});

test("missing confirmation: refused, profile stays draft, honest message in both locales, way back", () => {
  for (const choice of ["myself", "both"] as const) {
    const en = requireAge18ForPublish({ choice, confirmedAt: undefined, locale: "en" });
    assert.equal(en.ok, false);
    if (!en.ok) {
      assert.equal(en.code, "age_18_required");
      assert.equal(en.profile, "draft");
      assert.equal(en.backStep, "readyToBuild");
      assert.match(en.message, /not live yet/);
      assert.match(en.message, /18/);
    }
    const es = requireAge18ForPublish({ choice, confirmedAt: null, locale: "es" });
    assert.equal(es.ok, false);
    if (!es.ok) assert.match(es.message, /todavía no está en línea/);
  }
});

test("a junk timestamp is not a confirmation", () => {
  assert.equal(hasAge18Confirmation("yesterday-ish"), false);
  assert.equal(hasAge18Confirmation(123), false);
  assert.equal(requireAge18ForPublish({ choice: "myself", confirmedAt: "nope" }).ok, false);
});

test("a confirmation allows the publish", () => {
  const at = new Date().toISOString();
  assert.deepEqual(requireAge18ForPublish({ choice: "myself", confirmedAt: at }), { ok: true, required: true });
  assert.deepEqual(requireAge18ForPublish({ choice: "both", confirmedAt: at, locale: "es" }), { ok: true, required: true });
});

test("studio is allowed with or without it", () => {
  assert.deepEqual(requireAge18ForPublish({ choice: "studio", confirmedAt: undefined }), { ok: true, required: false });
});

test("the confirmation round-trips through the persisted module state", () => {
  const at = new Date().toISOString();
  const s = parsePersistedModuleState({ choice: "myself", age18ConfirmedAt: at, age18ConfirmedBy: "u1" });
  assert.equal(s.age18ConfirmedAt, at);
  assert.equal(s.age18ConfirmedBy, "u1");
  assert.equal(parsePersistedModuleState({ age18ConfirmedAt: "garbage" }).age18ConfirmedAt, undefined);
});
