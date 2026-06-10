/**
 * safe-action-abort.test.ts — lane/save-abort.
 *
 * Pins the AbortSignal contract that `persistBuilderTree`'s coalesced save queue
 * relies on to drop a SUPERSEDED in-flight draft save. The real wiring lives in
 * edit-context.tsx (needs a DOM + server action), but the abort semantics it
 * depends on are entirely inside `safeAction`, which is pure and importable.
 *
 * The guarantees under test:
 *   1. Aborting the signal STOPS the await and resolves to `fallback` promptly —
 *      it does NOT wait out the (here 45s) timeout. This is the "queue never
 *      blocks on a stale write" property.
 *   2. The underlying action keeps running after abort (client-only cancel) and
 *      its later resolution/rejection never surfaces an unhandled rejection.
 *   3. A signal already aborted before the call returns `fallback` immediately.
 *   4. Back-compat: with no signal, behaviour is unchanged (success passes
 *      through, the timeout still fires, real rejections still hit `fallback`).
 *   5. If the action RESOLVES before the abort lands, its real result wins (so a
 *      write that genuinely succeeded in the same tick is honored).
 *
 * Runner: node:test via `tsx --test`. Pure — no DOM, no React.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { safeAction } from "./safe-action";

const FALLBACK = { ok: false as const, code: "network" as const };

// `safeAction` calls improntaLog → structured-log, which in test has no real
// sink; silence console noise from the warn path without asserting on it.
beforeEach(() => {
  mock.method(console, "warn", () => {});
  mock.method(console, "log", () => {});
});
afterEach(() => {
  mock.restoreAll();
});

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("safeAction — AbortSignal (superseded draft-save abort)", () => {
  it("aborting the signal resolves to fallback WITHOUT waiting out the timeout", async () => {
    const controller = new AbortController();
    const pending = deferred<{ ok: true }>(); // never resolves on its own here

    const t0 = Date.now();
    const racePromise = safeAction(() => pending.promise, {
      name: "saveDraftHomepageAction",
      // A long timeout to prove we return because of the ABORT, not the timeout.
      timeoutMs: 45_000,
      signal: controller.signal,
      fallback: FALLBACK,
    });

    // Supersede mid-flight.
    controller.abort();

    const result = await racePromise;
    assert.deepEqual(result, FALLBACK, "abort resolves to the fallback shape");
    assert.ok(
      Date.now() - t0 < 1_000,
      "returned promptly on abort, not after the 45s timeout",
    );

    // The underlying action settling later must not throw (client-only cancel).
    pending.resolve({ ok: true });
    await pending.promise;
  });

  it("a still-running action that REJECTS after abort does not surface unhandled", async () => {
    const controller = new AbortController();
    const pending = deferred<{ ok: true }>();

    const racePromise = safeAction(() => pending.promise, {
      timeoutMs: 45_000,
      signal: controller.signal,
      fallback: FALLBACK,
    });
    controller.abort();
    const result = await racePromise;
    assert.deepEqual(result, FALLBACK);

    // Reject the abandoned action; safeAction's inner .catch swallows it.
    pending.reject(new Error("server action failed late"));
    await assert.rejects(pending.promise);
  });

  it("a signal already aborted before the call returns fallback immediately", async () => {
    const controller = new AbortController();
    controller.abort();
    let invoked = false;
    const result = await safeAction(
      () => {
        invoked = true;
        return Promise.resolve({ ok: true as const });
      },
      { signal: controller.signal, fallback: FALLBACK },
    );
    assert.deepEqual(result, FALLBACK, "pre-aborted signal short-circuits");
    // The action is still invoked (fire-and-forget write), we just don't await it.
    assert.equal(invoked, true);
  });

  it("if the action RESOLVES before the abort lands, the real success wins", async () => {
    const controller = new AbortController();
    const result = await safeAction(
      () => Promise.resolve({ ok: true as const, pageVersion: 9 }),
      { signal: controller.signal, fallback: FALLBACK },
    );
    // We never abort here; the action resolves first.
    assert.deepEqual(result, { ok: true, pageVersion: 9 });
    controller.abort(); // late abort is a no-op on an already-settled race
  });

  it("back-compat: no signal — success passes through unchanged", async () => {
    const result = await safeAction(
      () => Promise.resolve({ ok: true as const, pageVersion: 3 }),
      { fallback: FALLBACK },
    );
    assert.deepEqual(result, { ok: true, pageVersion: 3 });
  });

  it("back-compat: no signal — a rejecting action still returns fallback", async () => {
    const result = await safeAction(
      () => Promise.reject(new Error("Failed to fetch")),
      { fallback: FALLBACK },
    );
    assert.deepEqual(result, FALLBACK);
  });

  it("timeout still fires when no signal is supplied", async () => {
    const never = new Promise<{ ok: true }>(() => {});
    const t0 = Date.now();
    const result = await safeAction(() => never, {
      timeoutMs: 20,
      fallback: FALLBACK,
    });
    assert.deepEqual(result, FALLBACK, "timeout resolves to fallback");
    assert.ok(Date.now() - t0 >= 15, "waited ~the timeout window");
  });

  it("an unaborted signal with a fast action does not interfere", async () => {
    const controller = new AbortController();
    const result = await safeAction(
      () => Promise.resolve({ ok: true as const }),
      { signal: controller.signal, timeoutMs: 45_000, fallback: FALLBACK },
    );
    assert.deepEqual(result, { ok: true });
  });
});
