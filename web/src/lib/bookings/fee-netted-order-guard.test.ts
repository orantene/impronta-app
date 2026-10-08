import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  guardFeeNettedOrderId,
  isFeeNettedOrderIdViolation,
} from "./fee-netted-order-guard";

describe("TUL-154 fee-netted order_id guard", () => {
  it("allows fee-netted rows with no order_id (transactions.create shape)", () => {
    assert.equal(
      isFeeNettedOrderIdViolation({
        orderId: null,
        platformFeeBasisPoints: 600,
      }),
      false,
    );
    assert.equal(
      guardFeeNettedOrderId({ orderId: undefined, platformFeeBasisPoints: 1500 }),
      null,
    );
  });

  it("allows pass-through and net=gross order-linked rows (bps = 0)", () => {
    assert.equal(
      isFeeNettedOrderIdViolation({
        orderId: "11111111-1111-4111-8111-111111111111",
        platformFeeBasisPoints: 0,
      }),
      false,
    );
    assert.equal(
      guardFeeNettedOrderId({
        orderId: "11111111-1111-4111-8111-111111111111",
        platformFeeBasisPoints: 0,
      }),
      null,
    );
  });

  it("blocks fee-netted + order_id (would under-count order collection)", () => {
    assert.equal(
      isFeeNettedOrderIdViolation({
        orderId: "11111111-1111-4111-8111-111111111111",
        platformFeeBasisPoints: 600,
      }),
      true,
    );
    const msg = guardFeeNettedOrderId({
      orderId: "11111111-1111-4111-8111-111111111111",
      platformFeeBasisPoints: 600,
    });
    assert.match(String(msg), /under-count order collection/);
  });

  it("treats blank order_id as absent", () => {
    assert.equal(
      isFeeNettedOrderIdViolation({
        orderId: "   ",
        platformFeeBasisPoints: 600,
      }),
      false,
    );
  });
});

describe("TUL-154 migration + fee-netted writer", () => {
  const migrationsDir = join(process.cwd(), "..", "supabase", "migrations");
  const migrationName = readdirSync(migrationsDir).find((f) =>
    f.endsWith("_booking_transactions_fee_netted_no_order.sql"),
  );

  it("ships a CHECK that fee-netted rows cannot carry order_id", () => {
    assert.ok(migrationName, "migration file missing");
    const sql = readFileSync(join(migrationsDir, migrationName!), "utf8");
    assert.match(sql, /booking_transactions_fee_netted_no_order/);
    assert.match(
      sql,
      /CHECK\s*\(\s*order_id\s+IS\s+NULL\s+OR\s+platform_fee_basis_points\s*=\s*0\s*\)/i,
    );
  });

  it("createBookingTransaction insert never sets order_id (fee-netted path)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/bookings/transactions.ts"),
      "utf8",
    );
    const createFn = src.match(
      /export async function createBookingTransaction[\s\S]*?^export async function /m,
    );
    assert.ok(createFn, "createBookingTransaction not found");
    const body = createFn[0];
    assert.match(body, /guardFeeNettedOrderId/);
    const insertRow = body.match(/const insertRow\s*=\s*\{([\s\S]*?)\};/);
    assert.ok(insertRow, "fee-netted insertRow object not found");
    assert.equal(
      /\border_id\b/.test(insertRow[1]),
      false,
      "fee-netted create must omit order_id",
    );
    assert.match(insertRow[1], /platform_fee_basis_points/);
    assert.match(insertRow[1], /net_amount_cents/);
    assert.match(body, /\.from\("booking_transactions"\)\s*\.insert\(insertRow\)/);
  });
});
