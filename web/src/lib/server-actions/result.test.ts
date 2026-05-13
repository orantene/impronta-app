/**
 * C.5 — Type-level test for ServerActionResult discriminator.
 *
 * This file is a compile-time test: if it fails to typecheck, we have a
 * regression in the canonical result shape. Runtime assertions are
 * minimal because the actual contract is the type.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fail, ok, type ServerActionResult } from "./result";

// ── Type-level proofs (compile-time tests) ─────────────────────────────────

type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

function expectType<T>(_value: T): void {
  // no-op — used only for compile-time inference assertions
}

// 1. ServerActionResult<undefined> is the default — no `data` payload needed
//    on success.
expectType<ServerActionResult>({ ok: true, data: undefined });
expectType<ServerActionResult>({ ok: false, error: "x" });
expectType<ServerActionResult>({ ok: false, error: "x", reason: "rate_limited" });

// 2. ServerActionResult<T> narrows data on the success branch.
type WithUser = ServerActionResult<{ userId: string }>;
const userResult: WithUser = { ok: true, data: { userId: "u1" } };
if (userResult.ok) {
  // TypeScript should know data is { userId: string } here.
  expectType<string>(userResult.data.userId);
}

// 3. Discriminator: the false branch carries error, never data.
const failed: ServerActionResult<{ x: number }> = { ok: false, error: "nope" };
if (!failed.ok) {
  expectType<string>(failed.error);
  // @ts-expect-error — `data` doesn't exist on the false branch
  failed.data;
}

// 4. fail/ok constructors return the discriminated union.
const okFromHelper = ok({ count: 3 });
type _OkOk = Equals<typeof okFromHelper.ok, true>; // true by inference

const failFromHelper = fail("nope", "validation_failed");
type _FailOk = Equals<typeof failFromHelper.ok, false>;

// ── Runtime tests (light — the type is the real contract) ──────────────────

describe("ServerActionResult helpers", () => {
  it("ok() wraps data with ok: true", () => {
    const r = ok({ id: "x1" });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.data, { id: "x1" });
  });

  it("fail() wraps error string with ok: false", () => {
    const r = fail("Forbidden", "forbidden");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "Forbidden");
      assert.equal(r.reason, "forbidden");
    }
  });

  it("fail() reason is optional", () => {
    const r = fail("Unknown");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, undefined);
  });
});
