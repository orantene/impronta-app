/**
 * WAVE1-1.6 — a DUPLICATED tab must conflict honestly, while the SAME tab keeps
 * adopting its own beacon write.
 *
 * The regression this locks: browser tab duplication COPIES sessionStorage, so
 * the WS1-D edit-session token was shared by two live tabs. Their
 * `Date.now()`-seeded `draft_seq` values interleaved and the server's
 * same-session last-write-wins lane adopted one tab's write as the other's —
 * silent cross-tab overwrite, no conflict toast.
 *
 * Both directions are asserted, because fixing only the first one would
 * re-open the W1-L2 false-conflict class (a reload must still reuse its token).
 *
 * Run:
 *   npx tsx --test src/components/edit-chrome/edit-session-token.test.ts
 *   (Glob-covered by the `test:builder-chrome` lane via src/components/edit-chrome.)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  claimEditSessionLease,
  EDIT_SESSION_LEASE_STALE_MS,
  EDIT_SESSION_STORAGE_KEY,
  editSessionLeaseKey,
  resolveEditSessionToken,
  type EditSessionEnv,
  type EditSessionStorageLike,
} from "./edit-session-token";

function memStore(seed: Record<string, string> = {}): EditSessionStorageLike & {
  dump: () => Record<string, string>;
} {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

/** A fake browser clock the lease heartbeat and the staleness check share. */
function makeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

let mintCounter = 0;
const mintUuid = () => `uuid-${++mintCounter}`;

function env(
  over: Partial<EditSessionEnv> & {
    session: EditSessionStorageLike;
    local: EditSessionStorageLike;
  },
): EditSessionEnv {
  return {
    navigationType: "navigate",
    now: () => 1_000_000,
    mintUuid,
    ...over,
  };
}

