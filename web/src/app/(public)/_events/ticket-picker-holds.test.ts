import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("public ticket hold calls admissionHoldSeats, not a second writer", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/_events/ticket-picker-actions.ts"), "utf8");
  assert.match(src, /admissionHoldSeats/);
  assert.match(src, /export async function holdTicketSeats/);
  assert.match(src, /from\("event_seat_maps"\)/);
});

test("pos_reserve_collection follow-up accepts method link after 20261231233000", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231235000_pos_reserve_collection_accepts_link.sql"),
    "utf8",
  );
  assert.match(sql, /p_method NOT IN \('cash', 'online_card', 'terminal', 'link'\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.pos_reserve_collection/);
});
