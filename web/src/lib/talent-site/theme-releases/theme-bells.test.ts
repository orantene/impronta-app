/**
 * F127: at most one unread update bell per design; closing rows resolves bells.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { resolveBellsForRows, supersedeOlderBells } from "./theme-bells.server";
import { dismissThemeUpdate } from "./talent-update/talent-update.server";
import { makeFakeDb } from "./talent-update/fake-db.test-helper";
import type { BellRow } from "./manager/notify";

const PROFILE = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const R16 = "44444444-4444-4444-8444-000000000016";
const R17 = "44444444-4444-4444-8444-000000000017";
const R18 = "44444444-4444-4444-8444-000000000018";
const U16 = "55555555-5555-4555-8555-000000000016";
const U17 = "55555555-5555-4555-8555-000000000017";

const bell = (id: string, release: string, toVersion: number, design = "maison-v2") => ({
  id, user_id: "u-1", origin_kind: "theme_release", origin_event_id: release, read_at: null,
  target_payload: { kind: "theme_update", releaseId: release, design, toVersion },
});
const readOf = (db: ReturnType<typeof makeFakeDb>, id: string) =>
  (db.tables.user_notifications!.find((r) => r.id === id) as { read_at: string | null }).read_at;

function world() {
  return makeFakeDb({
    user_notifications: [bell("b16", R16, 16), bell("b17", R17, 17), bell("b-other", "44444444-4444-4444-8444-0000000000ff", 17, "folio")],
    talent_site_theme_updates: [
      { id: U16, release_id: R16, talent_site_id: SITE, talent_profile_id: PROFILE, state: "available" },
      { id: U17, release_id: R17, talent_site_id: SITE, talent_profile_id: PROFILE, state: "available" },
    ],
    talent_profiles: [{ id: PROFILE, user_id: "u-1" }],
    talent_sites: [{ id: SITE, talent_profile_id: PROFILE, theme_design_version: 15 }],
    talent_theme_releases: [
      { id: R16, design_slug: "maison-v2", to_version: 16, from_version: 15, status: "published", channel: "optin" },
      { id: R17, design_slug: "maison-v2", to_version: 17, from_version: 16, status: "published", channel: "optin" },
    ],
  });
}

test("a newer release's bell marks the older unread ones for the same design read, nothing else", async () => {
  const db = world();
  const fresh: BellRow = {
    user_id: "u-1", tenant_id: null, kind: "system", surface: "talent", title: "t", body: "b",
    target_drawer: "theme-update",
    target_payload: { kind: "theme_update", releaseId: R18, design: "maison-v2", toVersion: 18 },
    origin_event_id: R18, origin_kind: "theme_release",
  };
  await supersedeOlderBells(db.admin, [fresh]);
  assert.ok(readOf(db, "b16"));
  assert.ok(readOf(db, "b17"));
  assert.equal(readOf(db, "b-other"), null, "another design keeps its bell");
  // an OLDER release fanned out late must not silence a newer bell
  const db2 = world();
  await supersedeOlderBells(db2.admin, [{ ...fresh, origin_event_id: R16, target_payload: { ...fresh.target_payload, releaseId: R16, toVersion: 16 } }]);
  assert.equal(readOf(db2, "b17"), null);
});

test("closing rows resolves their releases' bells", async () => {
  const db = world();
  await resolveBellsForRows(db.admin, PROFILE, [U16]);
  assert.ok(readOf(db, "b16"));
  assert.equal(readOf(db, "b17"), null);
});

test("Not now (dismiss) resolves the bells of every row the offer covers", async () => {
  const db = world();
  const res = await dismissThemeUpdate(db.admin, PROFILE, U17);
  assert.ok(res.ok);
  assert.ok(readOf(db, "b16"));
  assert.ok(readOf(db, "b17"));
  assert.equal(readOf(db, "b-other"), null);
});