describe("resolveEditSessionToken", () => {
  test("first ever load in a tab mints and persists a token", () => {
    const session = memStore();
    const local = memStore();
    const res = resolveEditSessionToken(env({ session, local }));

    assert.equal(res.reason, "minted-fresh");
    assert.equal(
      session.dump()[EDIT_SESSION_STORAGE_KEY],
      res.token,
      "the token is persisted so a reload can reuse it",
    );
  });

  test("SAME TAB reload reuses its token (W1-L2 same-session adoption preserved)", () => {
    const clock = makeClock();
    const session = memStore();
    const local = memStore();

    // Load 1: mint + hold the lease.
    const first = resolveEditSessionToken(
      env({ session, local, now: clock.now }),
    );
    const lease = claimEditSessionLease({ local, now: clock.now }, first.token);
    lease.claim();

    // F5: pagehide releases, the document is replaced, sessionStorage survives,
    // and the navigation type is "reload".
    lease.release();
    const second = resolveEditSessionToken(
      env({ session, local, now: clock.now, navigationType: "reload" }),
    );

    assert.equal(second.reason, "reused-same-document");
    assert.equal(
      second.token,
      first.token,
      "a reload keeps the token, so the editor's first save after the pagehide beacon is still ADOPTED, not falsely conflicted",
    );
  });

  test("reload reuses the token EVEN IF the lease was never released (crashed/killed tab)", () => {
    const clock = makeClock();
    const session = memStore();
    const local = memStore();
    const first = resolveEditSessionToken(
      env({ session, local, now: clock.now }),
    );
    claimEditSessionLease({ local, now: clock.now }, first.token).claim();

    // No release at all — but the navigation type is unambiguous.
    const second = resolveEditSessionToken(
      env({ session, local, now: clock.now, navigationType: "reload" }),
    );
    assert.equal(second.token, first.token);
    assert.equal(second.reason, "reused-same-document");
  });

  test("DUPLICATED TAB gets its OWN token, so its conflicts are honest", () => {
    const clock = makeClock();
    const original = memStore();
    const local = memStore();

    // Tab A is live and heartbeating its lease.
    const a = resolveEditSessionToken(env({ session: original, local, now: clock.now }));
    const leaseA = claimEditSessionLease({ local, now: clock.now }, a.token);
    leaseA.claim();

    // "Duplicate tab": sessionStorage is COPIED into tab B, and the new document
    // reports a plain `navigate` (not a reload). Tab A never fired pagehide, so
    // its lease is still fresh.
    const copied = memStore(original.dump());
    clock.advance(500);
    const b = resolveEditSessionToken(
      env({ session: copied, local, now: clock.now, navigationType: "navigate" }),
    );

    assert.equal(b.reason, "reminted-duplicate-tab");
    assert.notEqual(
      b.token,
      a.token,
      "the duplicated tab must NOT share the original's edit-session token",
    );
    assert.equal(
      copied.dump()[EDIT_SESSION_STORAGE_KEY],
      b.token,
      "the duplicate persists its own token for its own later reloads",
    );
    assert.equal(
      original.dump()[EDIT_SESSION_STORAGE_KEY],
      a.token,
      "the original tab's token is untouched",
    );
  });

  test("same-tab hard navigation reuses the token (lease was released on pagehide)", () => {
    const clock = makeClock();
    const session = memStore();
    const local = memStore();
    const first = resolveEditSessionToken(env({ session, local, now: clock.now }));
    const lease = claimEditSessionLease({ local, now: clock.now }, first.token);
    lease.claim();

    // Full-page navigation within the SAME tab: pagehide fires, lease released.
    lease.release();
    const second = resolveEditSessionToken(
      env({ session, local, now: clock.now, navigationType: "navigate" }),
    );
    assert.equal(second.reason, "reused-lease-free");
    assert.equal(second.token, first.token);
  });

  test("an IDLE duplicate is still detected — presence, not freshness, is the signal", () => {
    // Regression guard for the first cut of this fix: it heartbeated a
    // timestamp and treated a >6s-old claim as dead. Background tabs have their
    // timers throttled to ~1/min (and automation tabs are permanently
    // backgrounded), so a duplicated-but-idle tab looked dead and went right
    // back to SHARING the token — the exact bug 1.6 exists to close.
    const clock = makeClock();
    const original = memStore();
    const local = memStore();
    const a = resolveEditSessionToken(env({ session: original, local, now: clock.now }));
    claimEditSessionLease({ local, now: clock.now }, a.token).claim();

    clock.advance(10 * 60 * 1000); // ten idle minutes, no heartbeat at all
    const b = resolveEditSessionToken(
      env({
        session: memStore(original.dump()),
        local,
        now: clock.now,
        navigationType: "navigate",
      }),
    );
    assert.equal(b.reason, "reminted-duplicate-tab");
    assert.notEqual(b.token, a.token);
  });

  test("a claim left by a tab that crashed long ago is garbage-collected, not honoured forever", () => {
    const clock = makeClock();
    const session = memStore();
    const local = memStore();
    const first = resolveEditSessionToken(env({ session, local, now: clock.now }));
    claimEditSessionLease({ local, now: clock.now }, first.token).claim();

    clock.advance(EDIT_SESSION_LEASE_STALE_MS + 1);
    const second = resolveEditSessionToken(
      env({ session, local, now: clock.now, navigationType: "navigate" }),
    );
    assert.equal(second.reason, "reused-lease-free");
    assert.equal(second.token, first.token);
  });

  test("blocked storage degrades to an in-memory token instead of throwing", () => {
    const hostile: EditSessionStorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const res = resolveEditSessionToken(
      env({ session: hostile, local: hostile }),
    );
    assert.equal(res.reason, "minted-fresh");
    assert.ok(res.token, "a usable token is still produced");
  });

  test("back_forward restore reuses the token", () => {
    const session = memStore();
    const local = memStore();
    const first = resolveEditSessionToken(env({ session, local }));
    const second = resolveEditSessionToken(
      env({ session, local, navigationType: "back_forward" }),
    );
    assert.equal(second.token, first.token);
    assert.equal(second.reason, "reused-same-document");
  });
});

describe("claimEditSessionLease", () => {
  test("claim writes the token's key; release removes it", () => {
    const clock = makeClock();
    const local = memStore();
    const lease = claimEditSessionLease({ local, now: clock.now }, "tok");

    lease.claim();
    assert.equal(local.dump()[editSessionLeaseKey("tok")], String(clock.now()));

    lease.release();
    assert.equal(local.dump()[editSessionLeaseKey("tok")], undefined);
  });
});
