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
 * node:test + node:assert only — no DB, no network. The fake Supabase below is
 * a small in-memory PostgREST: it applies the filters the query layer sends
 * (including the keyset `or(...)` cursor) rather than ignoring them, because a
 * stub that ignores filters would pass while the real query returned the wrong
 * rows — which is exactly the failure mode being fixed.
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

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TALENT = "11111111-1111-1111-1111-111111111111";

type Row = Record<string, unknown>;

type Recorded = {
  table: string;
  filters: Array<[string, string, unknown]>;
  ors: string[];
};

/**
 * Minimal in-memory PostgREST. Supports the operators the query layer uses:
 * eq / neq / is / in / not(in|is) / or(...) / order / limit, plus
 * `{ count: "exact", head: true }`.
 */
function makeFakeSupabase(tables: Record<string, Row[]>) {
  const recorded: Recorded[] = [];

  function evalOr(row: Row, expression: string): boolean {
    // `or(a,b,and(c,d))` → split on top-level commas.
    const inner = expression.startsWith("or(")
      ? expression.slice(3, -1)
      : expression;
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of inner) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    if (current) parts.push(current);
    return parts.some((part) => evalClause(row, part));
  }

  function evalClause(row: Row, clause: string): boolean {
    if (clause.startsWith("and(")) {
      const inner = clause.slice(4, -1);
      return inner.split(",").every((sub) => evalClause(row, sub));
    }
    if (clause.startsWith("or(")) return evalOr(row, clause);
    const first = clause.indexOf(".");
    const column = clause.slice(0, first);
    const rest = clause.slice(first + 1);
    // `not.in` is the one two-word operator this fake sees.
    const op = rest.startsWith("not.in.")
      ? "not.in"
      : rest.slice(0, rest.indexOf("."));
    const raw = rest.slice(op.length + 1);
    const value = row[column];
    switch (op) {
      case "eq":
        return String(value) === raw;
      case "is":
        return raw === "null" ? value === null || value === undefined : false;
      case "lt":
        return String(value) < raw;
      case "in": {
        const list = raw.replace(/^\(|\)$/g, "").split(",");
        return list.includes(String(value));
      }
      case "not.in": {
        // Postgres semantics on purpose: `NULL NOT IN (…)` is NULL, i.e. NOT
        // TRUE. A fake that returned `true` here would hide the exact bug the
        // brand-asset test below pins.
        if (value === null || value === undefined) return false;
        const list = raw.replace(/^\(|\)$/g, "").split(",");
        return !list.includes(String(value));
      }
      case "ilike": {
        const needle = raw.replace(/\*/g, "").toLowerCase();
        return typeof value === "string" && value.toLowerCase().includes(needle);
      }
      default:
        return false;
    }
  }

  function from(table: string) {
    const rec: Recorded = { table, filters: [], ors: [] };
    recorded.push(rec);
    let head = false;
    let wantCount = false;
    const orders: Array<[string, boolean]> = [];
    let cap = Number.POSITIVE_INFINITY;

    function run() {
      let rows = (tables[table] ?? []).filter((row) =>
        rec.filters.every(([column, op, value]) => {
          const actual = row[column];
          if (op === "eq") return actual === value;
          if (op === "neq") return actual !== value;
          if (op === "is") return value === null ? actual == null : actual === value;
          if (op === "in") return (value as unknown[]).map(String).includes(String(actual));
          if (op === "not-in") {
            const list = String(value).replace(/^\(|\)$/g, "").split(",");
            return actual == null || !list.includes(String(actual));
          }
          if (op === "not-is") return value === null ? actual != null : actual !== value;
          return true;
        }),
      );
      rows = rows.filter((row) => rec.ors.every((expr) => evalOr(row, expr)));
      for (const [column, ascending] of [...orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const av = String(a[column] ?? "");
          const bv = String(b[column] ?? "");
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      const count = rows.length;
      if (head) return { data: null, error: null, count };
      return {
        data: rows.slice(0, cap),
        error: null,
        count: wantCount ? count : null,
      };
    }

    const builder: Record<string, unknown> = {
      select: (_columns: string, options?: { count?: string; head?: boolean }) => {
        head = options?.head === true;
        wantCount = !!options?.count;
        return builder;
      },
      eq: (c: string, v: unknown) => (rec.filters.push([c, "eq", v]), builder),
      neq: (c: string, v: unknown) => (rec.filters.push([c, "neq", v]), builder),
      is: (c: string, v: unknown) => (rec.filters.push([c, "is", v]), builder),
      in: (c: string, v: unknown) => (rec.filters.push([c, "in", v]), builder),
      not: (c: string, op: string, v: unknown) => (
        rec.filters.push([c, `not-${op}`, v]), builder
      ),
      or: (expression: string) => (rec.ors.push(expression), builder),
      order: (c: string, o: { ascending: boolean }) => (
        orders.push([c, o.ascending]), builder
      ),
      limit: (n: number) => {
        cap = n;
        return builder;
      },
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return builder;
  }

  return {
    supabase: {
      from,
      storage: {
        from: () => ({
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://cdn.test/${path}` },
          }),
        }),
      },
    } as never,
    recorded,
  };
}

/** `count` assets, newest first: asset-000 is the newest, asset-N-1 the oldest. */
function makeAssets(count: number, overrides: (i: number) => Row = () => ({})): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `asset-${String(i).padStart(3, "0")}`,
    tenant_id: TENANT_A,
    owner_talent_profile_id: null,
    bucket_id: "media-public",
    storage_path: `library/photo-${String(i).padStart(3, "0")}.jpg`,
    public_url: `https://cdn.test/photo-${String(i).padStart(3, "0")}.jpg`,
    variant_kind: "original",
    approval_state: "approved",
    purpose: "cms",
    asset_kind: "image",
    watermark_override_json: null,
    sort_order: i,
    width: 800,
    height: 1000,
    file_size: 1000,
    file_size_bytes: 1000,
    byte_size: 1000,
    mime: "image/jpeg",
    mime_type: "image/jpeg",
    original_filename: `photo-${String(i).padStart(3, "0")}.jpg`,
    alt: null,
    tags: [],
    metadata: {},
    source_media_asset_id: null,
    // Descending id order == descending created_at order.
    created_at: `2026-01-01T00:00:${String(99 - i).padStart(2, "0")}.000Z`,
    deleted_at: null,
    ownership_kind: "agency",
    owner_tenant_id: TENANT_A,
    uploaded_by_user_id: null,
    talent_profiles: null,
    ...overrides(i),
  }));
}

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
