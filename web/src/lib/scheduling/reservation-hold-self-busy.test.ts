/**
 * TUL-433 — post-insert TOCTOU must ignore the hold just created, but still
 * release when a real booking landed in the gap.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { placeReservationHold } from "./reservation-hold";

const SLOT = {
  talentProfileId: "55555555-5555-4555-8555-555555555555",
  tenantId: "11111111-1111-4111-8111-111111111111",
  startsAt: "2026-10-01T14:00:00.000Z",
  endsAt: "2026-10-01T15:00:00.000Z",
  title: "QA paid test",
  expiresAt: null as null,
};

const HOLD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type BusyRow = {
  id?: string;
  starts_at: string;
  ends_at: string;
  expires_at?: string | null;
  status?: string | null;
  travel_before_min?: number | null;
  travel_after_min?: number | null;
};

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

function holdClient(opts: {
  /** When true, a colliding booking appears only after the hold insert. */
  bookingAfterInsert?: boolean;
}) {
  let inserted = false;
  const deletedIds: string[] = [];
  return {
    deletedIds: () => deletedIds,
    from: (table: string) => {
      if (table === "talent_availability_blocks") return selectRows([]);
      if (table === "talent_bookings") {
        return selectRows(
          inserted && opts.bookingAfterInsert
            ? [
                {
                  starts_at: SLOT.startsAt,
                  ends_at: SLOT.endsAt,
                  status: "confirmed",
                  travel_before_min: 0,
                  travel_after_min: 0,
                },
              ]
            : [],
        );
      }
      assert.equal(table, "talent_holds");
      return {
        select: () =>
          selectRows(
            inserted
              ? [
                  {
                    id: HOLD_ID,
                    starts_at: SLOT.startsAt,
                    ends_at: SLOT.endsAt,
                    expires_at: null,
                  },
                ]
              : [],
          ),
        insert: () => ({
          select: () => ({
            single: async () => {
              inserted = true;
              return { data: { id: HOLD_ID }, error: null };
            },
          }),
        }),
        delete: () => ({
          eq: async (_col: string, id: string) => {
            deletedIds.push(id);
            return { data: null, error: null };
          },
        }),
      };
    },
  };
}

test("TUL-433: own hold in post-insert busy read still succeeds", async () => {
  const admin = holdClient({});
  const res = await placeReservationHold(admin as never, SLOT);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.holdId, HOLD_ID);
  assert.deepEqual(admin.deletedIds(), []);
});

test("TUL-433: overlapping booking after insert releases hold as slot_taken", async () => {
  const admin = holdClient({ bookingAfterInsert: true });
  const res = await placeReservationHold(admin as never, SLOT);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "slot_taken");
  assert.deepEqual(admin.deletedIds(), [HOLD_ID]);
});
