/**
 * BUF-4 / PATHA-6 — two customers, one exclusive slot.
 *
 * Simulates concurrent hold inserts: exactly one win; the loser maps to
 * customer-facing `slot_taken`. Does not claim LIVE race PASS (needs isolated
 * DB prove with real gist exclusion under load).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { mapHoldInsertError, placeReservationHold } from "./reservation-hold";
import { mapEngineFail } from "./instant-book-run";

const SLOT = {
  talentProfileId: "55555555-5555-4555-8555-555555555555",
  tenantId: "11111111-1111-4111-8111-111111111111",
  startsAt: "2026-10-01T14:00:00.000Z",
  endsAt: "2026-10-01T15:00:00.000Z",
  title: "Soft Gel",
  expiresAt: null as null,
};

type InsertResult = {
  data: { id: string } | null;
  error: { code: string; message: string } | null;
};

type BusyRow = {
  id?: string;
  starts_at: string;
  ends_at: string;
  expires_at?: string | null;
  status?: string | null;
  travel_before_min?: number | null;
  travel_after_min?: number | null;
};

/** Chainable select builder that resolves to the given rows. */
function selectRows(rows: BusyRow[]) {
  const terminal: {
    select: () => typeof terminal;
    eq: () => typeof terminal;
    lt: () => typeof terminal;
    gt: () => typeof terminal;
    or: () => typeof terminal;
    then: Promise<{ data: BusyRow[]; error: null }>["then"];
  } = {
    select: () => terminal,
    eq: () => terminal,
    lt: () => terminal,
    gt: () => terminal,
    or: () => terminal,
    then: (resolve, reject) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return terminal;
}

const WINNER_HOLD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Mock admin: first insert wins; every later insert hits firm-hold exclusion.
 * After the winner inserts, hold selects return that row so a naive post-insert
 * busy re-check would self-collide without excludeHoldIds (TUL-433). */
function racingHoldClient() {
  let inserts = 0;
  let liveHold: BusyRow | null = null;
  return {
    from: (table: string) => {
      if (table === "talent_bookings" || table === "talent_availability_blocks") {
        return selectRows([]);
      }
      assert.equal(table, "talent_holds");
      return {
        select: () => selectRows(liveHold ? [liveHold] : []),
        insert: () => ({
          select: () => ({
            single: async (): Promise<InsertResult> => {
              inserts += 1;
              if (inserts === 1) {
                liveHold = {
                  id: WINNER_HOLD_ID,
                  starts_at: SLOT.startsAt,
                  ends_at: SLOT.endsAt,
                  expires_at: null,
                };
                return {
                  data: { id: WINNER_HOLD_ID },
                  error: null,
                };
              }
              return {
                data: null,
                error: {
                  code: "23P01",
                  message:
                    'conflicting key value violates exclusion constraint "talent_holds_firm_no_overlap"',
                },
              };
            },
          }),
        }),
        delete: () => ({
          eq: async () => {
            liveHold = null;
            return { data: null, error: null };
          },
        }),
      };
    },
  };
}

test("BUF-4: two parallel hold attempts → exactly one win, loser is slot_taken", async () => {
  const admin = racingHoldClient() as never;
  const [a, b] = await Promise.all([
    placeReservationHold(admin, { ...SLOT, title: "Customer A" }),
    placeReservationHold(admin, { ...SLOT, title: "Customer B" }),
  ]);

  const wins = [a, b].filter((r) => r.ok === true);
  const losses = [a, b].filter((r) => r.ok === false);

  assert.equal(wins.length, 1, "exactly one customer keeps the slot");
  assert.equal(losses.length, 1, "exactly one customer is refused");
  if (!losses[0]!.ok) {
    assert.equal(losses[0].code, "slot_taken");
    assert.match(losses[0].error, /just taken/i);
  }
});

test("BUF-4: exclusion maps to instant-book customer copy (not engine dump)", () => {
  const mapped = mapHoldInsertError({
    code: "23P01",
    message: 'exclusion constraint "talent_bookings_no_overlap"',
  });
  assert.equal(mapped.ok, false);
  if (!mapped.ok) {
    assert.equal(mapped.code, "slot_taken");
    const ui = mapEngineFail({
      ok: false,
      reason: "slot_taken",
      error: mapped.error,
    });
    assert.equal(ui.ok, false);
    if (!ui.ok) {
      assert.equal(ui.slotTaken, true);
      assert.match(ui.error, /just taken/i);
    }
  }
});

test("BUF-4: booking overlap exclusion name alone is enough without SQLSTATE", () => {
  const mapped = mapHoldInsertError({
    code: null,
    message: 'conflicting key value violates exclusion constraint "talent_bookings_no_overlap"',
  });
  assert.equal(mapped.ok, false);
  if (!mapped.ok) assert.equal(mapped.code, "slot_taken");
});
