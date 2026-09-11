import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expectedCashFromRows, recordShiftMovement } from "./shift-movements";

test("expected cash is float plus cash sales plus paid-in minus paid-out minus drops", () => {
  assert.equal(
    expectedCashFromRows({
      openingCashCents: 5000,
      cashSalesCents: 3000,
      movements: [
        { kind: "paid_in", amountCents: 200 },
        { kind: "float_add", amountCents: 100 },
        { kind: "paid_out", amountCents: 50 },
        { kind: "drop", amountCents: 1000 },
      ],
    }),
    7250,
  );
});

test("a refused movement writes nothing", async () => {
  const result = await recordShiftMovement(
    {
      from: () => {
        throw new Error("no table");
      },
      rpc: async () => ({ data: { ok: false, reason: "already_closed" }, error: null }),
    },
    {
      tenantId: "t1",
      actorUserId: "u1",
      kind: "drop",
      amountCents: 100,
      reason: "safe",
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "already_closed");
});

test("shift movements SQL refuses a write on a missing shift", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231208000_pos_shift_movements.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.pos_shift_movements/);
  assert.match(sql, /a refused movement wrote a row/);
});
