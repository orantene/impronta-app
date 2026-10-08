/**
 * F126: Resume runs the fan-out for sites that became eligible while paused;
 * a paused release is invisible to talents (no banner, no preview, no apply).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { makeFakeDb, type FakeDb } from "../talent-update/fake-db.test-helper";
import { applyThemeUpdate, loadTalentUpdateNotices, loadUpdateContext, previewThemeUpdate, type UpdateDeps } from "../talent-update/talent-update.server";
import { setReleasePaused } from "./release-manager.server";
import type { ThemeRelease } from "../types";

const PROFILE = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const R = "44444444-4444-4444-8444-000000000018";

function world(status: "paused" | "published"): FakeDb {
  return makeFakeDb({
    talent_site_theme_updates: [],
    talent_theme_releases: [
      {
        id: R, design_slug: "maison-v2", from_version: 17, to_version: 18, channel: "optin", status, notes: { en: "n" },
        items: [{ type: "new-block", key: "gallery", tree: "home" }], critical: false, rollout_pct: 100,
        dry_run_report: null, created_at: "", published_at: "", updated_at: "", created_by: null,
      },
    ],
    talent_sites: [
      { id: SITE, talent_profile_id: PROFILE, site_slug: "valeria", draft_rev: 1, theme_design_slug: "maison-v2", theme_design_version: 17, site_published_at: null },
    ],
    talent_profiles: [
      { id: PROFILE, profile_code: "TAL-1", user_id: "u-1", display_name: "Valeria", preferred_locale: "es", is_demo: false, deleted_at: null },
    ],
    talent_pages: [],
    talent_theme_catalog: [{ kind: "design", slug: "maison-v2", title: "Maison v2" }],
    user_notifications: [],
  });
}

const release = (db: FakeDb) => db.tables.talent_theme_releases![0] as unknown as ThemeRelease;

test("resume creates the rows and bells for sites inside the rollout, and reports the counts", async () => {
  const db = world("paused");
  const res = await setReleasePaused(db.admin, release(db), false);
  assert.ok(res.ok);
  assert.deepEqual({ updates: res.updates, bells: res.bells }, { updates: 1, bells: 1 });
  assert.equal(db.tables.talent_theme_releases![0]!.status, "published");
  assert.equal(db.tables.talent_site_theme_updates!.length, 1);
  assert.equal(db.tables.user_notifications!.length, 1);
  // resuming again is idempotent
  const again = await setReleasePaused(db.admin, release(db), false);
  assert.ok(again.ok);
  assert.deepEqual({ updates: again.updates, bells: again.bells }, { updates: 0, bells: 0 });
});

test("pause is status only: no fan-out, counts zero", async () => {
  const db = world("published");
  const res = await setReleasePaused(db.admin, release(db), true);
  assert.ok(res.ok);
  assert.deepEqual({ updates: res.updates, bells: res.bells }, { updates: 0, bells: 0 });
  assert.equal(db.tables.talent_theme_releases![0]!.status, "paused");
  assert.equal(db.tables.talent_site_theme_updates!.length, 0);
});

test("a paused release is hidden from talents who already have rows: no banner, no preview, no apply", async () => {
  const db = world("published");
  await setReleasePaused(db.admin, { ...release(db), status: "paused" } as ThemeRelease, false); // fan out rows while open
  assert.equal((await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false })).length, 1);
  await setReleasePaused(db.admin, release(db), true);
  assert.equal(db.tables.talent_theme_releases![0]!.status, "paused");
  assert.equal((await loadTalentUpdateNotices(db.admin, PROFILE)).length, 0, "no banner while paused");
  const rowId = db.tables.talent_site_theme_updates![0]!.id as string;
  assert.equal(await loadUpdateContext(db.admin, PROFILE, rowId), null);
  const deps = { admin: db.admin, merge: async () => ({ ok: false, error: "never" }), checkTree: async () => null } as unknown as UpdateDeps;
  const preview = await previewThemeUpdate(deps, PROFILE, rowId);
  assert.equal(preview.ok, false);
  const apply = await applyThemeUpdate(deps, { talentProfileId: PROFILE, updateId: rowId, expectedDraftRev: 1, actorId: "u-1" });
  assert.equal(apply.ok, false);
  // resumed: the banner is back
  await setReleasePaused(db.admin, release(db), false);
  assert.equal((await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false })).length, 1);
});
