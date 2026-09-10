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
