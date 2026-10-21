import assert from "node:assert/strict";
import test from "node:test";

import { buildEventBoard, roleMessage, type BoardRole } from "./event-board";

const roles: BoardRole[] = [
  {
    id: "r1",
    role: "Photographer",
    needed: 2,
    callTime: "2026-11-10T14:00:00Z",
    people: [
      { talentProfileId: "t1", name: "Ana", status: "confirmed", locale: "es" },
      { talentProfileId: "t2", name: "Beto", status: "invited", locale: "en" },
    ],
  },
  { id: "r2", role: "Assistant", needed: 1, callTime: "2026-11-10T13:00:00Z", people: [{ talentProfileId: "t3", name: "Cris", status: "confirmed", locale: "en" }] },
  { id: "r3", role: "Driver", needed: 1, callTime: null, people: [{ talentProfileId: "t4", name: "Dana", status: "declined", locale: "en" }] },
];

test("each role: confirmed, invited, still open; a decline does not fill a seat", () => {
  const b = buildEventBoard(roles);
  const by = Object.fromEntries(b.roles.map((r) => [r.id, r]));
  assert.deepEqual([by.r1.confirmed, by.r1.invited, by.r1.open, by.r1.state], [1, 1, 1, "partial"]);
  assert.deepEqual([by.r2.confirmed, by.r2.open, by.r2.state], [1, 0, "filled"]);
  assert.deepEqual([by.r3.confirmed, by.r3.open, by.r3.state], [0, 1, "open"]);
  assert.deepEqual(b.totals, { needed: 4, confirmed: 2, invited: 1, open: 2 });
  assert.equal(b.complete, false);
});

test("invited people do not count as confirmed; only confirmed seats close a role", () => {
  const b = buildEventBoard([{ id: "r", role: "X", needed: 1, callTime: null, people: [{ talentProfileId: "t", name: "T", status: "invited", locale: "en" }] }]);
  assert.equal(b.roles[0].open, 1);
  assert.equal(b.roles[0].state, "open");
});

test("a board is complete only when every role is filled; extra confirmed people never go negative", () => {
  const full = buildEventBoard([{ id: "r", role: "X", needed: 1, callTime: null, people: [{ talentProfileId: "a", name: "A", status: "confirmed", locale: "en" }, { talentProfileId: "b", name: "B", status: "confirmed", locale: "en" }] }]);
  assert.equal(full.roles[0].open, 0);
  assert.equal(full.complete, true);
  assert.equal(buildEventBoard([]).complete, false);
});

test("call sheet: confirmed people only, by call time then role, unscheduled last", () => {
  const b = buildEventBoard(roles);
  assert.deepEqual(b.callSheet.map((c) => [c.name, c.role]), [["Cris", "Assistant"], ["Ana", "Photographer"]]);
});

test("each role gets only its part, in its language", () => {
  const es = roleMessage({ role: roles[0], person: roles[0].people[0], eventTitle: "Boda Lumina", startsAt: "2026-11-10T14:00:00Z", timeZone: "America/Cancun" });
  assert.match(es, /Boda Lumina/);
  assert.match(es, /Fotógrafo|Photographer/);
  assert.match(es, /Tu llamado|Llamado/);
  const en = roleMessage({ role: roles[1], person: roles[1].people[0], eventTitle: "Lumina wedding", startsAt: "2026-11-10T13:00:00Z", timeZone: "America/Cancun" });
  assert.match(en, /Your call/);
  assert.match(en, /Assistant/);
  // nothing about anyone else or any money
  for (const text of [es, en]) for (const leak of ["Beto", "Cris", "Ana", "Dana", "$", "margin", "cost"]) {
    if (leak === "Ana" && text === es) continue; // her own name may appear in her own message
    if (leak === "Cris" && text === en) continue;
    assert.ok(!text.includes(leak), `${leak} in ${text}`);
  }
});

test("a person without a language gets English", () => {
  const msg = roleMessage({ role: roles[2], person: { ...roles[2].people[0], locale: "" }, eventTitle: "E", startsAt: null, timeZone: "UTC" });
  assert.match(msg, /Your call|Your role/);
});
