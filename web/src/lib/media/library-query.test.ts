/**
 * library-query.test.ts — the unified media read path.
 *
 * THE REGRESSION THIS FILE EXISTS FOR
 * The picker used to call `listTenantMediaLibrary`, which is `.limit(60)` with
 * no search and no pagination. On a tenant with ~1,900 assets that made ~97%
 * of the library unreachable from the builder, and it made the album chips
 * lie: they filtered inside the newest 60, so a folder full of real photos
 * rendered "No images in this album". `[library-paging] an asset older than
 * the newest 60 is reachable` and `[library-folder] a folder filter reaches
 * past the first page` are that bug, pinned.
 *
 * node:test + node:assert only — no DB, no network. The fake Supabase lives in
 * `library-query-fixtures.ts` (extracted 2026-08-16 when the per-talent filter
 * pushed this file past the 800-line cap): a small in-memory PostgREST that
 * APPLIES the filters the query layer sends, including the keyset `or(...)`
 * cursor and Postgres NULL semantics, rather than ignoring them. A stub that
 * ignored filters would pass while the real query returned the wrong rows —
 * exactly the failure mode being fixed.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  decodeMediaCursor,
  encodeMediaCursor,
  sanitizeMediaSearch,
} from "./library-item";
import { queryTenantMediaLibrary } from "./library-query";

import {
  makeAssets,
  makeFakeSupabase,
  TALENT,
  TENANT_A,
  TENANT_B,
} from "./library-query-fixtures";

// ── cursor ──────────────────────────────────────────────────────────────────

test("[library-cursor] round-trips, and refuses a cursor that could break out of a filter", () => {
  const cursor = encodeMediaCursor({
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "asset-001",
  });
  assert.deepEqual(decodeMediaCursor(cursor), {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "asset-001",
  });
  assert.equal(decodeMediaCursor(null), null);
  assert.equal(decodeMediaCursor("garbage-no-separator"), null);
  // A comma or a paren would be read as PostgREST syntax, not as data.
  assert.equal(decodeMediaCursor(encodeURIComponent("2026~a,b")), null);
  assert.equal(decodeMediaCursor(encodeURIComponent("2026~a)or(1")), null);
});

test("[library-search] user text cannot inject PostgREST filter syntax", () => {
  assert.equal(sanitizeMediaSearch("  swim wear  "), "swim wear");
  assert.equal(sanitizeMediaSearch("a,b)or(x.eq.1"), "a b or x.eq.1");
  assert.equal(sanitizeMediaSearch(null), "");
});

// ── pagination: the exact bug being fixed ───────────────────────────────────

test("[library-paging] an asset older than the newest 60 is reachable", async () => {
  // 200 assets. The old picker returned exactly the newest 60 and stopped.
  const { supabase } = makeFakeSupabase({
    media_assets: makeAssets(200),
    media_folders: [],
    agency_talent_roster: [],
  });

  const first = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    limit: 60,
  });
  assert.equal(first.items.length, 60);
  assert.equal(first.totalCount, 200);
  assert.ok(first.nextCursor, "a 200-asset library must report a next page");
  assert.equal(first.items[0].id, "asset-000");
  assert.equal(first.items[59].id, "asset-059");

  // Walk the whole library one page at a time.
  const seen: string[] = first.items.map((item) => item.id);
  let cursor: string | null = first.nextCursor;
  let pages = 1;
  while (cursor && pages < 20) {
    const page = await queryTenantMediaLibrary({
      supabase,
      tenantId: TENANT_A,
      limit: 60,
      cursor,
    });
    for (const item of page.items) seen.push(item.id);
    cursor = page.nextCursor;
    pages += 1;
  }

  assert.equal(seen.length, 200, "every asset is reachable by paging");
  assert.equal(new Set(seen).size, 200, "keyset paging never repeats a row");
  // The specific failure: asset-150 is far outside the newest 60.
  assert.ok(seen.includes("asset-150"), "an old asset must be reachable");
  assert.equal(cursor, null, "the last page reports no next cursor");
});

test("[library-search] finds an old asset the first page could never show", async () => {
  const rows = makeAssets(200, (i) =>
    i === 150 ? { original_filename: "campaign-lookbook-ss24.jpg" } : {},
  );
  const { supabase } = makeFakeSupabase({
    media_assets: rows,
    media_folders: [],
    agency_talent_roster: [],
  });

  const result = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    search: "lookbook",
    limit: 60,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "asset-150");
  assert.equal(result.totalCount, 1, "the count reflects the SEARCH, not the page");
});

test("[library-folder] a folder filter reaches past the first page", async () => {
  // The album's only photo is the 151st newest — the case that used to render
  // "No images in this album" because the chip filtered the truncated 60.
  const { supabase } = makeFakeSupabase({
    media_assets: makeAssets(200),
    media_folders: [
      {
        id: "folder-1",
        name: "Editorial",
        color: null,
        is_private: false,
        share_token: null,
        share_expires_at: null,
        share_view_count: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        is_collection: false,
        shoot_date: null,
        tenant_id: TENANT_A,
        media_folder_items: [{ asset_id: "asset-150" }],
      },
    ],
    agency_talent_roster: [],
  });

  const result = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    folderId: "folder-1",
    limit: 60,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "asset-150");
  assert.deepEqual(result.items[0].folderIds, ["folder-1"]);
});

// ── approval ────────────────────────────────────────────────────────────────

test("[library-approval] pending assets are excluded but COUNTED, never silent", async () => {
  const rows = makeAssets(10, (i) =>
    i < 3 ? { approval_state: "pending" } : {},
  );
  const { supabase } = makeFakeSupabase({
    media_assets: rows,
    media_folders: [],
    agency_talent_roster: [],
  });

  const result = await queryTenantMediaLibrary({ supabase, tenantId: TENANT_A });
  assert.equal(result.items.length, 7, "pending assets are not pickable");
  assert.ok(
    result.items.every((item) => item.approvalState === "approved"),
    "no pending asset leaks into the grid",
  );
  assert.equal(result.pendingCount, 3, "their existence IS surfaced");
});

// ── scope / isolation ───────────────────────────────────────────────────────

test("[library-scope] EVERY query is tenant-scoped (talent lane, service-role client)", async () => {
  const { supabase, recorded } = makeFakeSupabase({
    media_assets: makeAssets(5, () => ({ owner_talent_profile_id: TALENT })),
    media_folders: [],
    agency_talent_roster: [],
    agency_talent_media: [{ agency_media_id: "asset-000", master_media_id: null }],
  });

  await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    scope: "talent",
    talentProfileId: TALENT,
  });

  assert.ok(recorded.length >= 3, `expected >=3 queries, got ${recorded.length}`);
  for (const query of recorded) {
    const tenantFilter = query.filters.find(([column]) => column === "tenant_id");
    assert.ok(
      tenantFilter,
      `query on "${query.table}" MUST filter tenant_id — the caller passes a service-role client`,
    );
    assert.equal(tenantFilter[2], TENANT_A);
  }
});

test("[library-scope] another tenant's rows never appear", async () => {
  const mine = makeAssets(3);
  const theirs = makeAssets(3).map((row, i) => ({
    ...row,
    id: `other-${i}`,
    tenant_id: TENANT_B,
  }));
  const { supabase } = makeFakeSupabase({
    media_assets: [...mine, ...theirs],
    media_folders: [],
    agency_talent_roster: [],
  });

  const result = await queryTenantMediaLibrary({ supabase, tenantId: TENANT_A });
  assert.equal(result.items.length, 3);
  assert.ok(result.items.every((item) => !item.id.startsWith("other-")));
});

test("[library-scope] a removed talent's media leaves — but brand assets do NOT", async () => {
  // The NULL trap: `owner_talent_profile_id NOT IN (removed…)` is NULL — i.e.
  // NOT TRUE — for a workspace-owned brand asset, which has no owner talent.
  // A bare `not.in` would silently delete every brand & site image from the
  // library the moment one talent was removed from the roster.
  const rows = makeAssets(5, (i) => ({
    owner_talent_profile_id:
      i < 2 ? TALENT : i < 4 ? "22222222-2222-2222-2222-222222222222" : null,
    ...(i === 4 ? { id: "brand-logo", purpose: "branding" } : {}),
  }));
  const { supabase } = makeFakeSupabase({
    media_assets: rows,
    media_folders: [],
    agency_talent_roster: [
      { talent_profile_id: TALENT, status: "removed", tenant_id: TENANT_A },
    ],
  });

  const result = await queryTenantMediaLibrary({ supabase, tenantId: TENANT_A });
  const ids = result.items.map((item) => item.id);
  assert.equal(result.items.length, 3);
  assert.ok(
    result.items.every((item) => item.talentProfileId !== TALENT),
    "a removed talent's media leaves with them",
  );
  assert.ok(
    ids.includes("brand-logo"),
    "a workspace-owned brand asset has no owner talent and must survive the exclusion",
  );
});

// ── filter by talent ────────────────────────────────────────────────────────

test("[library-talent] filtering to one talent is NULL-correct: brand assets drop out, and come back when it is cleared", async () => {
  // The #1169 class, in its POSITIVE form. `owner_talent_profile_id IN (…)` is
  // NULL — i.e. NOT TRUE — for a workspace-owned brand asset, so the logo must
  // be absent while a talent is selected. What must NOT happen is the mirror
  // failure: the same NULL silently surviving the filter, which would make
  // "Ana's photos" show the agency's logo.
  const OTHER = "22222222-2222-2222-2222-222222222222";
  const rows = makeAssets(6, (i) => ({
    owner_talent_profile_id: i < 2 ? TALENT : i < 4 ? OTHER : null,
    ...(i >= 4 ? { purpose: "branding" } : {}),
  }));
  const { supabase } = makeFakeSupabase({
    media_assets: rows,
    media_folders: [],
    agency_talent_roster: [],
  });

  const filtered = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    talentProfileIds: [TALENT],
  });
  assert.deepEqual(
    filtered.items.map((item) => item.id),
    ["asset-000", "asset-001"],
    "only the selected talent's assets",
  );
  assert.equal(
    filtered.totalCount,
    2,
    "the count reflects the talent filter, not the library",
  );
  assert.ok(
    filtered.items.every((item) => item.talentProfileId === TALENT),
    "a NULL owner (brand & site asset) is NOT TRUE for IN(…) and must not appear",
  );

  const cleared = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    talentProfileIds: null,
  });
  assert.equal(cleared.items.length, 6, "clearing the filter restores everything");
  assert.equal(
    cleared.items.filter((item) => item.talentProfileId === "").length,
    2,
    "…including the two brand assets that have no owner talent",
  );

  // An empty array is "no filter", not "match nothing" — a select that has not
  // been touched must never silently empty the library.
  const emptyArray = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    talentProfileIds: [],
  });
  assert.equal(emptyArray.items.length, 6);
});

test("[library-talent] composes with kind + folder + search, all at once", async () => {
  const OTHER = "22222222-2222-2222-2222-222222222222";
  const rows = makeAssets(12, (i) => ({
    owner_talent_profile_id: i % 2 === 0 ? TALENT : OTHER,
    // asset-000 and asset-004 are the two the composed query should be choosing
    // between; only 004 is a video, only 000 carries the search term.
    ...(i === 2
      ? { asset_kind: "video", mime_type: "video/mp4", mime: "video/mp4" }
      : {}),
    ...(i === 0 ? { original_filename: "editorial-lookbook.jpg" } : {}),
    ...(i === 6 ? { original_filename: "editorial-lookbook-b.jpg" } : {}),
  }));
  const { supabase } = makeFakeSupabase({
    media_assets: rows,
    media_folders: [
      {
        id: "folder-1",
        name: "Editorial",
        color: null,
        is_private: false,
        share_token: null,
        share_expires_at: null,
        share_view_count: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        is_collection: false,
        shoot_date: null,
        tenant_id: TENANT_A,
        // The folder holds one asset from each talent plus one that the search
        // will reject, so no single filter alone produces the answer.
        media_folder_items: [
          { asset_id: "asset-000" },
          { asset_id: "asset-001" },
          { asset_id: "asset-004" },
          { asset_id: "asset-006" },
        ],
      },
    ],
    agency_talent_roster: [],
  });

  const result = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    talentProfileIds: [TALENT],
    kind: "image",
    folderId: "folder-1",
    search: "lookbook",
  });

  assert.deepEqual(
    result.items.map((item) => item.id),
    ["asset-000", "asset-006"],
    "talent AND kind AND folder AND search — every predicate is ANDed",
  );

  // Drop the talent and asset-001 (the other talent's, in the folder) is still
  // excluded by the search: proof the talent filter is what removed it above,
  // not one of the others doing double duty.
  const withoutTalent = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    kind: "image",
    folderId: "folder-1",
    search: "lookbook",
  });
  assert.deepEqual(
    withoutTalent.items.map((item) => item.id),
    ["asset-000", "asset-006"],
  );
});

test("[library-talent] the talent LANE never accepts a talentProfileIds filter", async () => {
  // Talent scope already pins `owner_talent_profile_id` to the one talent (plus
  // their portfolio links). Letting a second predicate at the same column in
  // would be two rules for one thing, and the caller of that lane is a
  // service-role client, so "harmless" is not the assumption to make.
  const OTHER = "22222222-2222-2222-2222-222222222222";
  const { supabase } = makeFakeSupabase({
    media_assets: makeAssets(4, () => ({ owner_talent_profile_id: TALENT })),
    media_folders: [],
    agency_talent_roster: [],
    agency_talent_media: [],
  });

  const result = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    scope: "talent",
    talentProfileId: TALENT,
    talentProfileIds: [OTHER],
  });
  assert.equal(
    result.items.length,
    4,
    "the talent's own library is unaffected by a staff-lane filter",
  );
});

test("[library-talent] the select's options are the non-removed roster, de-duped and sorted", async () => {
  const OTHER = "22222222-2222-2222-2222-222222222222";
  const GONE = "33333333-3333-3333-3333-333333333333";
  const { supabase } = makeFakeSupabase({
    media_assets: makeAssets(2),
    media_folders: [],
    agency_talent_roster: [
      {
        tenant_id: TENANT_A,
        status: "active",
        talent_profile_id: OTHER,
        talent_profiles: {
          id: OTHER,
          display_name: "Zoe Marchetti",
          first_name: null,
          last_name: null,
          profile_code: "TL-2",
        },
      },
      {
        tenant_id: TENANT_A,
        status: "pending",
        talent_profile_id: TALENT,
        talent_profiles: {
          id: TALENT,
          display_name: null,
          first_name: "Ana",
          last_name: "Ruiz",
          profile_code: "TL-1",
        },
      },
      // A rejoin: same talent, second roster row. One option, not two.
      {
        tenant_id: TENANT_A,
        status: "active",
        talent_profile_id: TALENT,
        talent_profiles: {
          id: TALENT,
          display_name: null,
          first_name: "Ana",
          last_name: "Ruiz",
          profile_code: "TL-1",
        },
      },
      // Removed: their media is excluded from the library entirely, so an
      // option for them could only ever return nothing.
      {
        tenant_id: TENANT_A,
        status: "removed",
        talent_profile_id: GONE,
        talent_profiles: {
          id: GONE,
          display_name: "Removed Person",
          first_name: null,
          last_name: null,
          profile_code: "TL-3",
        },
      },
      // Another tenant's roster row must never leak into this select.
      {
        tenant_id: TENANT_B,
        status: "active",
        talent_profile_id: "44444444-4444-4444-4444-444444444444",
        talent_profiles: {
          id: "44444444-4444-4444-4444-444444444444",
          display_name: "Other Tenant Talent",
          first_name: null,
          last_name: null,
          profile_code: "TL-4",
        },
      },
    ],
  });

  const withOptions = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    includeTalentOptions: true,
  });
  assert.deepEqual(
    withOptions.talents.map((option) => option.name),
    ["Ana Ruiz", "Zoe Marchetti"],
    "non-removed, de-duped, name-sorted, this tenant only",
  );
  assert.equal(withOptions.talents[0].profileCode, "TL-1");

  // Opt-in: the workspace Media page composes two reads per render and neither
  // wants a roster query attached to it.
  const withoutOptions = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
  });
  assert.deepEqual(withoutOptions.talents, []);
});

// ── private folders ─────────────────────────────────────────────────────────

test("[library-folders] a private folder is staff-only, and a talent cannot resolve it", async () => {
  const folder = {
    id: "folder-private",
    name: "Unreleased",
    color: null,
    is_private: true,
    share_token: null,
    share_expires_at: null,
    share_view_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    is_collection: false,
    shoot_date: null,
    tenant_id: TENANT_A,
    media_folder_items: [{ asset_id: "asset-000" }],
  };
  const { supabase } = makeFakeSupabase({
    media_assets: makeAssets(3, () => ({ owner_talent_profile_id: TALENT })),
    media_folders: [folder],
    agency_talent_roster: [],
    agency_talent_media: [],
  });

  const staff = await queryTenantMediaLibrary({ supabase, tenantId: TENANT_A });
  assert.equal(staff.folders.length, 1, "staff browse their own private folders");

  const talent = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    scope: "talent",
    talentProfileId: TALENT,
  });
  assert.equal(talent.folders.length, 0, "a talent never lists a private folder");

  // And naming it directly must not fail OPEN into "no folder filter at all".
  const forced = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    scope: "talent",
    talentProfileId: TALENT,
    folderId: "folder-private",
  });
  assert.equal(forced.items.length, 0, "an invisible folder resolves to nothing, not everything");
});

// ── kind ────────────────────────────────────────────────────────────────────

test("[library-kind] an unsanitized SVG is never classified as an image", async () => {
  const rows = [
    ...makeAssets(2),
    {
      ...makeAssets(1)[0],
      id: "svg-unsafe",
      storage_path: "library/logo.svg",
      mime: "image/svg+xml",
      mime_type: "image/svg+xml",
      asset_kind: "image", // a writer claiming it is an image must not be believed
      metadata: {},
    },
    {
      ...makeAssets(1)[0],
      id: "svg-safe",
      storage_path: "library/brand.svg",
      mime: "image/svg+xml",
      mime_type: "image/svg+xml",
      asset_kind: null,
      metadata: { svg_sanitized: true },
    },
  ];
  const { supabase } = makeFakeSupabase({
    media_assets: rows,
    media_folders: [],
    agency_talent_roster: [],
  });

  const result = await queryTenantMediaLibrary({ supabase, tenantId: TENANT_A });
  const ids = result.items.map((item) => item.id);
  assert.ok(!ids.includes("svg-unsafe"), "an unstamped SVG stays out of the library");
  assert.ok(ids.includes("svg-safe"), "a sanitizer-stamped SVG is a normal image (#1165)");
});

// ── locked[] parity ─────────────────────────────────────────────────────────

test("[library-locked] the talent route still returns items WHOLE plus a locked[] reason list", async () => {
  // The two-key rule greys unusable tiles instead of dropping them: a photo
  // that quietly is not there is the "I save and nothing changes" class. The
  // query layer must not filter them, and the route must still classify them.
  const { supabase } = makeFakeSupabase({
    media_assets: makeAssets(4, () => ({ owner_talent_profile_id: TALENT })),
    media_folders: [],
    agency_talent_roster: [],
    agency_talent_media: [],
  });
  const result = await queryTenantMediaLibrary({
    supabase,
    tenantId: TENANT_A,
    scope: "talent",
    talentProfileId: TALENT,
  });
  assert.equal(result.items.length, 4, "the talent lane returns its items whole");

  const routeSource = readFileSync(
    join(process.cwd(), "src/app/api/talent/media/library/route.ts"),
    "utf8",
  );
  assert.match(
    routeSource,
    /classifyTalentMediaUsability/,
    "the talent route must still classify usability",
  );
  assert.match(routeSource, /locked,/, "…and must still return the locked[] array");
});
