import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatZonedWhen } from "./area-pure";
import { visitZone } from "./visit-zone";

test("each visit uses its own talent's zone; the tenant zone is only the fallback", () => {
  assert.equal(visitZone("Europe/Madrid", "America/Mexico_City"), "Europe/Madrid");
  assert.equal(visitZone(null, "America/Mexico_City"), "America/Mexico_City");
  assert.equal(visitZone("Not/AZone", "America/Cancun"), "America/Cancun");
  assert.equal(visitZone(undefined, "nonsense"), "UTC");
});

test("a Mexico City visit and a Madrid visit read in their own local time with the zone named", () => {
  const iso = "2026-10-09T16:30:00Z";
  const mx = formatZonedWhen(iso, visitZone("America/Mexico_City", "UTC"), "es");
  const es = formatZonedWhen(iso, visitZone("Europe/Madrid", "UTC"), "es");
  assert.ok(mx && /10:30/.test(mx.time), mx?.time);
  assert.ok(es && /18:30|6:30/.test(es.time), es?.time);
  assert.notEqual(mx?.tzLabel, es?.tzLabel);
});

test("the visit detail loads the talent zone and the page renders with it", () => {
  const data = readFileSync(join(process.cwd(), "src/lib/client-account/area-data.server.ts"), "utf8");
  assert.match(data, /timeZone: string \| null/);
  assert.match(data, /from\("talent_booking_hours"\)/);
  const view = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountArea.tsx"), "utf8");
  assert.match(view, /visitZone\(v\.timeZone, props\.timeZone\)/);
});

import { buildVisitZoneMap } from "./visit-zone";

test("the visits LIST resolves each inquiry to its booking talent's zone through booking, order line, offering and hours", () => {
  const zones = buildVisitZoneMap({
    bookings: [
      { inquiryId: "i1", orderId: "o1" },
      { inquiryId: "i2", orderId: "o2" },
      { inquiryId: "i3", orderId: null },
      { inquiryId: "i4", orderId: "o4" },
      { inquiryId: "i5", orderId: "o5" },
    ],
    lines: [
      { orderId: "o1", offeringId: "f1" },
      { orderId: "o2", offeringId: "f2" },
      { orderId: "o4", offeringId: "f4" },
      { orderId: "o5", offeringId: null },
    ],
    offerings: [
      { id: "f1", talentId: "t1" },
      { id: "f2", talentId: "t2" },
      { id: "f4", talentId: "t4" },
    ],
    hours: [
      { talentId: "t1", timezone: "America/Mexico_City" },
      { talentId: "t2", timezone: "Europe/Madrid" },
      { talentId: "t4", timezone: "Not/AZone" },
    ],
  });
  assert.deepEqual(zones, { i1: "America/Mexico_City", i2: "Europe/Madrid" });
  const byId: Record<string, string | undefined> = zones;
  // i3 has no order, i4 an invalid zone, i5 no offering: all fall back to the host zone.
  assert.equal(visitZone(byId["i3"], "America/Cancun"), "America/Cancun");
  assert.equal(visitZone(byId["i4"], "America/Cancun"), "America/Cancun");
  assert.equal(visitZone(byId["i1"], "America/Cancun"), "America/Mexico_City");
});

test("two visits with different talents read in different zones in the list", () => {
  const src = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountArea.tsx"), "utf8");
  assert.match(src, /visitZone\(props\.data\.visits\?\.zones\?\.\[v\.id\], props\.timeZone\)/);
  const data = readFileSync(join(process.cwd(), "src/lib/client-account/area-data.server.ts"), "utf8");
  assert.match(data, /loadVisitZones\(tenantId, rows\.map/);
});

test("TUL-62: list when uses starts_at (not date-only UTC midnight) in the talent zone", () => {
  const zone = visitZone("America/Mexico_City", "UTC");
  // Date-only → UTC midnight → previous evening in Mexico City (the Live QA bug).
  const dateOnly = formatZonedWhen("2026-10-20", zone, "es");
  assert.ok(dateOnly);
  assert.match(dateOnly.time, /6:00|18:00/);
  // Full timestamptz (what detail uses / what loadMeData now maps into eventDate).
  const startsAt = formatZonedWhen("2026-10-20T16:00:00.000Z", zone, "es");
  assert.ok(startsAt);
  assert.match(startsAt.time, /10:00/);
  assert.match(startsAt.date, /20/);
  assert.notEqual(dateOnly.date, startsAt.date);
});

test("TUL-62: Cancel/Reschedule show when canManage; list uses MeItem title/status/when", () => {
  const view = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountArea.tsx"), "utf8");
  assert.match(view, /v\.canManage && v\.bookingId/);
  assert.match(view, /VisitActions/);
  assert.match(view, /cancelVisit/);
  assert.match(view, /reschedule/);
  assert.match(view, /v\.title \|\| a\("service"\)/);
  assert.match(view, /statusLabel\(v\.status\)/);
  const data = readFileSync(join(process.cwd(), "src/lib/client-account/area-data.server.ts"), "utf8");
  assert.match(data, /b\.client_user_id === userId/);
  const loadMe = readFileSync(join(process.cwd(), "src/lib/me/load-me.ts"), "utf8");
  assert.match(loadMe, /meVisitListFields/);
  assert.match(loadMe, /starts_at/);
});

test("TUL-62: en+es status and manage copy stay paired", () => {
  const en = JSON.parse(readFileSync(join(process.cwd(), "messages/en.json"), "utf8"));
  const es = JSON.parse(readFileSync(join(process.cwd(), "messages/es.json"), "utf8"));
  const a = en.public.clientAccountArea;
  const b = es.public.clientAccountArea;
  assert.equal(a.statusConfirmed, "Confirmed");
  assert.equal(b.statusConfirmed, "Confirmada");
  assert.equal(a.statusPending, "Pending");
  assert.equal(b.statusPending, "Pendiente");
  assert.equal(a.cancelVisit, "Cancel visit");
  assert.equal(b.cancelVisit, "Cancelar visita");
  assert.equal(a.reschedule, "Change time");
  assert.equal(b.reschedule, "Cambiar horario");
  assert.equal(a.service, "Service");
  assert.equal(b.service, "Servicio");
});
