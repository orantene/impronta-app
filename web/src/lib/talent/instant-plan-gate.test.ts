import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  INSTANT_PLAN_REFUSAL_EN,
  INSTANT_PLAN_REFUSAL_ES,
  instantPlanNoticeCopy,
  instantPlanRefuses,
  showInstantPlanNotice,
} from "./instant-plan-gate";

test("TUL-1270 #12: the notice shows when the item books instantly and the plan has no instant", () => {
  assert.equal(showInstantPlanNotice({ effectiveMode: "instant", quote: false, planAllowsInstant: false }), true);
  assert.equal(showInstantPlanNotice({ effectiveMode: "instant", quote: false, planAllowsInstant: true }), false);
  assert.equal(showInstantPlanNotice({ effectiveMode: "request", quote: false, planAllowsInstant: false }), false);
  assert.equal(showInstantPlanNotice({ effectiveMode: "instant", quote: true, planAllowsInstant: false }), false);
  assert.equal(showInstantPlanNotice({ effectiveMode: "instant", quote: false, planAllowsInstant: undefined }), false, "unknown plan never warns");
});

test("TUL-1270 #12: the server refuses a NEW instant choice on a plan without instant", () => {
  assert.equal(instantPlanRefuses({ nextMode: "instant", priorMode: "request", planAllowsInstant: false }), true);
  assert.equal(instantPlanRefuses({ nextMode: "instant", priorMode: null, planAllowsInstant: false }), true);
  assert.equal(instantPlanRefuses({ nextMode: "instant", priorMode: undefined, planAllowsInstant: false }), true);
});

test("TUL-1270 #12: never a lock-out: stored instant rows, inheriting rows, paid plans and unknown plans save", () => {
  assert.equal(instantPlanRefuses({ nextMode: "instant", priorMode: "instant", planAllowsInstant: false }), false);
  assert.equal(instantPlanRefuses({ nextMode: null, priorMode: null, planAllowsInstant: false }), false);
  assert.equal(instantPlanRefuses({ nextMode: "request", priorMode: "instant", planAllowsInstant: false }), false);
  assert.equal(instantPlanRefuses({ nextMode: "instant", priorMode: "request", planAllowsInstant: true }), false);
  assert.equal(instantPlanRefuses({ nextMode: "instant", priorMode: "request", planAllowsInstant: undefined }), false);
});

test("TUL-1270 #12: copy in English and Spanish, no em dashes", () => {
  const all = [INSTANT_PLAN_REFUSAL_EN, INSTANT_PLAN_REFUSAL_ES, ...Object.values(instantPlanNoticeCopy(true)), ...Object.values(instantPlanNoticeCopy(false))];
  for (const s of all) assert.doesNotMatch(s, /—/);
  assert.match(instantPlanNoticeCopy(true).body, /reserva instantánea/);
  assert.match(instantPlanNoticeCopy(false).body, /instant booking/);
});

test("TUL-1270 #12: the server gate reads the same entitlement the public page uses", () => {
  const gate = readFileSync(join(process.cwd(), "src/lib/talent/offering-save-gate.server.ts"), "utf8");
  assert.match(gate, /loadPlanAllowsInstant\(/);
  assert.match(gate, /instantPlanRefuses\(/);
  assert.match(gate, /INSTANT_PLAN_REFUSAL_EN/);
  const save = readFileSync(join(process.cwd(), "src/components/talent/services/offering-editor-save.ts"), "utf8");
  assert.match(save, /INSTANT_PLAN_REFUSAL_ES/);
});

test("TUL-1270 #12: the editor shows the plan notice next to the booking-mode choice", () => {
  const editor = readFileSync(join(process.cwd(), "src/components/talent/services/EditorScreen.tsx"), "utf8");
  assert.match(editor, /<InstantPlanNotice /);
  const notice = readFileSync(join(process.cwd(), "src/components/talent/services/InstantPlanNotice.tsx"), "utf8");
  assert.match(notice, /showInstantPlanNotice\(/);
  assert.match(notice, /loadInstantPlanEntitlement\(/);
  assert.match(notice, /href="\/talent\/plan"/);
});
