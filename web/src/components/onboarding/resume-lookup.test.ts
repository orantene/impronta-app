import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { initialMachineState, reduceMachine } from "@/lib/onboarding/machine";

import { runResumeLookup } from "./resume-lookup";

const snap = {
  briefId: "b-late",
  isAuthenticated: false,
  email: null,
  state: { step: "entry" as const, choice: "studio" as const },
};
type Snap = typeof snap;
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

function harness(load: () => Promise<Snap | null>, timeoutMs = 20) {
  const log: string[] = [];
  const cancel = runResumeLookup<Snap | null>({
    load,
    timeoutMs,
    onChecked: () => log.push("checked"),
    onLoaded: (s) => log.push(s ? "loaded" : "loaded-null"),
  });
  return { log, cancel };
}

test("rejected lookup still marks checked (Choose renders), nothing dispatched", async () => {
  const h = harness(() => Promise.reject(new Error("5xx")));
  await tick(5);
  assert.deepEqual(h.log, ["checked"]);
  await tick(40);
  assert.deepEqual(h.log, ["checked"]);
});

test("fast lookup: checked then loaded, timeout never fires twice", async () => {
  const h = harness(() => Promise.resolve(snap));
  await tick(5);
  assert.deepEqual(h.log, ["checked", "loaded"]);
  await tick(40);
  assert.deepEqual(h.log, ["checked", "loaded"]);
});

test("slow lookup: timeout marks checked, late result is still delivered", async () => {
  const h = harness(() => tick(40).then(() => snap));
  await tick(30);
  assert.deepEqual(h.log, ["checked"]);
  await tick(30);
  assert.deepEqual(h.log, ["checked", "loaded"]);
});

test("slow lookup then late resume does not replace a choice (reducer guard)", () => {
  let s = initialMachineState("unknown", "choose");
  s = reduceMachine(s, { type: "choiceChosen", choice: "myself" });
  s = reduceMachine(s, { type: "resumeLoaded", snapshot: snap });
  assert.equal(s.resume, null);
  assert.equal(s.choice, "myself");
});

test("cancel (unmount) clears the timer and drops results", async () => {
  const h = harness(() => tick(10).then(() => snap));
  h.cancel();
  await tick(40);
  assert.deepEqual(h.log, []);
});

test("module uses runResumeLookup for the mount lookup", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/onboarding-module.tsx"), "utf8");
  assert.match(src, /runResumeLookup/);
});
