/**
 * TUL-1463: "Leave a review" on a visit in the client account.
 *  - only a completed visit can be reviewed;
 *  - at most one review per visit (no duplicate, a moderated one is never replaced);
 *  - an open review request is reused, not doubled;
 *  - owner and tenant scoped: another client's or another tenant's visit is refused;
 *  - the write is the existing review path (moderation included), not a new insert.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { ClientAccountArea } from "@/components/client-account/ClientAccountArea";

import { decideVisitReview, pickReviewTalent, type VisitReviewFacts, type VisitReviewState } from "./visit-review";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const ME = "client-1";
const SITE = "tenant-a";

const facts = (over: Partial<VisitReviewFacts> = {}): VisitReviewFacts => ({
  bookingId: "b1", bookingTenantId: SITE, bookingClientUserId: ME, inquiryClientUserId: ME,
  status: "completed", paymentStatus: "paid", endsAt: "2026-10-10T18:00:00Z", eventDate: "2026-10-10",
  talentProfileIds: ["tp1"], reviewedTalentIds: [], openRequestToken: null, ...over,
});
const decide = (over: Partial<VisitReviewFacts> = {}, who: string | null = ME, site: string | null = SITE, host: string | null = null) =>
  decideVisitReview({ sessionUserId: who, siteTenantId: site, hostTalentProfileId: host, facts: facts(over), nowMs: NOW });

test("only a completed visit can be reviewed", () => {
  assert.deepEqual(decide(), { kind: "form", talentProfileId: "tp1" });
  // Paid and already over counts as completed (the existing review policy and the DB insert rule).
  assert.equal(decide({ status: "confirmed", paymentStatus: "paid", endsAt: "2026-10-19T10:00:00Z" }).kind, "form");
  for (const over of [
    { status: "confirmed", paymentStatus: "unpaid", endsAt: "2026-10-30T10:00:00Z", eventDate: "2026-10-30" },
    { status: "confirmed", paymentStatus: "paid", endsAt: "2026-10-30T10:00:00Z", eventDate: "2026-10-30" },
    { status: "cancelled", paymentStatus: "refunded" },
    { status: "pending", paymentStatus: "unpaid", endsAt: null, eventDate: null },
  ]) {
    assert.deepEqual(decide(over), { kind: "none", reason: "not_completed" }, JSON.stringify(over));
  }
});

test("no duplicate review: any review already left on the visit closes it, hidden ones included", () => {
  assert.deepEqual(decide({ reviewedTalentIds: ["tp1"] }), { kind: "done" });
  // The loader reads reviews of ANY status, so a review hidden by moderation still counts as the one.
  const loader = readFileSync(join(process.cwd(), "src/lib/client-account/visit-review.server.ts"), "utf8");
  const reviewsRead = loader.slice(loader.indexOf('from("talent_reviews")'), loader.indexOf('from("review_requests")'));
  assert.match(reviewsRead, /\.eq\("client_user_id", userId\)/);
  assert.doesNotMatch(reviewsRead, /status/, "every status counts, not only published");
});

test("an open review request is reused (its /review/<token> page), never a second way in", () => {
  assert.deepEqual(decide({ openRequestToken: "tok 1" }), { kind: "request", href: "/review/tok%201" });
  // A review already written wins over a stale request.
  assert.equal(decide({ openRequestToken: "tok", reviewedTalentIds: ["tp1"] }).kind, "done");
});

test("scoping: no session, another client, another tenant are refused", () => {
  assert.deepEqual(decide({}, null), { kind: "none", reason: "not_signed_in" });
  assert.deepEqual(decide({}, "someone-else"), { kind: "none", reason: "not_owner" });
  assert.deepEqual(decide({ bookingClientUserId: null, inquiryClientUserId: "someone-else" }), { kind: "none", reason: "not_owner" });
  assert.equal(decide({ bookingClientUserId: null, inquiryClientUserId: ME }).kind, "form", "a booking made before sign-in belongs to the inquiry's client");
  assert.deepEqual(decide({ bookingTenantId: "tenant-b" }), { kind: "none", reason: "wrong_tenant" });
  assert.deepEqual(decide({}, ME, null), { kind: "none", reason: "wrong_tenant" });
});

test("which talent is reviewed: the site's own talent, else the only one; several and no host is no form", () => {
  assert.equal(pickReviewTalent(["tp1", "tp2"], "tp2"), "tp2");
  assert.equal(pickReviewTalent(["tp1"], null), "tp1");
  assert.equal(pickReviewTalent(["tp1", "tp2"], null), null);
  assert.equal(pickReviewTalent(["tp1", "tp2"], "tp9"), null);
  assert.deepEqual(decide({ talentProfileIds: ["tp1", "tp2"] }), { kind: "none", reason: "no_talent" });
  assert.deepEqual(decide({ talentProfileIds: [] }), { kind: "none", reason: "no_talent" });
});

test("the action decides with the same rule, scoped by host tenant, and writes through the existing review path", () => {
  const action = readFileSync(join(process.cwd(), "src/lib/client-account/visit-review-actions.ts"), "utf8");
  assert.match(action, /^"use server";/);
  assert.match(action, /assertNotImpersonating\(\)/);
  assert.match(action, /resolveAccountTenant\(\)/);
  assert.match(action, /decideVisitReview\(/);
  assert.match(action, /submitTalentReviewAction\(/);
  assert.doesNotMatch(action, /from\("talent_reviews"\)/, "no new insert path");
  assert.doesNotMatch(action, /tenantId: input|tenant_id: input/);
  const loader = readFileSync(join(process.cwd(), "src/lib/client-account/visit-review.server.ts"), "utf8");
  assert.match(loader, /from\("agency_bookings"\)[\s\S]{0,200}\.eq\("id", bookingId\)\s*\.eq\("tenant_id", tenantId\)/);
});

const ROUTER: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };

const visitArea = (locale: "en" | "es", visitReview: VisitReviewState | null) =>
  renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: ROUTER }, createElement(ClientAccountArea, {
      locale, audience: "client", view: { kind: "visit", id: "00000000-0000-4000-8000-000000000001" }, talentName: "Ana", email: "c@example.com", timeZone: "UTC",
      data: {
        visit: {
          inquiryId: "i1", bookingId: "11111111-1111-4111-8111-111111111111", service: "Haircut", status: "completed", startsAt: "2026-10-10T16:00:00Z",
          eventDate: "2026-10-10", place: null, amountCents: null, currency: "USD", paymentStatus: "paid", paidCents: 0,
          policy: { enforceable: false, insideWindow: false, deadlineIso: null, refundIfCancelled: 0 }, offeringId: null, timeZone: null,
          canManage: false, payCode: null, payUrl: null, canPay: false,
        },
        visitReview,
      },
    } as never)),
  );

test("the visit page shows the review form on a completed visit, ES and EN, plain language", () => {
  const en = visitArea("en", { kind: "form", talentProfileId: "tp1" });
  assert.match(en, /How was your visit\?/);
  assert.match(en, /data-visit-review-form/);
  assert.match(en, /Send review/);
  assert.match(en, /aria-label="5 of 5"/);
  const es = visitArea("es", { kind: "form", talentProfileId: "tp1" });
  assert.match(es, /¿Qué tal tu visita\?/);
  assert.match(es, /Enviar reseña/);
  for (const html of [en, es]) assert.doesNotMatch(html, /—/, "no em dash");
  assert.doesNotMatch(en, /tp1/, "no talent id in the markup");
});

test("done shows thanks, a request shows the Leave a review link, nothing shows nothing", () => {
  assert.match(visitArea("en", { kind: "done" }), /You already reviewed this visit/);
  assert.match(visitArea("en", { kind: "request", href: "/review/tok" }), /href="\/review\/tok"[^>]*>Leave a review/);
  assert.doesNotMatch(visitArea("en", { kind: "none", reason: "not_completed" }), /data-account-visit-review/);
  assert.doesNotMatch(visitArea("en", null), /data-account-visit-review/);
});
