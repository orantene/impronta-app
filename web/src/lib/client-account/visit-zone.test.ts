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
