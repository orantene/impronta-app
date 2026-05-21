/**
 * cleanup-orphan-media-rows.ts — soft-delete media_assets rows whose
 * underlying storage object no longer exists.
 *
 * Why this exists:
 *   The 2026-05-20 backfill (`backfill-media-resize.ts`) revealed ~60
 *   rows per batch hitting `download failed: Object not found` — DB rows
 *   in `public.media_assets` whose `storage_path` points at a bucket
 *   key that's not in storage anymore. Most are seed/demo leftovers
 *   (`<uuid>/demo/TAL-91xxx/...`, pravatar.cc thumbnails) but they
 *   accumulate in queries, slow down joins, inflate row counts, and
 *   make every future backfill waste a download cycle.
 *
 * Safety bar is high:
 *   Deleting a media_assets row breaks downstream references —
 *   favorites, shortlist items, agency branding logos, builder
 *   ownership links, watermark sources, etc. So per candidate we do
 *   TWO checks before deletion:
 *     1) Storage check — does the object actually exist? If yes,
 *        SKIP (we'd orphan storage, the opposite problem).
 *     2) Reference check — does any FK point at this row? FKs are
 *        discovered DYNAMICALLY at startup from `pg_constraint`, so
 *        new FKs added later are picked up without script changes.
 *
 * Soft-delete first, hard-delete later:
 *   Default mode (`--apply`) writes `deleted_at = now()`. If a
 *   "missing" object turns out to have been a transient CDN miss, the
 *   row is recoverable for a week. Pass `--hard-delete` (separate run)
 *   to physically remove rows soft-deleted more than 7 days ago.
 *
 * Run from `web/`:
 *   npm run cleanup:orphan-media                            # dry-run
 *   npm run cleanup:orphan-media -- --apply                 # soft-delete
 *   npm run cleanup:orphan-media -- --apply --limit 10      # small batch
 *   npm run cleanup:orphan-media -- --hard-delete           # dry-run hard pass
 *   npm run cleanup:orphan-media -- --hard-delete --apply   # ≥7d old → DELETE
 *
 * Re-run idempotently — every soft-delete pass picks up the next N
 * orphans (already-deleted rows are excluded). Hard-delete passes
 * are also idempotent (the time window keeps moving forward).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local)",
  );
  process.exit(1);
}
if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN (web/.env.local). The script discovers FK\n" +
      "references via the Management API SQL endpoint; without the token it\n" +
      "would have to hardcode the FK list, which is unsafe across schema drift.",
  );
  process.exit(1);
}

const DRY = !process.argv.includes("--apply");
const HARD = process.argv.includes("--hard-delete");
const LIMIT = (() => {
  const idx = process.argv.indexOf("--limit");
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 500;
})();

const REF = url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!REF) {
  console.error("Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

const svc = createClient(url, key, { auth: { persistSession: false } });

// UUID v4 (and v1/v5) shape — used to guard before injecting into SQL.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function runSql<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await fetch(SQL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = (await res.json()) as { message?: string } | T[];
  if (!res.ok || (body && typeof body === "object" && "message" in body && body.message)) {
    throw new Error(
      (body as { message?: string })?.message ?? `Management API HTTP ${res.status}`,
    );
  }
  return body as T[];
}

type FkRef = {
  /** schema-qualified table identifier, e.g. `public.client_favorites` */
  table_name: string;
  /** referencing column name, e.g. `media_asset_id` */
  column_name: string;
};

async function discoverFks(): Promise<FkRef[]> {
  // Single-column FKs whose target is `public.media_assets`. Composite
  // FKs (multi-column conkey) are filtered out — none today, but the
  // guard means a future composite FK can't silently break this loop.
  return await runSql<FkRef>(`
    SELECT
      conrelid::regclass::text AS table_name,
      a.attname               AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.media_assets'::regclass
      AND array_length(c.conkey, 1) = 1
    ORDER BY table_name, column_name;
  `);
}

type Candidate = {
  id: string;
  bucket_id: string;
  storage_path: string;
};

async function loadCandidates(): Promise<Candidate[]> {
  const { data, error } = await svc
    .from("media_assets")
    .select("id, bucket_id, storage_path")
    .is("deleted_at", null)
    .not("storage_path", "is", null)
    // Oldest-first — seed/demo data was inserted earliest, so this
    // surfaces the highest-confidence orphans first.
    .order("created_at", { ascending: true })
    .limit(LIMIT);

  if (error) throw new Error(`candidate query failed: ${error.message}`);
  return (data ?? []) as Candidate[];
}

