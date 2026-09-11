import { test } from "node:test";
import assert from "node:assert/strict";

import { resumeRefundEffects } from "./refund-resume-effects";

/**
 * Behavioural, against a fake PostgREST — the same seam `hold-capacity.test.ts`
 * uses. The point of this path is what it does when the RPC keeps failing and
 * what it does NOT do ever (touch money), and neither is visible in source
 * text.
 */

type Row = Record<string, unknown>;

function fakeAdmin(
  admissions: Row[],
  rpcReply: (id: string) => { data: unknown; error: { message?: string } | null },
) {
  const calls: string[] = [];
  const from = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (k: string, v: unknown) => {
        eqs.push([k, v]);
        return api;
      },
      in: (k: string, vals: string[]) => {
        eqs.push([k, { __in: vals }]);
        return api;
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown, reject?: (e: unknown) => unknown) => {
        const rows = (table === "admissions" ? admissions : []).filter((row) =>
          eqs.every(([k, v]) =>
            v && typeof v === "object" && v !== null && "__in" in v
              ? (v as { __in: unknown[] }).__in.includes(row[k])
              : row[k] === v,
          ),
        );
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return api;
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    assert.equal(fn, "refund_admission", "this path may call NOTHING else");
    const id = String(args.p_admission_id);
    calls.push(id);
    return rpcReply(id);
  };
  return { admin: { from, rpc } as never, calls };
}

const adm = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  order_line_id: "L1",
  admitted_count: 0,
  status: "valid",
  ...over,
});

test("resumes the ticket effect that the executor could not land", () => {
  const { admin, calls } = fakeAdmin([adm("a1"), adm("a2")], () => ({
    data: { ok: true },
    error: null,
  }));
  return resumeRefundEffects(admin, { orderId: "ord", lineIds: ["L1"] }).then((r) => {
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.stamped, 2);
      assert.equal(r.stillIncomplete, 0);
    }
    assert.deepEqual(calls, ["a1", "a2"]);
  });
});

test("A SECOND RUN IS A NO-OP, NOT A SECOND REFUND", () => {
  // The whole reason this path can be a Retry button an operator presses.
  // A row already `refunded` is never sent to the RPC at all.
  const { admin, calls } = fakeAdmin([adm("a1", { status: "refunded" })], () => ({
    data: { ok: true },
    error: null,
  }));
  return resumeRefundEffects(admin, { orderId: "ord", lineIds: ["L1"] }).then((r) => {
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.alreadyDone, 1);
      assert.equal(r.stamped, 0, "nothing was re-done");
    }
    assert.deepEqual(calls, [], "a settled row is not even asked");
  });
});

test("an idempotent 'already' reply counts as done, so the exception clears", () => {
  // An exceptions queue whose items can never resolve is one nobody reads.
  const { admin } = fakeAdmin([adm("a1")], () => ({
    data: { ok: true, already: true },
    error: null,
  }));
  return resumeRefundEffects(admin, { orderId: "ord", lineIds: ["L1"] }).then((r) => {
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.alreadyDone, 1);
      assert.equal(r.stillIncomplete, 0);
    }
  });
});

test("a retry that fails AGAIN is still reported incomplete", () => {
  // The failure must not decay into silence on the second attempt either.
  const { admin } = fakeAdmin([adm("a1"), adm("a2")], (id) =>
    id === "a1"
      ? { data: { ok: true }, error: null }
      : { data: null, error: { message: "57014 statement timeout" } },
  );
  return resumeRefundEffects(admin, { orderId: "ord", lineIds: ["L1"] }).then((r) => {
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.stamped, 1);
      assert.equal(r.stillIncomplete, 1, "one ticket still admits and a human must know");
    }
  });
});

test("a scanned ticket is skipped, never resumed", () => {
  const { admin, calls } = fakeAdmin([adm("a1", { admitted_count: 1 })], () => ({
    data: { ok: true },
    error: null,
  }));
  return resumeRefundEffects(admin, { orderId: "ord", lineIds: ["L1"] }).then((r) => {
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.skippedAdmitted, 1);
      assert.equal(r.stillIncomplete, 0, "a dispute is not an unresolved effect");
    }
    assert.deepEqual(calls, []);
  });
});

test("a void admission still resumes — cancellation voids before the money moves", () => {
  const { admin, calls } = fakeAdmin([adm("a1", { status: "void" })], () => ({
    data: { ok: true },
    error: null,
  }));
  return resumeRefundEffects(admin, { orderId: "ord", lineIds: ["L1"] }).then((r) => {
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.stamped, 1);
    assert.deepEqual(calls, ["a1"]);
  });
});

test("no lines is a refusal, not an empty success", () => {
  const { admin } = fakeAdmin([], () => ({ data: null, error: null }));
  return resumeRefundEffects(admin, { orderId: "ord", lineIds: [] }).then((r) => {
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "no_admissions");
  });
});
