import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("agency toggle says it governs listings only and points at the site setting (EN+ES)", () => {
  const page = read("../../admin/shell/internal/talent/agenda/AgendaAvailabilityPage.tsx");
  assert.match(page, /Direct booking from listings/);
  assert.match(page, /does not change booking on your own site/);
  const es = read("../../../lib/talent-agenda/agenda-i18n.ts");
  assert.match(es, /"Direct booking from listings": "Reserva directa desde listados"/);
  assert.match(es, /No cambia la reserva en tu propio sitio/);
});

test("Defaults screen names the site setting and shows the current effective mode", () => {
  const d = read("./DefaultsScreen.tsx");
  assert.match(d, /On your site, clients book/);
  assert.match(d, /site-booking-current/);
  assert.match(d, /bookingPostureSource === "platform"/);
  const rail = read("../../admin/shell/internal/dashboard-i18n-rail.ts");
  assert.match(rail, /"On your site, clients book": "En tu sitio, los clientes reservan"/);
  assert.match(rail, /"Right now: \{mode\}": "Ahora: \{mode\}"/);
});

test("display-only source field is never persisted", () => {
  const a = read("../../../lib/talent/services-settings-actions.ts");
  assert.match(a, /bookingPostureSource: _display, \.\.\.storable/);
  assert.doesNotMatch(a, /\.\.\.defaults,\s*\n\s*inPersonMethods/);
});

test("Services list and editor flag overrides; manager badge shows the EFFECTIVE mode", () => {
  assert.match(read("./ItemStateChips.tsx"), /overrideBadgeLabel/);
  assert.match(read("./ServicesHome.tsx"), /sitePosture=\{defaults\?\.bookingPosture\}/);
  assert.match(read("./EditorScreen.tsx"), /<SiteModeOverrideNotice/);
  const m = read("./TalentOfferingsManager.tsx");
  assert.doesNotMatch(m, /\{it\.bookingMode === "instant" && \(/);
  assert.match(m, /siteBookingModeView\(it\.bookingMode, sitePosture\)\.effective === "instant"/);
  assert.match(m, /<SiteOverrideChip/);
});

test("no behaviour edits: resolver and surface gate untouched by this change", () => {
  const gates = read("../../../lib/scheduling/instant-book-gates.ts");
  assert.match(gates, /Precedence \(product rules §1\)/);
});
