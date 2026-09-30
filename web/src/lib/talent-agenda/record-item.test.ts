import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { agendaItemFromSnapshot, agendaWindowAround } from "./record-item";
import type { TalentAgendaItem } from "./types";

// Row shape of d57ef2e2: a manual booking (no inquiry) saved from New booking.
const ID = "d57ef2e2-56ce-4860-aa6b-f1cd2a0eeca2";
const manual = { id: ID, title: "Gel semipermanente en manos", startsAt: "2026-10-02T17:00:00+00:00" } as unknown as TalentAgendaItem;

test("F60: a booking missing from the layout snapshot is read, not stubbed", () => {
  assert.equal(agendaItemFromSnapshot([], ID), null);
  assert.equal(agendaItemFromSnapshot(null, ID), null);
  assert.equal(agendaItemFromSnapshot([manual], ID), manual);
  assert.equal(agendaItemFromSnapshot([manual], ""), null);
});

test("F60: the single-item read spans a day either side of the booking start", () => {
  const w = agendaWindowAround("2026-10-02T17:00:00+00:00");
  assert.ok(w);
  assert.equal(w.from.toISOString(), "2026-10-01T17:00:00.000Z");
  assert.equal(w.to.toISOString(), "2026-10-03T17:00:00.000Z");
  assert.equal(agendaWindowAround(""), null);
});

const dir = dirname(fileURLToPath(import.meta.url));

test("F60: the record route falls back to the reader, scoped to her own profile", () => {
  const route = readFileSync(join(dir, "../../components/admin/shell/internal/talent/agenda/BookingRecordRoute.tsx"), "utf8");
  assert.match(route, /loadTalentAgendaRecordItem\(bookingId\)/);
  const loader = readFileSync(join(dir, "load-record-item.ts"), "utf8");
  assert.match(loader, /\.eq\("talent_profile_id", actor\.talentProfileId\)/);
  assert.match(loader, /loadTalentAgenda\(actor\.talentProfileId, window\)/);
});
