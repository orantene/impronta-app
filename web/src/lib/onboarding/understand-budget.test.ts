/** TUL-541: the reading step always settles, even when every call hangs. */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

import {
  EXTRACTION_ATTEMPT_TIMEOUT_MS,
  EXTRACTION_RETRY_BACKOFF_MS,
  FALLBACK_CARD_CEILING_MS,
  planExtractionAttempts,
  runUnderstandStep,
  UNDERSTAND_CEILING_MS,
} from "./understand-budget";

const never = <T>() => new Promise<T>(() => {});

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

test("never-resolving understand AND card load still land on the entry fallback", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let settled: unknown = null;
    void runUnderstandStep({ understand: () => never<{ ok: boolean }>(), loadCard: () => never<{ ok: boolean }>() }).then((o) => {
      settled = o;
    });
    mock.timers.tick(UNDERSTAND_CEILING_MS);
    await flush();
    assert.equal(settled, null, "still waiting on the card load");
    mock.timers.tick(FALLBACK_CARD_CEILING_MS);
    await flush();
    assert.deepEqual(settled, { kind: "entry", result: null });
  } finally {
    mock.timers.reset();
  }
});

test("a stalled understand falls back to the short-form card", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let settled: unknown = null;
    void runUnderstandStep({ understand: () => never<{ ok: boolean }>(), loadCard: async () => ({ ok: true }) }).then((o) => {
      settled = o;
    });
    mock.timers.tick(UNDERSTAND_CEILING_MS);
    await flush();
    assert.deepEqual(settled, { kind: "fallback", result: null, card: { ok: true } });
  } finally {
    mock.timers.reset();
  }
});

test("a thrown understand is a fallback, not a hang", async () => {
  const o = await runUnderstandStep({ understand: () => Promise.reject(new Error("x")), loadCard: async () => ({ ok: true }) });
  assert.equal(o.kind, "fallback");
});

test("an ok understand wins", async () => {
  const o = await runUnderstandStep({ understand: async () => ({ ok: true }), loadCard: () => never<{ ok: boolean }>() });
  assert.equal(o.kind, "understood");
});

test("at most one retry: failover when present, else same provider", () => {
  assert.deepEqual(planExtractionAttempts("a", "b").map((x) => x.attempt), ["first", "failover"]);
  assert.deepEqual(planExtractionAttempts("a", null).map((x) => `${x.attempt}:${x.chat}`), ["first:a", "retry:a"]);
});

test("server worst case fits inside the client ceiling", () => {
  assert.ok(2 * EXTRACTION_ATTEMPT_TIMEOUT_MS + EXTRACTION_RETRY_BACKOFF_MS + 5_000 < UNDERSTAND_CEILING_MS);
});
