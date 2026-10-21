/**
 * TUL-1317 slice 2: "My reviews" in the client account. The reviews this client wrote on
 * THIS site's tenant, and the review requests still waiting for them (a "Leave a review" link
 * that reuses /review/[token]). Tenant and client scoped; nothing from another business.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientAccountArea } from "@/components/client-account/ClientAccountArea";
import { shapeMyReviews, type ReviewRequestRow, type WrittenReviewRow } from "./my-reviews";

const written = (over: Partial<WrittenReviewRow> = {}): WrittenReviewRow => ({
  id: "r1", rating: 5, body: "Wonderful dinner", status: "published", created_at: "2026-10-02T00:00:00Z",
  talent_profiles: { display_name: "Rafa Chef" }, ...over,
});
const pending = (over: Partial<ReviewRequestRow> = {}): ReviewRequestRow => ({
  invite_token: "tok123", status: "sent", created_at: "2026-10-03T00:00:00Z", talent_profiles: { display_name: "Ana" }, ...over,
});

test("written reviews: newest first, rating clamped 1..5, hidden (moderated) ones are not listed", () => {
  const out = shapeMyReviews(
    [written({ id: "old", created_at: "2026-09-01T00:00:00Z" }), written({ id: "new", created_at: "2026-10-09T00:00:00Z", rating: 9 }), written({ id: "hid", status: "hidden" })],
    [],
  );
  assert.deepEqual(out.written.map((r) => r.id), ["new", "old"]);
  assert.equal(out.written[0]!.rating, 5);
});

test("review requests: only pending or sent ones become a Leave a review link to /review/<token>", () => {
  const out = shapeMyReviews([], [pending(), pending({ invite_token: "done", status: "completed" }), pending({ invite_token: "exp", status: "expired" })]);
  assert.deepEqual(out.toWrite.map((r) => r.href), ["/review/tok123"]);
  assert.equal(out.toWrite[0]!.who, "Ana");
});

test("a request with no token is dropped; a missing talent name falls back", () => {
  const out = shapeMyReviews([written({ talent_profiles: null })], [pending({ invite_token: "" })]);
  assert.equal(out.toWrite.length, 0);
  assert.equal(out.written[0]!.who, null);
});

const area = (locale: "en" | "es", reviews: ReturnType<typeof shapeMyReviews>) =>
  renderToStaticMarkup(
    createElement(ClientAccountArea, {
      locale, audience: "client", view: { kind: "home", tab: "reviews" }, talentName: "Ana", email: "c@example.com", timeZone: "UTC",
      data: { reviews, profile: { name: "Cli", phone: "", locale, marketingOptIn: false } },
    } as never),
  );

test("the tab shows reviews to leave first, then the ones written, ES and EN", () => {
  const r = shapeMyReviews([written()], [pending()]);
  const en = area("en", r);
  assert.match(en, /Leave a review/);
  assert.match(en, /href="\/review\/tok123"/);
  assert.match(en, /Wonderful dinner/);
  assert.ok(en.indexOf("Leave a review") < en.indexOf("Wonderful dinner"), "to-write first");
  const es = area("es", r);
  assert.match(es, /Dejar una reseña/);
  assert.match(es, /Tus reseñas/);
});

test("empty state, ES and EN", () => {
  const empty = shapeMyReviews([], []);
  assert.match(area("en", empty), /No reviews yet/);
  assert.match(area("es", empty), /Aún no hay reseñas/);
});

test("wiring: scoped to this client AND this tenant, only on the reviews tab", () => {
  const render = readFileSync(join(process.cwd(), "src/lib/client-account/render-area.tsx"), "utf8");
  assert.match(render, /view\.tab === "reviews"[\s\S]{0,120}loadMyReviews\(userId, tenantId\)/);
  const loader = readFileSync(join(process.cwd(), "src/lib/client-account/my-reviews.server.ts"), "utf8");
  for (const table of ["talent_reviews", "review_requests"]) assert.match(loader, new RegExp(`from\\("${table}"\\)`));
  assert.equal((loader.match(/\.eq\("client_user_id", userId\)/g) ?? []).length, 2);
  assert.equal((loader.match(/\.eq\("tenant_id", tenantId\)/g) ?? []).length, 2);
});
