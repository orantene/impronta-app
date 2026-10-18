import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { portalVisitWhen } from "./portal-visit-when";

const mx = { startsAt: "2026-10-20T16:00:00Z", bookingZone: "America/Mexico_City", talentZone: "America/Mexico_City" };
const es = { startsAt: "2026-10-22T08:00:00Z", bookingZone: "Europe/Madrid", talentZone: "Europe/Madrid" };

test("portal visits read in their own local time with the zone named", () => {
  const a = portalVisitWhen({ ...mx, workspaceZone: "UTC", locale: "en" });
  const b = portalVisitWhen({ ...es, workspaceZone: "UTC", locale: "en" });
  assert.ok(a && /10:00/.test(a.time), a?.time);
  assert.ok(b && /10:00/.test(b.time), b?.time);
  assert.equal(a?.tzLabel, "Mexico City time");
  assert.equal(b?.tzLabel, "Madrid time");
});

test("zone order: talent hours, then booking zone, then workspace zone", () => {
  const base = { startsAt: "2026-10-20T16:00:00Z", locale: "en" };
  assert.equal(portalVisitWhen({ ...base, talentZone: "Europe/Madrid", bookingZone: "America/Mexico_City", workspaceZone: "UTC" })?.zone, "Europe/Madrid");
  assert.equal(portalVisitWhen({ ...base, talentZone: null, bookingZone: "America/Mexico_City", workspaceZone: "UTC" })?.zone, "America/Mexico_City");
  assert.equal(portalVisitWhen({ ...base, talentZone: null, bookingZone: null, workspaceZone: "America/Cancun" })?.zone, "America/Cancun");
});

test("no booking start means no time (the page keeps its date only)", () => {
  assert.equal(portalVisitWhen({ startsAt: null, talentZone: null, bookingZone: null, workspaceZone: "UTC", locale: "es" }), null);
});

test("the portal loaders read the booking start and zone and the pages render them", () => {
  const root = process.cwd();
  const det = readFileSync(join(root, "src/app/(workspace)/[tenantSlug]/_data-bridge/client-inquiry-details.ts"), "utf8");
  assert.match(det, /loadPortalVisitWhenMap/);
  const up = readFileSync(join(root, "src/app/(workspace)/[tenantSlug]/_data-bridge/client-upcoming.ts"), "utf8");
  assert.match(up, /loadPortalVisitWhenMap/);
  const tab = readFileSync(join(root, "src/app/(workspace)/[tenantSlug]/client/messages/DetailsTab.tsx"), "utf8");
  assert.match(tab, /schedule\.when/);
});
