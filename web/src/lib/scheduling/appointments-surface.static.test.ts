/**
 * appointments-surface.static.test.ts — the three facts about the Appointments
 * screens that only the call site can carry.
 *
 * WHY A SOURCE SCAN. These are `"use client"` modules; a plain node test cannot
 * import them, and the shell has no runtime harness. The alternative is no
 * check at all on the one thing that cannot be seen from the library side: a
 * stale-screen guard is only a guard if the CALLER passes what it was looking
 * at. `rescheduleBooking` accepts `expectedStartsAt` as optional and documents
 * that omitting it "keeps the old last-write-wins behaviour" — so a screen that
 * forgets it type-checks, renders, and silently overwrites somebody else's
 * move. Nothing else in the build can see that.
 *
 * Each assertion below is about BEHAVIOUR, not about wording: that the value
 * passed is the ROW's own window rather than a literal or a fresh read, that
 * the promote sends the row's own status, and that the proposals banner reaches
 * the shared accept action rather than writing hours itself.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PAGE_MODULES = join(
  WEB_ROOT,
  "src/components/admin/shell/internal/page-modules",
);
const read = (file: string) => readFileSync(join(PAGE_MODULES, file), "utf8");

/** Source with its prose removed, so a comment cannot satisfy a code check. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

test("the reschedule sends the window the operator was looking at", () => {
  const src = codeOnly(read("AppointmentsList.tsx"));
  assert.match(
    src,
    /expectedStartsAt:\s*row\.startsAt/,
    "the reschedule call does not pass the row's own start, so a stale screen overwrites silently",
  );
  assert.match(
    src,
    /expectedEndsAt:\s*row\.endsAt/,
    "the reschedule call does not pass the row's own end",
  );
});

test("the new start is read in the venue's zone, never the browser's", () => {
  // `new Date("2027-03-14T09:00")` reads a datetime-local value in the
  // BROWSER's zone. An operator in Madrid moving a Tulum booking would store a
  // time three hours from where anybody expects it, with nothing on screen to
  // show for it.
  const src = codeOnly(read("AppointmentsList.tsx"));
  assert.match(src, /parseLocalDateTime\(/, "the local value is not decomposed before conversion");
  assert.match(
    src,
    /zonedLocalToUtc\(\s*parsed\.ymd,\s*parsed\.minutesOfDay,\s*row\.timeZone/,
    "the typed wall clock is not resolved in the row's own timezone",
  );
  assert.ok(
    !/new Date\(\s*move[.?]/.test(src),
    "the datetime-local value is being handed straight to new Date()",
  );
});

test("the promote sends the status the row is showing", () => {
  const src = codeOnly(read("AppointmentsWaitlist.tsx"));
  assert.match(
    src,
    /expectedStatus:\s*status as/,
    "promote does not carry the row's own status, so a stale list can promote the wrong person",
  );
  assert.match(
    src,
    /entry\.status/,
    "the status handed to promote is not read off the entry being promoted",
  );
});

test("nothing on this surface decides 'today' in the browser", () => {
  // The buckets are stamped on the server and travel with the row. A client
  // that recomputed them would render one answer on the server and another on
  // hydration, and every server-side check would still pass.
  for (const file of ["AppointmentsList.tsx", "AppointmentsPage.tsx"]) {
    const src = codeOnly(read(file));
    assert.ok(
      !/new Date\(\)/.test(src),
      `${file} reads the clock; the bucket must arrive with the row`,
    );
    assert.ok(
      !/bucketForStart\(/.test(src),
      `${file} recomputes a bucket the server already decided`,
    );
  }
});

test("the proposals banner accepts through the shared action, not a second writer", () => {
  const src = codeOnly(read("BookingHoursProposalsBanner.tsx"));
  assert.match(
    src,
    /acceptBookingHoursProposal\(/,
    "the banner does not use the existing accept action",
  );
  // T1-07 left exactly two writers of talent_booking_hours: the hours editor
  // and the accept RPC. A third one here would restore the defect.
  assert.ok(
    !/talent_booking_hours/.test(src),
    "the banner is reaching for the hours table itself",
  );
});

test("the banner says the public page has no hours until this is accepted", () => {
  // The gap is the point. Softening this to "finish setting up" would hide the
  // one fact an operator is on this screen to learn.
  const messages = JSON.parse(
    readFileSync(join(WEB_ROOT, "messages", "en.json"), "utf8"),
  ) as Record<string, Record<string, Record<string, Record<string, string>>>>;
  const help = messages.dashboard!.adminAppointments!.proposals!.help!;
  assert.match(
    help,
    /public booking page/i,
    "the proposals help no longer names the public booking page",
  );
  assert.match(
    help,
    /no hours/i,
    "the proposals help no longer says the public page reports no hours",
  );
});

test("a full class with an empty queue is still a card, so somebody can be added", () => {
  // The screen's half of the dead journey. The control that adds the first
  // person lives on a session card; if the card body could only render a table
  // of existing entries, an empty queue had nowhere to put it.
  const src = codeOnly(read("AppointmentsWaitlist.tsx"));
  assert.match(
    src,
    /view\.entries\.length === 0/,
    "the card has no branch for a queue nobody is on yet",
  );
  assert.match(
    src,
    /data-testid="waitlist-join-open"/,
    "the card no longer offers a way to open the add-somebody form",
  );
  assert.match(
    src,
    /joinSessionWaitlist\(/,
    "nothing on this screen calls the action that puts somebody on a queue",
  );
});

test("the seats line tells three states apart, and never reads unknown as full", () => {
  // A nullable remaining used to be rendered `(seatsRemaining ?? 0) <= 0`,
  // which prints "Full" for a read that failed. A wrongly sold-out class loses
  // the sale silently and nobody reports it.
  const src = codeOnly(read("AppointmentsWaitlist.tsx"));
  for (const kind of ["uncounted", "unreadable"]) {
    assert.match(
      src,
      new RegExp(`seats\\.kind === "${kind}"`),
      `the seats line does not tell ${kind} apart from a counted zero`,
    );
  }
  assert.match(
    src,
    /seats\.remaining <= 0/,
    "the full sentence is not decided from a count the engine actually gave",
  );
  // Scoped to the seats line itself: `?? 0` is legitimate elsewhere on this
  // screen, where it fills the {left} hole of a refusal the server already
  // decided. Inside this function it would be the defect.
  const line = /function seatsLine\([\s\S]*?\n}/.exec(src)?.[0] ?? "";
  assert.ok(line.length > 0, "seatsLine is gone; the three states have nowhere to be told apart");
  assert.ok(
    !/\?\? 0/.test(line),
    "an unreadable seat count is being defaulted to zero and rendered as full",
  );
});

test("the Sessions view offers the door to the queue on a class that is full", () => {
  // Where an operator FINDS OUT a class is full is where the way onto its
  // waitlist belongs. Without it the waitlist was a tab you had to already
  // know about.
  const src = codeOnly(read("SessionsPage.tsx"));
  assert.match(src, /onOpenWaitlist\(o\.id\)/, "a full occurrence offers no way onto its queue");
  assert.match(
    src,
    /seatsRemaining !== null/,
    "the full check treats an unread seat count as full",
  );
});

test("the empty state does not promise a door that is somewhere else", () => {
  // The old copy told the operator this screen was where they put the next
  // person when a class filled up, while the screen it described could not do
  // that at all. It now describes what actually happens.
  const messages = JSON.parse(
    readFileSync(join(WEB_ROOT, "messages", "en.json"), "utf8"),
  ) as Record<string, Record<string, Record<string, Record<string, Record<string, string>>>>>;
  const body = messages.dashboard!.adminAppointments!.waitlist!.empty!.body!;
  assert.match(body, /sells out/i, "the empty state no longer says what brings a class here");
  assert.ok(
    !/put the next person on its list here/i.test(body),
    "the empty state still claims the list is started from this empty screen",
  );
});
