import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { retrieveHelpEntries } from "./help-corpus";

// The assistant denied a feature that exists.
//
// A workspace owner asked "how i create an event" and was told "In Tulala there
// isn't a feature called 'event' exactly", then given New Inquiry and New
// Booking — the talent-agency shoot workflow, to a business that runs no shoots.
//
// EventsPage is 680 lines with a list and seven per-event tabs. Sessions and
// Reservations are live too. The assistant grounds on DRAWER_HELP, which is
// keyed by DRAWER ids, and these are PAGES, so nothing described them and the
// model answered from the agency-era entries that were there.

const ROOT = process.cwd();

/** Surfaces a workspace can actually open today, with the file that proves it. */
const LIVE_SURFACES: Array<{ key: string; ask: string; page: string }> = [
  {
    key: "events",
    ask: "how do i create an event",
    page: join("src", "components", "admin", "shell", "internal", "page-modules", "EventsPage.tsx"),
  },
  {
    key: "sessions",
    ask: "how do i set up a weekly class",
    page: join("src", "components", "admin", "shell", "internal", "page-modules", "SessionsPage.tsx"),
  },
  {
    key: "reservations",
    ask: "how do i take a table booking",
    page: join("src", "app", "(workspace)", "[tenantSlug]", "admin", "reservations", "page.tsx"),
  },
];

test("a question about a live surface retrieves that surface", () => {
  for (const { key, ask, page } of LIVE_SURFACES) {
    assert.ok(existsSync(join(ROOT, page)), `${key}: the page it claims does not exist (${page})`);
    const slugs = retrieveHelpEntries(ask, { limit: 6 }).map((e) => e.slug);
    assert.ok(
      slugs.includes(key),
      `asking "${ask}" retrieved ${slugs.join(", ") || "nothing"} — not ${key}, so the assistant answers from whatever else is nearest`,
    );
  }
});

test("the events entry does not promise ticketing", () => {
  // Ticketing waits on an `admissions` table that is not in production. The
  // last time this corpus oversold an unshipped feature it cost a real customer
  // a real answer, so the entry must say plainly that tickets are not sellable.
  const entry = retrieveHelpEntries("can i sell tickets to my event", { limit: 6 }).find(
    (e) => e.slug === "events",
  );
  assert.ok(entry, "events is not retrievable for a ticketing question");
  const text = JSON.stringify(entry).toLowerCase();
  assert.match(text, /not yet|still being built/, "no honest statement that ticketing is unshipped");
});

test("the events entry tells people where the door is", () => {
  // The page has no rail entry, so somebody who cannot find it in the sidebar
  // is not going to find it at all unless the answer names the URL.
  const entry = retrieveHelpEntries("where is events in the sidebar", { limit: 6 }).find(
    (e) => e.slug === "events",
  );
  assert.ok(entry, "events is not retrievable when asked where it is");
  assert.match(JSON.stringify(entry), /\/admin\/events/, "the entry never names the URL");
});