/**
 * Return the set of candidate ids that are referenced by ANY FK. For
 * efficiency we issue one query per FK relation with ANY(ARRAY[...])
 * across all candidate ids in one round trip.
 */
async function findReferencedIds(
  candidates: Candidate[],
  fks: FkRef[],
): Promise<Set<string>> {
  const referenced = new Set<string>();
  if (candidates.length === 0 || fks.length === 0) return referenced;

  const ids = candidates.map((c) => c.id).filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return referenced;
  const idArrayLiteral = `ARRAY[${ids.map((id) => `'${id}'`).join(",")}]::uuid[]`;

  for (const fk of fks) {
    // Quote the column; the table identifier from regclass is already
    // schema-qualified and safe to inline.
    const sql = `
      SELECT DISTINCT "${fk.column_name}"::text AS id
      FROM ${fk.table_name}
      WHERE "${fk.column_name}" = ANY(${idArrayLiteral})
    `;
    let rows: { id: string | null }[];
    try {
      rows = await runSql<{ id: string | null }>(sql);
    } catch (e) {
      // If a single FK lookup fails, treat ALL candidates as referenced
      // for this run — we cannot prove they're safe to delete.
      console.error(
        `[fk-query-failed] ${fk.table_name}.${fk.column_name} — ${(e as Error).message}\n` +
          `  Aborting this pass; marking every candidate as 'referenced' to stay safe.`,
      );
      for (const id of ids) referenced.add(id);
      return referenced;
    }
    for (const r of rows) {
      if (r.id) referenced.add(r.id);
    }
  }
  return referenced;
}

/**
 * True iff the bucket object exists. Uses `storage.from().list()` with
 * a search filter — cheaper than `.download()` (no body transfer) but
 * still authoritative (we re-check exact filename match because
 * `search` is a substring filter).
 */
async function storageObjectExists(bucket: string, path: string): Promise<boolean> {
  const idx = path.lastIndexOf("/");
  const parent = idx >= 0 ? path.slice(0, idx) : "";
  const filename = path.slice(idx + 1);
  if (!filename) return false; // malformed path → treat as orphan

  const { data, error } = await svc.storage.from(bucket).list(parent, {
    search: filename,
    limit: 100,
  });
  if (error) {
    // Bucket missing or auth issue. Be conservative — say "exists" so
    // we DON'T delete the DB row on uncertain evidence.
    throw new Error(`list ${bucket}/${parent}: ${error.message}`);
  }
  return (data ?? []).some((item) => item.name === filename);
}

// ─── soft-delete pass ──────────────────────────────────────────────────

async function softDeletePass(): Promise<void> {
  console.log(
    `[cleanup-orphan-media] soft-delete pass · ${DRY ? "DRY-RUN" : "APPLY"} · limit=${LIMIT}`,
  );

  const fks = await discoverFks();
  console.log(`[cleanup-orphan-media] discovered ${fks.length} single-column FK refs:`);
  for (const fk of fks) console.log(`  ${fk.table_name}.${fk.column_name}`);

  const candidates = await loadCandidates();
  console.log(`[cleanup-orphan-media] ${candidates.length} candidate rows`);
  if (candidates.length === 0) return;

  const referencedIds = await findReferencedIds(candidates, fks);
  console.log(
    `[cleanup-orphan-media] ${referencedIds.size} of ${candidates.length} candidates are referenced by at least one FK\n`,
  );

  let softDeletedCount = 0;
  let storageExistsCount = 0;
  let referencedCount = 0;
  let failedCount = 0;
  const toSoftDelete: string[] = [];

  for (const row of candidates) {
    console.log(`[candidate] ${row.id}  ${row.bucket_id}/${row.storage_path}`);

    if (referencedIds.has(row.id)) {
      console.log(`  [skip-referenced]`);
      referencedCount += 1;
      continue;
    }

    let exists: boolean;
    try {
      exists = await storageObjectExists(row.bucket_id, row.storage_path);
    } catch (e) {
      console.warn(`  [fail] storage check error: ${(e as Error).message}`);
      failedCount += 1;
      continue;
    }
    if (exists) {
      console.log(`  [skip-storage-exists]`);
      storageExistsCount += 1;
      continue;
    }

    console.log(`  ${DRY ? "[would-delete]" : "[delete]"}`);
    toSoftDelete.push(row.id);
  }

  if (!DRY && toSoftDelete.length > 0) {
    // One UPDATE for the whole batch — fewer round trips, atomic if
    // any row write fails. We use the supabase-js client (not the
    // Management API) so RLS-bypass via service-role is explicit.
    const nowIso = new Date().toISOString();
    const { error: updErr } = await svc
      .from("media_assets")
      .update({ deleted_at: nowIso, updated_at: nowIso })
      .in("id", toSoftDelete);
    if (updErr) {
      console.error(`[fatal] soft-delete UPDATE failed: ${updErr.message}`);
      process.exit(1);
    }
    softDeletedCount = toSoftDelete.length;
  }

  console.log(`\n[cleanup-orphan-media] soft-delete pass done.`);
  console.log(`  candidates:                ${candidates.length}`);
  console.log(
    `  soft-deleted:              ${softDeletedCount}${DRY ? ` (would: ${toSoftDelete.length})` : ""}`,
  );
  console.log(`  skipped (storage exists):  ${storageExistsCount}`);
  console.log(`  skipped (referenced):      ${referencedCount}`);
  console.log(`  failed:                    ${failedCount}`);
  if (DRY) console.log(`\n  (DRY-RUN — re-run with --apply to write.)`);
  else if (candidates.length === LIMIT)
    console.log(`\n  Hit the limit (${LIMIT}). Re-run to continue.`);
}

