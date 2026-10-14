/** TUL-618 follow-up: atomic resume claim + unconfigured guest AI. Lane: test:ai-guardrails. */
import test from "node:test";
import assert from "node:assert/strict";

import { claimGuestResume, type ResumeClaimDeps, type ResumeTicketRow } from "./guest-resume-claim";
import {
  _resetGuestSupportLimiterForTests,
  checkSupportGuestAiByIp,
} from "../rate-limit-kv-guest-support";

/** Fake store with optimistic concurrency on updatedAt. */
function fakeStore(initial: ResumeTicketRow, beforeFirstUpdate?: (s: { row: ResumeTicketRow }) => void) {
  const state = { row: initial, updates: 0 };
  let hooked = false;
  const deps: ResumeClaimDeps = {
    async load() {
      return { row: structuredClone(state.row), error: false };
    },
    async update(patch, expected) {
      if (!hooked && beforeFirstUpdate) {
        hooked = true;
        beforeFirstUpdate(state);
      }
      if (expected && state.row.updatedAt !== expected) return { rows: 0, error: false };
      state.updates += 1;
      state.row = {
        updatedAt: patch.updatedAt,
        metadata: patch.metadata,
        guestSessionId: patch.guestSessionId,
      };
      return { rows: 1, error: false };
    },
  };
  return { state, deps };
}
const base = (): ResumeTicketRow => ({ updatedAt: "t0", metadata: {}, guestSessionId: "owner" });

test("uncontended first open claims the thread", async () => {
  const { state, deps } = fakeStore(base());
  assert.equal(await claimGuestResume(deps, 5, "A", () => "t1"), "claimed");
  assert.equal(state.row.guestSessionId, "A");
});

test("lost race to a different session is refused, winner kept", async () => {
  const { state, deps } = fakeStore(base(), (s) => {
    s.row = { updatedAt: "tW", metadata: { resume_claims: { "5": "B" } }, guestSessionId: "B" };
  });
  assert.equal(await claimGuestResume(deps, 5, "A", () => "t1"), "already_opened");
  assert.equal(state.row.guestSessionId, "B");
  assert.equal(state.updates, 0);
});

test("lost race to the same session still succeeds on retry", async () => {
  const { deps } = fakeStore(base(), (s) => {
    s.row = { updatedAt: "tW", metadata: { resume_claims: { "5": "A" } }, guestSessionId: "A" };
  });
  assert.equal(await claimGuestResume(deps, 5, "A", () => "t1"), "claimed");
});

test("two lost races in a row count as already opened", async () => {
  let n = 0;
  const deps: ResumeClaimDeps = {
    async load() {
      return { row: { ...base(), updatedAt: `t${n++}` }, error: false };
    },
    async update() {
      return { rows: 0, error: false };
    },
  };
  assert.equal(await claimGuestResume(deps, 5, "A"), "already_opened");
});

test("load/update errors and missing thread are reported", async () => {
  const mk = (load: ResumeClaimDeps["load"], update: ResumeClaimDeps["update"] = async () => ({ rows: 1, error: false })) =>
    claimGuestResume({ load, update }, 5, "A");
  assert.equal(await mk(async () => ({ row: null, error: true })), "error");
  assert.equal(await mk(async () => ({ row: null, error: false })), "not_found");
  assert.equal(await mk(async () => ({ row: base(), error: false }), async () => ({ rows: 0, error: true })), "error");
});

test("unconfigured store: guest AI refused on Vercel production, allowed elsewhere", async () => {
  const saved = { ...process.env };
  try {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    _resetGuestSupportLimiterForTests();
    process.env.VERCEL_ENV = "production";
    const origErr = console.error;
    const logs: string[] = [];
    console.error = (...a: unknown[]) => void logs.push(a.join(" "));
    const a = await checkSupportGuestAiByIp("1.2.3.4");
    await checkSupportGuestAiByIp("1.2.3.4");
    console.error = origErr;
    assert.equal(a.ok, false);
    assert.equal(logs.length, 1, "logged once");
    process.env.VERCEL_ENV = "preview";
    assert.equal((await checkSupportGuestAiByIp("1.2.3.4")).ok, true);
    delete process.env.VERCEL_ENV;
    assert.equal((await checkSupportGuestAiByIp("1.2.3.4")).ok, true);
  } finally {
    process.env = saved;
    _resetGuestSupportLimiterForTests();
  }
});
