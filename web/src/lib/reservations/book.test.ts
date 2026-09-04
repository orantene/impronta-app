import test from "node:test";
import assert from "node:assert/strict";
import { bookState, buildBook, summariseBook, type BookRow } from "./book";

const AT = new Date("2026-09-05T02:00:00Z"); // 20:00 Cancun
const min = (n: number) => new Date(AT.getTime() + n * 60_000);

const row = (over: Partial<BookRow> = {}): BookRow => ({
  admissionId: "a1",
  startsAt: AT,
  partySize: 4,
  admittedCount: 0,
  noShowAt: null,
  completedAt: null,
  status: "valid",
  holderName: "Ana R.",
  spaceCode: null,
  ...over,
});

test("the six states, in the order a host meets them", () => {
  const g = 30;
  assert.equal(bookState(row(), min(-60), g), "booked");
  assert.equal(bookState(row(), min(-10), g), "arriving");
  assert.equal(bookState(row(), min(45), g), "late");
  assert.equal(bookState(row({ admittedCount: 2 }), min(5), g), "part_seated");
  assert.equal(bookState(row({ admittedCount: 4 }), min(5), g), "seated");
  assert.equal(bookState(row({ noShowAt: min(31) }), min(45), g), "no_show");
  assert.equal(bookState(row({ completedAt: min(120) }), min(130), g), "completed");
});

test("a stamped no-show does NOT drift back into `late` as the clock moves", () => {
  // Terminal states are tested first for this reason. A no-show at 20:00
  // reading as "late by 180 minutes" at 23:00 is a row that looks live all
  // evening and gets chased by a host who has better things to do.
  assert.equal(bookState(row({ noShowAt: min(31) }), min(180), 30), "no_show");
});

test("`late` is NEVER `no_show`: this function does not imply a stamp exists", () => {
  // Past the grace period with nobody arrived is LATE. A no-show is something a
  // human or the grace job WROTE, and a derived view must never claim one was.
  const s = bookState(row(), min(400), 30);
  assert.equal(s, "late");
  assert.notEqual(s, "no_show");
});

test("a part-seated party stays part_seated however late the rest are", () => {
  assert.equal(bookState(row({ admittedCount: 2 }), min(300), 30), "part_seated");
});

test("seated wins over late, because they are sitting down", () => {
  assert.equal(bookState(row({ admittedCount: 4 }), min(300), 30), "seated");
});

test("nothing derives from `status`; a refunded booking still shows its real state", () => {
  // "Seated, then refunded" is a real sentence about one reservation, and
  // folding commercial state into the row state is what makes it unsayable.
  const e = buildBook([row({ admittedCount: 4, status: "refunded" })], min(5), 30)[0]!;
  assert.equal(e.state, "seated");
  assert.equal(e.isRefunded, true);
});

test("lateMinutes is 0 unless the row is actually late", () => {
  const late = buildBook([row()], min(75), 30)[0]!;
  assert.equal(late.state, "late");
  assert.equal(late.lateMinutes, 75);
  const seated = buildBook([row({ admittedCount: 4 })], min(75), 30)[0]!;
  assert.equal(seated.lateMinutes, 0);
});

test("the book is ordered by time, because that is how a host reads it", () => {
  const rows = [
    row({ admissionId: "late-one", startsAt: min(60) }),
    row({ admissionId: "early", startsAt: min(-60) }),
    row({ admissionId: "middle", startsAt: AT }),
  ];
  assert.deepEqual(
    buildBook(rows, AT, 30).map((e) => e.admissionId),
    ["early", "middle", "late-one"],
  );
});

// ─── the counters ────────────────────────────────────────────────────────────

test("covers and arrived are DIFFERENT numbers and both are reported", () => {
  // Summing party_size alone counts no-shows as diners; summing admitted_count
  // alone reports an empty room at 18:00. A restaurant wants the first before
  // service and the second after it.
  const entries = buildBook(
    [
      row({ admissionId: "1", partySize: 4, admittedCount: 4 }),
      row({ admissionId: "2", partySize: 2, admittedCount: 0 }),
      row({ admissionId: "3", partySize: 6, admittedCount: 2 }),
    ],
    min(5),
    30,
  );
  const s = summariseBook(entries);
  assert.equal(s.covers, 12, "everyone still expected");
  assert.equal(s.arrived, 6, "four seated plus two of the six-top");
});

