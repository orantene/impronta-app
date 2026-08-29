import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isPathAllowedForHostKind } from "./surface-allow-list";

/**
 * public-booking-surface.static.test.ts — the slot picker's URL and the
 * surface allow-list must agree.
 *
 * THE BUG THIS CATCHES, which shipped to production: `/api/public/booking/slots`
 * was written, unit-tested, reviewed and merged while absent from
 * SHARED_API_PREFIXES. The proxy resolves a registered host, the surface
 * allow-list then 404s any path no host kind claims, and the route never runs.
 * The picker's fetch got the branded HTML 404 back, so it rendered no times --
 * on every host, silently, with green CI. Nothing failed, because every test
 * called the handler directly and nobody ever made an HTTP request.
 *
 * So the two ends are pinned to each other: whatever URL the picker fetches
 * must be reachable on the surfaces a booking can start from.
 */

const SRC = resolve(process.cwd(), "src");

test("the slot picker's endpoint is reachable on every public surface", () => {
  const picker = readFileSync(
    join(SRC, "components/public-booking/SlotPicker.tsx"),
    "utf8",
  );
  const match = picker.match(/fetch\(\s*`(\/api\/[^?`]+)/);
  assert.ok(match, "SlotPicker no longer fetches a literal /api path — repoint this test");
  const path = match[1];

  // An appointment can be booked from an agency storefront, a talent site, the
  // app host or the marketing apex, so the endpoint must clear every host kind
  // exactly like /api/health does.
  for (const kind of ["app", "agency", "hub", "marketing"] as const) {
    assert.equal(
      isPathAllowedForHostKind(kind, path),
      true,
      `${path} is 404'd on host kind "${kind}" — add its prefix to SHARED_API_PREFIXES`,
    );
  }
});
