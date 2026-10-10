/**
 * G3b: live status on the public page. Toggle busts the cache, expiry reads as
 * off with injected time, and nothing about the table is exposed to anon.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { endOfLocalDay, toggleTalentEmergencies } from "./live-status";
import {
  LIVE_STATUS_CSS,
  liveStatusOnAt,
  liveStatusRootAttrs,
  msUntilExpiry,
  toLiveStatusRenderContext,
} from "./live-status-render";

const ID = "11111111-1111-4111-8111-111111111111";

function fakeAdmin(error: unknown = null) {
  const writes: unknown[] = [];
  return {
    writes,
    client: { from: () => ({ upsert: async (row: unknown) => (writes.push(row), { error }) }) },
  };
}

test("toggle on saves then busts the talent's site cache once", async () => {
  const { client, writes } = fakeAdmin();
  const busts: Array<[string, string | null]> = [];
  const now = new Date("2026-10-01T18:00:00Z");
  const res = await toggleTalentEmergencies(
    client,
    { talentProfileId: ID, profileCode: "TAL-ALEX", userId: null, on: true, now, timeZone: "America/Monterrey" },
    (id, code) => busts.push([id, code]),
  );
  assert.equal(res.ok, true);
  assert.equal(writes.length, 1);
  assert.deepEqual(busts, [[ID, "TAL-ALEX"]]);
});

test("toggle off also busts (the band must disappear on the next request)", async () => {
  const { client } = fakeAdmin();
  let busted = 0;
  const res = await toggleTalentEmergencies(
    client,
    { talentProfileId: ID, profileCode: null, userId: null, on: false, now: new Date(), timeZone: null },
    () => busted++,
  );
  assert.equal(res.ok && res.status.emergenciesUntil, null);
  assert.equal(busted, 1);
});

test("a failed write busts nothing; a throwing bust still reports the saved toggle", async () => {
  let busted = 0;
  const failed = await toggleTalentEmergencies(
    fakeAdmin({ message: "x" }).client,
    { talentProfileId: ID, profileCode: null, userId: null, on: true, now: new Date(), timeZone: null },
    () => busted++,
  );
  assert.equal(failed.ok, false);
  assert.equal(busted, 0);
  const saved = await toggleTalentEmergencies(
    fakeAdmin().client,
    { talentProfileId: ID, profileCode: null, userId: null, on: true, now: new Date(), timeZone: null },
    () => {
      throw new Error("no request scope");
    },
  );
  assert.equal(saved.ok, true);
});

test("render context: on before local midnight, off at and after it (time injected)", () => {
  const toggledAt = new Date("2026-10-02T02:30:00Z"); // 20:30 Monterrey
  const until = endOfLocalDay(toggledAt, "America/Monterrey").toISOString();
  const status = { emergenciesUntil: until };
  assert.deepEqual(toLiveStatusRenderContext(status, new Date("2026-10-02T05:59:59Z")), {
    emergenciesToday: true,
    emergenciesUntil: until,
  });
  assert.deepEqual(toLiveStatusRenderContext(status, new Date(until)), { emergenciesToday: false, emergenciesUntil: null });
  assert.deepEqual(toLiveStatusRenderContext(status, new Date("2026-10-03T12:00:00Z")), {
    emergenciesToday: false,
    emergenciesUntil: null,
  });
  assert.deepEqual(toLiveStatusRenderContext(null), { emergenciesToday: false, emergenciesUntil: null });
});

test("an expired flag never emits on markup: root says off, expiry is not leaked", () => {
  const ctx = toLiveStatusRenderContext({ emergenciesUntil: "2026-10-02T06:00:00.000Z" }, new Date("2026-10-02T07:00:00Z"));
  assert.deepEqual(liveStatusRootAttrs(ctx), { "data-emergencies-today": "off" });
  assert.equal(ctx.emergenciesUntil, null);
});

test("client island: schedules the flip, flips immediately once past, and the client hook lapses", () => {
  const until = "2026-10-02T06:00:00.000Z";
  const at = Date.parse(until);
  assert.equal(msUntilExpiry(until, at - 60_000), 60_000);
  assert.equal(msUntilExpiry(until, at), 0);
  assert.equal(msUntilExpiry(until, at + 1), 0);
  assert.equal(msUntilExpiry(null, at), null);
  assert.equal(msUntilExpiry("garbage", at), 0, "an unparseable expiry fails closed (off)");
  assert.equal(msUntilExpiry(until, at - 40 * 86_400_000), 2_147_483_647, "clamped to setTimeout's max");
  const ctx = { emergenciesToday: true, emergenciesUntil: until };
  assert.equal(liveStatusOnAt(ctx, at - 1), true);
  assert.equal(liveStatusOnAt(ctx, at), false);
});

test("CSS hides the variant the root does not match", () => {
  assert.match(LIVE_STATUS_CSS, /\[data-emergencies-today="off"\] \[data-live-when="on"\]/);
  assert.match(LIVE_STATUS_CSS, /\[data-emergencies-today="on"\] \[data-live-when="off"\]/);
});

const WEB = process.cwd();
const RENDER_SRC = readFileSync(join(WEB, "src/lib/talent-site/server/render-max-site.tsx"), "utf8");

test("public render reads per request, applies expiry, hands widgets one liveStatus, mounts the island", () => {
  assert.match(RENDER_SRC, /loadTalentLiveStatus\(admin, talentProfileId\)/);
  assert.match(RENDER_SRC, /toLiveStatusRenderContext\(liveStatusRow, new Date\(\)\)/);
  assert.match(RENDER_SRC, /\n\s+liveStatus,\n\s+\};/, "liveStatus on the page dataSources");
  assert.match(RENDER_SRC, /liveStatusRootAttrs\(liveStatus\)/);
  assert.match(RENDER_SRC, /<LiveStatusExpiry until=\{liveStatus\.emergenciesUntil\} \/>/);
  const siteRoute = "src/app/t/site/[siteSlug]/page.tsx";
  assert.match(readFileSync(join(WEB, siteRoute), "utf8"), /export const revalidate = 0;/, `${siteRoute} must stay per-request`);
  // TUL-445: the custom-domain route is CDN-cacheable for anonymous GETs. The toggle
  // busts that cache and the client island lapses an expired status, so the window stays short.
  const hostRoute = "src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx";
  const m = /export const revalidate = (\d+);/.exec(readFileSync(join(WEB, hostRoute), "utf8"));
  assert.ok(m && Number(m[1]) <= 60, `${hostRoute} must revalidate within 60s`);
});

test("toggle action routes through the busting helper", () => {
  const src = readFileSync(join(WEB, "src/components/talent/website-settings/live-status-action.ts"), "utf8");
  assert.match(src, /toggleTalentEmergencies\(/);
  assert.match(src, /bustTalentSiteCache/);
  assert.equal(/saveTalentEmergencies\(/.test(src), false, "no unbusted write path");
});

test("anon exposure: no anon grant, policy, view or definer function touches talent_live_status", () => {
  const dir = join(WEB, "..", "supabase", "migrations");
  const hits = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => [f, readFileSync(join(dir, f), "utf8")] as const)
    .filter(([, sql]) => sql.includes("talent_live_status"));
  assert.deepEqual(hits.map(([f]) => f), ["20261231299920_talent_live_status.sql"]);
  const sql = hits[0]![1];
  assert.match(sql, /REVOKE ALL ON public\.talent_live_status FROM PUBLIC, anon;/);
  assert.equal(/TO\s+anon/i.test(sql), false);
  assert.equal(/TO\s+public\b/i.test(sql), false);
  assert.equal(/SECURITY DEFINER/i.test(sql), false);
  assert.equal(/CREATE (OR REPLACE )?VIEW/i.test(sql), false);
  // The render context carries exactly a boolean and the expiry, nothing else.
  assert.deepEqual(Object.keys(toLiveStatusRenderContext({ emergenciesUntil: "2999-01-01T00:00:00Z" })).sort(), [
    "emergenciesToday",
    "emergenciesUntil",
  ]);
});