test("a no-show stops counting as a cover, but a late party does not", () => {
  const entries = buildBook(
    [
      row({ admissionId: "ns", partySize: 4, noShowAt: min(31) }),
      row({ admissionId: "late", partySize: 2 }),
    ],
    min(45),
    30,
  );
  const s = summariseBook(entries);
  assert.equal(s.covers, 2, "the no-show is gone, the late party is still coming");
  assert.equal(s.runningLate, 1);
});

test("a cancelled booking is not a cover at all", () => {
  const s = summariseBook(buildBook([row({ status: "void", partySize: 8 })], min(5), 30));
  assert.equal(s.covers, 0);
});

test("unassigned counts parties with no table, and only ones still coming", () => {
  const entries = buildBook(
    [
      row({ admissionId: "1", spaceCode: null }),
      row({ admissionId: "2", spaceCode: "T7" }),
      row({ admissionId: "3", spaceCode: null, noShowAt: min(31) }),
      row({ admissionId: "4", spaceCode: null, completedAt: min(120) }),
    ],
    min(45),
    30,
  );
  // Unassigned is a valid state, not an error — it is the host stand's whole
  // job. But a party that never came does not need a table.
  assert.equal(summariseBook(entries).unassigned, 1);
});

test("ARRIVAL beats a no-show stamp, and the stamp is not cleared", () => {
  // A party marked no-show can walk in: the host was early, or the grace job
  // fired while they were parking. The obvious repair is to null no_show_at on
  // arrival, and it is wrong — a no-show FEE may already have been charged off
  // that stamp, and clearing it leaves money that moved with nothing on the row
  // explaining why. The guest disputes it and the record cannot answer.
  const marked = row({ noShowAt: min(31), admittedCount: 4 });
  assert.equal(bookState(marked, min(50), 30), "seated");

  const partly = row({ noShowAt: min(31), admittedCount: 2 });
  assert.equal(bookState(partly, min(50), 30), "part_seated");

  // And with nobody arrived it still reads as the no-show it was marked.
  assert.equal(bookState(row({ noShowAt: min(31) }), min(50), 30), "no_show");
});

test("a no-show who arrived still counts as covers and as arrived", () => {
  const s = summariseBook(
    buildBook([row({ noShowAt: min(31), admittedCount: 4, partySize: 4 })], min(50), 30),
  );
  assert.equal(s.covers, 4, "they are eating; they are covers");
  assert.equal(s.arrived, 4);
});

test("a no-show who arrived is FLAGGED, because a fee may already be on their bill", () => {
  // Making arrival win the state is right — they are sitting down. But the
  // stamp must survive the state it lost to: the host stand is the one place a
  // human can explain that charge to the person in front of them.
  const arrived = buildBook([row({ noShowAt: min(31), admittedCount: 4 })], min(50), 30)[0]!;
  assert.equal(arrived.state, "seated");
  assert.equal(arrived.wasMarkedNoShow, true, "the fee is invisible without this");

  const partly = buildBook([row({ noShowAt: min(31), admittedCount: 2 })], min(50), 30)[0]!;
  assert.equal(partly.state, "part_seated");
  assert.equal(partly.wasMarkedNoShow, true);
});

test("a row still reading no_show is not ALSO badged as one", () => {
  // The badge means "the stamp lost to an arrival", not "there is a stamp".
  const stillGone = buildBook([row({ noShowAt: min(31) })], min(50), 30)[0]!;
  assert.equal(stillGone.state, "no_show");
  assert.equal(stillGone.wasMarkedNoShow, false);
});

test("an ordinary seated party carries no no-show badge", () => {
  const clean = buildBook([row({ admittedCount: 4 })], min(50), 30)[0]!;
  assert.equal(clean.wasMarkedNoShow, false);
});