// ─── hard-delete pass ──────────────────────────────────────────────────

type StaleRow = {
  id: string;
  storage_path: string;
  deleted_at: string;
};

async function hardDeletePass(): Promise<void> {
  console.log(
    `[cleanup-orphan-media] hard-delete pass · ${DRY ? "DRY-RUN" : "APPLY"} · limit=${LIMIT}`,
  );
  // Cutoff: anything soft-deleted ≥ 7 days ago.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await svc
    .from("media_assets")
    .select("id, storage_path, deleted_at")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff)
    .order("deleted_at", { ascending: true })
    .limit(LIMIT);

  if (error) {
    console.error(`[fatal] stale-row query failed: ${error.message}`);
    process.exit(1);
  }

  const stale = (data ?? []) as StaleRow[];
  console.log(`[cleanup-orphan-media] ${stale.length} rows soft-deleted before ${cutoff}`);
  if (stale.length === 0) return;

  for (const row of stale) {
    console.log(
      `[candidate] ${row.id}  ${row.storage_path}  (soft-deleted ${row.deleted_at})`,
    );
    console.log(`  ${DRY ? "[would-hard-delete]" : "[hard-delete]"}`);
  }

  let hardDeletedCount = 0;
  if (!DRY) {
    const ids = stale.map((r) => r.id).filter((id) => UUID_RE.test(id));
    if (ids.length > 0) {
      // Use Management API SQL — we want a single DELETE for the
      // whole set, and supabase-js doesn't support arbitrary WHERE
      // clauses against the `ANY(uuid[])` shape ergonomically.
      const idArray = `ARRAY[${ids.map((id) => `'${id}'`).join(",")}]::uuid[]`;
      const sql = `
        DELETE FROM public.media_assets
        WHERE id = ANY(${idArray})
          AND deleted_at IS NOT NULL
          AND deleted_at < '${cutoff}'::timestamptz
        RETURNING id
      `;
      try {
        const deleted = await runSql<{ id: string }>(sql);
        hardDeletedCount = deleted.length;
      } catch (e) {
        console.error(`[fatal] hard-delete DELETE failed: ${(e as Error).message}`);
        process.exit(1);
      }
    }
  }

  console.log(`\n[cleanup-orphan-media] hard-delete pass done.`);
  console.log(`  candidates:    ${stale.length}`);
  console.log(
    `  hard-deleted:  ${hardDeletedCount}${DRY ? ` (would: ${stale.length})` : ""}`,
  );
  if (DRY) console.log(`\n  (DRY-RUN — re-run with --apply to write.)`);
  else if (stale.length === LIMIT)
    console.log(`\n  Hit the limit (${LIMIT}). Re-run to continue.`);
}

// ─── entrypoint ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (HARD) await hardDeletePass();
  else await softDeletePass();
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
