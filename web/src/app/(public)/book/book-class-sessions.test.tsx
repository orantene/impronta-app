/**
 * TUL-1381: /book lists a class's scheduled sessions (session picker), not a
 * talent calendar, so a class with sessions never reads "no online times".
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BookPageClient } from "./BookPageClient";
import { loadOfferingIdsWithUpcomingSessions } from "@/lib/site-admin/server/load-book-page-offerings";

const TENANT = "11111111-1111-4111-8111-111111111111";

function cls(extra: Record<string, unknown> = {}) {
  return {
    id: "d9e36c3a-0000-4000-8000-000000000000",
    title: "Clase USD QA",
    talentProfileId: null,
    visibility: "public",
    reserveMode: "free",
    allowPayInPerson: false,
    durationMinutes: 60,
    amountCents: 2500,
    currency: "USD",
    bookingMode: "instant",
    hasOpenTimes: true,
    hasSessions: true,
    ...extra,
  } as never;
}

function render(offerings: unknown[], locale = "es") {
  return renderToStaticMarkup(
    createElement(BookPageClient, {
      tenantSlug: "s2",
      tenantId: TENANT,
      agencyName: "S2",
      offerings: offerings as never,
      locale,
      contactHref: "/contact",
    }),
  );
}

test("a class with sessions renders the session picker, not the no-times request path", () => {
  const html = render([cls()]);
  assert.match(html, /data-session-picker="root"/);
  assert.doesNotMatch(html, /data-book-no-times/);
  assert.doesNotMatch(html, /Sin horarios en línea/);
  assert.doesNotMatch(html, /data-book-empty/);
});

test("loadOfferingIdsWithUpcomingSessions reads scheduled sessions of THIS tenant for the given offerings", async () => {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "in"]) {
    chain[m] = (...a: unknown[]) => {
      calls.push([m, a]);
      return chain;
    };
  }
  chain.limit = async () => ({ data: [{ offering_id: "a" }, { offering_id: "a" }, { offering_id: null }], error: null });
  const admin = { from: (t: string) => (calls.push(["from", [t]]), chain) } as never;
  const out = await loadOfferingIdsWithUpcomingSessions(admin, TENANT, ["a", "b"], new Date("2026-11-01T00:00:00Z"));
  assert.deepEqual([...out], ["a"]);
  assert.ok(calls.some(([m, a]) => m === "from" && a[0] === "sessions"));
  assert.ok(calls.some(([m, a]) => m === "eq" && a[0] === "tenant_id" && a[1] === TENANT));
  assert.ok(calls.some(([m, a]) => m === "eq" && a[0] === "status" && a[1] === "scheduled"));
  assert.ok(calls.some(([m, a]) => m === "in" && a[0] === "offering_id"));
  const none = await loadOfferingIdsWithUpcomingSessions(admin, TENANT, []);
  assert.equal(none.size, 0);
});
