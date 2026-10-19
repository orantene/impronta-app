/**
 * G2 (TUL-1272 #11): reviews tied to the service, one automatic review request
 * after a completed booking, and the review page in Spanish.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AUTO_REVIEW_MAX_DAYS_AFTER_END,
  bookingEndedAt,
  decideAutoReviewRequests,
  type AutoReviewBooking,
} from "./auto-review-request-plan";
import {
  REVIEW_PAGE_EN,
  REVIEW_PAGE_ES,
  REVIEW_TRAITS,
  fillCopy,
  formatReviewDate,
  getReviewPageCopy,
  localizeReviewError,
  resolveReviewLocale,
} from "./review-page-copy";
import { resolveRequestOfferingId, stampReviewOffering } from "./review-offering";
import { ReviewTokenForm } from "../../app/review/[token]/ReviewTokenForm";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ─── Spanish review page ──────────────────────────────────────────────────────

test("review page copy: EN and ES carry the same keys and the same placeholders", () => {
  const en = Object.keys(REVIEW_PAGE_EN).sort();
  const es = Object.keys(REVIEW_PAGE_ES).sort();
  assert.deepEqual(es, en);
  const holders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const k of en as Array<keyof typeof REVIEW_PAGE_EN>) {
    assert.equal(holders(REVIEW_PAGE_ES[k]), holders(REVIEW_PAGE_EN[k]), `placeholders differ for ${k}`);
    assert.ok(REVIEW_PAGE_ES[k].trim().length > 0, `empty ES for ${k}`);
  }
});

test("review page copy: Spanish is Spanish (no English leftovers, no em dashes)", () => {
  for (const [k, v] of Object.entries(REVIEW_PAGE_ES)) {
    assert.doesNotMatch(v, /—/, `em dash in ${k}`);
    assert.doesNotMatch(v, /\b(review|booking|sign in|publish|rate)\b/i, `English word in ES ${k}: ${v}`);
  }
  assert.equal(REVIEW_PAGE_ES.publish, "Publicar reseña");
});

test("language: the booking's language wins, then the browser's, then English", () => {
  assert.equal(resolveReviewLocale({ bookingLocale: "es-MX", acceptLanguage: "en-US,en;q=0.9" }), "es");
  assert.equal(resolveReviewLocale({ bookingLocale: "en", acceptLanguage: "es-MX" }), "en");
  assert.equal(resolveReviewLocale({ bookingLocale: null, acceptLanguage: "es-MX,es;q=0.9,en;q=0.5" }), "es");
  assert.equal(resolveReviewLocale({ bookingLocale: null, acceptLanguage: "fr-FR" }), "en");
  assert.equal(resolveReviewLocale({}), "en");
});

test("fillCopy never prints undefined; dates read in the page language", () => {
  assert.equal(fillCopy("Hola {name}", { name: "Ana" }), "Hola Ana");
  assert.equal(fillCopy("Hola {name}", {}), "Hola ");
  assert.match(formatReviewDate("2026-10-14", "es") ?? "", /octubre/);
  assert.match(formatReviewDate("2026-10-14", "en") ?? "", /October/);
  assert.equal(formatReviewDate("nope", "es"), null);
});

test("server errors that arrive in English are shown in the page language", () => {
  const es = getReviewPageCopy("es");
  assert.equal(localizeReviewError("This review link is not valid.", es), es.errInvalid);
  assert.equal(localizeReviewError("This review link has expired or was already used.", es), es.errSpent);
  assert.equal(localizeReviewError("something unexpected from the server", es), es.saveFailed);
  assert.equal(localizeReviewError(null, es), es.saveFailed);
});

const formProps = {
  token: "abc",
  talentName: "Luna",
  talentProfileCode: "TAL-1",
  verifiable: true,
  bookingId: "b1",
  talentProfileId: "tp1",
};

test("the form renders in Spanish with the service, and traits keep their stored values", () => {
  const html = renderToStaticMarkup(
    React.createElement(ReviewTokenForm, { ...formProps, t: getReviewPageCopy("es"), serviceName: "Corte de cabello" }),
  );
  assert.match(html, /Califica Corte de cabello/);
  assert.match(html, /Publicar reseña/);
  assert.match(html, /Puntual/);
  assert.match(html, /Profesionalismo/);
  assert.match(html, /Toca para calificar/);
  assert.match(html, /Cliente verificado/);
  assert.doesNotMatch(html, /Publish review|Tap to rate|Rate specific/);
  // Stored values stay canonical English, so counts and filters do not split by language.
  assert.deepEqual(
    REVIEW_TRAITS.map((x) => x.value),
    ["On time", "Great communication", "Well prepared", "Delivered the brief", "Easy to work with"],
  );
});

test("the form renders in English when the page is English", () => {
  const html = renderToStaticMarkup(
    React.createElement(ReviewTokenForm, { ...formProps, t: getReviewPageCopy("en"), serviceName: null }),
  );
  assert.match(html, /Rate Luna/);
  assert.match(html, /Publish review/);
  assert.match(html, /On time/);
});

test("the page reads its words from the copy, not from English literals", () => {
  const page = read("src/app/review/[token]/page.tsx");
  assert.match(page, /getReviewPageCopy/);
  assert.match(page, /accept-language/i);
  for (const lit of ["Sign in and continue", "You worked with", "This review link has expired", "asked you for a review"]) {
    assert.ok(!page.includes(lit), `English literal left in page: ${lit}`);
  }
  const form = read("src/app/review/[token]/ReviewTokenForm.tsx");
  for (const lit of ["Publish review", "Tap to rate", "Rate specific qualities", "Would you book them again?"]) {
    assert.ok(!form.includes(lit), `English literal left in form: ${lit}`);
  }
});

// ─── Automatic request, once ──────────────────────────────────────────────────

const NOW = new Date("2026-10-20T08:00:00Z");

function booking(over: Partial<AutoReviewBooking> = {}): AutoReviewBooking {
  return {
    id: "bk1",
    tenant_id: "t1",
    status: "completed",
    ends_at: "2026-10-19T15:00:00Z",
    starts_at: "2026-10-19T14:00:00Z",
    event_date: null,
    client_user_id: null,
    contact_email: "Ana@Example.test",
    order_id: "o1",
    title: "Corte",
    ...over,
  };
}

function decide(b: AutoReviewBooking, talents: string[] = ["tp1"], requested: string[] = []) {
  return decideAutoReviewRequests({
    now: NOW,
    bookings: [b],
    talentsByBooking: new Map([[b.id, talents]]),
    requestedBookingIds: new Set(requested),
  });
}

test("a completed booking with one talent and a client email is due once, to its own client only", () => {
  const d = decide(booking());
  assert.equal(d.due.length, 1);
  assert.equal(d.due[0].invitedEmail, "ana@example.test");
  assert.equal(d.due[0].talentProfileId, "tp1");
});

test("once: a booking that already has a request of any kind is not asked again", () => {
  const d = decide(booking(), ["tp1"], ["bk1"]);
  assert.equal(d.due.length, 0);
  assert.equal(d.skipped.already_requested, 1);
});

test("timing: too soon after the end waits, very old is left alone", () => {
  assert.equal(decide(booking({ ends_at: "2026-10-20T06:30:00Z" })).skipped.too_soon, 1);
  const old = new Date(NOW.getTime() - (AUTO_REVIEW_MAX_DAYS_AFTER_END + 2) * 86_400_000).toISOString();
  assert.equal(decide(booking({ ends_at: old })).skipped.too_old, 1);
});

test("who is asked: not completed, no recipient, a malformed address and a roster are skipped", () => {
  assert.equal(decide(booking({ status: "confirmed" })).skipped.not_completed, 1);
  assert.equal(decide(booking({ contact_email: null })).skipped.no_recipient, 1);
  assert.equal(decide(booking({ contact_email: "not-an-email" })).skipped.no_recipient, 1);
  assert.equal(decide(booking(), ["tp1", "tp2"]).skipped.talent_count, 1);
  assert.equal(decide(booking(), []).skipped.talent_count, 1);
  // A client account alone is enough to ask.
  assert.equal(decide(booking({ contact_email: null, client_user_id: "u1" })).due.length, 1);
});

test("a booking with only a date ends at the end of that day (UTC)", () => {
  const d = bookingEndedAt({ ends_at: null, starts_at: null, event_date: "2026-10-10" });
  assert.equal(d?.toISOString(), "2026-10-10T23:59:59.000Z");
  assert.equal(bookingEndedAt({ ends_at: null, starts_at: null, event_date: null }), null);
});

// ─── Review -> offering ───────────────────────────────────────────────────────

type Result = { data: unknown; error?: { code?: string; message?: string } | null };
function fakeDb(tables: Record<string, Result>) {
  const calls: Array<{ table: string; ops: unknown[][] }> = [];
  return {
    calls,
    from(table: string) {
      const rec = { table, ops: [] as unknown[][] };
      calls.push(rec);
      const chain: unknown = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (resolve: (v: Result) => void) => resolve(tables[table] ?? { data: null, error: null });
            }
            return (...args: unknown[]) => {
              rec.ops.push([String(prop), ...args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
}

test("the request's own service wins over the booking's order line", async () => {
  const db = fakeDb({ review_requests: { data: { offering_id: "off-request" } } });
  const id = await resolveRequestOfferingId(db as never, { requestId: "r1", bookingId: "bk1" });
  assert.equal(id, "off-request");
  assert.equal(db.calls.filter((c) => c.table === "agency_bookings").length, 0);
});

test("without a service link on the request, the booking's sold offering is used", async () => {
  const db = fakeDb({
    review_requests: { data: { offering_id: null } },
    agency_bookings: { data: { order_id: "o1" } },
    order_lines: { data: [{ offering_id: "off-order" }] },
  });
  const id = await resolveRequestOfferingId(db as never, { requestId: "r1", bookingId: "bk1" });
  assert.equal(id, "off-order");
});

test("a missing column (migration not applied) degrades to the booking's service, never throws", async () => {
  const db = fakeDb({
    review_requests: { data: null, error: { code: "42703", message: "column offering_id does not exist" } },
    agency_bookings: { data: { order_id: "o1" } },
    order_lines: { data: [{ offering_id: "off-order" }] },
  });
  assert.equal(await resolveRequestOfferingId(db as never, { requestId: "r1", bookingId: "bk1" }), "off-order");
});

test("stamping fills an empty link only, keyed on the review's own natural key", async () => {
  const db = fakeDb({ talent_reviews: { data: null, error: null } });
  await stampReviewOffering(db as never, {
    bookingId: "bk1",
    talentProfileId: "tp1",
    clientUserId: "u1",
    offeringId: "off1",
  });
  const call = db.calls.find((c) => c.table === "talent_reviews");
  assert.ok(call);
  const ops = call.ops.map((o) => o.join(":"));
  assert.ok(ops.includes('update:[object Object]'));
  assert.ok(ops.includes("eq:booking_id:bk1"));
  assert.ok(ops.includes("eq:talent_profile_id:tp1"));
  assert.ok(ops.includes("eq:client_user_id:u1"));
  assert.ok(ops.includes("is:offering_id:"));
  // No service, nothing to write.
  const none = fakeDb({});
  await stampReviewOffering(none as never, { bookingId: "bk1", talentProfileId: "tp1", clientUserId: "u1", offeringId: null });
  assert.equal(none.calls.length, 0);
});

// ─── Wiring ───────────────────────────────────────────────────────────────────

test("wiring: both submit paths stamp the service; the cron runs the sweep once a day", () => {
  const token = read("src/lib/reviews/review-token-actions.ts");
  assert.equal((token.match(/stampReviewOffering\(/g) ?? []).length, 2);
  const actions = read("src/lib/reviews/review-actions.ts");
  assert.match(actions, /stampReviewOffering\(/);
  const route = read("src/app/api/cron/booking-reminders/route.ts");
  assert.match(route, /if \(reviewSweepDue\) \{[\s\S]*runAutoReviewRequests\(now\)/);
  const producer = read("src/lib/reviews/auto-review-request.ts");
  assert.match(producer, /source: "auto"/);
  assert.match(producer, /offering_id: offeringId/);
  assert.match(producer, /review-invite:\$\{created\.id\}/);
  assert.match(producer, /PG_UNIQUE_VIOLATION/);
});

test("migration: additive, held, one automatic request per booking enforced by the database", () => {
  const sqlPath = path.join(ROOT, "..", "supabase/migrations/_pending_pm/20261231417300_reviews_offering_link_auto_request.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS offering_id uuid/g);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS review_requests_auto_once_idx[\s\S]*WHERE source = 'auto'/);
  assert.match(sql, /GRANT SELECT \(offering_id\) ON public\.talent_reviews TO anon, authenticated/);
  assert.doesNotMatch(sql, /^\s*DROP\s+(TABLE|COLUMN)/im);
});
